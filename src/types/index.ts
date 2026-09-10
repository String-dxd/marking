export type PaperType = 'STANDARD' | 'SCIENCE_LAB' | 'LISTENING_COMP';

export interface AccessArrangement {
  extraTimePct: number;       // e.g. 0, 15, 25, 50
  needsSeparateRoom: boolean; // separate room accommodation
  frontSeatMobility: boolean; // preferential seating (front row near audio/exit)
  remarks?: string;
}

export interface Candidate {
  id: string;                 // 4-digit Index Number (e.g. "0005" from "15550005"), IC discarded
  indexNumber: string;        // 4-digit Index Number (e.g. "0005")
  fullName: string;           // Statutory Name (e.g. "DENISSE VOO XIAO YOU")
  academicLevel?: string;     // e.g. "SECONDARY 4"
  classGroup?: string;        // e.g. "4E1", "4N2" (if enriched/parsed)
  schoolName?: string;        // e.g. "CANBERRA SECONDARY SCHOOL"
  examCentreCode?: string;    // e.g. "1555"
  subjectCodes: string[];     // e.g. ["6127/01", "6091/01", "6091/03"]
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

export interface ExamPaper {
  id: string;
  code: string;               // e.g. "6127/01" or "6091/03"
  title: string;              // e.g. "Art (Revised) Paper 1"
  durationMins: number;
  type: PaperType;
  requiresComputer: boolean;  // true if paper requires PC terminals
  allowCombine?: boolean;     // whether paper can share a venue with others on same day/slot (always false for LISTENING_COMP)
  date: string;               // YYYY-MM-DD
  startTime: string;          // HH:mm
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
