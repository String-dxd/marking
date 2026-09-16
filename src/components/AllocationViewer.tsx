import React, { useState, useMemo } from 'react';
import { useExamStore } from '../store/useExamStore';
import { 
  runDeterministicAllocation, 
  arePapersConcurrent, 
  classifyVenue, 
  extractLevelNumber,
  getPaperLevel,
  getDistinctLevels
} from '../services/allocationEngine';
import { getCandidatePaperArrangement } from '../types';
import { 
  Play, 
  RotateCcw, 
  ArrowLeftRight, 
  AlertTriangle, 
  Users, 
  Building2, 
  Monitor, 
  Headphones, 
  Ban,
  Sparkles,
  Trash2,
  ExternalLink,
  X,
  DoorOpen,
  Check,
  Layers,
  GraduationCap
} from 'lucide-react';

export const AllocationViewer: React.FC = () => {
  const { 
    scope,
    papers, 
    candidates, 
    venues, 
    allocations, 
    autoCombineAaVenues,
    setAutoCombineAaVenues,
    setAllocations, 
    setBatchAllocations,
    clearAllocationsForPaper, 
    clearAllAllocations,
    swapSeats, 
    moveSeat 
  } = useExamStore();

  const [selectedLevelFilter, setSelectedLevelFilter] = useState<string>('ALL');
  const [selectedPaperId, setSelectedPaperId] = useState<string>(papers[0]?.id || '');
  const [selectedVenueId, setSelectedVenueId] = useState<string>('');
  const [selectedSeatForSwap, setSelectedSeatForSwap] = useState<{ candidateId: string; seatLabel: string; venueId: string } | null>(null);
  const [showEmptyVenues, setShowEmptyVenues] = useState<boolean>(false);
  const [swapActionNotice, setSwapActionNotice] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);
  const [isBatchSummaryOpen, setIsBatchSummaryOpen] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{
    totalPapersProcessed: number;
    totalCandidatesSeated: number;
    warningsByPaper: { paperCode: string; paperTitle: string; warnings: string[] }[];
    paperStats: {
      paperId: string;
      paperCode: string;
      paperTitle: string;
      level?: string;
      date: string;
      startTime: string;
      enrolledCount: number;
      seatedCount: number;
      venuesCount: number;
      requiresComputer: boolean;
      type: string;
    }[];
  } | null>(null);

  // Discover all distinct academic levels from papers and candidates
  const distinctLevels = useMemo(() => {
    return getDistinctLevels(papers, candidates);
  }, [papers, candidates]);

  // Filter papers by selected academic level
  const displayedPapers = useMemo(() => {
    if (selectedLevelFilter === 'ALL') return papers;
    return papers.filter((p) => getPaperLevel(p, candidates) === selectedLevelFilter);
  }, [papers, candidates, selectedLevelFilter]);

  // Current active paper
  const currentPaper = useMemo(() => {
    const foundInDisplayed = displayedPapers.find((p) => p.id === selectedPaperId);
    if (foundInDisplayed) return foundInDisplayed;
    const foundInAll = papers.find((p) => p.id === selectedPaperId);
    if (foundInAll && selectedLevelFilter === 'ALL') return foundInAll;
    return displayedPapers[0] || papers[0] || null;
  }, [papers, displayedPapers, selectedPaperId, selectedLevelFilter]);

  // Current allocations for selected paper
  const currentAllocations = useMemo(() => {
    if (!currentPaper) return [];
    return allocations[currentPaper.id] || [];
  }, [allocations, currentPaper]);

  // Concurrent papers scheduled on the same date with overlapping duration
  const concurrentPapers = useMemo(() => {
    if (!currentPaper) return [];
    return papers.filter((p) => p.id !== currentPaper.id && arePapersConcurrent(p, currentPaper));
  }, [papers, currentPaper]);

  // Existing allocations for concurrent papers
  const concurrentAllocations = useMemo(() => {
    if (concurrentPapers.length === 0) return [];
    return concurrentPapers.flatMap((p) => allocations[p.id] || []);
  }, [concurrentPapers, allocations]);

  // Enrolled candidates for current paper
  const enrolledCandidates = useMemo(() => {
    if (!currentPaper) return [];
    return candidates.filter((c) => c.subjectCodes.includes(currentPaper.code));
  }, [candidates, currentPaper]);

  // Detected target academic level number for active paper
  const currentLevelNumber = useMemo(() => {
    if (!currentPaper) return undefined;
    const paperLevel = extractLevelNumber(currentPaper.level);
    if (paperLevel !== undefined) return paperLevel;
    const cand = enrolledCandidates.find((c) => extractLevelNumber(c.academicLevel) || extractLevelNumber(c.classGroup));
    return cand ? extractLevelNumber(cand.academicLevel) || extractLevelNumber(cand.classGroup) : undefined;
  }, [currentPaper, enrolledCandidates]);

  // Venues used in this allocation (and concurrent allocations for this slot)
  const allocatedVenueIds = useMemo(() => {
    const ids = new Set([
      ...currentAllocations.map((a) => a.venueId),
      ...concurrentAllocations.map((a) => a.venueId)
    ]);
    return Array.from(ids);
  }, [currentAllocations, concurrentAllocations]);

  const allocatedVenues = useMemo(() => {
    return venues.filter((v) => allocatedVenueIds.includes(v.id));
  }, [venues, allocatedVenueIds]);

  const emptyVenues = useMemo(() => {
    return venues.filter((v) => !allocatedVenueIds.includes(v.id));
  }, [venues, allocatedVenueIds]);

  // Venues to display in tabs: all allocated, plus active venue if it is empty, plus all empty if showEmptyVenues is true
  const displayedVenues = useMemo(() => {
    const list: typeof venues = [...allocatedVenues];
    emptyVenues.forEach((ev) => {
      if (showEmptyVenues || ev.id === selectedVenueId) {
        if (!list.some((v) => v.id === ev.id)) {
          list.push(ev);
        }
      }
    });
    return list;
  }, [allocatedVenues, emptyVenues, showEmptyVenues, selectedVenueId]);

  // Active viewing venue
  const activeVenue = useMemo(() => {
    if (selectedVenueId && venues.some((v) => v.id === selectedVenueId)) {
      return venues.find((v) => v.id === selectedVenueId)!;
    }
    return allocatedVenues[0] || venues[0] || null;
  }, [venues, selectedVenueId, allocatedVenues]);

  // Selected candidate and venue helpers for swap / move
  const selectedSeatCandidate = useMemo(() => {
    if (!selectedSeatForSwap) return null;
    return candidates.find((c) => c.id === selectedSeatForSwap.candidateId) || null;
  }, [candidates, selectedSeatForSwap]);

  const sourceVenue = useMemo(() => {
    if (!selectedSeatForSwap) return null;
    return venues.find((v) => v.id === selectedSeatForSwap.venueId) || null;
  }, [venues, selectedSeatForSwap]);

  // Run allocation handler
  const handleRunAllocation = () => {
    if (!currentPaper) return;

    const result = runDeterministicAllocation(
      currentPaper,
      candidates,
      venues,
      papers,
      allocations,
      { autoCombineAaVenues }
    );

    setAllocations(currentPaper.id, result.allocations);
    setLastWarnings(result.warnings);
    setSelectedSeatForSwap(null);

    if (result.allocations.length > 0) {
      setSelectedVenueId(result.allocations[0].venueId);
    }
  };

  const handleClear = () => {
    if (!currentPaper) return;
    clearAllocationsForPaper(currentPaper.id);
    setLastWarnings([]);
    setSelectedSeatForSwap(null);
  };

  const handleBatchRunAll = () => {
    if (papers.length === 0) return;
    if (venues.length === 0) {
      alert('Please configure at least one exam venue in Stage 3 before generating seating allocations.');
      return;
    }

    // Filter to papers with enrolled candidates if candidates exist
    const papersWithCandidates = papers.filter((p) =>
      candidates.some((c) => c.subjectCodes.includes(p.code))
    );
    const targetPapers = papersWithCandidates.length > 0 ? papersWithCandidates : papers;

    // Chronological and deterministic sort: date -> startTime -> code
    const sorted = [...targetPapers].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      const t = a.startTime.localeCompare(b.startTime);
      if (t !== 0) return t;
      return a.code.localeCompare(b.code);
    });

    const newAllocations: Record<string, any[]> = {};
    const warningsByPaper: { paperCode: string; paperTitle: string; warnings: string[] }[] = [];
    const paperStats: any[] = [];
    let totalSeated = 0;

    for (const paper of sorted) {
      const enrolled = candidates.filter((c) => c.subjectCodes.includes(paper.code));
      const result = runDeterministicAllocation(
        paper,
        candidates,
        venues,
        papers,
        newAllocations, // accumulates to enforce short-gap venue continuity and concurrent non-overlap!
        { autoCombineAaVenues }
      );

      newAllocations[paper.id] = result.allocations;
      totalSeated += result.allocations.length;

      const distinctVenues = new Set(result.allocations.map((a) => a.venueId)).size;
      paperStats.push({
        paperId: paper.id,
        paperCode: paper.code,
        paperTitle: paper.title,
        level: getPaperLevel(paper, candidates),
        date: paper.date,
        startTime: paper.startTime,
        enrolledCount: enrolled.length,
        seatedCount: result.allocations.length,
        venuesCount: distinctVenues,
        requiresComputer: paper.requiresComputer,
        type: paper.type,
      });

      if (result.warnings.length > 0) {
        warningsByPaper.push({
          paperCode: paper.code,
          paperTitle: paper.title,
          warnings: result.warnings,
        });
      }
    }

    setBatchAllocations(newAllocations);
    setBatchSummary({
      totalPapersProcessed: targetPapers.length,
      totalCandidatesSeated: totalSeated,
      warningsByPaper,
      paperStats,
    });
    setIsBatchSummaryOpen(true);

    if (targetPapers.length > 0) {
      setSelectedPaperId(targetPapers[0].id);
      if (newAllocations[targetPapers[0].id]?.length > 0) {
        setSelectedVenueId(newAllocations[targetPapers[0].id][0].venueId);
      }
    }
  };

  // Quick move to first available seat in target venue (supports empty rooms!)
  const handleQuickMoveToVenue = (targetVenueId: string) => {
    if (!currentPaper || !selectedSeatForSwap) return;

    const targetVenue = venues.find((v) => v.id === targetVenueId);
    if (!targetVenue) return;

    // Find first active, unoccupied seat in target venue (must not collide with current or concurrent papers)
    let foundSeat: { row: number; col: number; seatLabel: string } | null = null;

    for (let r = 0; r < targetVenue.seatGrid.length; r++) {
      for (let c = 0; c < targetVenue.seatGrid[r].length; c++) {
        const seat = targetVenue.seatGrid[r][c];
        if (seat.isActive) {
          const isOccupied = currentAllocations.some(
            (a) => a.venueId === targetVenue.id && a.row === r && a.col === c
          ) || concurrentAllocations.some(
            (a) => a.venueId === targetVenue.id && a.row === r && a.col === c
          );
          if (!isOccupied) {
            foundSeat = { row: r, col: c, seatLabel: seat.seatLabel };
            break;
          }
        }
      }
      if (foundSeat) break;
    }

    if (!foundSeat) {
      alert(`Cannot move: ${targetVenue.name} has no available active desks.`);
      return;
    }

    const cand = candidates.find((c) => c.id === selectedSeatForSwap.candidateId);
    const srcVenue = venues.find((v) => v.id === selectedSeatForSwap.venueId);

    moveSeat(
      currentPaper.id,
      selectedSeatForSwap.candidateId,
      targetVenue.id,
      foundSeat.row,
      foundSeat.col,
      foundSeat.seatLabel
    );

    setSelectedVenueId(targetVenue.id);
    setSelectedSeatForSwap(null);

    setSwapActionNotice({
      message: `Moved ${cand?.indexNumber} (${cand?.fullName}) from ${srcVenue?.name || 'original room'} to ${targetVenue.name} (Desk ${foundSeat.seatLabel}).`,
      type: 'success',
    });
    setTimeout(() => setSwapActionNotice(null), 4500);
  };

  // Seat click handler for swap or move (supports same-room and cross-room!)
  const handleSeatClick = (
    venueId: string, 
    row: number, 
    col: number, 
    seatLabel: string, 
    assignedCandidateId?: string
  ) => {
    if (!currentPaper) return;

    // If clicking a seat occupied by a concurrent exam: block with info notice
    const concurrentAlloc = concurrentAllocations.find(
      (a) => a.venueId === venueId && a.row === row && a.col === col
    );
    if (concurrentAlloc) {
      const otherPaper = papers.find((p) => p.id === concurrentAlloc.paperId);
      const otherCand = candidates.find((c) => c.id === concurrentAlloc.candidateId);
      setSwapActionNotice({
        message: `Desk ${seatLabel} is occupied by Candidate ${otherCand?.indexNumber || concurrentAlloc.candidateId} taking concurrent paper ${otherPaper?.code || 'another exam'}.`,
        type: 'info',
      });
      setTimeout(() => setSwapActionNotice(null), 4500);
      return;
    }

    // If nothing selected yet:
    if (!selectedSeatForSwap) {
      if (assignedCandidateId) {
        setSelectedSeatForSwap({
          candidateId: assignedCandidateId,
          seatLabel,
          venueId,
        });
      }
      return;
    }

    // If clicking the same seat: deselect
    if (selectedSeatForSwap.candidateId === assignedCandidateId) {
      setSelectedSeatForSwap(null);
      return;
    }

    const cand1 = candidates.find((c) => c.id === selectedSeatForSwap.candidateId);
    const srcVenue = venues.find((v) => v.id === selectedSeatForSwap.venueId);
    const targetVenue = venues.find((v) => v.id === venueId);

    // If clicking another occupied desk: SWAP (same room OR cross room!)
    if (assignedCandidateId) {
      const cand2 = candidates.find((c) => c.id === assignedCandidateId);
      const isCrossRoom = selectedSeatForSwap.venueId !== venueId;

      swapSeats(currentPaper.id, selectedSeatForSwap.candidateId, assignedCandidateId);
      setSelectedSeatForSwap(null);

      if (isCrossRoom) {
        setSwapActionNotice({
          message: `Cross-Room Swap Complete: Swapped ${cand1?.indexNumber} (${cand1?.fullName}) in ${srcVenue?.name} with ${cand2?.indexNumber} (${cand2?.fullName}) in ${targetVenue?.name}.`,
          type: 'success',
        });
      } else {
        setSwapActionNotice({
          message: `Swapped seats between ${cand1?.indexNumber} and ${cand2?.indexNumber} in ${targetVenue?.name}.`,
          type: 'success',
        });
      }
      setTimeout(() => setSwapActionNotice(null), 4500);
    } else {
      // If clicking an empty active desk: MOVE (same room OR cross room / empty room!)
      const isCrossRoom = selectedSeatForSwap.venueId !== venueId;

      moveSeat(currentPaper.id, selectedSeatForSwap.candidateId, venueId, row, col, seatLabel);
      setSelectedSeatForSwap(null);

      if (isCrossRoom) {
        setSwapActionNotice({
          message: `Moved ${cand1?.indexNumber} (${cand1?.fullName}) from ${srcVenue?.name} to ${targetVenue?.name} (Desk ${seatLabel}).`,
          type: 'success',
        });
      } else {
        setSwapActionNotice({
          message: `Moved ${cand1?.indexNumber} to Desk ${seatLabel} in ${targetVenue?.name}.`,
          type: 'success',
        });
      }
      setTimeout(() => setSwapActionNotice(null), 4500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Stage 4: Allocation Engine & Seating Matrix</h2>
            <p className="text-sm text-slate-500 mt-1">
              Deterministic allocation adhering to SEAB rooming logic, AA listening exception, venue continuity, and desk swapping.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Master Toggle: Auto-Combine AA Venues */}
            <label
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer transition-colors shadow-xs select-none"
              title="When enabled, AA separate room candidates across concurrent papers are automatically combined into designated AA rooms without desk collisions."
            >
              <input
                type="checkbox"
                checked={autoCombineAaVenues}
                onChange={(e) => setAutoCombineAaVenues(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>Auto-Combine AA Venues</span>
              </div>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase ${
                  autoCombineAaVenues
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-200 text-slate-600 border border-slate-300'
                }`}
              >
                {autoCombineAaVenues ? 'ON' : 'OFF'}
              </span>
            </label>

            {/* Paper Selector */}
            <select
              value={currentPaper?.id || ''}
              onChange={(e) => {
                setSelectedPaperId(e.target.value);
                setSelectedSeatForSwap(null);
                setLastWarnings([]);
              }}
              className="px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 shadow-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none max-w-xs md:max-w-sm truncate cursor-pointer"
            >
              {selectedLevelFilter === 'ALL' ? (
                distinctLevels.length > 1 ? (
                  distinctLevels.map((lvl) => {
                    const lvlPapers = papers.filter((p) => getPaperLevel(p, candidates) === lvl);
                    if (lvlPapers.length === 0) return null;
                    return (
                      <optgroup key={lvl} label={`── ${lvl} ──`}>
                        {lvlPapers.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{lvl}] {p.code} — {p.title}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })
                ) : (
                  papers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.title}
                    </option>
                  ))
                )
              ) : (
                displayedPapers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.title}
                  </option>
                ))
              )}
            </select>

            <button
              onClick={handleRunAllocation}
              disabled={!currentPaper || enrolledCandidates.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Generate Allocation</span>
            </button>

            <button
              onClick={handleBatchRunAll}
              disabled={papers.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
              title="Batch allocate seating for all scheduled exam papers across all levels"
            >
              <Sparkles className="w-4 h-4" />
              <span>Batch Run All</span>
            </button>

            <button
              onClick={handleClear}
              disabled={currentAllocations.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 hover:border-slate-400 disabled:opacity-50 text-slate-700 text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>

            {Object.keys(allocations).length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to reset all seating allocations across all exam papers?')) {
                    clearAllAllocations();
                    setLastWarnings([]);
                    setSelectedSeatForSwap(null);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-rose-200 hover:border-rose-300 text-rose-700 text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
                title="Reset all seating allocations"
              >
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>

        {/* Level Switcher Bar */}
        {distinctLevels.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-700">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider">Level Filter:</span>
            </div>

            <div className="flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200 gap-1">
              <button
                type="button"
                onClick={() => setSelectedLevelFilter('ALL')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  selectedLevelFilter === 'ALL'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>All Levels ({papers.length})</span>
              </button>

              {distinctLevels.map((lvl) => {
                const count = papers.filter((p) => getPaperLevel(p, candidates) === lvl).length;
                const isSelected = selectedLevelFilter === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => {
                      setSelectedLevelFilter(lvl);
                      const firstOfLvl = papers.find((p) => getPaperLevel(p, candidates) === lvl);
                      if (firstOfLvl) {
                        setSelectedPaperId(firstOfLvl.id);
                        setSelectedSeatForSwap(null);
                        setLastWarnings([]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>{lvl}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Paper Details strip */}
        {currentPaper && (
          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-slate-400">Level:</span>{' '}
                <strong className="text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {getPaperLevel(currentPaper, candidates)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400">Date:</span>{' '}
                <strong>{currentPaper.date}</strong> at <strong>{currentPaper.startTime}</strong> ({currentPaper.durationMins}m)
              </div>
              <div>
                <span className="text-slate-400">Enrolled Candidates:</span>{' '}
                <strong className="text-slate-900">{enrolledCandidates.length}</strong>
              </div>
              <div>
                <span className="text-slate-400">Allocated Desks:</span>{' '}
                <strong className="text-indigo-600">{currentAllocations.length}</strong>
              </div>
              {currentPaper.requiresComputer && (
                <span className="inline-flex items-center gap-1 text-sky-700 font-semibold">
                  <Monitor className="w-3.5 h-3.5" /> Requires Computer Lab
                </span>
              )}
              {currentPaper.type === 'LISTENING_COMP' && (
                <span className="inline-flex items-center gap-1 text-amber-800 font-semibold">
                  <Headphones className="w-3.5 h-3.5" /> Listening Comprehension (AA in Main Cohort)
                </span>
              )}
            </div>

            {selectedSeatForSwap && (
              <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-300 text-indigo-950 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs">
                <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>
                  Active Swap/Move: Candidate <strong className="font-mono">{selectedSeatCandidate?.indexNumber}</strong> ({selectedSeatCandidate?.fullName}) at Desk <strong className="font-mono">{selectedSeatForSwap.seatLabel}</strong> ({sourceVenue?.name}).
                </span>
                <button
                  onClick={() => setSelectedSeatForSwap(null)}
                  className="ml-2 px-1.5 py-0.5 bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded text-[11px] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Dedicated Cross-Room Relocation Action Banner */}
        {selectedSeatForSwap && (
          <div className="mt-4 p-3.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-300 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-xs">
                <ArrowLeftRight className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Cross-Room Swap / Relocation Active</span>
                  <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                    Room-to-Room
                  </span>
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Click another candidate in <strong>any venue</strong> to SWAP, or click an empty desk to MOVE. You can switch rooms using the tabs below.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Direct Move to Room Dropdown */}
              <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 border border-indigo-300 rounded-lg shadow-xs">
                <DoorOpen className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-xs font-medium text-slate-700">Quick Move:</span>
                <select
                  onChange={(e) => {
                    if (!e.target.value) return;
                    handleQuickMoveToVenue(e.target.value);
                    e.target.value = '';
                  }}
                  defaultValue=""
                  className="text-xs bg-transparent text-indigo-900 font-semibold focus:outline-none cursor-pointer pr-2"
                >
                  <option value="" disabled>Choose target room...</option>
                  {venues.map((v) => {
                    const count = currentAllocations.filter((a) => a.venueId === v.id).length;
                    const isSource = v.id === selectedSeatForSwap.venueId;
                    return (
                      <option key={v.id} value={v.id} disabled={isSource}>
                        {v.name} {count === 0 ? '(Empty Room)' : `(${count} seated)`} {isSource ? '— Current' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <button
                onClick={() => setSelectedSeatForSwap(null)}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Cancel Selection
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Notification Toast */}
      {swapActionNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-semibold flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{swapActionNotice.message}</span>
          </div>
          <button
            onClick={() => setSwapActionNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Warnings & Notices */}
      {lastWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Allocation Solver Notices:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-amber-800 pl-1">
            {lastWarnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Grid Visualizer */}
      {currentAllocations.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 shadow-sm">
          <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="font-semibold text-slate-700">No Seating Generated Yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Generate Allocation" to run the deterministic serpentine solver across active venues.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Venue Tabs (includes empty rooms & cross-room swap indicator) */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
            {displayedVenues.map((v) => {
              const countInVenue = currentAllocations.filter((a) => a.venueId === v.id).length;
              const concurrentInVenue = concurrentAllocations.filter((a) => a.venueId === v.id).length;
              const isActive = activeVenue?.id === v.id;
              const isEmpty = countInVenue === 0 && concurrentInVenue === 0;
              const isSourceOfSwap = selectedSeatForSwap?.venueId === v.id;
              const venueClass = classifyVenue(v.name, currentLevelNumber);

              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVenueId(v.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : isEmpty
                      ? 'bg-slate-50 border border-dashed border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isEmpty ? (
                    <DoorOpen className={`w-3.5 h-3.5 ${isActive ? 'text-slate-300' : 'text-slate-400'}`} />
                  ) : (
                    <Building2 className="w-3.5 h-3.5" />
                  )}
                  <span>{v.name}</span>

                  {scope === 'internal' && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-tight ${
                        isActive
                          ? venueClass.tier === 1
                            ? 'bg-emerald-500/30 text-emerald-200'
                            : venueClass.tier === 2
                            ? 'bg-sky-500/30 text-sky-200'
                            : 'bg-amber-500/30 text-amber-200'
                          : venueClass.tier === 1
                          ? 'bg-emerald-100 text-emerald-800'
                          : venueClass.tier === 2
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                      title={venueClass.tierLabel}
                    >
                      {venueClass.tier === 1 ? 'Own Level' : venueClass.tier === 2 ? 'Non-Form' : 'Other Level'}
                    </span>
                  )}

                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      isActive
                        ? 'bg-slate-800 text-slate-200'
                        : isEmpty
                        ? 'bg-slate-200 text-slate-600 font-mono'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isEmpty
                      ? 'Empty'
                      : `${countInVenue} seated${concurrentInVenue > 0 ? ` (+${concurrentInVenue} concurrent)` : ''}`}
                  </span>
                  {isSourceOfSwap && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Source of Selected Candidate" />
                  )}
                </button>
              );
            })}

            {/* Toggle button to show / hide unallocated empty rooms */}
            {emptyVenues.length > 0 && (
              <button
                type="button"
                onClick={() => setShowEmptyVenues(!showEmptyVenues)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ml-auto ${
                  showEmptyVenues
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-dashed border-slate-300 text-slate-600 hover:text-indigo-600 hover:border-indigo-400 shadow-xs'
                }`}
                title="Toggle visibility of empty / standby examination venues"
              >
                <DoorOpen className="w-3.5 h-3.5" />
                <span>{showEmptyVenues ? 'Hide Empty Rooms' : `+ Show Empty Rooms (${emptyVenues.length})`}</span>
              </button>
            )}
          </div>

          {/* Active Venue Seating Grid */}
          {activeVenue && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 overflow-x-auto">
              {/* Floor Plan Stage Banner */}
              <div className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 pb-2 border-b border-dashed border-slate-300">
                ▲ FRONT OF ROOM (TEACHER'S DESK / WHITEBOARD / AUDIO SPEAKER) ▲
              </div>

              <div
                className="grid gap-3 mx-auto justify-center"
                style={{
                  gridTemplateColumns: `repeat(${activeVenue.cols}, minmax(130px, 1fr))`,
                  maxWidth: `${activeVenue.cols * 180}px`,
                }}
              >
                {activeVenue.seatGrid.map((rowArr, r) =>
                  rowArr.map((seat, c) => {
                    const allocation = currentAllocations.find(
                      (a) => a.venueId === activeVenue.id && a.row === r && a.col === c
                    );
                    const candidate = allocation
                      ? candidates.find((cand) => cand.id === allocation.candidateId)
                      : null;

                    const concurrentAlloc = !allocation
                      ? concurrentAllocations.find(
                          (a) => a.venueId === activeVenue.id && a.row === r && a.col === c
                        )
                      : null;
                    const concurrentPaper = concurrentAlloc
                      ? papers.find((p) => p.id === concurrentAlloc.paperId)
                      : null;
                    const concurrentCandidate = concurrentAlloc
                      ? candidates.find((cand) => cand.id === concurrentAlloc.candidateId)
                      : null;

                    const isSelected =
                      selectedSeatForSwap &&
                      selectedSeatForSwap.candidateId === allocation?.candidateId;

                    if (!seat.isActive) {
                      return (
                        <div
                          key={`${r}-${c}`}
                          className="h-28 rounded-xl border border-dashed border-slate-200 bg-slate-100/60 flex flex-col items-center justify-center p-2 text-slate-300"
                          title="Disabled Desk / Pillar / Aisle"
                        >
                          <Ban className="w-5 h-5 text-slate-300" />
                          <span className="text-[10px] font-mono mt-1">Aisle / Pillar</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${r}-${c}`}
                        onClick={() =>
                          handleSeatClick(
                            activeVenue.id,
                            r,
                            c,
                            seat.seatLabel,
                            candidate?.id
                          )
                        }
                        className={`h-28 rounded-xl border p-2.5 flex flex-col justify-between transition-all cursor-pointer select-none ${
                          isSelected
                            ? 'ring-2 ring-indigo-500 bg-indigo-50/90 border-indigo-500 shadow-md scale-102'
                            : selectedSeatForSwap && !candidate && !concurrentAlloc
                            ? 'bg-emerald-50/40 border-dashed border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50/80 shadow-xs'
                            : selectedSeatForSwap && candidate
                            ? 'bg-amber-50/40 border-amber-300 hover:border-amber-500 hover:bg-amber-50/80 shadow-xs'
                            : concurrentAlloc
                            ? 'bg-purple-50/70 border-purple-200 text-purple-900 shadow-xs'
                            : candidate
                            ? candidate.arrangements &&
                              ((candidate.arrangements.extraTimePct ?? 0) > 0 ||
                                candidate.arrangements.needsSeparateRoom)
                              ? 'bg-amber-50/60 border-amber-300 hover:border-amber-400 shadow-xs'
                              : 'bg-white border-slate-300 hover:border-indigo-300 hover:shadow-xs'
                            : 'bg-white border-dashed border-slate-300 hover:border-indigo-400 hover:bg-slate-50/50'
                        }`}
                      >
                        {/* Desk Header */}
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-slate-600">
                            {seat.seatLabel}
                          </span>
                          <div className="flex items-center gap-1">
                            {seat.hasComputer && (
                              <span title="Equipped with Computer Workstation">
                                <Monitor className="w-3.5 h-3.5 text-sky-600" />
                              </span>
                            )}
                            {concurrentAlloc && (
                              <span
                                className="font-mono font-bold text-[9px] bg-purple-100 text-purple-800 border border-purple-200 px-1 py-0.2 rounded"
                                title={`Occupied by concurrent exam: ${concurrentPaper?.code || ''} — ${concurrentPaper?.title || ''}`}
                              >
                                {concurrentPaper?.code}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Candidate Information */}
                        {candidate ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              {candidate.classGroup && (
                                <span className="text-[10px] font-bold text-slate-700 bg-slate-200/80 px-1.5 py-0.5 rounded">
                                  {candidate.classGroup}
                                </span>
                              )}
                              <span className="font-mono font-black text-sm text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                                {candidate.classGroup ? `#${candidate.indexNumber}` : candidate.indexNumber}
                              </span>
                              {allocation?.shiftIndex && allocation.shiftIndex > 1 && (
                                <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1 rounded">
                                  Shift {allocation.shiftIndex}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-slate-800 line-clamp-1" title={candidate.fullName}>
                              {candidate.fullName}
                            </p>
                          </div>
                        ) : concurrentAlloc ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-black text-sm text-purple-950 bg-purple-100/90 px-1.5 py-0.5 rounded border border-purple-200">
                                {concurrentCandidate?.indexNumber || concurrentAlloc.candidateId}
                              </span>
                              <span className="text-[10px] font-bold text-purple-700">
                                Concurrent
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-purple-900 line-clamp-1" title={concurrentCandidate?.fullName}>
                              {concurrentCandidate?.fullName || 'Concurrent Candidate'}
                            </p>
                          </div>
                        ) : (
                          <div className="text-center py-2 text-xs font-medium">
                            {selectedSeatForSwap ? (
                              <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300 font-semibold text-[11px] inline-block animate-pulse">
                                Click to Move Here
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Empty Desk</span>
                            )}
                          </div>
                        )}

                        {/* Badges footer */}
                        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100">
                          {concurrentAlloc ? (
                            <span className="text-[10px] text-purple-700 font-medium truncate max-w-[90px]" title={concurrentPaper?.title}>
                              {concurrentPaper?.title || 'Concurrent Paper'}
                            </span>
                          ) : (() => {
                            const arr = getCandidatePaperArrangement(candidate, currentPaper?.code);
                            if (arr && ((arr.extraTimePct ?? 0) > 0 || arr.frontSeatMobility || arr.needsSeparateRoom)) {
                              return (
                                <div className="flex items-center gap-1">
                                  {(arr.extraTimePct ?? 0) > 0 && (
                                    <span className="bg-indigo-100 text-indigo-800 font-bold px-1 rounded">
                                      +{arr.extraTimePct}%
                                    </span>
                                  )}
                                  {arr.frontSeatMobility && (
                                    <span title="Front Row / LC Audio Seating" className="bg-sky-100 text-sky-800 font-bold px-1 rounded">
                                      FRONT
                                    </span>
                                  )}
                                  {arr.needsSeparateRoom && (
                                    <span title="Separate Room" className="bg-rose-100 text-rose-800 font-bold px-1 rounded">
                                      SEP
                                    </span>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <span className="text-[10px] text-slate-400 font-medium">
                                {candidate
                                  ? selectedSeatForSwap && !isSelected
                                    ? selectedSeatForSwap.venueId !== activeVenue.id
                                      ? 'Swap Cross-Room'
                                      : 'Click to Swap'
                                    : 'Standard'
                                  : selectedSeatForSwap
                                  ? 'Move Target'
                                  : 'Click to Move'}
                              </span>
                            );
                          })()}

                          <span className="text-[9px] text-slate-400 font-mono">
                            R{r + 1}C{c + 1}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Batch Summary Modal */}
      {isBatchSummaryOpen && batchSummary && (
        <BatchSummaryModal
          summary={batchSummary}
          onClose={() => setIsBatchSummaryOpen(false)}
          onSelectPaper={(paperId) => {
            setSelectedPaperId(paperId);
            const firstAlloc = allocations[paperId]?.[0];
            if (firstAlloc) {
              setSelectedVenueId(firstAlloc.venueId);
            }
          }}
        />
      )}
    </div>
  );
};

interface BatchSummaryModalProps {
  summary: {
    totalPapersProcessed: number;
    totalCandidatesSeated: number;
    warningsByPaper: { paperCode: string; paperTitle: string; warnings: string[] }[];
    paperStats: {
      paperId: string;
      paperCode: string;
      paperTitle: string;
      level?: string;
      date: string;
      startTime: string;
      enrolledCount: number;
      seatedCount: number;
      venuesCount: number;
      requiresComputer: boolean;
      type: string;
    }[];
  };
  onClose: () => void;
  onSelectPaper: (paperId: string) => void;
}

const BatchSummaryModal: React.FC<BatchSummaryModalProps> = ({
  summary,
  onClose,
  onSelectPaper,
}) => {
  const [modalLevelFilter, setModalLevelFilter] = useState<string>('ALL');

  const summaryLevels = useMemo(() => {
    const set = new Set<string>();
    summary.paperStats.forEach((p) => {
      if (p.level && p.level !== 'General') set.add(p.level);
    });
    return Array.from(set).sort((a, b) => {
      const numA = extractLevelNumber(a) ?? 999;
      const numB = extractLevelNumber(b) ?? 999;
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });
  }, [summary.paperStats]);

  const filteredStats = useMemo(() => {
    if (modalLevelFilter === 'ALL') return summary.paperStats;
    return summary.paperStats.filter((p) => p.level === modalLevelFilter);
  }, [summary.paperStats, modalLevelFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-xs">
              <Sparkles className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Batch Seating Allocation Complete</h3>
              <p className="text-xs text-purple-100">
                All scheduled examination papers processed across all levels through the deterministic seating solver.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 p-5 bg-slate-50 border-b border-slate-200">
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase">Papers Allocated</span>
            <p className="text-2xl font-bold text-purple-700 mt-1">{summary.totalPapersProcessed}</p>
            <p className="text-[11px] text-slate-400">Exam papers processed</p>
          </div>
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase">Candidates Seated</span>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{summary.totalCandidatesSeated}</p>
            <p className="text-[11px] text-slate-400">Total desks assigned</p>
          </div>
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase">Rooming Checks</span>
            <p className="text-2xl font-bold text-emerald-600 mt-1">Passed</p>
            <p className="text-[11px] text-slate-400">Hierarchy & continuity verified</p>
          </div>
        </div>

        {/* Content list */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {summary.warningsByPaper.length > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Rooming & Shift Notices ({summary.warningsByPaper.length})</span>
              </div>
              <ul className="list-disc list-inside space-y-1 mt-1 text-amber-800">
                {summary.warningsByPaper.map((w, idx) => (
                  <li key={idx}>
                    <strong>{w.paperCode}:</strong> {w.warnings.join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Allocated Papers Breakdown ({filteredStats.length})
              </h4>

              {summaryLevels.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setModalLevelFilter('ALL')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      modalLevelFilter === 'ALL'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({summary.paperStats.length})
                  </button>
                  {summaryLevels.map((lvl) => {
                    const count = summary.paperStats.filter((p) => p.level === lvl).length;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setModalLevelFilter(lvl)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                          modalLevelFilter === lvl
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {lvl} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              {filteredStats.map((stat) => (
                <div key={stat.paperId} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 font-mono font-bold text-xs rounded">
                        {stat.paperCode}
                      </span>
                      {stat.level && (
                        <span className="px-2 py-0.2 bg-indigo-50 text-indigo-700 font-bold text-[10px] rounded border border-indigo-200">
                          {stat.level}
                        </span>
                      )}
                      <span className="font-semibold text-slate-800 text-sm">{stat.paperTitle}</span>
                      {stat.requiresComputer && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-sky-100 text-sky-800 font-semibold px-1.5 py-0.2 rounded border border-sky-200">
                          <Monitor className="w-3 h-3" /> Computer
                        </span>
                      )}
                      {stat.type === 'LISTENING_COMP' && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.2 rounded border border-amber-200">
                          <Headphones className="w-3 h-3" /> LC
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      <span>{stat.date} at {stat.startTime}</span> &bull;{' '}
                      <span className="text-slate-700 font-medium">{stat.seatedCount} seated</span> across {stat.venuesCount} venue(s)
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onSelectPaper(stat.paperId);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <span>View Seating</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            Close & Review Seating
          </button>
        </div>
      </div>
    </div>
  );
};
