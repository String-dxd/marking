import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Candidate, ExamPaper, Venue, SeatAllocation, AccessArrangement } from '../types';

export type TabType = 'candidates' | 'timetable' | 'venues' | 'allocation' | 'reports';

interface ExamStoreState {
  candidates: Candidate[];
  papers: ExamPaper[];
  venues: Venue[];
  allocations: Record<string, SeatAllocation[]>; // paperId -> SeatAllocation[]
  activeTab: TabType;
  selectedPaperId: string | null;
  selectedVenueId: string | null;

  // Actions
  setActiveTab: (tab: TabType) => void;
  setSelectedPaperId: (id: string | null) => void;
  setSelectedVenueId: (id: string | null) => void;

  setCandidates: (candidates: Candidate[]) => void;
  mergeCandidates: (newCandidates: Candidate[]) => void;
  updateCandidateAA: (candidateId: string, arrangements: AccessArrangement, paperCode?: string, applyToAll?: boolean) => void;
  saveCandidateAAConfig: (candidateId: string, defaultAA?: AccessArrangement, paperArrangements?: Record<string, AccessArrangement>) => void;

  setPapers: (papers: ExamPaper[]) => void;
  mergePapers: (newPapers: ExamPaper[]) => void;
  addPaper: (paper: ExamPaper) => void;
  updatePaper: (paper: ExamPaper) => void;
  deletePaper: (paperId: string) => void;
  deletePapersByDate: (date: string) => void;
  deletePapersByDates: (dates: string[]) => void;
  deleteUnenrolledPapers: () => void;

  setVenues: (venues: Venue[]) => void;
  addVenue: (venue: Venue) => void;
  updateVenue: (venue: Venue) => void;
  deleteVenue: (venueId: string) => void;

  setAllocations: (paperId: string, allocs: SeatAllocation[]) => void;
  setBatchAllocations: (batch: Record<string, SeatAllocation[]>) => void;
  clearAllocationsForPaper: (paperId: string) => void;
  clearAllAllocations: () => void;
  swapSeats: (paperId: string, candidateId1: string, candidateId2: string) => void;
  moveSeat: (paperId: string, candidateId: string, targetVenueId: string, targetRow: number, targetCol: number, targetSeatLabel: string) => void;

  clearAllData: () => void;
}

