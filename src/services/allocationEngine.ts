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

export function runDeterministicAllocation(
  targetPaper: ExamPaper,
  allCandidates: Candidate[],
  allVenues: Venue[],
  allPapers: ExamPaper[] = [],
  existingAllocations: Record<string, SeatAllocation[]> = {}
): AllocationResult {
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

  // Sort candidates by pure 4-digit Index Number
  const sortedCandidates = [...candidatesForPaper].sort((a, b) =>
    a.indexNumber.localeCompare(b.indexNumber)
  );

  // Check for Back-to-Back Preceding Paper on the same day for venue continuity
  const precedingPaper = allPapers.find((p) => p.id !== targetPaper.id && isBackToBack(p, targetPaper));
  const previousPaperAllocations = precedingPaper ? existingAllocations[precedingPaper.id] || [] : [];
  const prevSeatMap = new Map<string, SeatAllocation>();
  previousPaperAllocations.forEach((alloc) => prevSeatMap.set(alloc.candidateId, alloc));

  const isListeningComp = targetPaper.type === 'LISTENING_COMP';
  const isScienceLab = targetPaper.type === 'SCIENCE_LAB';
  const requiresComputer = targetPaper.requiresComputer;

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
        mainCohortCandidates.sort((a, b) => a.indexNumber.localeCompare(b.indexNumber));
        aaSeparateCandidates.length = 0;
      }
    } else if (isScienceLab) {
      // Need AA venue equipped with science laboratory benches
      eligibleAaVenues = allVenues.filter((v) => v.isAaDesignated && v.isLab);
      if (eligibleAaVenues.length === 0) {
        // No separate AA science lab: AA candidates join science lab with accommodation
        warnings.push(`${aaSeparateCandidates.length} AA candidate(s) require science lab; seated in Science Lab under invigilator accommodation.`);
        mainCohortCandidates.push(...aaSeparateCandidates);
        mainCohortCandidates.sort((a, b) => a.indexNumber.localeCompare(b.indexNumber));
        aaSeparateCandidates.length = 0;
      }
    } else {
      const aaVenues = allVenues.filter((v) => v.isAaDesignated && !v.isLab && !v.hasComputers);
      eligibleAaVenues = aaVenues.length > 0 ? aaVenues : allVenues.filter((v) => v.isAaDesignated);
      if (eligibleAaVenues.length === 0) {
        warnings.push(`Paper has ${aaSeparateCandidates.length} AA candidate(s) requiring separate room, but no AA-designated venues are configured. Falling back to available quiet classrooms.`);
        eligibleAaVenues = allVenues.filter((v) => !v.isLab && !v.hasComputers);
      }
    }

    if (aaSeparateCandidates.length > 0) {
      const candidatePool = [...aaSeparateCandidates];
      for (const venue of eligibleAaVenues) {
        if (candidatePool.length === 0) break;
        const availableSeats = getSerpentineSeats(venue);

        for (const { seat, row, col } of availableSeats) {
          if (candidatePool.length === 0) break;
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

  // 3. Filter Venues for Main Cohort
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
    // Strictly audio-equipped venues
    eligibleVenues = allVenues.filter((v) => v.hasAudio && !v.isLab && !v.isAaDesignated);
    if (eligibleVenues.length === 0) {
      warnings.push('Listening Comprehension requires PA/audio equipped venues. Falling back to general classrooms/halls.');
      eligibleVenues = allVenues.filter((v) => !v.isLab && !v.isAaDesignated);
    }
  } else {
    // Standard written papers: Halls and classrooms (avoid labs unless overflow)
    const nonLabs = allVenues.filter((v) => !v.isLab && !v.isAaDesignated && !v.hasComputers);
    const computerLabsFallback = allVenues.filter((v) => v.hasComputers && !v.isLab && !v.isAaDesignated);
    eligibleVenues = [...nonLabs, ...computerLabsFallback];
  }

  // 4. Handle Science Lab Shifts (Multi-Shift split + Holding Room)
  let isMultiShift = false;
  let holdingRoomVenueId: string | undefined;

  if (isScienceLab && eligibleVenues.length > 0) {
    const totalLabActiveSeats = eligibleVenues.reduce((sum, v) => {
      const active = v.seatGrid.flat().filter((s) => s.isActive).length;
      return sum + active;
    }, 0);

    if (mainCohortCandidates.length > totalLabActiveSeats && totalLabActiveSeats > 0) {
      isMultiShift = true;
      warnings.push(`Cohort size (${mainCohortCandidates.length}) exceeds total lab capacity (${totalLabActiveSeats}). Cohort is partitioned into Shift 1 and Shift 2.`);

      // Find an idle classroom to serve as Quarantine / Holding Room
      const idleClassroom = allVenues.find(
        (v) => !v.isLab && !v.isAaDesignated && v.seatGrid.flat().filter((s) => s.isActive).length >= Math.ceil(mainCohortCandidates.length / 2)
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
      return a.indexNumber.localeCompare(b.indexNumber);
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

          if (currentSeatObj && currentSeatObj.isActive && !continuitySeatsAllocated.has(seatKey)) {
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

  // Standard allocation (single shift)
  for (const venue of eligibleVenues) {
    if (remainingCandidates.length === 0) break;

    const orderedSeats = isListeningComp ? orderSeatsForLC(venue) : getSerpentineSeats(venue);
    // If venue is computer lab, limit seats to computerStations
    const maxCapacity = requiresComputer && venue.hasComputers 
      ? Math.min(venue.computerStations || orderedSeats.length, orderedSeats.length)
      : orderedSeats.length;

    let seatsAssignedInVenue = 0;

    for (const { seat, row, col } of orderedSeats) {
      if (remainingCandidates.length === 0) break;
      if (seatsAssignedInVenue >= maxCapacity) break;

      // Check if desk is already occupied from continuity pass
      const isOccupied = allocations.some(
        (a) => a.venueId === venue.id && a.row === row && a.col === col && a.paperId === targetPaper.id
      );
      if (isOccupied) continue;

      const candidate = remainingCandidates.shift()!;
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
    }
  }

  const unallocatedCandidateIds = remainingCandidates.map((c) => c.id);
  if (unallocatedCandidateIds.length > 0) {
    warnings.push(`Not enough total venue capacity! ${unallocatedCandidateIds.length} candidate(s) could not be seated.`);
  }

  return {
    allocations,
    unallocatedCandidateIds,
    holdingRoomVenueId,
    isMultiShift: false,
    warnings,
  };
}
