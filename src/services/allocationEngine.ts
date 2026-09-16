import type { Candidate, ExamPaper, Venue, SeatAllocation, VenueSeat } from '../types';
import { getCandidatePaperArrangement } from '../types';

export interface AllocationResult {
  allocations: SeatAllocation[];
  unallocatedCandidateIds: string[];
  holdingRoomVenueId?: string;
  isMultiShift: boolean;
  warnings: string[];
}

/**
 * Parses time "HH:mm" into minutes from midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Extracts academic level number (1-6) from strings like "Secondary 1", "Sec 1", "P4", "1 DILIGENCE", "Classroom 1-1", "1-1", etc.
 */
export function extractLevelNumber(str?: string): number | undefined {
  if (!str) return undefined;
  const clean = str.trim();

  // 1. Explicit keyword followed by number: "Secondary 1", "Sec 1", "Pri 4", "Primary 4", "Level 1", "Lvl 1", "Grade 1", "Year 1", "JC 1"
  const keywordMatch = clean.match(/(?:Secondary|Sec|Primary|Pri|Level|Lvl|Grade|Year|JC|Class|Room)\s*([1-6])/i);
  if (keywordMatch) {
    return parseInt(keywordMatch[1], 10);
  }

  // 2. Class group or room starting with level digit: "1 DILIGENCE", "1-1", "1A", "4E1", "4N1", "01-01"
  const leadingMatch = clean.match(/^0*([1-6])(?:\b|\D)/i);
  if (leadingMatch) {
    return parseInt(leadingMatch[1], 10);
  }

  // 3. Fallback: single digit between word boundaries
  const digitMatch = clean.match(/\b([1-6])\b/);
  if (digitMatch) {
    return parseInt(digitMatch[1], 10);
  }

  return undefined;
}

/**
 * Normalizes a level string or candidate/paper into a canonical display label
 * e.g. "Secondary 1", "Secondary 2", "Primary 4", "JC 1", etc.
 */
export function getCanonicalLevelName(levelStr?: string, defaultPrefix: string = 'Secondary'): string | undefined {
  if (!levelStr) return undefined;
  const clean = levelStr.trim();
  const num = extractLevelNumber(clean);
  if (!num) return clean;

  if (/Pri(?:mary)?/i.test(clean) || /^P[1-6]/i.test(clean)) return `Primary ${num}`;
  if (/JC/i.test(clean)) return `JC ${num}`;
  if (/Sec(?:ondary)?/i.test(clean) || /^S[1-6]/i.test(clean)) return `Secondary ${num}`;
  return `${defaultPrefix} ${num}`;
}

/**
 * Derives the academic level label for an exam paper
 */
export function getPaperLevel(paper: ExamPaper, allCandidates: Candidate[] = []): string {
  if (paper.level) {
    return getCanonicalLevelName(paper.level) || paper.level;
  }
  // If not explicitly set on paper, derive from enrolled candidates' academicLevel or classGroup
  const enrolled = allCandidates.filter((c) => c.subjectCodes.includes(paper.code));
  for (const cand of enrolled) {
    if (cand.academicLevel) {
      const canonical = getCanonicalLevelName(cand.academicLevel);
      if (canonical) return canonical;
    }
    if (cand.classGroup) {
      const num = extractLevelNumber(cand.classGroup);
      if (num) return `Secondary ${num}`;
    }
  }
  return 'General';
}

/**
 * Discovers and extracts all distinct academic levels across timetable papers and candidates
 */
export function getDistinctLevels(papers: ExamPaper[] = [], candidates: Candidate[] = []): string[] {
  const levelSet = new Set<string>();

  papers.forEach((p) => {
    const lvl = getPaperLevel(p, candidates);
    if (lvl && lvl !== 'General') levelSet.add(lvl);
  });

  candidates.forEach((c) => {
    if (c.academicLevel) {
      const canonical = getCanonicalLevelName(c.academicLevel);
      if (canonical) levelSet.add(canonical);
    } else if (c.classGroup) {
      const num = extractLevelNumber(c.classGroup);
      if (num) levelSet.add(`Secondary ${num}`);
    }
  });

  return Array.from(levelSet).sort((a, b) => {
    const numA = extractLevelNumber(a) ?? 999;
    const numB = extractLevelNumber(b) ?? 999;
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });
}

export type VenueTier = 1 | 2 | 3;

/**
 * Classifies a venue into one of three priority tiers for a given target level:
 * Tier 1: Own Level Form Classrooms (e.g. "1-1", "1-2", "1 DILIGENCE", "Classroom 1-1" when target level is 1)
 * Tier 2: Non-Form Classrooms (e.g. "RR1", "RR2", "AVA Room", "LT1", "School Hall" - does not start with a number)
 * Tier 3: Other Level Form Classrooms (e.g. "2-1", "3-1", "4-1" when target level is 1)
 */
