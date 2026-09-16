import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { ExamPaper, PaperType, Candidate } from '../types';
import { arePapersConcurrent, extractLevelNumber } from './allocationEngine';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface InternalTimetableParseResult {
  papers: ExamPaper[];
  rowCount: number;
}

export interface MultiInternalTimetableParseResult {
  mergedPapers: ExamPaper[];
  fileReports: { fileName: string; paperCount: number; rowCount: number }[];
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12'
};

/**
 * Normalizes Singapore date strings into ISO format YYYY-MM-DD
 * Handles: "23/9/2026", "23/09/2026", "23-09-2026", "23/9/26", "23 Sep 2026", "23 September", "23/9"
 */
export function normalizeSingaporeDate(raw: string, defaultYear: string = '2026'): string {
  const clean = raw.trim();
  if (!clean) return new Date().toISOString().split('T')[0];

  // 1. DD/MM/YYYY or DD-MM-YYYY
  const dmy4 = clean.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy4) {
    const day = dmy4[1].padStart(2, '0');
    const month = dmy4[2].padStart(2, '0');
    const year = dmy4[3];
    return `${year}-${month}-${day}`;
  }

  // 2. YYYY-MM-DD
  const ymd = clean.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, '0');
    const day = ymd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 3. DD/MM/YY or DD-MM-YY
  const dmy2 = clean.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2})\b/);
  if (dmy2) {
    const day = dmy2[1].padStart(2, '0');
    const month = dmy2[2].padStart(2, '0');
    const year = `20${dmy2[3]}`;
    return `${year}-${month}-${day}`;
  }

  // 4. DD Month YYYY (e.g. "23 Sep 2026", "23 September 2026")
  const textDateWithYear = clean.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (textDateWithYear) {
    const day = textDateWithYear[1].padStart(2, '0');
    const mStr = textDateWithYear[2].toLowerCase().slice(0, 4);
    const month = MONTH_MAP[mStr] || MONTH_MAP[mStr.slice(0, 3)] || '09';
    const year = textDateWithYear[3];
    return `${year}-${month}-${day}`;
  }

  // 5. DD Month (e.g. "23 Sep", "23 September")
  const textDateNoYear = clean.match(/(\d{1,2})\s+([A-Za-z]+)/);
  if (textDateNoYear) {
    const day = textDateNoYear[1].padStart(2, '0');
    const mStr = textDateNoYear[2].toLowerCase().slice(0, 4);
    const month = MONTH_MAP[mStr] || MONTH_MAP[mStr.slice(0, 3)];
    if (month) {
      return `${defaultYear}-${month}-${day}`;
    }
  }

  // 6. DD/MM without year (e.g. "23/9", "23/09")
  const dmNoYear = clean.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
  if (dmNoYear) {
    const day = dmNoYear[1].padStart(2, '0');
    const month = dmNoYear[2].padStart(2, '0');
    return `${defaultYear}-${month}-${day}`;
  }

  return clean;
}

export interface ExtractedDateInfo {
  rawDate: string;
  isoDate: string;
}

/**
 * Extracts and normalizes any date mentioned in a text line.
 * Handles formats: "23 Sep 2026", "23 September", "Wednesday 23/9/2026", "23/09/2026", "23/9 (Wed)", "23-09-2026"
 */
