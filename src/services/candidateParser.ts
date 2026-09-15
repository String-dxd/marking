import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { Candidate, ExamPaper, PaperType } from '../types';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface ParseResult {
  candidates: Candidate[];
  discoveredPapers: ExamPaper[];
  format: 'SEAB' | 'GENERIC';
  totalRowsProcessed: number;
}

export async function parseCandidateFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (rawRows.length === 0) {
    throw new Error('Uploaded file contains no rows.');
  }

  // Inspect headers
  const headers = Object.keys(rawRows[0]).map(h => h.trim().toLowerCase());
  const isSeabFormat = headers.some(h => h.includes('index no') || h.includes('index number')) &&
                       headers.some(h => h.includes('subject code') || h.includes('paper no'));

  if (isSeabFormat) {
    return parseSeabFormat(rawRows);
  } else {
    return parseGenericFormat(rawRows);
  }
}

function parseSeabFormat(rows: Record<string, any>[]): ParseResult {
  const candidatesMap = new Map<string, Candidate>();
  const papersMap = new Map<string, ExamPaper>();

  for (const row of rows) {
    // Helper to find column regardless of casing or extra spaces
    const getVal = (possibleKeys: string[]) => {
      for (const [k, v] of Object.entries(row)) {
        const cleanK = k.trim().toLowerCase();
        if (possibleKeys.some(pk => cleanK === pk.toLowerCase() || cleanK.includes(pk.toLowerCase()))) {
          return String(v).trim();
        }
      }
      return '';
    };

    const rawIndex = getVal(['index no.', 'index no', 'index number']);
    const statutoryName = getVal(['statutory name', 'candidate name', 'student name', 'name']);
    const academicLevel = getVal(['academic level', 'level']);
    const schoolName = getVal(['school name', 'posted school name']);
    const examCentreCode = getVal(['posted exam centre code', 'exam centre code', 'centre code']);
    const subjectCode = getVal(['subject code']);
    const subjectName = getVal(['subject name', 'subject description']);
    let paperNo = getVal(['paper no', 'paper number', 'paper']);
    const mode = getVal(['mode of assessment', 'mode']).toUpperCase();

    // NRIC / FIN is deliberately ignored & discarded here (PDPA compliance)

    if (!rawIndex || !subjectCode) {
      continue;
    }

    // Extract 4-digit Index Number as the ID
    // e.g. "15550005" -> "0005"
    const digitsOnly = rawIndex.replace(/\D/g, '');
    const cleanIndexNumber = digitsOnly.length >= 4 
      ? digitsOnly.slice(-4) 
      : digitsOnly.padStart(4, '0');

    // Format Paper No as 2 digits, e.g. "1" -> "01"
    if (paperNo.length === 1) {
      paperNo = `0${paperNo}`;
    }
    const compositePaperCode = paperNo ? `${subjectCode}/${paperNo}` : subjectCode;

    // Determine Paper Archetype
    let paperType: PaperType = 'STANDARD';
    if (mode.includes('PRACTICAL') || mode.includes('LAB')) {
      paperType = 'SCIENCE_LAB';
    } else if (mode.includes('LISTENING') || mode.includes('LC')) {
      paperType = 'LISTENING_COMP';
    }

    const requiresComputer = subjectName.toUpperCase().includes('COMPUTING') || 
                             subjectName.toUpperCase().includes('COMPUTER') ||
                             mode.includes('COMPUTER') ||
                             mode.includes('E-EXAM');

    // Track discovered paper
    if (!papersMap.has(compositePaperCode)) {
      papersMap.set(compositePaperCode, {
        id: `paper-${compositePaperCode.replace('/', '-')}`,
        code: compositePaperCode,
        title: subjectName ? `${subjectName} Paper ${paperNo}`.trim() : `Paper ${compositePaperCode}`,
        durationMins: paperType === 'LISTENING_COMP' ? 45 : paperType === 'SCIENCE_LAB' ? 110 : 120,
        type: paperType,
        requiresComputer,
        allowCombine: paperType !== 'LISTENING_COMP',
        date: new Date().toISOString().split('T')[0],
        startTime: '08:00'
      });
    }

    // Aggregate Candidate
    if (!candidatesMap.has(cleanIndexNumber)) {
      candidatesMap.set(cleanIndexNumber, {
        id: cleanIndexNumber,
        indexNumber: cleanIndexNumber,
        fullName: statutoryName || `Candidate ${cleanIndexNumber}`,
        academicLevel,
        schoolName,
        examCentreCode,
        subjectCodes: [compositePaperCode]
      });
    } else {
      const existing = candidatesMap.get(cleanIndexNumber)!;
      if (!existing.subjectCodes.includes(compositePaperCode)) {
        existing.subjectCodes.push(compositePaperCode);
      }
    }
  }

  // Sort candidates by pure 4-digit Index Number
  const candidates = Array.from(candidatesMap.values()).sort((a, b) => 
    a.indexNumber.localeCompare(b.indexNumber)
  );

  return {
    candidates,
    discoveredPapers: Array.from(papersMap.values()),
    format: 'SEAB',
    totalRowsProcessed: rows.length
  };
}