export function classifyVenue(
  venueName: string,
  targetLevelNumber?: number
): {
  isFormClassroom: boolean;
  levelNumber?: number;
  tier: VenueTier;
  tierLabel: string;
} {
  const clean = venueName.trim();

  // Strip generic room/classroom prefixes: "Classroom 1-1" -> "1-1", "Room 1-1" -> "1-1", "Sec 1-1" -> "1-1"
  const stripped = clean.replace(/^(?:Classroom|Class|Room|Sec|Secondary|Pri|Primary|Level|Lvl)\s+/i, '').trim();

  // Check if stripped or clean name starts with a number
  const startsWithNumber = /^0*([1-6])(?:\b|\D)/i.test(stripped) || /^0*([1-6])(?:\b|\D)/i.test(clean);

  if (startsWithNumber) {
    const levelNum = extractLevelNumber(stripped) || extractLevelNumber(clean);
    const isOwnLevel = targetLevelNumber !== undefined && levelNum === targetLevelNumber;

    return {
      isFormClassroom: true,
      levelNumber: levelNum,
      tier: isOwnLevel ? 1 : 3,
      tierLabel: isOwnLevel
        ? `Level ${levelNum ?? ''} Form Room`
        : `Other Level (${levelNum ? `Level ${levelNum}` : 'Other'}) Room`,
    };
  }

  // Non-form classroom (e.g. RR1, AVA Room, School Hall, LT1, etc.)
  return {
    isFormClassroom: false,
    levelNumber: undefined,
    tier: 2,
    tierLabel: 'Non-Form Room (General / Resource)',
  };
}

/**
 * Sorts venues according to the 3-tier hierarchy:
 * 1. Own Level Form Classrooms
 * 2. Non-Form Classrooms (like RR1, not starting with a number)
 * 3. Other Level Form Classrooms
 */