export function extractDateFromText(text: string, defaultYear: string = '2026'): ExtractedDateInfo | null {
  const clean = text.trim();
  if (!clean) return null;

  // 1. Text date with explicit month name: "23 Sep 2026", "23 September", "Wed 23 Sep"
  const textDateMatch = clean.match(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+(\d{4}|\d{2}))?\b/i
  );
  if (textDateMatch) {
    const day = textDateMatch[1].padStart(2, '0');
    const mStr = textDateMatch[2].toLowerCase().slice(0, 4);
    const month = MONTH_MAP[mStr] || MONTH_MAP[mStr.slice(0, 3)];
    if (month) {
      let year = defaultYear;
      if (textDateMatch[3]) {
        year = textDateMatch[3].length === 2 ? `20${textDateMatch[3]}` : textDateMatch[3];
      }
      return { rawDate: textDateMatch[0], isoDate: `${year}-${month}-${day}` };
    }
  }

  // 2. Numeric date with explicit 4-digit or 2-digit year: "23/09/2026", "23-09-2026", "23/9/26", "2026-09-23"
  const fullNumDateMatch = clean.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/);
  if (fullNumDateMatch) {
    const day = fullNumDateMatch[1].padStart(2, '0');
    const month = fullNumDateMatch[2].padStart(2, '0');
    const year = fullNumDateMatch[3].length === 2 ? `20${fullNumDateMatch[3]}` : fullNumDateMatch[3];
    const mNum = parseInt(month, 10);
    const dNum = parseInt(day, 10);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return { rawDate: fullNumDateMatch[0], isoDate: `${year}-${month}-${day}` };
    }
  }

  // 2b. ISO date YYYY-MM-DD
  const isoMatch = clean.match(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return { rawDate: isoMatch[0], isoDate: `${year}-${month}-${day}` };
  }

  // 3. Numeric date without year: "23/9", "23/09", "23-9"
  const dayOfWeekMatch = clean.match(/\b(Mon|Monday|Tue|Tuesday|Wed|Wednesday|Thu|Thursday|Fri|Friday|Sat|Saturday|Sun|Sunday)\b/i);
  const shortNumDateMatch = clean.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
  if (shortNumDateMatch) {
    const isClassroom = /\b(?:Classroom|Room|Hall|Lab|Venue)\s*\d+[/-]\d+/i.test(clean);
    const part1 = parseInt(shortNumDateMatch[1], 10);
    const part2 = parseInt(shortNumDateMatch[2], 10);
    if (!isClassroom && (dayOfWeekMatch || (part1 >= 1 && part1 <= 31 && part2 >= 1 && part2 <= 12 && (part1 > 12 || part2 >= 5)))) {
      const day = String(part1).padStart(2, '0');
      const month = String(part2).padStart(2, '0');
      return { rawDate: shortNumDateMatch[0], isoDate: `${defaultYear}-${month}-${day}` };
    }
  }

  return null;
}

/**
 * Parses time range and derives startTime, endTime and exact duration in minutes
 * e.g. "0815 - 0945" -> { startTime: "08:15", endTime: "09:45", durationMins: 90 }
 * e.g. "1045 - 1145" -> { startTime: "10:45", endTime: "11:45", durationMins: 60 }
 */
export function parseTimeRange(raw: string): { startTime: string; endTime: string; durationMins: number } | null {
  const clean = raw.trim();
  const match = clean.match(/(\d{1,2}[:.]?\d{2})\s*-\s*(\d{1,2}[:.]?\d{2})/);
  if (!match) return null;

  const startStr = match[1].replace(/[:.]/, '');
  const endStr = match[2].replace(/[:.]/, '');

  const startH = parseInt(startStr.length === 3 ? startStr.slice(0, 1) : startStr.slice(0, 2), 10);
  const startM = parseInt(startStr.slice(-2), 10);

  const endH = parseInt(endStr.length === 3 ? endStr.slice(0, 1) : endStr.slice(0, 2), 10);
  const endM = parseInt(endStr.slice(-2), 10);

  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;

  const durationMins = endTotal > startTotal ? endTotal - startTotal : 90;

  const startTime = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
  const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

  return { startTime, endTime, durationMins };
}

/**
 * Parses duration strings like "1 hr 30 mins", "2 hrs", "30 mins", "40 mins", "1 hr 15 mins", "1 hr"
 */
function parseDurationMins(raw: string, fallbackMins: number = 90): number {
  const clean = raw.toLowerCase().trim();
  let totalMins = 0;

  const hrMatch = clean.match(/(\d+)\s*(?:hr|hour|hrs|hours)/);
  if (hrMatch) {
    totalMins += parseInt(hrMatch[1], 10) * 60;
  }

  const minMatch = clean.match(/(\d+)\s*(?:min|mins|minute|minutes)/);
  if (minMatch) {
    totalMins += parseInt(minMatch[1], 10);
  }

  if (totalMins > 0) return totalMins;

  const numOnly = parseInt(clean.replace(/\D/g, ''), 10);
  if (!isNaN(numOnly) && numOnly > 0 && numOnly <= 360) return numOnly;

  return fallbackMins;
}