function parseGenericFormat(rows: Record<string, any>[]): ParseResult {
  const candidates: Candidate[] = [];
  const papersMap = new Map<string, ExamPaper>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const getVal = (possibleKeys: string[]) => {
      for (const [k, v] of Object.entries(row)) {
        const cleanK = k.trim().toLowerCase();
        if (possibleKeys.some(pk => cleanK === pk.toLowerCase() || cleanK.includes(pk.toLowerCase()))) {
          return String(v).trim();
        }
      }
      return '';
    };

    const rawIndex = getVal(['index', 'id', 'student id', 'roll no']) || String(i + 1).padStart(4, '0');
    const name = getVal(['name', 'full name', 'student name']) || `Candidate ${rawIndex}`;
    const classGroup = getVal(['class', 'class group', 'form class']);
    const papersRaw = getVal(['papers', 'registered papers', 'subjects', 'subject codes']);

    const digitsOnly = rawIndex.replace(/\D/g, '');
    const cleanIndexNumber = digitsOnly.length >= 4 
      ? digitsOnly.slice(-4) 
      : digitsOnly.padStart(4, '0');

    const subjectCodes = papersRaw 
      ? papersRaw.split(/[,;|]/).map(s => s.trim()).filter(Boolean)
      : [];

    subjectCodes.forEach(code => {
      if (!papersMap.has(code)) {
        papersMap.set(code, {
          id: `paper-${code.replace('/', '-')}`,
          code,
          title: `Paper ${code}`,
          durationMins: 120,
          type: 'STANDARD',
          requiresComputer: false,
          allowCombine: true,
          date: new Date().toISOString().split('T')[0],
          startTime: '08:00'
        });
      }
    });

    candidates.push({
      id: cleanIndexNumber,
      indexNumber: cleanIndexNumber,
      fullName: name,
      classGroup,
      subjectCodes
    });
  }

  candidates.sort((a, b) => a.indexNumber.localeCompare(b.indexNumber));

  return {
    candidates,
    discoveredPapers: Array.from(papersMap.values()),
    format: 'GENERIC',
    totalRowsProcessed: rows.length
  };
}

export interface MultiCandidateParseResult {
  mergedCandidates: Candidate[];
  mergedPapers: ExamPaper[];
  fileReports: { fileName: string; format: string; candidateCount: number; rowCount: number }[];
}

export async function parseMultipleCandidateFiles(files: File[]): Promise<MultiCandidateParseResult> {
  const fileReports: { fileName: string; format: string; candidateCount: number; rowCount: number }[] = [];
  const candidatesMap = new Map<string, Candidate>();
  const papersMap = new Map<string, ExamPaper>();

  for (const file of files) {
    const res = await parseCandidateFile(file);
    fileReports.push({
      fileName: file.name,
      format: res.format,
      candidateCount: res.candidates.length,
      rowCount: res.totalRowsProcessed,
    });

    for (const cand of res.candidates) {
      if (candidatesMap.has(cand.id)) {
        const existing = candidatesMap.get(cand.id)!;
        const combined = Array.from(new Set([...existing.subjectCodes, ...cand.subjectCodes]));
        candidatesMap.set(cand.id, {
          ...existing,
          fullName: existing.fullName || cand.fullName,
          academicLevel: existing.academicLevel || cand.academicLevel,
          schoolName: existing.schoolName || cand.schoolName,
          examCentreCode: existing.examCentreCode || cand.examCentreCode,
          subjectCodes: combined,
        });
      } else {
        candidatesMap.set(cand.id, cand);
      }
    }

    for (const p of res.discoveredPapers) {
      if (!papersMap.has(p.code)) {
        papersMap.set(p.code, p);
      }
    }
  }

  const mergedCandidates = Array.from(candidatesMap.values()).sort((a, b) =>
    a.indexNumber.localeCompare(b.indexNumber)
  );

  return {
    mergedCandidates,
    mergedPapers: Array.from(papersMap.values()),
    fileReports,
  };
}