export const useExamStore = create<ExamStoreState>()(
  persist(
    (set) => ({
      candidates: [],
      papers: [],
      venues: [],
      allocations: {},
      activeTab: 'candidates',
      selectedPaperId: null,
      selectedVenueId: null,

      setActiveTab: (activeTab) => set({ activeTab }),
      setSelectedPaperId: (selectedPaperId) => set({ selectedPaperId }),
      setSelectedVenueId: (selectedVenueId) => set({ selectedVenueId }),

      setCandidates: (candidates) => set({ candidates }),
      mergeCandidates: (newCandidates) =>
        set((state) => {
          const map = new Map<string, Candidate>();
          // Existing candidates
          state.candidates.forEach((c) => map.set(c.id, { ...c, subjectCodes: [...c.subjectCodes] }));

          // Merge incoming
          newCandidates.forEach((incoming) => {
            if (map.has(incoming.id)) {
              const existing = map.get(incoming.id)!;
              const combinedSubjects = Array.from(new Set([...existing.subjectCodes, ...incoming.subjectCodes]));
              map.set(incoming.id, {
                ...existing,
                fullName: existing.fullName || incoming.fullName,
                academicLevel: existing.academicLevel || incoming.academicLevel,
                schoolName: existing.schoolName || incoming.schoolName,
                examCentreCode: existing.examCentreCode || incoming.examCentreCode,
                subjectCodes: combinedSubjects,
                // preserve arrangements if existing has it
                arrangements: existing.arrangements || incoming.arrangements,
                paperArrangements: { ...incoming.paperArrangements, ...existing.paperArrangements },
              });
            } else {
              map.set(incoming.id, incoming);
            }
          });

          const merged = Array.from(map.values()).sort((a, b) =>
            a.indexNumber.localeCompare(b.indexNumber)
          );
          return { candidates: merged };
        }),
      updateCandidateAA: (candidateId, arrangements, paperCode, applyToAll) =>
        set((state) => ({
          candidates: state.candidates.map((c) => {
            if (c.id !== candidateId) return c;
            if (applyToAll || !paperCode) {
              return {
                ...c,
                arrangements,
                paperArrangements: undefined,
              };
            }
            return {
              ...c,
              paperArrangements: {
                ...(c.paperArrangements || {}),
                [paperCode]: arrangements,
              },
            };
          }),
        })),
      saveCandidateAAConfig: (candidateId, defaultAA, paperArrangements) =>
        set((state) => ({
          candidates: state.candidates.map((c) => {
            if (c.id !== candidateId) return c;
            return {
              ...c,
              arrangements: defaultAA,
              paperArrangements:
                paperArrangements && Object.keys(paperArrangements).length > 0
                  ? paperArrangements
                  : undefined,
            };
          }),
        })),

      setPapers: (papers) => set({ papers }),
      mergePapers: (newPapers) =>
        set((state) => {
          const map = new Map<string, ExamPaper>();
          state.papers.forEach((p) => map.set(p.code, p));
          newPapers.forEach((incoming) => {
            if (!map.has(incoming.code)) {
              map.set(incoming.code, incoming);
            }
          });
          const merged = Array.from(map.values()).sort((a, b) => {
            const dateCmp = a.date.localeCompare(b.date);
            if (dateCmp !== 0) return dateCmp;
            return a.startTime.localeCompare(b.startTime);
          });
          return { papers: merged };
        }),
      addPaper: (paper) => set((state) => ({ papers: [...state.papers, paper] })),
      updatePaper: (paper) =>
        set((state) => ({
          papers: state.papers.map((p) => (p.id === paper.id ? paper : p)),
        })),
      deletePaper: (paperId) =>
        set((state) => {
          const newAllocations = { ...state.allocations };
          delete newAllocations[paperId];
          return {
            papers: state.papers.filter((p) => p.id !== paperId),
            allocations: newAllocations,
            selectedPaperId: state.selectedPaperId === paperId ? null : state.selectedPaperId,
          };
        }),
      deletePapersByDate: (date) =>
        set((state) => {
          const removedIds = new Set(state.papers.filter((p) => p.date === date).map((p) => p.id));
          const newAllocations = { ...state.allocations };
          removedIds.forEach((id) => delete newAllocations[id]);
          return {
            papers: state.papers.filter((p) => p.date !== date),
            allocations: newAllocations,
            selectedPaperId: state.selectedPaperId && removedIds.has(state.selectedPaperId) ? null : state.selectedPaperId,
          };
        }),
      deletePapersByDates: (dates) =>
        set((state) => {
          const dateSet = new Set(dates);
          const removedIds = new Set(state.papers.filter((p) => dateSet.has(p.date)).map((p) => p.id));
          const newAllocations = { ...state.allocations };
          removedIds.forEach((id) => delete newAllocations[id]);
          return {
            papers: state.papers.filter((p) => !dateSet.has(p.date)),
            allocations: newAllocations,
            selectedPaperId: state.selectedPaperId && removedIds.has(state.selectedPaperId) ? null : state.selectedPaperId,
          };
        }),
      deleteUnenrolledPapers: () =>
        set((state) => {
          const enrolledCodes = new Set(state.candidates.flatMap((c) => c.subjectCodes));
          const keptPapers = state.papers.filter((p) => enrolledCodes.has(p.code));
          const removedIds = new Set(state.papers.filter((p) => !enrolledCodes.has(p.code)).map((p) => p.id));
          const newAllocations = { ...state.allocations };
          removedIds.forEach((id) => delete newAllocations[id]);
          return {
            papers: keptPapers,
            allocations: newAllocations,
            selectedPaperId: state.selectedPaperId && removedIds.has(state.selectedPaperId) ? null : state.selectedPaperId,
          };
        }),

      setVenues: (venues) => set({ venues }),
      addVenue: (venue) => set((state) => ({ venues: [...state.venues, venue] })),
      updateVenue: (venue) =>
        set((state) => ({
          venues: state.venues.map((v) => (v.id === venue.id ? venue : v)),
        })),
      deleteVenue: (venueId) =>
        set((state) => ({
          venues: state.venues.filter((v) => v.id !== venueId),
          selectedVenueId: state.selectedVenueId === venueId ? null : state.selectedVenueId,
        })),

      setAllocations: (paperId, allocs) =>
        set((state) => ({
          allocations: {
            ...state.allocations,
            [paperId]: allocs,
          },
        })),
      setBatchAllocations: (batch) =>
        set((state) => ({
          allocations: {
            ...state.allocations,
            ...batch,
          },
        })),

      clearAllocationsForPaper: (paperId) =>
        set((state) => {
          const newAllocations = { ...state.allocations };
          delete newAllocations[paperId];
          return { allocations: newAllocations };
        }),
      clearAllAllocations: () =>
        set({ allocations: {} }),

      swapSeats: (paperId, candidateId1, candidateId2) =>
        set((state) => {
          const current = state.allocations[paperId] || [];
          const idx1 = current.findIndex((a) => a.candidateId === candidateId1);
          const idx2 = current.findIndex((a) => a.candidateId === candidateId2);

          if (idx1 === -1 || idx2 === -1) return state;

          const updated = [...current];
          const seat1 = updated[idx1];
          const seat2 = updated[idx2];

          updated[idx1] = {
            ...seat1,
            candidateId: seat2.candidateId,
          };
          updated[idx2] = {
            ...seat2,
            candidateId: seat1.candidateId,
          };

          return {
            allocations: {
              ...state.allocations,
              [paperId]: updated,
            },
          };
        }),

      moveSeat: (paperId, candidateId, targetVenueId, targetRow, targetCol, targetSeatLabel) =>
        set((state) => {
          const current = state.allocations[paperId] || [];
          const idx = current.findIndex((a) => a.candidateId === candidateId);

          if (idx === -1) return state;

          const updated = [...current];
          updated[idx] = {
            ...updated[idx],
            venueId: targetVenueId,
            row: targetRow,
            col: targetCol,
            seatLabel: targetSeatLabel,
          };

          return {
            allocations: {
              ...state.allocations,
              [paperId]: updated,
            },
          };
        }),

      clearAllData: () =>
        set({
          candidates: [],
          papers: [],
          venues: [],
          allocations: {},
          selectedPaperId: null,
          selectedVenueId: null,
        }),
    }),
    {
      name: import.meta.env.DEV ? 'plexo_exam_store_v1' : 'plexo_exam_store_v0.1_dist',
    }
  )
);
