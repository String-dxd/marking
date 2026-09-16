export type ExamScope = 'national' | 'internal';

export type PaperType = 'STANDARD' | 'SCIENCE_LAB' | 'LISTENING_COMP' | 'ORAL';

export interface AccessArrangement {
  extraTimePct: number;       // e.g. 0, 15, 25, 50
  needsSeparateRoom: boolean; // separate room accommodation
  frontSeatMobility: boolean; // preferential seating (front row near audio/exit)
  remarks?: string;
}

export interface Candidate {
  id: string;                 // 4-digit Index Number (SEAB) or unique class-reg id (Internal, e.g. "1 DILIGENCE-01")
  indexNumber: string;        // 4-digit Index Number (e.g. "0005") or Register Number (e.g. "01")
  fullName: string;           // Statutory Name (e.g. "DENISSE VOO XIAO YOU")
  academicLevel?: string;     // e.g. "SECONDARY 4" or "SECONDARY 1"
  classGroup?: string;        // e.g. "4E1", "1 DILIGENCE"
  schoolName?: string;        // e.g. "CANBERRA SECONDARY SCHOOL"
  examCentreCode?: string;    // e.g. "1555"
  subjectCodes: string[];     // e.g. ["6127/01", "6091/01"] or ["EL - G3", "Maths - G2"]
  gender?: string;            // "F" or "M"
  formTeacher?: string;       // Form Teacher name for internal school exams
  teachingGroup?: string;     // e.g. "1J31_MARYAM"
  stream?: string;            // e.g. "G1", "G2", "G3", "EXP", "NA", "NT"
  arrangements?: AccessArrangement; // Default fallback arrangement for all papers
  paperArrangements?: Record<string, AccessArrangement>; // Granular AA mapped by subject/paper code (e.g. "1128/01")
}

export function getCandidatePaperArrangement(
  candidate?: Candidate | null,
  paperCode?: string
): AccessArrangement | undefined {
  if (!candidate) return undefined;
  if (paperCode && candidate.paperArrangements?.[paperCode]) {
    return candidate.paperArrangements[paperCode];
  }
  return candidate.arrangements;
}

export interface SeabRawCandidateRow {
  academicLevel: string;
  nricFin: string;
  statutoryName: string;
  schoolName: string;
  indexNo: string;
  subjectCode: string;
  subjectName: string;
  paperNo: string;
  modeOfAssessment: string;
  examSeries: string;
  postedSchoolCode: string;
  postedSchoolName: string;
  postedExamCentreCode: string;
}

export interface InternalRawMarkSheetRow {
  regNo: number;
  name: string;
  sex: string;
  formTeacher: string;
  classGroup: string;
  teachingGroup: string;
  subjectName: string;
}

export interface ExamPaper {
  id: string;
  code: string;               // e.g. "6127/01" or "EL - G3/P1"
  title: string;              // e.g. "Art (Revised) Paper 1" or "English Language P1"
  durationMins: number;
  type: PaperType;
  requiresComputer: boolean;  // true if paper requires PC terminals
  allowCombine?: boolean;     // whether paper can share a venue with others on same day/slot (default false, always false for LISTENING_COMP)
  date: string;               // YYYY-MM-DD
  startTime: string;          // HH:mm
  level?: string;             // e.g. "Secondary 4", "Sec 1", "GCE O-Level", "JC 2", "Primary 6"
  stream?: string;            // e.g. "G1", "G2", "G3", "All Streams"
  baseSubjectCode?: string;   // e.g. "EL - G3"
  venueType?: string;         // e.g. "Classrooms", "Computer Labs"
}

export interface VenueSeat {
  row: number;
  col: number;
  seatLabel: string;          // e.g. "R1C1", "A01"
  isActive: boolean;          // false if pillar, walkway, broken desk
  hasComputer?: boolean;      // true if desk has a PC workstation
}

export interface Venue {
  id: string;
  name: string;
  rows: number;
  cols: number;
  isLab: boolean;
  hasAudio: boolean;
  hasComputers: boolean;      // true for computer labs or PC classrooms
  computerStations: number;   // number of working PC stations
  isAaDesignated: boolean;
  seatGrid: VenueSeat[][];
}

export interface SeatAllocation {
  paperId: string;
  venueId: string;
  candidateId: string;
  shiftIndex: number;         // 1 for normal, 1 or 2 for lab shifts
  row: number;
  col: number;
  seatLabel: string;
  isHoldingRoom?: boolean;    // true if student is waiting in holding room for shift 2
}

export interface AllocationReportItem {
  candidate: Candidate;
  paper: ExamPaper;
  venue: Venue;
  seat: SeatAllocation;
}
