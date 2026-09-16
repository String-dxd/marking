import * as XLSX from 'xlsx';
import type { Candidate } from '../types';

export interface InternalCandidateParseResult {
  candidates: Candidate[];
  discoveredSubjects: string[];
  schoolName?: string;
  academicLevel?: string;
  totalRowsProcessed: number;
}

export interface MultiInternalCandidateParseResult {
  mergedCandidates: Candidate[];
  discoveredSubjects: string[];
  fileReports: { fileName: string; candidateCount: number; subjectCount: number }[];
}

/**
 * Natural sort helper for class names and register numbers:
 * e.g. "1 DILIGENCE" before "1 EMPATHY", "01" before "02"
 */
function sortInternalCandidates(candidates: Candidate[]): Candidate[] {
  return candidates.sort((a, b) => {
    const classA = a.classGroup || '';
    const classB = b.classGroup || '';
    const classCmp = classA.localeCompare(classB, undefined, { numeric: true, sensitivity: 'base' });
    if (classCmp !== 0) return classCmp;
    return a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true });
  });
}

/**
 * Parses an MOE School Cockpit Component Mark Sheet (.xlsx, .xls)
 * Report ID: RE_RES_090
 */
export async function parseInternalMarkSheetFile(file: File): Promise<InternalCandidateParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const candidatesMap = new Map<string, Candidate>();
  const discoveredSubjects = new Set<string>();

  let detectedSchoolName = '';
  let detectedLevel = '';
  let totalRowsProcessed = 0;

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    // Convert sheet to row-based array of arrays
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    totalRowsProcessed += rows.length;

    let currentSubject = '';

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const col0 = String(row[0] ?? '').trim();

      // Check metadata headers near top
      if (!detectedSchoolName && r < 10 && /^\d{4}\s+[A-Z\s]+SCHOOL/i.test(col0)) {
        detectedSchoolName = col0.replace(/^\d{4}\s+/, '').trim();
      }
      if (!detectedLevel && r < 10 && /^Level:\s*([A-Za-z0-9]+)/i.test(col0)) {
        const match = col0.match(/^Level:\s*([A-Za-z0-9]+)/i);
        if (match) {
          const rawLvl = match[1].toUpperCase();
          detectedLevel = rawLvl.startsWith('S') ? `SECONDARY ${rawLvl.replace('S', '')}` : rawLvl;
        }
      }

      // Check for table header row
      // Row contains "Reg#" in column 0 (Col A) and Subject in column 8 (Col I)
      if (col0.toLowerCase() === 'reg#' || col0.toLowerCase() === 'reg #') {
        const subjCandidate = String(row[8] ?? '').trim();
        if (subjCandidate) {
          currentSubject = subjCandidate;
          discoveredSubjects.add(currentSubject);
        }
        continue;
      }

      // Check if this row is a student data row (col0 is numeric register number)
      const regNoNum = parseInt(col0, 10);
      if (!isNaN(regNoNum) && regNoNum > 0 && currentSubject) {
        const name = String(row[1] ?? '').trim();
        const sex = String(row[2] ?? '').trim().toUpperCase();
        const formTeacher = String(row[3] ?? '').trim();
        const classGroup = String(row[4] ?? '').trim();
        const teachingGroup = String(row[5] ?? '').trim();

        if (!classGroup || !name) continue;

        let candidateLevel = detectedLevel;
        if (!candidateLevel && classGroup) {
          const classMatch = classGroup.match(/^([1-6])\s+[A-Za-z]/);
          if (classMatch) {
            candidateLevel = `SECONDARY ${classMatch[1]}`;
            if (!detectedLevel) detectedLevel = candidateLevel;
          } else {
            const pMatch = classGroup.match(/^P([1-6])/i);
            if (pMatch) {
              candidateLevel = `PRIMARY ${pMatch[1]}`;
              if (!detectedLevel) detectedLevel = candidateLevel;
            } else {
              const jcMatch = classGroup.match(/^JC([1-2])/i);
              if (jcMatch) {
                candidateLevel = `JC ${jcMatch[1]}`;
                if (!detectedLevel) detectedLevel = candidateLevel;
              }
            }
          }
        }

        const regNoPadded = regNoNum.toString().padStart(2, '0');
        const candidateId = `${classGroup}-${regNoPadded}`;

        if (!candidatesMap.has(candidateId)) {
          candidatesMap.set(candidateId, {
            id: candidateId,
            indexNumber: regNoPadded,
            fullName: name,
            classGroup,
            gender: sex === 'F' || sex === 'M' ? sex : undefined,
            formTeacher: formTeacher || undefined,
            teachingGroup: teachingGroup || undefined,
            academicLevel: candidateLevel || undefined,
            schoolName: detectedSchoolName || undefined,
            subjectCodes: [currentSubject],
          });
        } else {
          const existing = candidatesMap.get(candidateId)!;
          if (!existing.academicLevel && candidateLevel) {
            existing.academicLevel = candidateLevel;
          }
          if (!existing.subjectCodes.includes(currentSubject)) {
            existing.subjectCodes.push(currentSubject);
          }
          if (!existing.formTeacher && formTeacher) existing.formTeacher = formTeacher;
          if (!existing.gender && (sex === 'F' || sex === 'M')) existing.gender = sex;
          if (!existing.teachingGroup && teachingGroup) existing.teachingGroup = teachingGroup;
        }
      }
    }
  }

  const sortedCandidates = sortInternalCandidates(Array.from(candidatesMap.values()));

  return {
    candidates: sortedCandidates,
    discoveredSubjects: Array.from(discoveredSubjects).sort(),
    schoolName: detectedSchoolName,
    academicLevel: detectedLevel,
    totalRowsProcessed,
  };
}

/**
 * Multi-file parser for internal candidate mark sheets
 */
export async function parseMultipleInternalCandidateFiles(files: File[]): Promise<MultiInternalCandidateParseResult> {
  const fileReports: { fileName: string; candidateCount: number; subjectCount: number }[] = [];
  const candidatesMap = new Map<string, Candidate>();
  const discoveredSubjects = new Set<string>();

  for (const file of files) {
    const res = await parseInternalMarkSheetFile(file);
    fileReports.push({
      fileName: file.name,
      candidateCount: res.candidates.length,
      subjectCount: res.discoveredSubjects.length,
    });

    res.discoveredSubjects.forEach((s) => discoveredSubjects.add(s));

    for (const cand of res.candidates) {
      if (candidatesMap.has(cand.id)) {
        const existing = candidatesMap.get(cand.id)!;
        const combined = Array.from(new Set([...existing.subjectCodes, ...cand.subjectCodes]));
        candidatesMap.set(cand.id, {
          ...existing,
          fullName: existing.fullName || cand.fullName,
          academicLevel: existing.academicLevel || cand.academicLevel,
          schoolName: existing.schoolName || cand.schoolName,
          classGroup: existing.classGroup || cand.classGroup,
          formTeacher: existing.formTeacher || cand.formTeacher,
          gender: existing.gender || cand.gender,
          subjectCodes: combined,
          arrangements: existing.arrangements || cand.arrangements,
          paperArrangements: { ...cand.paperArrangements, ...existing.paperArrangements },
        });
      } else {
        candidatesMap.set(cand.id, cand);
      }
    }
  }

  const mergedCandidates = sortInternalCandidates(Array.from(candidatesMap.values()));

  return {
    mergedCandidates,
    discoveredSubjects: Array.from(discoveredSubjects).sort(),
    fileReports,
  };
}