export interface MultiTimetableParseResult {
  mergedPapers: ExamPaper[];
  fileReports: { fileName: string; paperCount: number; rowCount: number }[];
}

// --- Date, Time & Duration Normalization Helpers ---

function normalizeSingaporeDate(rawDate: string): string {
  if (!rawDate) return new Date().toISOString().split('T')[0];
  const str = String(rawDate).trim();

  // Match DD/MM/YYYY or DD-MM-YYYY (e.g. 13/07/2026 or 02-06-2026)
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

function normalizeDurationMins(rawDuration: string, paperType: PaperType): number {
  if (!rawDuration) {
    return paperType === 'LISTENING_COMP' ? 45 : paperType === 'SCIENCE_LAB' ? 110 : 120;
  }
  const str = String(rawDuration).trim();

  // Match HH:MM or H:MM (e.g. "01:20" -> 80 mins, "00:45" -> 45 mins)
  const hmMatch = str.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const hours = parseInt(hmMatch[1], 10);
    const mins = parseInt(hmMatch[2], 10);
    return hours * 60 + mins;
  }

  // Numeric minutes (e.g. "80", "110", "120 mins")
  const numOnly = parseInt(str.replace(/\D/g, ''), 10);
  if (!isNaN(numOnly) && numOnly > 0) {
    return numOnly;
  }

  return paperType === 'LISTENING_COMP' ? 45 : paperType === 'SCIENCE_LAB' ? 110 : 120;
}

