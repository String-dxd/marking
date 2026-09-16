import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ExamPaper, PaperType, Candidate } from '../types';
import { arePapersConcurrent, extractLevelNumber } from './allocationEngine';

// PDF.js worker setup
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
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
export function parseDurationMins(raw: string, fallbackMins: number = 90): number {
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
  let cleanSubj = subjectTitle.trim();
  const requiresComputer =
    /\b(?:e-exam|e-examination|computer|computing)\b/i.test(cleanSubj) ||
    /\(e-exam/i.test(cleanSubj) ||
    /\(e-examination/i.test(cleanSubj);

  cleanSubj = cleanSubj
    .replace(/\[.*?\]/g, '')
    .replace(/\(e-Examination\)|\(e-Exam\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const upperSubj = cleanSubj.toUpperCase();
  const cleanStream = (stream || 'G3').toUpperCase().trim();

  let paperType: PaperType = 'STANDARD';
  if (/\b(?:LISTENING|LC)\b/i.test(upperSubj)) {
    paperType = 'LISTENING_COMP';
  } else if (/\b(?:SCIENCE PRACTICAL|PRACTICAL EXAM|PRACTICAL LAB)\b/i.test(upperSubj) || (/\bPRACTICAL\b/i.test(upperSubj) && !upperSubj.includes('COMPUTER'))) {
    paperType = 'SCIENCE_LAB';
  }

  let suffix = '';
  let paperNumLabel = '';
  if (upperSubj.includes('P1') || upperSubj.includes('PAPER 1')) {
    suffix = '/P1';
    paperNumLabel = 'Paper 1';
  } else if (upperSubj.includes('P2') || upperSubj.includes('PAPER 2')) {
    suffix = '/P2';
    paperNumLabel = 'Paper 2';
  } else if (upperSubj.includes('P3') || upperSubj.includes('PAPER 3')) {
    suffix = '/P3';
    paperNumLabel = 'Paper 3';
  } else if (upperSubj.includes('P4') || upperSubj.includes('PAPER 4')) {
    suffix = '/P4';
    paperNumLabel = 'Paper 4';
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

  // 7. Additional Mathematics (must precede Mathematics)
  if (upperSubj.includes('ADDITIONAL MATHEMATICS') || upperSubj.includes('ADD MATH') || upperSubj.includes('A-MATH')) {
    const baseSubjectCode = `A-Math - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Additional Mathematics${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 8. Mathematics
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

  // 9. Nutrition & Food Science / Food & Consumer Education (must precede Science)
  if (upperSubj.includes('NUTRITION') || upperSubj.includes('FOOD SCIENCE') || upperSubj.includes('NFS') || upperSubj.includes('FCE')) {
    const baseSubjectCode = `NFS - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Nutrition & Food Science${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 10. Computing / Computer Applications
  if (upperSubj.includes('COMPUTING') || upperSubj.includes('COMPUTER APPLICATIONS') || upperSubj.includes('CPA')) {
    const baseSubjectCode = `Computing - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Computing${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer: true,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 11. Design & Technology
  if (upperSubj.includes('DESIGN & TECHNOLOGY') || upperSubj.includes('DESIGN AND TECHNOLOGY') || upperSubj.includes('D&T')) {
    const baseSubjectCode = `D&T - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Design & Technology${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 12. Art
  if (upperSubj.startsWith('ART') || upperSubj.includes(' ART')) {
    const baseSubjectCode = `Art - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Art${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 13. Social Studies
  if (upperSubj.includes('SOCIAL STUDIES') || upperSubj.startsWith('SS')) {
    const baseSubjectCode = `SS - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    const paperTitle = `Social Studies (${cleanStream})`;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 14. Chemistry
  if (upperSubj.includes('CHEMISTRY') || upperSubj.includes('CHEM')) {
    const baseSubjectCode = upperSubj.includes('SCIENCE') ? `Sci(Chem) - ${cleanStream}` : `Chemistry - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle: `${cleanSubj} (${cleanStream})`,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 15. Physics
  if (upperSubj.includes('PHYSICS') || upperSubj.includes('PHY')) {
    const baseSubjectCode = upperSubj.includes('SCIENCE') ? `Sci(Phy) - ${cleanStream}` : `Physics - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle: `${cleanSubj} (${cleanStream})`,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 16. Biology
  if (upperSubj.includes('BIOLOGY') || upperSubj.includes('BIO')) {
    const baseSubjectCode = upperSubj.includes('SCIENCE') ? `Sci(Bio) - ${cleanStream}` : `Biology - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle: `${cleanSubj} (${cleanStream})`,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 17. Science generic
  if (upperSubj.includes('SCIENCE') || upperSubj.startsWith('SCI')) {
    const baseSubjectCode = `Sci - ${cleanStream}`;
    const paperCode = suffix ? `${baseSubjectCode}${suffix}` : baseSubjectCode;
    return [{
      baseSubjectCode,
      paperCode,
      paperTitle: `Science${paperNumLabel ? ' ' + paperNumLabel : ''} (${cleanStream})`,
      paperType,
      requiresComputer,
      eligibleStudentCodes: [baseSubjectCode],
    }];
  }

  // 18. Geography
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

  // 19. History
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

  // 20. English Literature
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
    paperCode: suffix ? `${fallbackBase}${suffix}` : fallbackBase,
    paperTitle: `${cleanSubj} (${cleanStream})`,
    paperType,
    requiresComputer,
    eligibleStudentCodes: [fallbackBase, cleanSubj],
  }];
}

/**
 * Parses an internal school timetable PDF (such as Canberra Secondary School 2026 EOY timetable)
 */
interface GridLine {
  y: number;
  x1: number;
  x2: number;
  type: 'FULL_DAY_ROW' | 'STREAM_ROW' | 'SUBJECT_ROW' | 'OTHER';
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
  let carryLevel = '';

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const ops = await page.getOperatorList();

    const pageText = content.items.map((i: any) => i.str || '').join(' ').toUpperCase();
    let pageLevel = carryLevel;
    const lvlMatch = pageText.match(
      /\b(SECONDARY\s*[1-6]|SEC\s*[1-6]|PRIMARY\s*[1-6]|PRI\s*[1-6]|JC\s*[1-2]|LEVEL\s*[1-6]|GRADE\s*[1-6]|YEAR\s*[1-6])\b/i
    );
    if (lvlMatch) {
      const num = extractLevelNumber(lvlMatch[1]);
      if (num) {
        if (/PRI/i.test(lvlMatch[1])) pageLevel = `Primary ${num}`;
        else if (/JC/i.test(lvlMatch[1])) pageLevel = `JC ${num}`;
        else pageLevel = `Secondary ${num}`;
        carryLevel = pageLevel;
      }
    }

    // Extract horizontal grid lines from vector graphics (e.g. Word / PDF tables)
    const lines: GridLine[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === pdfjsLib.OPS.constructPath) {
        const bbox = ops.argsArray[i][2];
        if (bbox && bbox.length === 4) {
          const minX = Math.round(bbox[0]);
          const minY = Math.round(bbox[1]);
          const maxX = Math.round(bbox[2]);
          const maxY = Math.round(bbox[3]);
          const h = maxY - minY;
          const w = maxX - minX;

          if (h <= 2 && w >= 50) {
            let type: GridLine['type'] = 'OTHER';
            if (minX <= 55 && maxX >= 430) type = 'FULL_DAY_ROW';
            else if (minX <= 125 && maxX >= 430) type = 'STREAM_ROW';
            else if (minX <= 145 && maxX >= 430) type = 'SUBJECT_ROW';
            lines.push({ y: minY, x1: minX, x2: maxX, type });
          }
        }
      }
    }
    lines.sort((a, b) => b.y - a.y);

    const dedupLines: GridLine[] = [];
    for (const l of lines) {
      const existing = dedupLines.find((x) => Math.abs(x.y - l.y) <= 2);
      if (!existing) {
        dedupLines.push(l);
      } else if (l.type === 'FULL_DAY_ROW') {
        existing.type = 'FULL_DAY_ROW';
      }
    }
    dedupLines.sort((a, b) => b.y - a.y);

    const dayLines = dedupLines.filter((l) => l.type === 'FULL_DAY_ROW');

    const items = (content.items as any[])
      .map((i) => ({
        str: (i.str || '').trim(),
        x: Math.round(i.transform[4]),
        y: Math.round(i.transform[5]),
      }))
      .filter((i) => i.str.length > 0);

    // Strategy 1: Grid-based table cell segmentation (exact for bordered school tables)
    if (dayLines.length >= 2) {
      for (let d = 0; d < dayLines.length - 1; d++) {
        const topY = dayLines[d].y;
        const bottomY = dayLines[d + 1].y;

        const dayItems = items.filter((it) => it.y < topY && it.y >= bottomY);
        if (dayItems.length === 0) continue;

        const dayText = dayItems.map((i) => i.str).join(' ');
        const upperDay = dayText.toUpperCase();
        if (
          upperDay.includes('NORMAL LESSONS') ||
          upperDay.includes('MARKING DAY') ||
          upperDay.includes('HBL')
        ) {
          continue;
        }

        let dayDate = '';
        const dateMatch = extractDateFromText(dayText);
        if (dateMatch) dayDate = dateMatch.isoDate;
        else if (lastCarriedDate) dayDate = lastCarriedDate;
        if (!dayDate) continue;
        lastCarriedDate = dayDate;

        const innerLines = dedupLines.filter((l) => l.y < topY && l.y > bottomY);
        const streamLines = innerLines.filter((l) => l.type === 'STREAM_ROW');

        const streamIntervals: { top: number; bottom: number; stream: string }[] = [];
        const streamSplitY = [topY, ...streamLines.map((l) => l.y), bottomY];

        for (let s = 0; s < streamSplitY.length - 1; s++) {
          const sTop = streamSplitY[s];
          const sBtm = streamSplitY[s + 1];
          const sItems = dayItems.filter((it) => it.y < sTop && it.y >= sBtm);

          const sLabel = sItems.find(
            (it) => it.x >= 100 && it.x <= 135 && /^(G1|G2|G3|EXP|NA|NT)$/i.test(it.str)
          );
          const streamName = sLabel
            ? sLabel.str.toUpperCase()
            : (s === 0 ? 'G3' : s === 1 ? 'G2' : 'G1');

          streamIntervals.push({ top: sTop, bottom: sBtm, stream: streamName });
        }

        for (const sInt of streamIntervals) {
          const sItems = dayItems.filter((it) => it.y < sInt.top && it.y >= sInt.bottom);
          if (sItems.length === 0) continue;
          const sText = sItems.map((i) => i.str).join(' ');
          if (sText.toUpperCase().includes('NO PAPER')) continue;

          const subjLines = innerLines.filter(
            (l) => l.type === 'SUBJECT_ROW' && l.y < sInt.top && l.y > sInt.bottom
          );
          const rowSplitY = [sInt.top, ...subjLines.map((l) => l.y), sInt.bottom];

          for (let r = 0; r < rowSplitY.length - 1; r++) {
            const rTop = rowSplitY[r];
            const rBtm = rowSplitY[r + 1];
            const cellItems = sItems.filter((it) => it.y < rTop && it.y >= rBtm);
            if (cellItems.length === 0) continue;

            const cellText = cellItems.map((i) => i.str).join(' ');
            const timeInfo = parseTimeRange(cellText);
            if (!timeInfo) continue;

            const hasEExam =
              /\b(?:e-exam|e-examination)\b/i.test(cellText) ||
              /\(e-exam/i.test(cellText) ||
              /\(e-examination/i.test(cellText) ||
              cellText.toUpperCase().includes('COMPUTER LAB');

            const venueStr = cellText.toUpperCase().includes('COMPUTER LAB')
              ? 'Computer Labs'
              : 'Classrooms';
            const durationMatch = cellText.match(
              /(\d+\s*(?:hr|hrs|hour|hours))?(?:\s*(\d+)\s*(?:min|mins|minutes))?/i
            );
            const durationRaw = durationMatch ? durationMatch[0] : '';
            const durationMins = durationRaw
              ? parseDurationMins(durationRaw, timeInfo.durationMins)
              : timeInfo.durationMins;

            let subjStr = cellItems
              .filter((i) => i.x >= 130 && i.x <= 285)
              .map((i) => i.str)
              .join(' ');
            subjStr = subjStr
              .replace(/\(e-Examination\)|\(e-Exam\)/gi, '')
              .replace(/Classrooms|Computer Labs/gi, '')
              .trim();

            if (!subjStr || subjStr.length < 2) continue;

            const mappings = resolveInternalSubjectMapping(sInt.stream, subjStr);
            for (const mapping of mappings) {
              const requiresComputer = hasEExam || mapping.requiresComputer;
              const levelSlug = pageLevel ? pageLevel.toLowerCase().replace(/[^a-z0-9]/g, '') : 'all';
              const paperId = `paper-${levelSlug}-${dayDate}-${mapping.paperCode.replace(/[^A-Za-z0-9]/g, '-')}`;

              if (!papersMap.has(paperId)) {
                papersMap.set(paperId, {
                  id: paperId,
                  code: mapping.paperCode,
                  title: mapping.paperTitle,
                  durationMins,
                  type: mapping.paperType,
                  requiresComputer,
                  allowCombine: false,
                  date: dayDate,
                  startTime: timeInfo.startTime,
                  level: pageLevel || undefined,
                  stream: sInt.stream,
                  baseSubjectCode: mapping.baseSubjectCode,
                  venueType: venueStr,
                });
                rowCount++;
              }
            }
          }
        }
      }
    } else {
      // Strategy 2: Fallback text-based row parsing with stream proximity grouping
      const rows: { y: number; items: typeof items }[] = [];
      for (const it of items) {
        let r = rows.find((row) => Math.abs(row.y - it.y) <= 3);
        if (!r) {
          r = { y: it.y, items: [] };
          rows.push(r);
        }
        r.items.push(it);
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) r.items.sort((a, b) => a.x - b.x);

      interface DateAnchor {
        y: number;
        isoDate: string;
      }
      const dateAnchors: DateAnchor[] = [];
      for (const r of rows) {
        const rowText = r.items.map((i) => i.str).join(' ');
        const d = extractDateFromText(rowText);
        if (d && !dateAnchors.find((a) => a.isoDate === d.isoDate || Math.abs(a.y - r.y) <= 15)) {
          dateAnchors.push({ y: r.y, isoDate: d.isoDate });
        }
      }
      dateAnchors.sort((a, b) => b.y - a.y);

      const streamLabels: { y: number; stream: string }[] = [];
      for (const it of items) {
        if (it.x >= 100 && it.x <= 135 && /^(G1|G2|G3|EXP|NA|NT)$/i.test(it.str)) {
          streamLabels.push({ y: it.y, stream: it.str.toUpperCase() });
        }
      }
      streamLabels.sort((a, b) => b.y - a.y);

      const getDateForY = (y: number): string => {
        if (dateAnchors.length === 0) return lastCarriedDate;
        if (dateAnchors.length === 1) return dateAnchors[0].isoDate;
        const boundaries: number[] = [];
        for (let i = 0; i < dateAnchors.length - 1; i++) {
          boundaries.push((dateAnchors[i].y + dateAnchors[i + 1].y) / 2);
        }
        if (y > boundaries[0]) return dateAnchors[0].isoDate;
        if (y <= boundaries[boundaries.length - 1]) return dateAnchors[dateAnchors.length - 1].isoDate;
        for (let i = 0; i < boundaries.length; i++) {
          const top = boundaries[i];
          const btm = i + 1 < boundaries.length ? boundaries[i + 1] : -Infinity;
          if (y <= top && y > btm) return dateAnchors[i + 1].isoDate;
        }
        return dateAnchors[0].isoDate;
      };

      for (const r of rows) {
        const rowText = r.items.map((i) => i.str).join(' ');
        const upperRow = rowText.toUpperCase();

        if (
          upperRow.includes('END-OF-YEAR EXAMINATION') ||
          upperRow.includes('NORMAL LESSONS') ||
          upperRow.includes('MARKING DAY') ||
          upperRow.includes('HBL') ||
          upperRow.includes('NO PAPER') ||
          upperRow.startsWith('S/NO.') ||
          upperRow.includes('CANBERRA SECONDARY')
        ) {
          continue;
        }

        const timeInfo = parseTimeRange(rowText);
        if (!timeInfo) continue;

        const sessionDate = getDateForY(r.y);
        if (!sessionDate) continue;
        lastCarriedDate = sessionDate;

        const blockStreams = streamLabels.filter((sl) => getDateForY(sl.y) === sessionDate);
        let assignedStream = 'G3';
        if (blockStreams.length === 1) {
          assignedStream = blockStreams[0].stream;
        } else if (blockStreams.length > 1) {
          const sBoundaries: number[] = [];
          for (let i = 0; i < blockStreams.length - 1; i++) {
            sBoundaries.push((blockStreams[i].y + blockStreams[i + 1].y) / 2);
          }
          if (r.y > sBoundaries[0]) {
            assignedStream = blockStreams[0].stream;
          } else if (r.y <= sBoundaries[sBoundaries.length - 1]) {
            assignedStream = blockStreams[blockStreams.length - 1].stream;
          } else {
            for (let i = 0; i < sBoundaries.length; i++) {
              const top = sBoundaries[i];
              const btm = i + 1 < sBoundaries.length ? sBoundaries[i + 1] : -Infinity;
              if (r.y <= top && r.y > btm) {
                assignedStream = blockStreams[i + 1].stream;
                break;
              }
            }
          }
        }

        const hasEExam =
          /\b(?:e-exam|e-examination)\b/i.test(rowText) ||
          /\(e-exam/i.test(rowText) ||
          /\(e-examination/i.test(rowText) ||
          upperRow.includes('COMPUTER LAB');

        const venueStr = upperRow.includes('COMPUTER LAB') ? 'Computer Labs' : 'Classrooms';
        const durationMatch = rowText.match(
          /(\d+\s*(?:hr|hrs|hour|hours))?(?:\s*(\d+)\s*(?:min|mins|minutes))?/i
        );
        const durationRaw = durationMatch ? durationMatch[0] : '';
        const durationMins = durationRaw
          ? parseDurationMins(durationRaw, timeInfo.durationMins)
          : timeInfo.durationMins;

        let subjStr = r.items
          .filter((i) => i.x >= 130 && i.x <= 285)
          .map((i) => i.str)
          .join(' ');
        if (!subjStr) {
          subjStr = rowText
            .replace(/Wednesday|Thursday|Friday|Monday|Tuesday|Saturday|Sunday/gi, '')
            .replace(/\d{1,2}[:.]?\d{2}\s*-\s*\d{1,2}[:.]?\d{2}/g, '')
            .replace(durationRaw, '')
            .replace(/Classrooms|Computer Labs/gi, '')
            .replace(/\b(G1|G2|G3|EXP|NA|NT)\b/gi, '')
            .replace(/^\s*\d+\s+/, '')
            .trim();
        }
        subjStr = subjStr
          .replace(/\(e-Examination\)|\(e-Exam\)/gi, '')
          .replace(/Classrooms|Computer Labs/gi, '')
          .trim();

        if (!subjStr || subjStr.length < 2) continue;

        const mappings = resolveInternalSubjectMapping(assignedStream, subjStr);
        for (const mapping of mappings) {
          const requiresComputer = hasEExam || mapping.requiresComputer;
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
              stream: assignedStream,
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

    const requiresComputer =
      compRaw === 'yes' ||
      compRaw === 'true' ||
      compRaw === '1' ||
      mode.includes('E-EXAM') ||
      mode.includes('COMPUTER') ||
      title.toUpperCase().includes('E-EXAM') ||
      title.toUpperCase().includes('COMPUTER');
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
      const paperLevelNum = extractLevelNumber(paper.level) ?? extractLevelNumber(paper.title);
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