export function sortVenuesByHierarchy(
  venues: Venue[],
  targetLevelNumber?: number
): Venue[] {
  return [...venues].sort((a, b) => {
    const classA = classifyVenue(a.name, targetLevelNumber);
    const classB = classifyVenue(b.name, targetLevelNumber);

    // Primary: Tier 1 (Own Level) -> Tier 2 (Non-Form) -> Tier 3 (Other Level)
    if (classA.tier !== classB.tier) {
      return classA.tier - classB.tier;
    }

    // Secondary: Natural alphanumeric name order (e.g. 1-1 before 1-2, RR1 before RR2)
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Resolves candidate's subject and stream key for internal grouping and separation
 */
export function getCandidateSubjectAndStream(
  cand: Candidate,
  targetPaper: ExamPaper
): { subject: string; stream: string; key: string } {
  let stream = targetPaper.stream || cand.stream || '';
  let subject = targetPaper.baseSubjectCode || targetPaper.code.split('/')[0] || targetPaper.title;

  const matchingCode = cand.subjectCodes.find(
    (code) =>
      code === targetPaper.code ||
      (targetPaper.baseSubjectCode && code === targetPaper.baseSubjectCode) ||
      code.startsWith(subject)
  );

  if (matchingCode) {
    const streamMatch = matchingCode.match(/\b(G1|G2|G3|EXP|NA|NT)\b/i);
    if (streamMatch) {
      stream = streamMatch[1].toUpperCase();
    }
    const [sub] = matchingCode.split(' - ');
    if (sub && sub.trim()) {
      subject = sub.trim();
    }
  }

  if (!stream) {
    const paperStreamMatch =
      targetPaper.title.match(/\b(G1|G2|G3|EXP|NA|NT)\b/i) ||
      targetPaper.code.match(/\b(G1|G2|G3|EXP|NA|NT)\b/i);
    if (paperStreamMatch) stream = paperStreamMatch[1].toUpperCase();
  }

  return {
    subject: subject.toUpperCase().trim(),
    stream: stream.toUpperCase().trim(),
    key: `${subject.toUpperCase().trim()}__${stream.toUpperCase().trim()}`,
  };
}

/**
 * Checks if two papers on the same date are consecutive back-to-back with a short turnover gap (<= 60 mins)
 */
function isBackToBack(precedingPaper: ExamPaper, currentPaper: ExamPaper): boolean {
  if (precedingPaper.date !== currentPaper.date) return false;

  const startA = parseTimeToMinutes(precedingPaper.startTime);
  const dismissalA = startA + precedingPaper.durationMins + 15;

  const startB = parseTimeToMinutes(currentPaper.startTime);
  const reportingB = startB - 30;

  const gap = reportingB - dismissalA;
  return gap >= 0 && gap <= 60;
}

/**
 * Checks if two papers happen during overlapping duration on the same day.
 */
export function arePapersConcurrent(paperA: ExamPaper, paperB: ExamPaper): boolean {
  if (paperA.id === paperB.id) return false;
  if (paperA.date !== paperB.date) return false;

  const startA = parseTimeToMinutes(paperA.startTime);
  const endA = startA + (paperA.durationMins || 60);

  const startB = parseTimeToMinutes(paperB.startTime);
  const endB = startB + (paperB.durationMins || 60);

  return startA < endB && startB < endA;
}

export interface AllocationOptions {
  autoCombineAaVenues?: boolean;
}

export function runDeterministicAllocation(
  targetPaper: ExamPaper,
  allCandidates: Candidate[],
  allVenues: Venue[],
  allPapers: ExamPaper[] = [],
  existingAllocations: Record<string, SeatAllocation[]> = {},
  options?: AllocationOptions
): AllocationResult {
  const autoCombineAaVenues = options?.autoCombineAaVenues ?? true;
  const warnings: string[] = [];
  const allocations: SeatAllocation[] = [];

  // Filter candidates taking this paper
  const candidatesForPaper = allCandidates.filter((c) =>
    c.subjectCodes.includes(targetPaper.code)
  );

  if (candidatesForPaper.length === 0) {
    return {
      allocations: [],
      unallocatedCandidateIds: [],
      isMultiShift: false,
      warnings: ['No candidates enrolled in this paper.'],
    };
  }

  // Detect whether this is an internal school exam or national SEAB exam
  const isInternal = candidatesForPaper.some(
    (c) => Boolean(c.classGroup) || Boolean(c.formTeacher) || (c.indexNumber && c.indexNumber.length < 4)
  );

  // Extract target academic level (e.g. 1 for Secondary 1, 4 for Sec 4)
  const paperLevelNum = extractLevelNumber(targetPaper.level);
  const candLevelNum = candidatesForPaper
    .map((c) => extractLevelNumber(c.academicLevel) || extractLevelNumber(c.classGroup))
    .find((n) => n !== undefined);
  const targetLevelNumber = paperLevelNum ?? candLevelNum;

  // Sort candidates:
  // For internal exams: 1. Subject & Stream -> 2. Class Group -> 3. Register Number (natural numeric sort)
  // For national exams: Pure 4-digit Index Number
  let sortedCandidates: Candidate[] = [];
  if (isInternal) {
    sortedCandidates = [...candidatesForPaper].sort((a, b) => {
      const subStreamA = getCandidateSubjectAndStream(a, targetPaper).key;
      const subStreamB = getCandidateSubjectAndStream(b, targetPaper).key;
      const subCmp = subStreamA.localeCompare(subStreamB);
      if (subCmp !== 0) return subCmp;

      const classA = a.classGroup || '';
      const classB = b.classGroup || '';
      const classCmp = classA.localeCompare(classB, undefined, { numeric: true, sensitivity: 'base' });
      if (classCmp !== 0) return classCmp;

      const regCmp = a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true });
      if (regCmp !== 0) return regCmp;

      return a.fullName.localeCompare(b.fullName);
    });
  } else {
    sortedCandidates = [...candidatesForPaper].sort((a, b) =>
      a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true })
    );
  }

  // Identify Concurrent Papers on the same date with overlapping time
  const concurrentPapers = allPapers.filter(
    (p) => p.id !== targetPaper.id && arePapersConcurrent(p, targetPaper)
  );

  // Collect seat allocations already granted to concurrent papers
  const concurrentAllocations = concurrentPapers.flatMap(
    (p) => existingAllocations[p.id] || []
  );

  // Check for candidate timetable clash (same candidate taking 2 concurrent papers)
  const clashDetails: { candidate: Candidate; clashingPapers: ExamPaper[] }[] = [];
  sortedCandidates.forEach((cand) => {
    const clashing = concurrentPapers.filter((cp) => cand.subjectCodes.includes(cp.code));
    if (clashing.length > 0) {
      clashDetails.push({ candidate: cand, clashingPapers: clashing });
    }
  });

  if (clashDetails.length > 0) {
    const clashingPaperNames = Array.from(
      new Set(clashDetails.flatMap((d) => d.clashingPapers.map((p) => `"${p.code}" (${p.title}, ${p.startTime})`)))
    ).join(', ');
    warnings.push(
      `Timetable clash detected: ${clashDetails.length} candidate(s) (e.g. ${clashDetails.slice(0, 3).map((d) => d.candidate.classGroup ? `${d.candidate.classGroup}-${d.candidate.indexNumber}` : d.candidate.indexNumber).join(', ')}) are enrolled in concurrent paper(s) scheduled at the same time: ${clashingPaperNames}.`
    );
  }

  // Check for Back-to-Back Preceding Paper on the same day for venue continuity
  const precedingPaper = allPapers.find((p) => p.id !== targetPaper.id && isBackToBack(p, targetPaper));
  const previousPaperAllocations = precedingPaper ? existingAllocations[precedingPaper.id] || [] : [];
  const prevSeatMap = new Map<string, SeatAllocation>();
  previousPaperAllocations.forEach((alloc) => prevSeatMap.set(alloc.candidateId, alloc));

  const isListeningComp = targetPaper.type === 'LISTENING_COMP';
  const isScienceLab = targetPaper.type === 'SCIENCE_LAB';
  const requiresComputer = targetPaper.requiresComputer;

  // Determine blocked venues due to no-combine restrictions:
  // - Listening comprehension and Oral must never combine with any other paper (acoustic isolation)
  // - For national SEAB exams: non-combine papers cannot share venues
  // - For internal school exams: papers prioritize fresh rooms first, and can share remaining capacity across rooms if total fresh capacity is insufficient.
  const isTargetAudioOrOral = isListeningComp || targetPaper.type === 'ORAL';
  const audioOrOralConcurrentPaperIds = new Set(
    concurrentPapers
      .filter((cp) => cp.type === 'LISTENING_COMP' || cp.type === 'ORAL')
      .map((cp) => cp.id)
  );
  const venuesUsedByConcurrent = new Set(concurrentAllocations.map((a) => a.venueId));
  const venuesUsedByAudioOrOral = new Set(
    concurrentAllocations
      .filter((a) => audioOrOralConcurrentPaperIds.has(a.paperId))
      .map((a) => a.venueId)
  );

  const nonCombineConcurrentPaperIds = new Set(
    concurrentPapers
      .filter((cp) => !cp.allowCombine || cp.type === 'LISTENING_COMP' || cp.type === 'ORAL')
      .map((cp) => cp.id)
  );
  const blockedVenuesFromNonCombine = new Set(
    concurrentAllocations
      .filter((a) => nonCombineConcurrentPaperIds.has(a.paperId))
      .map((a) => a.venueId)
  );

  const isVenueBlocked = (venueId: string): boolean => {
    // Audio / Oral papers must have dedicated, acoustically isolated rooms
    if (isTargetAudioOrOral && venuesUsedByConcurrent.has(venueId)) {
      return true;
    }
    if (venuesUsedByAudioOrOral.has(venueId)) {
      return true;
    }
    if (!isInternal) {
      const canTargetCombine = targetPaper.allowCombine === true && !isListeningComp && targetPaper.type !== 'ORAL';
      if (!canTargetCombine && venuesUsedByConcurrent.has(venueId)) {
        return true;
      }
      return blockedVenuesFromNonCombine.has(venueId);
    }
    return false;
  };

  // Helper to check if a specific desk in a venue is already occupied
  // by another candidate in targetPaper or by any concurrent paper
  const isSeatOccupied = (venueId: string, row: number, col: number, shiftIndex?: number): boolean => {
    const inTarget = allocations.some(
      (a) => a.venueId === venueId && a.row === row && a.col === col && (shiftIndex === undefined || a.shiftIndex === shiftIndex)
    );
    if (inTarget) return true;

    const inConcurrent = concurrentAllocations.some(
      (a) => a.venueId === venueId && a.row === row && a.col === col && (shiftIndex === undefined || a.shiftIndex === shiftIndex)
    );
    if (inConcurrent) return true;

    return false;
  };

  // 1. Separate AA Candidates vs Standard Cohort
  // Exception: In Listening Comprehension, AA candidates join the rest of the cohort
  const aaSeparateCandidates: Candidate[] = [];
  const mainCohortCandidates: Candidate[] = [];

  for (const cand of sortedCandidates) {
    const candAA = getCandidatePaperArrangement(cand, targetPaper.code);
    const hasAA = candAA && (
      (candAA.extraTimePct ?? 0) > 0 || 
      candAA.needsSeparateRoom
    );

    if (hasAA && !isListeningComp) {
      aaSeparateCandidates.push(cand);
    } else {
      mainCohortCandidates.push(cand);
    }
  }

  // Helper to generate serpentine ordered seats for a venue
  // Col 1: Row 1 -> Row R, Col 2: Row R -> Row 1, Col 3: Row 1 -> Row R ...
  const getSerpentineSeats = (venue: Venue): { seat: VenueSeat; row: number; col: number }[] => {
    const result: { seat: VenueSeat; row: number; col: number }[] = [];
    for (let c = 0; c < venue.cols; c++) {
      const isEvenCol = c % 2 === 0;
      const rowIndices = Array.from({ length: venue.rows }, (_, i) => i);
      if (!isEvenCol) {
        rowIndices.reverse();
      }

      for (const r of rowIndices) {
        const seat = venue.seatGrid[r]?.[c];
        if (seat && seat.isActive) {
          result.push({ seat, row: r, col: c });
        }
      }
    }
    return result;
  };

  // Helper to prioritize Front Row (Row 0) seats for LC Preferential seating
  const orderSeatsForLC = (venue: Venue): { seat: VenueSeat; row: number; col: number }[] => {
    const allSeats = getSerpentineSeats(venue);
    // Front row seats (row === 0) first, then remaining serpentine
    const frontRow = allSeats.filter((s) => s.row === 0);
    const others = allSeats.filter((s) => s.row > 0);
    return [...frontRow, ...others];
  };

  // 2. Allocate AA Candidates (if paper requiring separate room)
  if (aaSeparateCandidates.length > 0) {
    let eligibleAaVenues: Venue[] = [];

    if (requiresComputer) {
      // Need AA venue equipped with computers
      eligibleAaVenues = allVenues.filter((v) => v.isAaDesignated && v.hasComputers);
      if (eligibleAaVenues.length === 0) {
        // No separate AA computer lab: AA candidates join computer lab with accommodation
        warnings.push(`${aaSeparateCandidates.length} AA candidate(s) require computers; seated in Computer Lab under invigilator accommodation.`);
        mainCohortCandidates.push(...aaSeparateCandidates);
        mainCohortCandidates.sort((a, b) => a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true }));
        aaSeparateCandidates.length = 0;
      }
    } else if (isScienceLab) {
      // Need AA venue equipped with science laboratory benches
      eligibleAaVenues = allVenues.filter((v) => v.isAaDesignated && v.isLab);
      if (eligibleAaVenues.length === 0) {
        // No separate AA science lab: AA candidates join science lab with accommodation
        warnings.push(`${aaSeparateCandidates.length} AA candidate(s) require science lab; seated in Science Lab under invigilator accommodation.`);
        mainCohortCandidates.push(...aaSeparateCandidates);
        mainCohortCandidates.sort((a, b) => a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true }));
        aaSeparateCandidates.length = 0;
      }
    } else {
      const aaVenues = allVenues.filter((v) => v.isAaDesignated && !v.isLab && !v.hasComputers);
      eligibleAaVenues = aaVenues.length > 0 ? aaVenues : allVenues.filter((v) => v.isAaDesignated);
      if (eligibleAaVenues.length === 0) {
        warnings.push(`Paper has ${aaSeparateCandidates.length} AA candidate(s) requiring separate room, but no AA-designated venues are configured. Falling back to available quiet classrooms.`);
        const fallbackVenues = allVenues.filter((v) => !v.isLab && !v.hasComputers);
        eligibleAaVenues = isInternal ? sortVenuesByHierarchy(fallbackVenues, targetLevelNumber) : fallbackVenues;
      }
    }

    if (aaSeparateCandidates.length > 0) {
      const candidatePool = [...aaSeparateCandidates];

      // Determine whether an AA venue is blocked for AA candidates
      const isAaVenueBlocked = (venueId: string): boolean => {
        if (autoCombineAaVenues) {
          const venue = allVenues.find((v) => v.id === venueId);
          // If the venue is an AA-designated room, allow combining across concurrent papers
          // provided no concurrent paper in the room is LISTENING_COMP or ORAL
          if (venue?.isAaDesignated) {
            const hasAcousticOrOralConflict = concurrentAllocations.some((a) => {
              if (a.venueId !== venueId) return false;
              const cp = concurrentPapers.find((p) => p.id === a.paperId);
              return cp?.type === 'LISTENING_COMP' || cp?.type === 'ORAL';
            });
            return hasAcousticOrOralConflict;
          }
        }
        return isVenueBlocked(venueId);
      };

      const unblockedAaVenues = eligibleAaVenues.filter((v) => !isAaVenueBlocked(v.id));
      const targetAaVenues = unblockedAaVenues.length > 0 ? unblockedAaVenues : eligibleAaVenues;

      for (const venue of targetAaVenues) {
        if (candidatePool.length === 0) break;
        const availableSeats = getSerpentineSeats(venue);

        for (const { seat, row, col } of availableSeats) {
          if (candidatePool.length === 0) break;
          if (isSeatOccupied(venue.id, row, col, 1)) continue;

          const candidate = candidatePool.shift()!;
          allocations.push({
            paperId: targetPaper.id,
            venueId: venue.id,
            candidateId: candidate.id,
            shiftIndex: 1,
            row,
            col,
            seatLabel: seat.seatLabel || `R${row + 1}C${col + 1}`,
          });
        }
      }

      if (candidatePool.length > 0) {
        warnings.push(`Not enough AA venue seats! ${candidatePool.length} AA candidate(s) remain unseated.`);
      }
    }
  }

  // 3. Filter and Prioritize Venues for Main Cohort
  // Apply hierarchy:
  // 1. By Level (prefer own level form classrooms: Tier 1)
  // 2. Non-form classrooms (like RR1, AVA, School Hall, not starting with a number: Tier 2)
  // 3. Other level form classrooms: Tier 3
  let eligibleVenues: Venue[] = [];

  if (requiresComputer) {
    // Strictly prioritize computer labs
    eligibleVenues = allVenues.filter((v) => v.hasComputers && v.computerStations > 0);
    if (eligibleVenues.length === 0) {
      warnings.push('This paper requires computer terminals, but no venues are marked as computer-ready with stations.');
    }
  } else if (isScienceLab) {
    // Strictly science labs
    eligibleVenues = allVenues.filter((v) => v.isLab);
    if (eligibleVenues.length === 0) {
      warnings.push('Science Lab paper requires laboratory venues, but no science labs are configured.');
      eligibleVenues = allVenues.filter((v) => !v.isAaDesignated);
    }
  } else if (isListeningComp) {
    // Strictly audio-equipped venues (ordered by hierarchy)
    const audioVenues = allVenues.filter((v) => v.hasAudio && !v.isLab && !v.isAaDesignated);
    eligibleVenues = isInternal ? sortVenuesByHierarchy(audioVenues, targetLevelNumber) : audioVenues;
    if (eligibleVenues.length === 0) {
      warnings.push('Listening Comprehension requires PA/audio equipped venues. Falling back to general classrooms/halls.');
      const fallbackVenues = allVenues.filter((v) => !v.isLab && !v.isAaDesignated);
      eligibleVenues = isInternal ? sortVenuesByHierarchy(fallbackVenues, targetLevelNumber) : fallbackVenues;
    }
  } else {
    // Standard written papers: Halls and classrooms (avoid labs unless overflow)
    // Ordered strictly by Hierarchy: Tier 1 (Own Level) -> Tier 2 (Non-Form, e.g. RR1) -> Tier 3 (Other Level)
    const nonLabs = allVenues.filter((v) => !v.isLab && !v.isAaDesignated && !v.hasComputers);
    const sortedClassrooms = isInternal ? sortVenuesByHierarchy(nonLabs, targetLevelNumber) : nonLabs;
    const computerLabsFallback = allVenues.filter((v) => v.hasComputers && !v.isLab && !v.isAaDesignated);
    eligibleVenues = [...sortedClassrooms, ...computerLabsFallback];
  }

  // Exclude venues that cannot be shared due to no-combine / acoustic isolation restrictions
  const unblockedMainVenues = eligibleVenues.filter((v) => !isVenueBlocked(v.id));
  const freshVenues = unblockedMainVenues.filter((v) => !venuesUsedByConcurrent.has(v.id));
  const freshCapacity = freshVenues.reduce(
    (sum, v) => sum + v.seatGrid.flat().filter((s) => s.isActive && !isSeatOccupied(v.id, s.row, s.col)).length,
    0
  );

  if (freshCapacity >= mainCohortCandidates.length && freshVenues.length > 0) {
    eligibleVenues = freshVenues;
  } else if (unblockedMainVenues.length > 0) {
    // If fresh rooms cannot seat all students, prioritize fresh rooms first, then available rooms with unoccupied seats
    const sharedVenues = unblockedMainVenues.filter((v) => !freshVenues.some((fv) => fv.id === v.id));
    eligibleVenues = [...freshVenues, ...sharedVenues];
    if (sharedVenues.length > 0 && isInternal && freshCapacity < mainCohortCandidates.length) {
      warnings.push('Notice: Fresh venues capacity reached. Falling back to shared venues with collision-free seat allocation.');
    }
  } else if (eligibleVenues.some((v) => isVenueBlocked(v.id))) {
    warnings.push('Notice: All eligible venues are in use by concurrent papers. Falling back to shared venues with collision-free seat allocation.');
  }

  // 4. Handle Science Lab Shifts (Multi-Shift split + Holding Room)
  let isMultiShift = false;
  let holdingRoomVenueId: string | undefined;

  if (isScienceLab && eligibleVenues.length > 0) {
    const totalLabActiveSeats = eligibleVenues.reduce((sum, v) => {
      const active = v.seatGrid.flat().filter((s) => s.isActive && !isSeatOccupied(v.id, s.row, s.col, 1)).length;
      return sum + active;
    }, 0);

    if (mainCohortCandidates.length > totalLabActiveSeats && totalLabActiveSeats > 0) {
      isMultiShift = true;
      warnings.push(`Cohort size (${mainCohortCandidates.length}) exceeds total lab capacity (${totalLabActiveSeats}). Cohort is partitioned into Shift 1 and Shift 2.`);

      // Find an idle classroom to serve as Quarantine / Holding Room (prefer Tier 2 or own level)
      const potentialHoldingRooms = isInternal
        ? sortVenuesByHierarchy(
            allVenues.filter((v) => !v.isLab && !v.isAaDesignated && !isVenueBlocked(v.id)),
            targetLevelNumber
          )
        : allVenues.filter((v) => !v.isLab && !v.isAaDesignated && !isVenueBlocked(v.id));

      const idleClassroom = potentialHoldingRooms.find(
        (v) => v.seatGrid.flat().filter((s) => s.isActive && !isSeatOccupied(v.id, s.row, s.col)).length >= Math.ceil(mainCohortCandidates.length / 2)
      );

      if (idleClassroom) {
        holdingRoomVenueId = idleClassroom.id;
        warnings.push(`Quarantine / Holding Room auto-assigned: "${idleClassroom.name}" for Shift 2 candidates.`);
      } else {
        warnings.push('Warning: No suitable classroom found to serve as Quarantine / Holding Room for Shift 2 candidates.');
      }
    }
  }

  // 5. Main Seating Allocation
  const remainingCandidates = [...mainCohortCandidates];

  // For LC papers, sort candidates so that students requiring preferential front-row seating are allocated first
  if (isListeningComp) {
    remainingCandidates.sort((a, b) => {
      const aAA = getCandidatePaperArrangement(a, targetPaper.code);
      const bAA = getCandidatePaperArrangement(b, targetPaper.code);
      const aPref = aAA?.frontSeatMobility ? 1 : 0;
      const bPref = bAA?.frontSeatMobility ? 1 : 0;
      if (aPref !== bPref) return bPref - aPref; // preferential first
      return a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true });
    });
  }

  // Attempt venue continuity first for back-to-back papers
  if (precedingPaper && prevSeatMap.size > 0) {
    const continuitySeatsAllocated = new Set<string>(); // "venueId-r-c"

    for (let i = remainingCandidates.length - 1; i >= 0; i--) {
      const candidate = remainingCandidates[i];
      const prevSeat = prevSeatMap.get(candidate.id);

      if (prevSeat) {
        const venue = eligibleVenues.find((v) => v.id === prevSeat.venueId);
        if (venue) {
          const seatKey = `${venue.id}-${prevSeat.row}-${prevSeat.col}`;
          const currentSeatObj = venue.seatGrid[prevSeat.row]?.[prevSeat.col];

          if (
            currentSeatObj &&
            currentSeatObj.isActive &&
            !continuitySeatsAllocated.has(seatKey) &&
            !isSeatOccupied(venue.id, prevSeat.row, prevSeat.col, 1)
          ) {
            // Retain exact same seat
            continuitySeatsAllocated.add(seatKey);
            allocations.push({
              paperId: targetPaper.id,
              venueId: venue.id,
              candidateId: candidate.id,
              shiftIndex: 1,
              row: prevSeat.row,
              col: prevSeat.col,
              seatLabel: currentSeatObj.seatLabel || `R${prevSeat.row + 1}C${prevSeat.col + 1}`,
            });
            remainingCandidates.splice(i, 1);
          }
        }
      }
    }
  }

  // If Science Lab multi-shift, allocate Shift 1 and Shift 2
  if (isScienceLab && isMultiShift) {
    const half = Math.ceil(remainingCandidates.length / 2);
    const shift1Candidates = remainingCandidates.slice(0, half);
    const shift2Candidates = remainingCandidates.slice(half);

    // Shift 1
    let shift1Pool = [...shift1Candidates];
    for (const venue of eligibleVenues) {
      if (shift1Pool.length === 0) break;
      const availableSeats = getSerpentineSeats(venue);
      for (const { seat, row, col } of availableSeats) {
        if (shift1Pool.length === 0) break;
        if (isSeatOccupied(venue.id, row, col, 1)) continue;
        const candidate = shift1Pool.shift()!;
        allocations.push({
          paperId: targetPaper.id,
          venueId: venue.id,
          candidateId: candidate.id,
          shiftIndex: 1,
          row,
          col,
          seatLabel: seat.seatLabel || `R${row + 1}C${col + 1}`,
        });
      }
    }

    // Shift 2 Lab Seating (and mirror to holding room)
    let shift2Pool = [...shift2Candidates];
    for (const venue of eligibleVenues) {
      if (shift2Pool.length === 0) break;
      const availableSeats = getSerpentineSeats(venue);
      for (const { seat, row, col } of availableSeats) {
        if (shift2Pool.length === 0) break;
        if (isSeatOccupied(venue.id, row, col, 2)) continue;
        const candidate = shift2Pool.shift()!;
        allocations.push({
          paperId: targetPaper.id,
          venueId: venue.id,
          candidateId: candidate.id,
          shiftIndex: 2,
          row,
          col,
          seatLabel: seat.seatLabel || `R${row + 1}C${col + 1}`,
        });
      }
    }

    const unallocated = [...shift1Pool, ...shift2Pool].map((c) => c.id);
    return {
      allocations,
      unallocatedCandidateIds: unallocated,
      holdingRoomVenueId,
      isMultiShift: true,
      warnings,
    };
  }

  // 6. Standard Allocation: Partition candidates by Subject & Stream to separate rooms
  const candidateGroups: { key: string; candidates: Candidate[] }[] = [];
  const groupMap = new Map<string, Candidate[]>();

  for (const cand of remainingCandidates) {
    const key = isInternal ? getCandidateSubjectAndStream(cand, targetPaper).key : 'ALL';
    const list = groupMap.get(key) || [];
    list.push(cand);
    groupMap.set(key, list);
  }

  groupMap.forEach((groupCandidates, key) => {
    candidateGroups.push({ key, candidates: groupCandidates });
  });

  // Track rooms occupied by each subject/stream group within this allocation
  const venueOccupiedByGroup = new Map<string, string>(); // venueId -> groupKey
  let unallocatedCandidates: Candidate[] = [];

  for (const group of candidateGroups) {
    const groupPool = [...group.candidates];

    // Find available venues for this group
    // If multiple groups exist, prefer venues not already partially filled by a different group
    const candidateVenuesForGroup = eligibleVenues.filter((v) => {
      const occupant = venueOccupiedByGroup.get(v.id);
      return !occupant || occupant === group.key;
    });

    const targetVenues = candidateVenuesForGroup.length > 0 ? candidateVenuesForGroup : eligibleVenues;

    for (const venue of targetVenues) {
      if (groupPool.length === 0) break;

      const orderedSeats = isListeningComp ? orderSeatsForLC(venue) : getSerpentineSeats(venue);
      const concurrentInVenue = concurrentAllocations.filter((a) => a.venueId === venue.id && a.shiftIndex === 1).length;
      const targetInVenue = allocations.filter((a) => a.venueId === venue.id && a.shiftIndex === 1).length;
      const maxCapacity = requiresComputer && venue.hasComputers
        ? Math.max(0, Math.min(venue.computerStations || orderedSeats.length, orderedSeats.length) - concurrentInVenue)
        : orderedSeats.length;

      let seatsAssignedInVenue = targetInVenue;

      for (const { seat, row, col } of orderedSeats) {
        if (groupPool.length === 0) break;
        if (seatsAssignedInVenue >= maxCapacity) break;

        if (isSeatOccupied(venue.id, row, col, 1)) continue;

        const candidate = groupPool.shift()!;
        allocations.push({
          paperId: targetPaper.id,
          venueId: venue.id,
          candidateId: candidate.id,
          shiftIndex: 1,
          row,
          col,
          seatLabel: seat.seatLabel || `R${row + 1}C${col + 1}`,
        });
        seatsAssignedInVenue++;
        venueOccupiedByGroup.set(venue.id, group.key);
      }
    }

    if (groupPool.length > 0) {
      unallocatedCandidates.push(...groupPool);
    }
  }

  const unallocatedCandidateIds = unallocatedCandidates.map((c) => c.id);
  if (unallocatedCandidateIds.length > 0) {
    warnings.push(`Not enough total venue capacity! ${unallocatedCandidateIds.length} candidate(s) could not be seated.`);
  }

  // Shared venue information notification
  if (concurrentAllocations.length > 0) {
    const sharedVenues = Array.from(new Set(allocations.map((a) => a.venueId))).filter((vid) =>
      concurrentAllocations.some((ca) => ca.venueId === vid)
    );
    if (sharedVenues.length > 0) {
      const sharedNames = sharedVenues.map((vid) => allVenues.find((v) => v.id === vid)?.name || vid).join(', ');
      const otherCodes = Array.from(new Set(concurrentPapers.map((cp) => cp.code))).join(', ');
      warnings.push(
        `Shared venue seating: Allocated concurrently with ${otherCodes} in ${sharedNames} without seat overlap.`
      );
    }
  }

  return {
    allocations,
    unallocatedCandidateIds,
    holdingRoomVenueId,
    isMultiShift: false,
    warnings,
  };
}