function normalizeStartTime(rawTime: string): string {
  if (!rawTime) return '08:00';
  const str = String(rawTime).trim();
  const match = str.match(/(\d{1,2})[:.](\d{2})/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  if (str.toUpperCase().includes('PM')) {
    return '14:00';
  }
  return '08:00';
}

// --- PDF Timetable Parser (SEAB Official Layout) ---

export async function parsePdfTimetable(file: File): Promise<{ papers: ExamPaper[]; rowCount: number }> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const papersMap = new Map<string, ExamPaper>();
  let rowCount = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows: { y: number; items: { x: number; str: string }[] }[] = [];

    for (const rawItem of content.items) {
      const it = rawItem as { str: string; transform: number[] };
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const x = Math.round(it.transform[4]);
      let r = rows.find((row) => Math.abs(row.y - y) <= 4);
      if (!r) {
        r = { y, items: [] };
        rows.push(r);
      }
      r.items.push({ x, str: it.str.trim() });
    }

    // Sort descending by Y (top of page to bottom)
    rows.sort((a, b) => b.y - a.y);

    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      const rowText = r.items.map((i) => i.str).join(' ');
      const dateMatch = rowText.match(/^(\d{2}\/\d{2}\/\d{4})/);
      if (!dateMatch) continue;

      const dateRaw = dateMatch[1];
      const remainingItems = r.items.filter((i) => !i.str.includes(dateRaw));

      // Subject code is 4 alphanumeric chars (e.g. 1151, 6092, NP04, A101)
      const codeItemIdx = remainingItems.findIndex(
        (i) => /^[A-Z0-9]{4}$/.test(i.str) && i.x > 80 && i.x < 180
      );
      if (codeItemIdx === -1) continue;

      const timeItems = remainingItems.slice(0, codeItemIdx);
      const code = remainingItems[codeItemIdx].str;
      const paperNoItem = remainingItems[codeItemIdx + 1];
      const hasPaperNo = paperNoItem && /^\d{2}$/.test(paperNoItem.str);
      const paperNo = hasPaperNo ? paperNoItem.str : '01';

      const moaIdx = remainingItems.findIndex((i) =>
        ['WRITTEN', 'LC', 'ORAL', 'PRACTICAL', 'SCIENCE PRACTICAL', 'LISTENING', 'LISTENING COMPREHENSION'].includes(
          i.str.toUpperCase()
        )
      );
      const durIdx = remainingItems.findIndex(
        (i) => /^\d{2}:\d{2}$/.test(i.str) && i.x > 300
      );

      let subjName = '';
      let moa = 'WRITTEN';
      let rawDuration = '01:30';

      const subjStartIndex = hasPaperNo ? codeItemIdx + 2 : codeItemIdx + 1;

      if (moaIdx !== -1) {
        if (moaIdx > subjStartIndex) {
          subjName = remainingItems
            .slice(subjStartIndex, moaIdx)
            .map((i) => i.str)
            .join(' ');
        }
        moa = remainingItems[moaIdx].str;
      } else {
        const endIdx = durIdx !== -1 ? durIdx : remainingItems.length;
        if (endIdx > subjStartIndex) {
          subjName = remainingItems
            .slice(subjStartIndex, endIdx)
            .map((i) => i.str)
            .join(' ');
        }
      }

      if (durIdx !== -1) {
        rawDuration = remainingItems[durIdx].str;
      }

      const timeStr = timeItems.map((i) => i.str).join(' ');
      const isoDate = normalizeSingaporeDate(dateRaw);
      const startTime = normalizeStartTime(timeStr);

      // Determine paper type
      let paperType: PaperType = 'STANDARD';
      const cleanMoa = moa.toUpperCase();
      const cleanTitle = subjName.toUpperCase();

      if (cleanMoa === 'LC' || cleanMoa.includes('LISTENING') || cleanTitle.includes('LISTENING')) {
        paperType = 'LISTENING_COMP';
      } else if (
        cleanMoa.includes('PRACTICAL') ||
        cleanMoa.includes('LAB') ||
        cleanTitle.includes('PRACTICAL') ||
        cleanTitle.includes('SHIFT')
      ) {
        paperType = 'SCIENCE_LAB';
      } else if (cleanMoa === 'ORAL') {
        paperType = 'ORAL';
      }

      const durationMins = normalizeDurationMins(rawDuration, paperType);

      // Determine computer requirement
      const requiresComputer =
        code === '7155' ||
        code === '7018' ||
        cleanTitle.includes('COMPUTING') ||
        cleanTitle.includes('COMPUTER') ||
        cleanMoa.includes('COMPUTER') ||
        cleanMoa.includes('E-EXAM');

      const allowCombine = paperType !== 'LISTENING_COMP' && paperType !== 'ORAL';
      const compositeCode = `${code}/${paperNo}`;

      // Build a unique paper key per subject+paper+type so ORAL and LC/WRITTEN
      // entries with the same composite code (e.g. 1202/03) are stored separately.
      const paperKey = cleanTitle.includes('SHIFT')
        ? `${compositeCode}-${cleanTitle.slice(0, 7).replace(/[^A-Za-z0-9]/g, '')}`
        : paperType === 'ORAL'
          ? `${compositeCode}-ORAL`
          : compositeCode;

      if (!papersMap.has(paperKey)) {
        papersMap.set(paperKey, {
          id: `paper-${paperKey.replace(/[^A-Za-z0-9]/g, '-')}`,
          code: compositeCode,
          title: subjName || `Paper ${compositeCode}`,
          date: isoDate,
          startTime,
          durationMins,
          type: paperType,
          requiresComputer,
          allowCombine,
        });
        rowCount++;
      }
    }
  }

  return {
    papers: Array.from(papersMap.values()),
    rowCount,
  };
}

// --- Spreadsheet Timetable Parser (.xlsx, .xls, .csv) ---