export interface InternalSubjectMapping {
  baseSubjectCode: string;
  paperCode: string;
  paperTitle: string;
  paperType: PaperType;
  requiresComputer: boolean;
  eligibleStudentCodes: string[];
}

/**
 * Resolves standard internal school timetable subject names & streams into
 * matching paper codes and base subject codes matching MOE Mark Sheet (RE_RES_090).
 * Duplicates MTL (Mother Tongue Language) papers into Chinese Language (CL), Malay Language (ML), and Tamil Language (TL).
 */
export function resolveInternalSubjectMapping(
  stream: string,
  subjectTitle: string
): InternalSubjectMapping[] {
  const cleanSubj = subjectTitle.trim();
  const upperSubj = cleanSubj.toUpperCase();
  const cleanStream = (stream || 'G3').toUpperCase().trim();

  let paperType: PaperType = 'STANDARD';
  if (/\b(?:LISTENING|LC)\b/i.test(upperSubj)) {
    paperType = 'LISTENING_COMP';
  } else if (/\b(?:SCIENCE PRACTICAL|PRACTICAL EXAM|PRACTICAL LAB)\b/i.test(upperSubj) || (/\bPRACTICAL\b/i.test(upperSubj) && !upperSubj.includes('COMPUTER'))) {
    paperType = 'SCIENCE_LAB';
  }

  const requiresComputer =
    upperSubj.includes('E-EXAM') ||
    upperSubj.includes('COMPUTER') ||
    upperSubj.includes('COMPUTING');

  let suffix = '';
  let paperNumLabel = '';
  if (upperSubj.includes('P1') || upperSubj.includes('PAPER 1')) {
    suffix = '/P1';
    paperNumLabel = 'Paper 1';
  } else if (upperSubj.includes('P2') || upperSubj.includes('PAPER 2')) {
    suffix = '/P2';
    paperNumLabel = 'Paper 2';
  } else if (upperSubj.includes('LISTENING') || upperSubj.includes('LC')) {
    suffix = '/LC';
    paperNumLabel = 'LC';
  }

  // 1. English Language
  if (upperSubj.includes('ENGLISH LANGUAGE') || upperSubj.startsWith('EL')) {
    const baseSubjectCode = `EL - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `English Language${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 2. Mother Tongue Language (Duplicated into CL, ML, and TL)
  if (upperSubj.includes('MOTHER TONGUE') || upperSubj.includes('MTL')) {
    const clBase = `CL - ${cleanStream}`;
    const clCode = suffix ? `${clBase}${suffix}` : clBase;
    const clTitle = `Chinese Language${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;

    const mlBase = `ML - ${cleanStream}`;
    const mlCode = suffix ? `${mlBase}${suffix}` : mlBase;
    const mlTitle = `Malay Language${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;

    const tlBase = `TL - ${cleanStream}`;
    const tlCode = suffix ? `${tlBase}${suffix}` : tlBase;
    const tlTitle = `Tamil Language${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;

    return [
      {
        baseSubjectCode: clBase,
        paperCode: clCode,
        paperTitle: clTitle,
        paperType,
        requiresComputer,
        eligibleStudentCodes: [clBase],
      },
      {
        baseSubjectCode: mlBase,
        paperCode: mlCode,
        paperTitle: mlTitle,
        paperType,
        requiresComputer,
        eligibleStudentCodes: [mlBase],
      },
      {
        baseSubjectCode: tlBase,
        paperCode: tlCode,
        paperTitle: tlTitle,
        paperType,
        requiresComputer,
        eligibleStudentCodes: [tlBase],
      },
    ];
  }

  // 3. Higher Chinese Language
  if (upperSubj.includes('HIGHER CHINESE') || upperSubj.includes('HCL')) {
    const baseSubjectCode = `HCL - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Higher Chinese${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 4. Chinese Language (Direct)
  if (upperSubj.includes('CHINESE') || upperSubj.startsWith('CL')) {
    const baseSubjectCode = `CL - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Chinese Language${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 5. Malay Language (Direct)
  if (upperSubj.includes('MALAY') || upperSubj.startsWith('ML')) {
    const baseSubjectCode = `ML - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Malay Language${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 6. Tamil Language (Direct)
  if (upperSubj.includes('TAMIL') || upperSubj.startsWith('TL')) {
    const baseSubjectCode = `TL - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Tamil Language${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 7. Mathematics
  if (upperSubj.includes('MATHEMATICS') || upperSubj.includes('MATHS') || upperSubj.startsWith('MATH')) {
    const baseSubjectCode = `Maths - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Mathematics${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 8. Science
  if (upperSubj.includes('SCIENCE') || upperSubj.startsWith('SCI')) {
    const baseSubjectCode = `Sci - ${cleanStream}`;
    return [{
      baseSubjectCode,
      paperCode: baseSubjectCode,
      paperTitle: `Science (${cleanStream})`,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 9. Geography
  if (upperSubj.includes('GEOGRAPHY') || upperSubj.includes('GEOG')) {
    const baseSubjectCode = `HUM(GEOG) - ${cleanStream}`;
    return [{
      baseSubjectCode,
      paperCode: baseSubjectCode,
      paperTitle: `Geography (${cleanStream})`,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 10. History
  if (upperSubj.includes('HISTORY') || upperSubj.includes('HIST')) {
    const baseSubjectCode = `HUM(HIST) - ${cleanStream}`;
    return [{
      baseSubjectCode,
      paperCode: baseSubjectCode,
      paperTitle: `History (${cleanStream})`,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 11. English Literature
  if (upperSubj.includes('LITERATURE') || upperSubj.includes('LIT')) {
    const baseSubjectCode = `HUM(LIT E) - ${cleanStream}`;
    return [{
      baseSubjectCode,
      paperCode: baseSubjectCode,
      paperTitle: `Literature in English (${cleanStream})`,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // Fallback generic
  const fallbackBase = `${cleanSubj} - ${cleanStream}`;
  return [{
    baseSubjectCode: fallbackBase,
    paperCode: fallbackBase,
    paperTitle: `${cleanSubj} (${cleanStream})`,
    paperType,
    requiresComputer,
    eligibleStudentCodes: [fallbackBase, cleanSubj],
  }];
}

/**
 * Parses an internal school timetable PDF (such as Canberra Secondary School 2026 EOY timetable)
 */
export async function parseInternalPdfTimetable(file: File): Promise<InternalTimetableParseResult> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const papersMap = new Map<string, ExamPaper>();
  let rowCount = 0;
  let lastCarriedDate = '';

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows: { y: number; items: { x: number; str: string }[] }[] = [];

    const pageText = content.items.map((i: any) => i.str || '').join(' ').toUpperCase();
    let pageLevel = '';
    const lvlMatch = pageText.match(/\b(SECONDARY\s*[1-6]|SEC\s*[1-6]|PRIMARY\s*[1-6]|PRI\s*[1-6]|JC\s*[1-2]|LEVEL\s*[1-6]|GRADE\s*[1-6]|YEAR\s*[1-6])\b/i);
    if (lvlMatch) {
      const num = extractLevelNumber(lvlMatch[1]);
      if (num) {
        if (/PRI/i.test(lvlMatch[1])) pageLevel = `Primary ${num}`;
        else if (/JC/i.test(lvlMatch[1])) pageLevel = `JC ${num}`;
        else pageLevel = `Secondary ${num}`;
      }
    }

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

    // 1. Extract and segment all date anchors on this page
    interface DateAnchor {
      y: number;
      isoDate: string;
      rawDate: string;
    }

    const rawAnchors: DateAnchor[] = [];
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      const rowText = r.items.map((i) => i.str).join(' ');
      const d = extractDateFromText(rowText);
      if (d) {
        rawAnchors.push({ y: r.y, isoDate: d.isoDate, rawDate: d.rawDate });
      }
    }

    // Deduplicate date anchors: group anchors with same date or very close Y
    const dateAnchors: DateAnchor[] = [];
    for (const anchor of rawAnchors) {
      const existing = dateAnchors.find(
        (a) => a.isoDate === anchor.isoDate || Math.abs(a.y - anchor.y) <= 15
      );
      if (!existing) {
        dateAnchors.push(anchor);
      }
    }
    dateAnchors.sort((a, b) => b.y - a.y);

    let pageCurrentStream = 'G3';

    for (const r of rows) {
      const rowText = r.items.map((i) => i.str).join(' ');
      const upperRow = rowText.toUpperCase();

      // Check if this row mentions a specific level
      const rowLevelMatch = rowText.match(/\b(Secondary\s*[1-6]|Sec\s*[1-6]|Primary\s*[1-6]|Pri\s*[1-6]|JC\s*[1-2])\b/i);
      if (rowLevelMatch) {
        const num = extractLevelNumber(rowLevelMatch[1]);
        if (num) {
          if (/PRI/i.test(rowLevelMatch[1])) pageLevel = `Primary ${num}`;
          else if (/JC/i.test(rowLevelMatch[1])) pageLevel = `JC ${num}`;
          else pageLevel = `Secondary ${num}`;
        }
      }

      // Skip headers and non-exam remarks
      if (
        upperRow.includes('END-OF-YEAR EXAMINATION') ||
        upperRow.includes('DEAR STUDENTS') ||
        upperRow.includes('PLEASE NOTE') ||
        upperRow.includes('NORMAL LESSONS') ||
        upperRow.includes('MARKING DAY') ||
        upperRow.includes('HBL') ||
        upperRow.includes('NO PAPER') ||
        upperRow.includes('WE WISH YOU ALL') ||
        upperRow.includes('EXAM COMMITTEE') ||
        upperRow.startsWith('S/NO.') ||
        upperRow.includes('CANBERRA SECONDARY')
      ) {
        continue;
      }

      // Check for time range pattern: e.g. "0815 - 0945", "1100 - 1230", "08:15 - 09:45"
      const timeInfo = parseTimeRange(rowText);
      if (!timeInfo) {
        continue;
      }

      // Determine date for this session row based on vertical bounding box segmentation
      let sessionDate = '';
      if (dateAnchors.length === 1) {
        sessionDate = dateAnchors[0].isoDate;
      } else if (dateAnchors.length > 1) {
        // Compute split midpoints between consecutive date anchors
        // dateAnchors sorted descending by Y: A[0] (top), A[1] (middle), A[2] (bottom)
        const boundaries: number[] = [];
        for (let i = 0; i < dateAnchors.length - 1; i++) {
          boundaries.push((dateAnchors[i].y + dateAnchors[i + 1].y) / 2);
        }

        if (r.y > boundaries[0]) {
          sessionDate = dateAnchors[0].isoDate;
        } else if (r.y <= boundaries[boundaries.length - 1]) {
          sessionDate = dateAnchors[dateAnchors.length - 1].isoDate;
        } else {
          for (let i = 0; i < boundaries.length; i++) {
            const topBoundary = boundaries[i];
            const bottomBoundary = i + 1 < boundaries.length ? boundaries[i + 1] : -Infinity;
            if (r.y <= topBoundary && r.y > bottomBoundary) {
              sessionDate = dateAnchors[i + 1].isoDate;
              break;
            }
          }
        }
      } else {
        sessionDate = lastCarriedDate;
      }

      if (!sessionDate) {
        continue;
      }
      lastCarriedDate = sessionDate;

      // Check all streams mentioned on this row: e.g. G1, G2, G3
      const rowStreams = Array.from(rowText.matchAll(/\b(G1|G2|G3|EXP|NA|NT)\b/gi)).map((m) => m[1].toUpperCase());
      const targetStreams = rowStreams.length > 0 ? Array.from(new Set(rowStreams)) : [pageCurrentStream];
      if (rowStreams.length === 1) {
        pageCurrentStream = rowStreams[0];
      }

      // Check duration: e.g. "1 hr 30 mins", "2 hrs", "30 mins", "40 mins"
      const durationMatch = rowText.match(/(\d+\s*(?:hr|hrs|hour|hours))?(?:\s*(\d+)\s*(?:min|mins|minutes))?/i);
      const durationRaw = durationMatch ? durationMatch[0] : '';

      // Check venue: "Classrooms" or "Computer Labs"
      const venueStr = upperRow.includes('COMPUTER LAB') ? 'Computer Labs' : 'Classrooms';

      // Extract subject title by filtering out Date, Stream, Duration, Time, Venue
      let remaining = rowText;
      const extractedDate = extractDateFromText(rowText);
      if (extractedDate) remaining = remaining.replace(extractedDate.rawDate, '');
      remaining = remaining
        .replace(/Wednesday|Thursday|Friday|Monday|Tuesday|Saturday|Sunday/gi, '')
        .replace(/\d{1,2}[:.]?\d{2}\s*-\s*\d{1,2}[:.]?\d{2}/g, '')
        .replace(durationRaw, '')
        .replace(/Classrooms|Computer Labs/gi, '')
        .replace(/\b(G1|G2|G3|EXP|NA|NT)\b/gi, '')
        .replace(/^\s*\d+\s+/, '') // leading s/no
        .trim();

      const subjectTitle = remaining.replace(/\s{2,}/g, ' ').trim();
      if (!subjectTitle || subjectTitle.length < 2) continue;

      for (const st of targetStreams) {
        const mappings = resolveInternalSubjectMapping(st, subjectTitle);
        for (const mapping of mappings) {
          const durationMins = durationRaw ? parseDurationMins(durationRaw, timeInfo.durationMins) : timeInfo.durationMins;
          const requiresComputer = venueStr === 'Computer Labs' || mapping.requiresComputer;

          const levelSlug = pageLevel ? pageLevel.toLowerCase().replace(/[^a-z0-9]/g, '') : 'all';
          const paperId = `paper-${levelSlug}-${sessionDate}-${mapping.paperCode.replace(/[^A-Za-z0-9]/g, '-')}`;

          if (!papersMap.has(paperId)) {
            papersMap.set(paperId, {
              id: paperId,
              code: mapping.paperCode,
              title: mapping.paperTitle,
              durationMins,
              type: mapping.paperType,
              requiresComputer,
              allowCombine: false,
              date: sessionDate,
              startTime: timeInfo.startTime,
              level: pageLevel || undefined,
              stream: st,
              baseSubjectCode: mapping.baseSubjectCode,
              venueType: venueStr,
            });
            rowCount++;
          }
        }
      }
    }
  }

  const sortedPapers = Array.from(papersMap.values()).sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.startTime.localeCompare(b.startTime);
  });

  return {
    papers: sortedPapers,
    rowCount,
  };
}

/**
 * Parses internal school timetable spreadsheets (.xlsx, .xls, .csv)
 */
export async function parseInternalSpreadsheetTimetable(
  file: File
): Promise<InternalTimetableParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

  if (rows.length === 0) {
    throw new Error(`Timetable file "${file.name}" contains no rows.`);
  }

  const papersMap = new Map<string, ExamPaper>();
  let rowCount = 0;

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
    const title = getVal(['paper title', 'title', 'subject name', 'subject', 'description']);
    const rawDate = getVal(['date', 'exam date', 'day']);
    const rawTime = getVal(['start time', 'time', 'start', 'session time']);
    const rawDuration = getVal(['duration', 'duration (mins)', 'duration (minutes)', 'duration mins']);
    const rawLevel = getVal(['academic level', 'level', 'acad level', 'grade', 'year']);
    const rawStream = getVal(['stream', 'course', 'banding']) || 'G3';
    const mode = getVal(['mode', 'mode of assessment', 'moa', 'type', 'paper type']).toUpperCase();
    const compRaw = getVal(['requires computer', 'computer', 'pc', 'e-exam']).toLowerCase();

    if (!rawCode && !title) continue;

    const formattedDate = normalizeSingaporeDate(rawDate);
    const timeInfo = parseTimeRange(rawTime);
    const startTime = timeInfo ? timeInfo.startTime : (rawTime.match(/\d{1,2}:\d{2}/)?.[0] || '08:00');
    const duration = rawDuration ? parseDurationMins(rawDuration, timeInfo?.durationMins || 90) : (timeInfo?.durationMins || 90);

    let paperType: PaperType = 'STANDARD';
    if (mode.includes('PRACTICAL') || mode.includes('LAB') || title.toUpperCase().includes('PRACTICAL')) {
      paperType = 'SCIENCE_LAB';
    } else if (mode.includes('LISTENING') || mode.includes('LC') || title.toUpperCase().includes('LISTENING')) {
      paperType = 'LISTENING_COMP';
    }

    const requiresComputer = compRaw === 'yes' || compRaw === 'true' || compRaw === '1';
    const levelSlug = rawLevel ? rawLevel.toLowerCase().replace(/[^a-z0-9]/g, '') : 'all';

    // If explicit paper code provided
    if (rawCode) {
      const paperId = `paper-${levelSlug}-${formattedDate}-${rawCode.replace(/[^A-Za-z0-9]/g, '-')}`;
      if (!papersMap.has(paperId)) {
        papersMap.set(paperId, {
          id: paperId,
          code: rawCode,
          title: title || rawCode,
          durationMins: duration,
          type: paperType,
          requiresComputer,
          allowCombine: false,
          date: formattedDate,
          startTime,
          level: rawLevel || undefined,
          stream: rawStream,
          baseSubjectCode: rawCode.includes('/') ? rawCode.split('/')[0] : rawCode,
        });
        rowCount++;
      }
    } else {
      // Resolve subject mapping
      const mappings = resolveInternalSubjectMapping(rawStream, title);
      for (const mapping of mappings) {
        const paperId = `paper-${levelSlug}-${formattedDate}-${mapping.paperCode.replace(/[^A-Za-z0-9]/g, '-')}`;
        if (!papersMap.has(paperId)) {
          papersMap.set(paperId, {
            id: paperId,
            code: mapping.paperCode,
            title: mapping.paperTitle,
            durationMins: duration,
            type: mapping.paperType,
            requiresComputer: requiresComputer || mapping.requiresComputer,
            allowCombine: false,
            date: formattedDate,
            startTime,
            level: rawLevel || undefined,
            stream: rawStream,
            baseSubjectCode: mapping.baseSubjectCode,
          });
          rowCount++;
        }
      }
    }
  }

  const sortedPapers = Array.from(papersMap.values()).sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.startTime.localeCompare(b.startTime);
  });

  return {
    papers: sortedPapers,
    rowCount,
  };
}

/**
 * Multi-file parser for internal school timetables (.pdf, .xlsx, .xls, .csv)
 */
export async function parseMultipleInternalTimetableFiles(
  files: File[]
): Promise<MultiInternalTimetableParseResult> {
  const fileReports: { fileName: string; paperCount: number; rowCount: number }[] = [];
  const papersMap = new Map<string, ExamPaper>();

  for (const file of files) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const res = isPdf
      ? await parseInternalPdfTimetable(file)
      : await parseInternalSpreadsheetTimetable(file);

    fileReports.push({
      fileName: file.name,
      paperCount: res.papers.length,
      rowCount: res.rowCount,
    });

    for (const paper of res.papers) {
      if (!papersMap.has(paper.id)) {
        papersMap.set(paper.id, paper);
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

/**
 * Connects internal candidates' enrolled subject codes with the timetable's
 * specific paper codes (e.g. expands candidate taking "EL - G3" to also include
 * "EL - G3/P1", "EL - G3/P2", "EL - G3/LC", and "CL - G3" to "CL - G3/P1", etc.)
 * Strictly respects candidate academic level (e.g. Sec 1 student only takes Sec 1 papers)
 * so the seating allocation engine seamlessly allocates students without cross-level or duplicate paper clashes.
 */
export function syncInternalCandidateEnrollments(
  candidates: Candidate[],
  papers: ExamPaper[]
): Candidate[] {
  // Collect all base subject codes that have specific component sub-papers in the timetable
  const baseCodesWithSubPapers = new Set<string>();
  papers.forEach((p) => {
    if (p.baseSubjectCode && p.code !== p.baseSubjectCode) {
      baseCodesWithSubPapers.add(p.baseSubjectCode);
    } else if (p.code.includes('/')) {
      const [prefix] = p.code.split('/');
      baseCodesWithSubPapers.add(prefix);
    }
  });

  return candidates.map((cand) => {
    const enrolledSet = new Set(cand.subjectCodes);
    const candLevelNum = cand.academicLevel
      ? extractLevelNumber(cand.academicLevel)
      : cand.classGroup
        ? extractLevelNumber(cand.classGroup)
        : undefined;

    for (const paper of papers) {
      // If both candidate and paper have known academic level numbers, ensure they match!
      const paperLevelNum = extractLevelNumber(paper.level);
      if (candLevelNum !== undefined && paperLevelNum !== undefined && candLevelNum !== paperLevelNum) {
        continue;
      }

      // Direct match
      if (enrolledSet.has(paper.code)) continue;

      // Match base subject code (e.g. "EL - G3" matches "EL - G3/P1", "CL - G3" matches "CL - G3/P1")
      if (paper.baseSubjectCode && enrolledSet.has(paper.baseSubjectCode)) {
        enrolledSet.add(paper.code);
        continue;
      }

      // Match slash prefix if baseSubjectCode was omitted (e.g. "CL - G3/P1" -> "CL - G3")
      if (paper.code.includes('/')) {
        const [prefix] = paper.code.split('/');
        if (enrolledSet.has(prefix)) {
          enrolledSet.add(paper.code);
          continue;
        }
      }

      // Special handling for Mother Tongue Language (MTL) group subjects:
      // ONLY enroll candidate into generic MTL paper if no specific language paper (CL/ML/TL) is scheduled concurrently
      if (paper.code.startsWith('MTL - ')) {
        const stream = paper.stream || 'G3';
        const isEligibleMtl =
          enrolledSet.has(`CL - ${stream}`) ||
          enrolledSet.has(`ML - ${stream}`) ||
          enrolledSet.has(`TL - ${stream}`);

        if (isEligibleMtl) {
          // Check if a specific CL/ML/TL paper exists for this student on this same timetable slot
          const hasConcurrentSpecificLanguage = papers.some(
            (p) =>
              p.id !== paper.id &&
              arePapersConcurrent(p, paper) &&
              (
                (enrolledSet.has(`CL - ${stream}`) && (p.code.startsWith(`CL - ${stream}`) || p.baseSubjectCode === `CL - ${stream}`)) ||
                (enrolledSet.has(`ML - ${stream}`) && (p.code.startsWith(`ML - ${stream}`) || p.baseSubjectCode === `ML - ${stream}`)) ||
                (enrolledSet.has(`TL - ${stream}`) && (p.code.startsWith(`TL - ${stream}`) || p.baseSubjectCode === `TL - ${stream}`))
              )
          );

          if (!hasConcurrentSpecificLanguage) {
            enrolledSet.add(paper.code);
          }
        }
      }
    }

    // Prune base codes if specific sub-papers exist in timetable and were enrolled
    // e.g. If candidate has "Maths - G3/P1" and "Maths - G3/P2", prune "Maths - G3"
    for (const baseCode of baseCodesWithSubPapers) {
      const hasSpecificPaper = papers.some((p) => p.code !== baseCode && (p.baseSubjectCode === baseCode || p.code.startsWith(`${baseCode}/`)) && enrolledSet.has(p.code));
      const hasActualPaperForBase = papers.some((p) => p.code === baseCode);
      if (hasSpecificPaper && !hasActualPaperForBase) {
        enrolledSet.delete(baseCode);
      }
    }

    return {
      ...cand,
      subjectCodes: Array.from(enrolledSet),
    };
  });
}