export async function parseSpreadsheetTimetable(file: File): Promise<{ papers: ExamPaper[]; rowCount: number }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

  if (rows.length === 0) {
    throw new Error(`Timetable file "${file.name}" contains no rows.`);
  }

  const papersMap = new Map<string, ExamPaper>();

  for (const row of rows) {
    const getVal = (keys: string[]) => {
      for (const [k, v] of Object.entries(row)) {
        const clean = k.trim().toLowerCase();
        if (keys.some((key) => clean === key.toLowerCase() || clean.includes(key.toLowerCase()))) {
          return String(v).trim();
        }
      }
      return '';
    };

    const rawCode = getVal(['paper code', 'subject code', 'code', 'paper']);
    let paperNo = getVal(['paper no', 'paper number']);
    const title = getVal(['paper title', 'title', 'subject name', 'subject', 'description']);
    const rawDate = getVal(['date', 'exam date', 'day']);
    const rawTime = getVal(['start time', 'time', 'start', 'session time']);
    const rawDuration = getVal(['duration', 'duration (mins)', 'duration (minutes)', 'duration mins']);
    const mode = getVal(['mode', 'mode of assessment', 'moa', 'type', 'paper type']).toUpperCase();
    const compRaw = getVal(['requires computer', 'computer', 'pc', 'e-exam']).toLowerCase();
    const combineRaw = getVal(['allow combine', 'can combine', 'combine']).toLowerCase();

    if (!rawCode && !title) continue;

    if (paperNo && paperNo.length === 1) {
      paperNo = `0${paperNo}`;
    }

    let compositeCode = rawCode;
    if (paperNo && !rawCode.includes('/')) {
      compositeCode = `${rawCode}/${paperNo}`;
    }

    if (!compositeCode) {
      compositeCode = title.replace(/\s+/g, '-').slice(0, 10);
    }

    let paperType: PaperType = 'STANDARD';
    if (mode.includes('PRACTICAL') || mode.includes('LAB') || title.toUpperCase().includes('PRACTICAL') || title.toUpperCase().includes('SHIFT')) {
      paperType = 'SCIENCE_LAB';
    } else if (mode.includes('LISTENING') || mode.includes('LC') || title.toUpperCase().includes('LISTENING')) {
      paperType = 'LISTENING_COMP';
    }

    const requiresComputer = compRaw === 'yes' || compRaw === 'true' || compRaw === '1' ||
      rawCode === '7155' || rawCode === '7018' ||
      title.toUpperCase().includes('COMPUTING') || title.toUpperCase().includes('COMPUTER') || mode.includes('COMPUTER');

    const allowCombine = paperType === 'LISTENING_COMP' 
      ? false 
      : (combineRaw === 'no' || combineRaw === 'false' || combineRaw === '0' ? false : true);

    const formattedDate = normalizeSingaporeDate(rawDate);
    const formattedTime = normalizeStartTime(rawTime);
    const duration = normalizeDurationMins(rawDuration, paperType);

    const paperKey = title.toUpperCase().includes('SHIFT')
      ? `${compositeCode}-${title.toUpperCase().slice(0, 7).replace(/[^A-Za-z0-9]/g, '')}`
      : compositeCode;

    if (!papersMap.has(paperKey)) {
      papersMap.set(paperKey, {
        id: `paper-${paperKey.replace(/[^A-Za-z0-9]/g, '-')}`,
        code: compositeCode,
        title: title || `Paper ${compositeCode}`,
        date: formattedDate,
        startTime: formattedTime,
        durationMins: duration,
        type: paperType,
        requiresComputer,
        allowCombine,
      });
    }
  }

  return {
    papers: Array.from(papersMap.values()),
    rowCount: rows.length,
  };
}

// Unified dispatcher: Supports PDF, XLSX, XLS, and CSV
export async function parseTimetableFile(file: File): Promise<{ papers: ExamPaper[]; rowCount: number }> {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
    return parsePdfTimetable(file);
  }
  return parseSpreadsheetTimetable(file);
}

export async function parseMultipleTimetableFiles(files: File[]): Promise<MultiTimetableParseResult> {
  const fileReports: { fileName: string; paperCount: number; rowCount: number }[] = [];
  const papersMap = new Map<string, ExamPaper>();

  for (const file of files) {
    const res = await parseTimetableFile(file);
    fileReports.push({
      fileName: file.name,
      paperCount: res.papers.length,
      rowCount: res.rowCount,
    });

    for (const p of res.papers) {
      const key = p.id;
      if (!papersMap.has(key)) {
        papersMap.set(key, p);
      }
    }
  }

  const mergedPapers = Array.from(papersMap.values()).sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.startTime.localeCompare(b.startTime);
  });

  return {
    mergedPapers,
    fileReports,
  };
}


