import React, { useState, useMemo } from 'react';
import { useExamStore } from '../store/useExamStore';
import { getCandidatePaperArrangement } from '../types';
import type { ExamPaper, AccessArrangement, Venue } from '../types';
import { 
  arePapersConcurrent,
  getPaperLevel,
  getDistinctLevels,
  extractLevelNumber,
  getCanonicalLevelName
} from '../services/allocationEngine';
import { 
  Printer, 
  Download, 
  FileText, 
  LayoutGrid, 
  Calendar, 
  DoorOpen, 
  Building2, 
  Monitor, 
  Ban, 
  Award, 
  Search, 
  UserCheck, 
  Scissors,
  GraduationCap,
  Clock,
  PackageCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import plexoLogo from '../assets/plexo-logo.png';

export type ReportType = 'ROOM_USE_OVERVIEW' | 'DOOR_CARD' | 'DESK_SLIPS' | 'INVIGILATOR_MATRIX' | 'ENTRY_PROOF' | 'PACKING_COVER';

function formatExamDate(dateStr?: string) {
  if (!dateStr) return { dayOfWeek: '', formattedDate: '', fullHeader: '' };
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = d.toLocaleDateString('en-SG', { weekday: 'long' });
    const formattedDate = d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
    return {
      dayOfWeek,
      formattedDate,
      fullHeader: `${dayOfWeek}, ${formattedDate}`,
    };
  } catch {
    return { dayOfWeek: '', formattedDate: dateStr, fullHeader: dateStr };
  }
}

export const ReportViewer: React.FC = () => {
  const { scope, papers, candidates, venues, allocations } = useExamStore();
  const [reportType, setReportType] = useState<ReportType>('ROOM_USE_OVERVIEW');

  // Academic level filter for reports
  const [reportLevelFilter, setReportLevelFilter] = useState<string>('ALL');

  // Discover all distinct academic levels from schedule
  const distinctLevels = useMemo(() => {
    return getDistinctLevels(papers, candidates);
  }, [papers, candidates]);

  // Entry Proof state
  const [entryProofClass, setEntryProofClass] = useState<string>('ALL');
  const [entryProofSearch, setEntryProofSearch] = useState<string>('');
  const [entryProofLayout, setEntryProofLayout] = useState<'1_UP' | '2_UP'>('1_UP');

  // Distinct dates in the schedule for Room Use Overview
  const distinctDates = useMemo(() => {
    return Array.from(new Set(papers.map((p) => p.date))).sort();
  }, [papers]);

  const [selectedDate, setSelectedDate] = useState<string>(distinctDates[0] || '');
  const [selectedPaperId, setSelectedPaperId] = useState<string>(papers[0]?.id || '');
  const [selectedVenueId, setSelectedVenueId] = useState<string>('ALL');

  // Ensure selectedDate defaults to first available date
  const activeDate = selectedDate || distinctDates[0] || '';
  const dateInfo = useMemo(() => formatExamDate(activeDate), [activeDate]);

  // Papers scheduled on activeDate (filtered by Level if selected)
  const dayPapers = useMemo(() => {
    const onDate = papers.filter((p) => p.date === activeDate);
    if (reportLevelFilter === 'ALL') return onDate;
    return onDate.filter((p) => getPaperLevel(p, candidates) === reportLevelFilter);
  }, [papers, activeDate, reportLevelFilter, candidates]);

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

  // 5-minute granular horizontal axis settings for Room Utilization Schedule
  const [timelineZoom, setTimelineZoom] = useState<'COMPACT' | 'STANDARD' | 'DETAILED'>('STANDARD');
  const [timelineVenueFilter, setTimelineVenueFilter] = useState<'ALL' | 'OCCUPIED'>('ALL');
  const slotWidth = timelineZoom === 'COMPACT' ? 18 : timelineZoom === 'DETAILED' ? 36 : 26;

  // Dynamic 5-minute timeline boundaries for activeDate
  const timelineBounds = useMemo(() => {
    if (dayPapers.length === 0) {
      return {
        axisStartMin: 8 * 60, // 08:00
        axisEndMin: 14 * 60,  // 14:00
        numSlots: 72,
        hasPapers: false,
      };
    }

    const starts = dayPapers.map((p) => parseTimeToMinutes(p.startTime));
    const ends = dayPapers.map((p) => parseTimeToMinutes(p.startTime) + (p.durationMins || 60));
    const minStart = Math.min(...starts);
    const maxEnd = Math.max(...ends);

    // Snap axisStartMin down to nearest 30-min mark, with 15-min buffer
    const bufferedStart = Math.max(0, minStart - 15);
    const axisStartMin = Math.floor(bufferedStart / 30) * 30;

    // Snap axisEndMin up to nearest 30-min mark, with 15-min buffer
    const bufferedEnd = Math.min(24 * 60, maxEnd + 15);
    const axisEndMin = Math.ceil(bufferedEnd / 30) * 30;

    const numSlots = Math.max(12, Math.round((axisEndMin - axisStartMin) / 5));

    return {
      axisStartMin,
      axisEndMin,
      numSlots,
      hasPapers: true,
    };
  }, [dayPapers]);

  // 5-minute discrete timeline slot array
  const timelineSlots = useMemo(() => {
    const { axisStartMin, numSlots } = timelineBounds;
    const result: {
      index: number;
      startMin: number;
      endMin: number;
      timeStr: string;
      minuteStr: string;
      isHour: boolean;
      isHalfHour: boolean;
    }[] = [];

    for (let i = 0; i < numSlots; i++) {
      const startMin = axisStartMin + i * 5;
      const endMin = startMin + 5;
      const timeStr = minutesToTime(startMin);
      const m = startMin % 60;

      result.push({
        index: i,
        startMin,
        endMin,
        timeStr,
        minuteStr: `:${String(m).padStart(2, '0')}`,
        isHour: m === 0,
        isHalfHour: m === 30,
      });
    }
    return result;
  }, [timelineBounds]);

  // Hour group headers across the 5-minute slots
  const timelineHourHeaders = useMemo(() => {
    const hours: { hourLabel: string; colSpan: number }[] = [];
    let currentHour = -1;
    let span = 0;

    timelineSlots.forEach((s) => {
      const h = Math.floor(s.startMin / 60);
      if (h !== currentHour) {
        if (currentHour !== -1) {
          hours.push({
            hourLabel: `${String(currentHour).padStart(2, '0')}:00`,
            colSpan: span,
          });
        }
        currentHour = h;
        span = 1;
      } else {
        span++;
      }
    });

    if (span > 0 && currentHour !== -1) {
      hours.push({
        hourLabel: `${String(currentHour).padStart(2, '0')}:00`,
        colSpan: span,
      });
    }

    return hours;
  }, [timelineSlots]);

  // Group papers and calculate visual lanes per venue
  const venueTimelineData = useMemo(() => {
    const { axisStartMin, numSlots } = timelineBounds;
    const result = new Map<
      string,
      {
        venue: Venue;
        bookings: {
          paper: ExamPaper;
          candidature: number;
          startMin: number;
          endMin: number;
          durationMins: number;
          startTime: string;
          endTime: string;
          startSlot: number;
          slotSpan: number;
          lane: number;
        }[];
        totalLanes: number;
        totalCandidature: number;
        isOccupied: boolean;
      }
    >();

    venues.forEach((v) => {
      const rawBookings: {
        paper: ExamPaper;
        candidature: number;
        startMin: number;
        endMin: number;
        durationMins: number;
        startTime: string;
        endTime: string;
        startSlot: number;
        slotSpan: number;
      }[] = [];

      dayPapers.forEach((p) => {
        const pAllocs = allocations[p.id] || [];
        const inRoom = pAllocs.filter((a) => a.venueId === v.id);
        if (inRoom.length > 0) {
          const startMin = parseTimeToMinutes(p.startTime);
          const durationMins = p.durationMins || 60;
          const endMin = startMin + durationMins;

          const startSlot = Math.max(0, Math.floor((startMin - axisStartMin) / 5));
          const endSlot = Math.min(numSlots, Math.ceil((endMin - axisStartMin) / 5));
          const slotSpan = Math.max(1, endSlot - startSlot);

          rawBookings.push({
            paper: p,
            candidature: inRoom.length,
            startMin,
            endMin,
            durationMins,
            startTime: p.startTime,
            endTime: minutesToTime(endMin),
            startSlot,
            slotSpan,
          });
        }
      });

      rawBookings.sort((a, b) => a.startMin - b.startMin || a.paper.code.localeCompare(b.paper.code));

      // Lane assignment for concurrent or overlapping exams in the same room
      const laneEndMins: number[] = [];
      const bookingsWithLanes = rawBookings.map((b) => {
        let assignedLane = -1;
        for (let l = 0; l < laneEndMins.length; l++) {
          if (laneEndMins[l] <= b.startMin) {
            assignedLane = l;
            laneEndMins[l] = b.endMin;
            break;
          }
        }
        if (assignedLane === -1) {
          assignedLane = laneEndMins.length;
          laneEndMins.push(b.endMin);
        }
        return {
          ...b,
          lane: assignedLane,
        };
      });

      const totalCandidature = rawBookings.reduce((sum, b) => sum + b.candidature, 0);

      result.set(v.id, {
        venue: v,
        bookings: bookingsWithLanes,
        totalLanes: Math.max(1, laneEndMins.length),
        totalCandidature,
        isOccupied: rawBookings.length > 0,
      });
    });

    return result;
  }, [venues, dayPapers, allocations, timelineBounds]);

  const displayedTimelineVenues = useMemo(() => {
    if (timelineVenueFilter === 'OCCUPIED') {
      return venues.filter((v) => venueTimelineData.get(v.id)?.isOccupied);
    }
    return venues;
  }, [venues, venueTimelineData, timelineVenueFilter]);

  // Concurrent candidate load at each 5-minute interval
  const slotConcurrentLoad = useMemo(() => {
    return timelineSlots.map((slot) => {
      let load = 0;
      venues.forEach((v) => {
        const vData = venueTimelineData.get(v.id);
        (vData?.bookings || []).forEach((b) => {
          if (b.startMin < slot.endMin && b.endMin > slot.startMin) {
            load += b.candidature;
          }
        });
      });
      return load;
    });
  }, [timelineSlots, venues, venueTimelineData]);



  // Papers filtered by level for Door Card / Desk Slips / Invigilator Matrix
  const displayedReportPapers = useMemo(() => {
    if (reportLevelFilter === 'ALL') return papers;
    return papers.filter((p) => getPaperLevel(p, candidates) === reportLevelFilter);
  }, [papers, candidates, reportLevelFilter]);

  // Current active paper for Door Card / Desk Slips
  const currentPaper = useMemo(() => {
    const inDisplayed = displayedReportPapers.find((p) => p.id === selectedPaperId);
    if (inDisplayed) return inDisplayed;
    const inAll = papers.find((p) => p.id === selectedPaperId);
    if (inAll && reportLevelFilter === 'ALL') return inAll;
    return displayedReportPapers[0] || papers[0] || null;
  }, [papers, displayedReportPapers, selectedPaperId, reportLevelFilter]);

  const currentAllocations = useMemo(() => {
    if (!currentPaper) return [];
    return allocations[currentPaper.id] || [];
  }, [allocations, currentPaper]);

  // Concurrent papers for currentPaper
  const concurrentPapers = useMemo(() => {
    if (!currentPaper) return [];
    return papers.filter((p) => p.id !== currentPaper.id && arePapersConcurrent(p, currentPaper));
  }, [papers, currentPaper]);

  // Existing allocations for concurrent papers
  const concurrentAllocations = useMemo(() => {
    if (concurrentPapers.length === 0) return [];
    return concurrentPapers.flatMap((p) => allocations[p.id] || []);
  }, [concurrentPapers, allocations]);

  // Filter by venue if specific venue is chosen
  const filteredAllocations = useMemo(() => {
    if (selectedVenueId === 'ALL') return currentAllocations;
    return currentAllocations.filter((a) => a.venueId === selectedVenueId);
  }, [currentAllocations, selectedVenueId]);

  // Venues to render door cards for
  const doorCardVenues = useMemo(() => {
    if (!currentPaper) return [];
    const paperAllocs = allocations[currentPaper.id] || [];
    const usedVenueIds = Array.from(new Set(paperAllocs.map((a) => a.venueId)));
    const activeVenues = venues.filter((v) => usedVenueIds.includes(v.id));

    if (selectedVenueId === 'ALL') {
      return activeVenues.length > 0 ? activeVenues : venues.slice(0, 1);
    }
    return venues.filter((v) => v.id === selectedVenueId);
  }, [currentPaper, allocations, venues, selectedVenueId]);

  // Venues to render exam packing cover for (separated by venue)
  const packingCoverVenues = useMemo(() => {
    if (!currentPaper) return [];
    const paperAllocs = allocations[currentPaper.id] || [];
    const usedVenueIds = Array.from(new Set(paperAllocs.map((a) => a.venueId)));
    const activeVenues = venues.filter((v) => usedVenueIds.includes(v.id));

    if (selectedVenueId === 'ALL') {
      return activeVenues;
    }
    return venues.filter((v) => v.id === selectedVenueId);
  }, [currentPaper, allocations, venues, selectedVenueId]);

  // Enriched items for desk slips & invigilator attendance
  const reportItems = useMemo(() => {
    return filteredAllocations
      .map((alloc) => {
        const candidate = candidates.find((c) => c.id === alloc.candidateId);
        const venue = venues.find((v) => v.id === alloc.venueId);
        if (!candidate || !venue) return null;
        return {
          allocation: alloc,
          candidate,
          venue,
          paper: currentPaper!,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.candidate.indexNumber.localeCompare(b!.candidate.indexNumber, undefined, { numeric: true }));
  }, [filteredAllocations, candidates, venues, currentPaper]);

  // Distinct classes for Entry Proof filtering (filtered by Level if selected)
  const distinctClasses = useMemo(() => {
    let candList = candidates;
    if (reportLevelFilter !== 'ALL') {
      candList = candidates.filter((c) => {
        const lvl = c.academicLevel ? getCanonicalLevelName(c.academicLevel) : undefined;
        if (lvl) return lvl === reportLevelFilter;
        if (c.classGroup) {
          const num = extractLevelNumber(c.classGroup);
          return num !== undefined && `Secondary ${num}` === reportLevelFilter;
        }
        return false;
      });
    }
    const classes = Array.from(
      new Set(candList.map((c) => c.classGroup).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return classes;
  }, [candidates, reportLevelFilter]);

  // Enriched entry proofs for each student
  const entryProofStudents = useMemo(() => {
    let filtered = [...candidates];

    if (reportLevelFilter !== 'ALL') {
      filtered = filtered.filter((c) => {
        const lvl = c.academicLevel ? getCanonicalLevelName(c.academicLevel) : undefined;
        if (lvl) return lvl === reportLevelFilter;
        if (c.classGroup) {
          const num = extractLevelNumber(c.classGroup);
          return num !== undefined && `Secondary ${num}` === reportLevelFilter;
        }
        return false;
      });
    }

    if (entryProofClass !== 'ALL') {
      filtered = filtered.filter((c) => c.classGroup === entryProofClass);
    }

    if (entryProofSearch.trim()) {
      const q = entryProofSearch.toLowerCase().trim();
      filtered = filtered.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.indexNumber.includes(q) ||
          (c.classGroup && c.classGroup.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => {
      if (a.classGroup && b.classGroup && a.classGroup !== b.classGroup) {
        return a.classGroup.localeCompare(b.classGroup, undefined, { numeric: true, sensitivity: 'base' });
      }
      return a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true });
    });

    return filtered.map((candidate) => {
      const enrolledSet = new Set(candidate.subjectCodes);
      const candLevelNum = extractLevelNumber(candidate.academicLevel) ?? extractLevelNumber(candidate.classGroup);

      const studentPapers = papers.filter((paper) => {
        const paperLevelNum = extractLevelNumber(paper.level) ?? extractLevelNumber(paper.title);
        if (candLevelNum !== undefined && paperLevelNum !== undefined && candLevelNum !== paperLevelNum) {
          return false;
        }

        if (enrolledSet.has(paper.code)) return true;
        if (paper.baseSubjectCode && enrolledSet.has(paper.baseSubjectCode)) return true;
        if (paper.code.startsWith('MTL - ')) {
          const stream = paper.stream || 'G3';
          if (
            enrolledSet.has(`CL - ${stream}`) ||
            enrolledSet.has(`ML - ${stream}`) ||
            enrolledSet.has(`TL - ${stream}`)
          ) {
            return true;
          }
        }
        return allocations[paper.id]?.some((a) => a.candidateId === candidate.id);
      });

      studentPapers.sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.startTime.localeCompare(b.startTime);
      });

      const entries = studentPapers.map((paper) => {
        const alloc = allocations[paper.id]?.find((a) => a.candidateId === candidate.id);
        const venue = alloc ? venues.find((v) => v.id === alloc.venueId) : null;

        const [h, m] = paper.startTime.split(':').map(Number);
        const totalEnd = (h || 0) * 60 + (m || 0) + (paper.durationMins || 60);
        const endH = String(Math.floor(totalEnd / 60) % 24).padStart(2, '0');
        const endM = String(totalEnd % 60).padStart(2, '0');
        const endTime = `${endH}:${endM}`;

        return {
          paper,
          date: paper.date,
          startTime: paper.startTime,
          endTime,
          durationMins: paper.durationMins,
          venueName: venue ? venue.name : alloc ? 'Assigned' : 'Unallocated',
          seatLabel: alloc ? alloc.seatLabel : '—',
          shiftIndex: alloc?.shiftIndex,
          isAllocated: Boolean(alloc),
        };
      });

      return {
        candidate,
        entries,
      };
    });
  }, [candidates, papers, allocations, venues, entryProofClass, entryProofSearch, reportLevelFilter]);

  const handlePrint = () => {
    window.print();
  };



  // Export Excel / CSV depending on the active report
  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new();

    if (reportType === 'ROOM_USE_OVERVIEW') {
      const headers = [
        'Exam Room',
        'Capacity',
        'PC Stations',
        ...timelineSlots.map((s) => `${s.timeStr} – ${minutesToTime(s.endMin)}`),
        'Total Day Candidature',
      ];
      const rows: any[] = [];

      venues.forEach((v) => {
        const vData = venueTimelineData.get(v.id);
        const venueDayTotal = vData?.totalCandidature || 0;
        const capacity = v.seatGrid ? v.seatGrid.flat().filter((s) => s.isActive).length : v.rows * v.cols;

        const slotCells = timelineSlots.map((slot) => {
          const activeInSlot = (vData?.bookings || []).filter(
            (b) => b.startMin < slot.endMin && b.endMin > slot.startMin
          );
          if (activeInSlot.length === 0) return '—';
          return activeInSlot.map((b) => `${b.paper.code} (${b.candidature} cands)`).join(' + ');
        });

        rows.push([v.name, capacity, v.hasComputers ? v.computerStations || 'Yes' : 'No', ...slotCells, venueDayTotal]);
      });

      // Bottom load totals per 5-min slot
      const bottomTotals = timelineSlots.map((slot) => {
        let activeCandsInSlot = 0;
        venues.forEach((v) => {
          const vData = venueTimelineData.get(v.id);
          (vData?.bookings || []).forEach((b) => {
            if (b.startMin < slot.endMin && b.endMin > slot.startMin) {
              activeCandsInSlot += b.candidature;
            }
          });
        });
        return activeCandsInSlot;
      });

      const dayGrandTotal = Array.from(venueTimelineData.values()).reduce((sum, vd) => sum + vd.totalCandidature, 0);
      rows.push(['Total Active Candidature (Concurrent Load)', '', '', ...bottomTotals, dayGrandTotal]);

      // Sheet 1: 5-Min Matrix
      const matrixSheet = XLSX.utils.aoa_to_sheet([
        [`Daily Examination Room Utilization Schedule (5-Min Granularity) — ${dateInfo.fullHeader}`],
        headers,
        ...rows,
      ]);

      // Sheet 2: Room Bookings Register
      const registerHeaders = [
        'Exam Room',
        'Capacity',
        'Paper Code',
        'Paper Title',
        'Level',
        'Stream',
        'Start Time',
        'End Time',
        'Duration (Mins)',
        'Candidature',
        'Requires Computer',
      ];
      const registerRows: any[] = [];
      venues.forEach((v) => {
        const vData = venueTimelineData.get(v.id);
        const capacity = v.seatGrid ? v.seatGrid.flat().filter((s) => s.isActive).length : v.rows * v.cols;
        (vData?.bookings || []).forEach((b) => {
          registerRows.push([
            v.name,
            capacity,
            b.paper.code,
            b.paper.title,
            b.paper.level || '',
            b.paper.stream || '',
            b.startTime,
            b.endTime,
            b.durationMins,
            b.candidature,
            b.paper.requiresComputer ? 'Yes' : 'No',
          ]);
        });
      });

      const registerSheet = XLSX.utils.aoa_to_sheet([
        [`Room Bookings Register — ${dateInfo.fullHeader}`],
        registerHeaders,
        ...registerRows,
      ]);

      XLSX.utils.book_append_sheet(workbook, matrixSheet, '5Min_Utilization_Schedule');
      XLSX.utils.book_append_sheet(workbook, registerSheet, 'Room_Bookings_Detail');
      XLSX.writeFile(workbook, `Plexo_RoomUtilization_5Min_${activeDate}.xlsx`);
      return;
    }

    if (reportType === 'DOOR_CARD') {
      const data: any[] = [];
      doorCardVenues.forEach((v) => {
        const vAllocs = (allocations[currentPaper?.id || ''] || []).filter((a) => a.venueId === v.id);
        vAllocs.forEach((a) => {
          const cand = candidates.find((c) => c.id === a.candidateId);
          data.push({
            'Paper Code': currentPaper?.code,
            'Paper Level': currentPaper?.level || '',
            'Exam Date': currentPaper?.date,
            'Venue': v.name,
            'Desk Label': a.seatLabel,
            'Candidate Index (No Names)': cand?.indexNumber || a.candidateId,
            'Shift': a.shiftIndex,
          });
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'DoorCardRegister');
      XLSX.writeFile(workbook, `Plexo_DoorCards_${currentPaper?.code.replace('/', '_')}.xlsx`);
      return;
    }

    if (reportType === 'ENTRY_PROOF') {
      const data: any[] = [];
      entryProofStudents.forEach((student) => {
        student.entries.forEach((entry) => {
          data.push({
            'Candidate Name': student.candidate.fullName,
            'Class': student.candidate.classGroup || '',
            'Reg No / Index': student.candidate.indexNumber,
            'Academic Level': student.candidate.academicLevel || '',
            'Form Teacher': student.candidate.formTeacher || '',
            'Exam Date': entry.date,
            'Start Time': entry.startTime,
            'End Time': entry.endTime,
            'Duration (Mins)': entry.durationMins,
            'Paper Code': entry.paper.code,
            'Paper Title': entry.paper.title,
            'Paper Level': entry.paper.level || '',
            'Venue': entry.venueName,
            'Seat Number': entry.seatLabel,
            'Shift': entry.shiftIndex && entry.shiftIndex > 1 ? `Shift ${entry.shiftIndex}` : 'Standard',
            'Allocation Status': entry.isAllocated ? 'Allocated' : 'Pending Allocation',
            'Access Arrangements': (() => {
              const arr = getCandidatePaperArrangement(student.candidate, entry.paper.code);
              return arr && ((arr.extraTimePct ?? 0) > 0 || arr.needsSeparateRoom || arr.frontSeatMobility || arr.remarks)
                ? `Extra Time: +${arr.extraTimePct || 0}%${arr.needsSeparateRoom ? ', Sep Room' : ''}${arr.frontSeatMobility ? ', Front Row' : ''}${arr.remarks ? ` (${arr.remarks})` : ''}`
                : 'None';
            })(),
          });
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'EntryProofs');
      XLSX.writeFile(
        workbook,
        `Plexo_Entry_Proofs_${entryProofClass === 'ALL' ? 'All_Classes' : entryProofClass.replace(/\s+/g, '_')}.xlsx`
      );
      return;
    }

    if (reportType === 'PACKING_COVER') {
      const summaryHeaders = [
        'Venue Name',
        'Paper Code',
        'Paper Title',
        'Level',
        'Stream',
        'Exam Date',
        'Day',
        'Start Time',
        'End Time',
        'Duration (Mins)',
        'Reporting Time',
        'Venue Capacity',
        'Total Candidates Seated',
        'Classes Seated',
        'Candidate Index Range',
        'AA Candidates Count',
      ];
      const summaryRows: any[] = [];
      const rosterRows: any[] = [];

      packingCoverVenues.forEach((v) => {
        const vAllocs = (allocations[currentPaper?.id || ''] || []).filter((a) => a.venueId === v.id);
        const vCands = vAllocs.map((a) => {
          const cand = candidates.find((c) => c.id === a.candidateId);
          const arr = cand ? getCandidatePaperArrangement(cand, currentPaper?.code || '') : undefined;
          return { alloc: a, cand, arr };
        });

        const classes = Array.from(new Set(vCands.map((vc) => vc.cand?.classGroup).filter(Boolean))).join(', ');
        const indices = vCands
          .map((vc) => vc.cand?.indexNumber)
          .filter((idx): idx is string => Boolean(idx))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const indexRange = indices.length > 0 ? `${indices[0]} – ${indices[indices.length - 1]}` : 'None';
        const aaCount = vCands.filter((vc) => vc.arr && ((vc.arr.extraTimePct ?? 0) > 0 || vc.arr.needsSeparateRoom || vc.arr.frontSeatMobility || vc.arr.remarks)).length;

        const dateDetails = formatExamDate(currentPaper?.date);
        const startMin = parseTimeToMinutes(currentPaper?.startTime || '08:00');
        const dur = currentPaper?.durationMins || 60;
        const endMin = startMin + dur;

        summaryRows.push([
          v.name,
          currentPaper?.code || '',
          currentPaper?.title || '',
          currentPaper?.level || '',
          currentPaper?.stream || '',
          currentPaper?.date || '',
          dateDetails.dayOfWeek,
          currentPaper?.startTime || '',
          minutesToTime(endMin),
          dur,
          minutesToTime(Math.max(0, startMin - 30)),
          v.seatGrid ? v.seatGrid.flat().filter((s) => s.isActive).length : v.rows * v.cols,
          vAllocs.length,
          classes || 'Standard',
          indexRange,
          aaCount,
        ]);

        vCands.forEach(({ alloc, cand, arr }) => {
          rosterRows.push({
            'Venue': v.name,
            'Seat Label': alloc.seatLabel,
            'Index Number': cand?.indexNumber || alloc.candidateId,
            'Class': cand?.classGroup || '',
            'Candidate Name': cand?.fullName || '',
            'Paper Code': currentPaper?.code || '',
            'Paper Title': currentPaper?.title || '',
            'Exam Date': currentPaper?.date || '',
            'Start Time': currentPaper?.startTime || '',
            'End Time': minutesToTime(endMin),
            'Shift': alloc.shiftIndex && alloc.shiftIndex > 1 ? `Shift ${alloc.shiftIndex}` : 'Standard',
            'Access Arrangements': arr && ((arr.extraTimePct ?? 0) > 0 || arr.needsSeparateRoom || arr.frontSeatMobility || arr.remarks)
              ? `Extra Time: +${arr.extraTimePct || 0}%, Separate: ${arr.needsSeparateRoom ? 'Yes' : 'No'}, Front Row: ${arr.frontSeatMobility ? 'Yes' : 'No'}${arr.remarks ? ` (${arr.remarks})` : ''}`
              : 'None',
          });
        });
      });

      const summarySheet = XLSX.utils.aoa_to_sheet([
        [`Exam Paper Packing Summary — ${currentPaper?.code} (${currentPaper?.title})`],
        summaryHeaders,
        ...summaryRows,
      ]);
      const rosterSheet = XLSX.utils.json_to_sheet(rosterRows.length > 0 ? rosterRows : [{ 'Notice': 'No allocated candidates' }]);

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Packing_Summary');
      XLSX.utils.book_append_sheet(workbook, rosterSheet, 'Candidate_Roster');
      XLSX.writeFile(workbook, `Plexo_PackingCover_${(currentPaper?.code || 'Paper').replace(/[/\\:]/g, '_')}.xlsx`);
      return;
    }

    const data = reportItems.map((item) => ({
      'Index Number': item!.candidate.indexNumber,
      'Candidate Name': item!.candidate.fullName,
      'Academic Level': item!.candidate.academicLevel || '',
      'Paper Code': item!.paper.code,
      'Paper Level': item!.paper.level || '',
      'Paper Title': item!.paper.title,
      'Exam Date': item!.paper.date,
      'Start Time': item!.paper.startTime,
      'Venue Name': item!.venue.name,
      'Desk Label': item!.allocation.seatLabel,
      'Shift': item!.allocation.shiftIndex,
      'Access Arrangements': (() => {
        const arr = getCandidatePaperArrangement(item!.candidate, item!.paper.code);
        return arr && ((arr.extraTimePct ?? 0) > 0 || arr.needsSeparateRoom || arr.frontSeatMobility || arr.remarks)
          ? `Extra Time: +${arr.extraTimePct || 0}%, Separate: ${arr.needsSeparateRoom ? 'Yes' : 'No'}${arr.frontSeatMobility ? ', Front Row: Yes' : ''}${arr.remarks ? ` (${arr.remarks})` : ''}`
          : 'None';
      })(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'SeatingAllocation');
    XLSX.writeFile(workbook, `Plexo_Report_${currentPaper?.code.replace('/', '_')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar (Hidden during print) */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Stage 6: Examination Reports & Audit Records</h2>
            <p className="text-sm text-slate-500 mt-1">
              Generate official SEAB room schedules, anonymous door cards, desk slips, and invigilator rosters.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Document (A4)</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Report Archetype Tabs */}
        <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200 gap-1">
            <button
              onClick={() => setReportType('ROOM_USE_OVERVIEW')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                reportType === 'ROOM_USE_OVERVIEW'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>1. Room Use Overview (by Day)</span>
            </button>

            <button
              onClick={() => setReportType('DOOR_CARD')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                reportType === 'DOOR_CARD'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <DoorOpen className="w-3.5 h-3.5 text-purple-600" />
              <span>2. Door Card (Seating Layout)</span>
            </button>

            <button
              onClick={() => setReportType('DESK_SLIPS')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                reportType === 'DESK_SLIPS'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-slate-500" />
              <span>Desk Slips (8-Up)</span>
            </button>

            <button
              onClick={() => setReportType('INVIGILATOR_MATRIX')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                reportType === 'INVIGILATOR_MATRIX'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Attendance Matrix</span>
            </button>

            <button
              onClick={() => setReportType('ENTRY_PROOF')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                reportType === 'ENTRY_PROOF'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-emerald-600" />
              <span>Candidate Entry Proof</span>
            </button>

            <button
              onClick={() => setReportType('PACKING_COVER')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                reportType === 'PACKING_COVER'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PackageCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>Exam Packing Cover (2-Page)</span>
            </button>
          </div>

          {/* Conditional Filters depending on active report */}
          {reportType === 'ENTRY_PROOF' ? (
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Filter by Class
                </label>
                <select
                  value={entryProofClass}
                  onChange={(e) => setEntryProofClass(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Classes ({candidates.length} candidates)</option>
                  {distinctClasses.map((cls) => {
                    const count = candidates.filter((c) => c.classGroup === cls).length;
                    return (
                      <option key={cls} value={cls}>
                        {cls} ({count} candidates)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Search Candidate
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name, reg#, index..."
                    value={entryProofSearch}
                    onChange={(e) => setEntryProofSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none w-52"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Print Layout
                </label>
                <select
                  value={entryProofLayout}
                  onChange={(e) => setEntryProofLayout(e.target.value as '1_UP' | '2_UP')}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="1_UP">1 Student Per A4 Sheet</option>
                  <option value="2_UP">2 Students Per A4 Sheet (Paper Saver)</option>
                </select>
              </div>
            </div>
          ) : reportType === 'ROOM_USE_OVERVIEW' ? (
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Exam Day Selector
                </label>
                <select
                  value={activeDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                >
                  {distinctDates.map((dateStr) => {
                    const info = formatExamDate(dateStr);
                    const count = papers.filter((p) => p.date === dateStr).length;
                    return (
                      <option key={dateStr} value={dateStr}>
                        {info.fullHeader} ({count} papers)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Rooms Filter
                </label>
                <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setTimelineVenueFilter('ALL')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      timelineVenueFilter === 'ALL'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Rooms ({venues.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineVenueFilter('OCCUPIED')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      timelineVenueFilter === 'OCCUPIED'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Active Only ({Array.from(venueTimelineData.values()).filter((d) => d.isOccupied).length})
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  5-Min Zoom
                </label>
                <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setTimelineZoom('COMPACT')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      timelineZoom === 'COMPACT'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Compact 18px per 5-min slot"
                  >
                    Compact (18px)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineZoom('STANDARD')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      timelineZoom === 'STANDARD'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Standard 26px per 5-min slot"
                  >
                    Standard (26px)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineZoom('DETAILED')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      timelineZoom === 'DETAILED'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Detailed 36px per 5-min slot"
                  >
                    Detailed (36px)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Select Paper
                </label>
                <select
                  value={currentPaper?.id || ''}
                  onChange={(e) => setSelectedPaperId(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {reportLevelFilter === 'ALL' && distinctLevels.length > 0 ? (
                    distinctLevels.map((lvl) => {
                      const lvlPapers = papers.filter((p) => getPaperLevel(p, candidates) === lvl);
                      if (lvlPapers.length === 0) return null;
                      return (
                        <optgroup key={lvl} label={lvl}>
                          {lvlPapers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} — {p.title}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })
                  ) : (
                    displayedReportPapers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.title}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Target Venue
                </label>
                <select
                  value={selectedVenueId}
                  onChange={(e) => setSelectedVenueId(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="ALL">All Allocated Venues</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Level Switcher Bar for Reports */}
        {distinctLevels.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-700">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider">Level Filter:</span>
            </div>

            <div className="flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200 gap-1">
              <button
                type="button"
                onClick={() => setReportLevelFilter('ALL')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  reportLevelFilter === 'ALL'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Levels ({papers.length} papers)
              </button>

              {distinctLevels.map((lvl) => {
                const count = papers.filter((p) => getPaperLevel(p, candidates) === lvl).length;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setReportLevelFilter(lvl)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      reportLevelFilter === lvl
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lvl} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Report Content Container */}
      <div className="bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-sm print:p-0 print:border-none print:shadow-none">
        {/* 1. Room Use Overview (by Day) */}
        {reportType === 'ROOM_USE_OVERVIEW' && (
          <div className="space-y-6">
            {/* Report Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-bold uppercase tracking-wider">
                    Room Use Overview
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-xs font-semibold text-slate-600">
                    {dateInfo.fullHeader}
                  </span>
                </div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
                  Daily Examination Room Utilization Schedule
                </h1>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>Horizontal axis: <strong>5-minute granular timeline</strong></span>
                  <span>•</span>
                  <span>Vertical axis: <strong>Examination rooms</strong></span>
                  <span>•</span>
                  <span>Blocks: <strong>Exact duration, paper code, title & candidature count</strong></span>
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right font-mono text-xs text-slate-600">
                  <p>Day Papers: <strong>{dayPapers.length}</strong></p>
                  <p>Active Rooms: <strong>{Array.from(venueTimelineData.values()).filter((d) => d.isOccupied).length} / {venues.length}</strong></p>
                  <p>Timeline: <strong>{minutesToTime(timelineBounds.axisStartMin)} – {minutesToTime(timelineBounds.axisEndMin)} ({timelineBounds.numSlots} x 5m)</strong></p>
                </div>
                <img src={plexoLogo} alt="Plexo" className="h-10 w-auto object-contain rounded" />
              </div>
            </div>

            {/* Matrix Table with 5-Min Granular Horizontal Axis */}
            {dayPapers.length === 0 ? (
              <div className="no-print p-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No Examination Papers Scheduled on this Date</p>
                <p className="text-xs text-slate-400 mt-1">
                  Select another day using the Exam Day Selector above, or upload timetables in Stage 2.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-300 rounded-lg shadow-xs bg-white">
                <table className="w-max min-w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-800 font-bold border-b-2 border-slate-400 select-none">
                    {/* Tier 1: Hours */}
                    <tr>
                      <th
                        rowSpan={2}
                        className="px-4 py-3 border-r border-b border-slate-300 w-64 min-w-[256px] max-w-[256px] bg-slate-200/90 sticky left-0 z-20 align-bottom shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                      >
                        <div className="font-bold text-slate-900 text-xs">Exam Room / Venue</div>
                        <div className="text-[10px] text-slate-500 font-normal">Capacity & Facilities</div>
                      </th>

                      {timelineHourHeaders.map((hour, hIdx) => (
                        <th
                          key={hIdx}
                          colSpan={hour.colSpan}
                          className="py-2 border-r border-b border-slate-300 bg-slate-100/95 text-center font-black text-indigo-950 text-xs tracking-wider"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <Clock className="w-3 h-3 text-indigo-500" />
                            <span>{hour.hourLabel}</span>
                          </div>
                        </th>
                      ))}

                      <th
                        rowSpan={2}
                        className="px-3 py-3 w-28 min-w-[112px] text-center bg-slate-200/90 font-bold text-slate-900 border-l border-b border-slate-300 sticky right-0 z-20 align-bottom shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                      >
                        <div>Daily Total</div>
                        <div className="text-[10px] text-slate-500 font-normal">Candidature</div>
                      </th>
                    </tr>

                    {/* Tier 2: 5-Minute Slots */}
                    <tr>
                      {timelineSlots.map((slot) => {
                        const isHourMark = slot.isHour;
                        const isHalfHourMark = slot.isHalfHour;
                        const borderClass =
                          slot.endMin % 60 === 0
                            ? 'border-r-2 border-slate-400'
                            : slot.endMin % 30 === 0
                            ? 'border-r border-slate-300'
                            : 'border-r border-slate-200/50';
                        const bgClass = Math.floor(slot.startMin / 60) % 2 === 0 ? 'bg-slate-100' : 'bg-slate-50/80';

                        return (
                          <th
                            key={slot.index}
                            style={{ width: slotWidth, minWidth: slotWidth, maxWidth: slotWidth }}
                            className={`py-1 text-center font-mono text-[9px] font-medium leading-none ${borderClass} ${bgClass} ${
                              isHourMark || isHalfHourMark ? 'text-indigo-900 font-bold' : 'text-slate-500'
                            }`}
                            title={`${slot.timeStr} – ${minutesToTime(slot.endMin)} (5 mins)`}
                          >
                            {slot.minuteStr}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 bg-white">
                    {displayedTimelineVenues.map((v) => {
                      const vData = venueTimelineData.get(v.id);
                      const capacity = v.seatGrid ? v.seatGrid.flat().filter((s) => s.isActive).length : v.rows * v.cols;
                      const totalLanes = vData?.totalLanes || 1;
                      const rowHeight = Math.max(56, totalLanes * 46 + 10);

                      return (
                        <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Sticky Left: Room Info */}
                          <td className="px-4 py-2 border-r border-slate-300 font-semibold text-slate-900 bg-slate-50/95 sticky left-0 z-10 w-64 min-w-[256px] max-w-[256px] align-middle shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span className="font-bold text-xs truncate" title={v.name}>{v.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal pl-5 flex items-center gap-1.5 mt-0.5">
                              <span>Cap: {capacity}</span>
                              {v.hasComputers && (
                                <span className="text-cyan-700 bg-cyan-50 px-1 py-0.2 rounded border border-cyan-200 font-medium">
                                  PC ({v.computerStations || capacity})
                                </span>
                              )}
                              {v.isLab && (
                                <span className="text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 font-medium">
                                  Lab
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Middle: Relative Timeline Track */}
                          <td
                            colSpan={timelineBounds.numSlots}
                            className="p-0 relative align-top border-b border-slate-200"
                            style={{ height: `${rowHeight}px` }}
                          >
                            {/* Background Guideline Grid */}
                            <div className="absolute inset-0 flex pointer-events-none">
                              {timelineSlots.map((slot) => {
                                const isEvenHour = Math.floor(slot.startMin / 60) % 2 === 0;
                                const borderClass =
                                  slot.endMin % 60 === 0
                                    ? 'border-r-2 border-slate-300'
                                    : slot.endMin % 30 === 0
                                    ? 'border-r border-slate-200'
                                    : 'border-r border-slate-100';
                                const bgClass = isEvenHour ? 'bg-slate-50/30' : 'bg-white';
                                return (
                                  <div
                                    key={slot.index}
                                    style={{ width: slotWidth, minWidth: slotWidth, maxWidth: slotWidth }}
                                    className={`h-full ${borderClass} ${bgClass}`}
                                  />
                                );
                              })}
                            </div>

                            {/* Paper Booking Blocks */}
                            {vData?.bookings.map((b, bIdx) => {
                              const leftPx = b.startSlot * slotWidth + 2;
                              const widthPx = Math.max(slotWidth - 4, b.slotSpan * slotWidth - 4);
                              const topPx = b.lane * 46 + 5;
                              const isComputer = b.paper.requiresComputer;
                              const isScience = b.paper.type === 'SCIENCE_LAB';
                              const isListening = b.paper.type === 'LISTENING_COMP';

                              const cardStyle = isComputer
                                ? 'bg-cyan-50/95 border-cyan-300 text-cyan-950 hover:bg-cyan-100 hover:border-cyan-400 shadow-xs'
                                : isScience
                                ? 'bg-amber-50/95 border-amber-300 text-amber-950 hover:bg-amber-100 hover:border-amber-400 shadow-xs'
                                : isListening
                                ? 'bg-purple-50/95 border-purple-300 text-purple-950 hover:bg-purple-100 hover:border-purple-400 shadow-xs'
                                : 'bg-indigo-50/95 border-indigo-300 text-indigo-950 hover:bg-indigo-100 hover:border-indigo-400 shadow-xs';

                              const pillStyle = isComputer
                                ? 'bg-cyan-600'
                                : isScience
                                ? 'bg-amber-600'
                                : isListening
                                ? 'bg-purple-600'
                                : 'bg-indigo-600';

                              return (
                                <div
                                  key={bIdx}
                                  style={{
                                    position: 'absolute',
                                    left: `${leftPx}px`,
                                    width: `${widthPx}px`,
                                    top: `${topPx}px`,
                                    height: '40px',
                                  }}
                                  className={`rounded-md border px-2 py-1 flex flex-col justify-between overflow-hidden cursor-default transition-all z-10 select-none ${cardStyle}`}
                                  title={`${b.paper.code} — ${b.paper.title}\nTiming: ${b.startTime} – ${b.endTime} (${b.durationMins} mins)\nRoom: ${v.name}\nCandidates: ${b.candidature}${isComputer ? '\nRequires Computer' : ''}`}
                                >
                                  <div className="flex items-center justify-between gap-1 text-[11px] leading-tight font-mono font-bold">
                                    <span className="truncate">{b.paper.code}</span>
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] text-white font-bold shrink-0 ${pillStyle}`}>
                                      {b.candidature} {b.candidature === 1 ? 'cand' : 'cands'}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1 text-[10px] text-slate-600 leading-tight">
                                    <span className="truncate font-sans font-medium" title={b.paper.title}>
                                      {b.paper.title}
                                    </span>
                                    <span className="font-mono text-[9px] text-slate-500 shrink-0 font-semibold">
                                      {b.startTime}–{b.endTime}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </td>

                          {/* Sticky Right: Daily Room Total */}
                          <td className="px-3 py-3 text-center font-bold font-mono text-xs bg-slate-50/95 sticky right-0 z-10 w-28 min-w-[112px] border-l border-slate-300 align-middle shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                            {(vData?.totalCandidature || 0) > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-white text-xs font-bold">
                                {vData?.totalCandidature}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Foot: Concurrent Load & Grand Total */}
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-800 select-none">
                    <tr>
                      <td className="px-4 py-2.5 border-r border-slate-300 text-xs font-bold text-slate-700 sticky left-0 z-20 bg-slate-100 w-64 min-w-[256px] max-w-[256px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                        <div className="uppercase text-[10px] tracking-wider text-slate-500">Timeline Load</div>
                        <div>Active Candidates (5-Min)</div>
                      </td>

                      <td colSpan={timelineBounds.numSlots} className="p-0 relative h-10 border-r border-slate-300 bg-slate-100">
                        <div className="flex h-full">
                          {timelineSlots.map((slot, sIdx) => {
                            const load = slotConcurrentLoad[sIdx] || 0;
                            const borderClass =
                              slot.endMin % 60 === 0
                                ? 'border-r-2 border-slate-300'
                                : slot.endMin % 30 === 0
                                ? 'border-r border-slate-200'
                                : 'border-r border-slate-200/50';
                            return (
                              <div
                                key={slot.index}
                                style={{ width: slotWidth, minWidth: slotWidth, maxWidth: slotWidth }}
                                className={`h-full flex items-center justify-center font-mono text-[9px] font-bold ${borderClass} ${
                                  load > 0 ? 'bg-indigo-50/80 text-indigo-900 font-black' : 'text-slate-300'
                                }`}
                                title={`${slot.timeStr} – ${minutesToTime(slot.endMin)}: ${load} active candidates taking exams`}
                              >
                                {load > 0 ? load : ''}
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td className="px-3 py-2.5 text-center font-mono font-black text-slate-900 text-sm bg-slate-200 sticky right-0 z-20 w-28 min-w-[112px] border-l border-slate-300 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                        {Array.from(venueTimelineData.values()).reduce((sum, vd) => sum + vd.totalCandidature, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 2. Door Card (Seating Layout matching Seat & Swap visualizer, Candidate Number ONLY, No Names) */}
        {reportType === 'DOOR_CARD' && (
          <div className="space-y-12">
            {!currentPaper || currentAllocations.length === 0 ? (
              <div className="no-print p-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                <DoorOpen className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No Seating Allocated for this Paper</p>
                <p className="text-xs text-slate-400 mt-1">
                  Please generate allocations in Stage 4 (Seat & Swap) before printing Door Cards.
                </p>
              </div>
            ) : (
              doorCardVenues.map((v, vIdx) => {
                const venueAllocs = currentAllocations.filter((a) => a.venueId === v.id);
                const concurrentInRoom = concurrentAllocations.filter((a) => a.venueId === v.id);
                const concurrentPapersInRoom = Array.from(
                  new Set(
                    concurrentInRoom
                      .map((a) => papers.find((p) => p.id === a.paperId))
                      .filter((p): p is ExamPaper => Boolean(p))
                  )
                );
                const hasCombinedPapers = concurrentPapersInRoom.length > 0;
                const dateDetails = formatExamDate(currentPaper.date);

                return (
                  <div
                    key={v.id}
                    className={`${vIdx > 0 ? 'page-break-before-always pt-8 print:pt-0' : ''} space-y-4`}
                  >
                    {/* Header: Day, Paper, Date, Venue */}
                    <div className="border-b-2 border-slate-900 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-slate-900 text-white font-mono font-bold text-xs rounded uppercase tracking-wider">
                            SEAB Examination Door Notice Card
                          </span>
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            {dateDetails.dayOfWeek}
                          </span>
                          {currentPaper.level && (
                            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {currentPaper.level}
                            </span>
                          )}
                          {hasCombinedPapers && (
                            <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              Combined Venue (+{concurrentPapersInRoom.map((p) => p.code).join(', ')})
                            </span>
                          )}
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 mt-1">
                          {currentPaper.code} — {currentPaper.title}
                        </h2>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1 font-medium">
                          <span>Day: <strong>{dateDetails.dayOfWeek}</strong></span>
                          <span>•</span>
                          <span>Date: <strong>{currentPaper.date}</strong></span>
                          <span>•</span>
                          <span>Start Time: <strong>{currentPaper.startTime}</strong></span>
                          <span>•</span>
                          <span>Venue: <strong className="text-indigo-900 text-sm font-black">{v.name}</strong></span>
                          <span>•</span>
                          <span>
                            Candidature: <strong>{venueAllocs.length + concurrentInRoom.length} candidates</strong>
                            {hasCombinedPapers && ` (${venueAllocs.length} for ${currentPaper.code}, ${concurrentInRoom.length} for ${concurrentPapersInRoom.map((p) => p.code).join('/')})`}
                          </span>
                        </div>
                      </div>
                      <img src={plexoLogo} alt="Plexo" className="h-10 w-auto object-contain rounded" />
                    </div>

                    {/* Box on top of the page saying TEACHER'S BENCH */}
                    <div className="w-full py-2.5 px-4 bg-slate-100 border-2 border-slate-800 rounded-lg text-center shadow-xs">
                      <span className="font-extrabold uppercase tracking-widest text-xs md:text-sm text-slate-900">
                        ▲ TEACHER'S BENCH (FRONT OF EXAMINATION ROOM) ▲
                      </span>
                    </div>

                    {/* Seating Layout matching Seat & Swap Interface (strictly NO candidate names) */}
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 print:bg-white print:border-none print:p-0 overflow-x-auto">
                      <div
                        className="grid gap-2.5 mx-auto justify-center"
                        style={{
                          gridTemplateColumns: `repeat(${v.cols}, minmax(110px, 1fr))`,
                          maxWidth: `${v.cols * 150}px`,
                        }}
                      >
                        {v.seatGrid.map((rowArr, r) =>
                          rowArr.map((seat, c) => {
                            const alloc = currentAllocations.find(
                              (a) => a.venueId === v.id && a.row === r && a.col === c
                            );
                            const candidate = alloc
                              ? candidates.find((cand) => cand.id === alloc.candidateId)
                              : null;

                            const concurrentAlloc = !alloc
                              ? concurrentInRoom.find((a) => a.row === r && a.col === c)
                              : null;
                            const concurrentCand = concurrentAlloc
                              ? candidates.find((cand) => cand.id === concurrentAlloc.candidateId)
                              : null;
                            const concurrentPaper = concurrentAlloc
                              ? papers.find((p) => p.id === concurrentAlloc.paperId)
                              : null;

                            if (!seat.isActive) {
                              return (
                                <div
                                  key={`${r}-${c}`}
                                  className="h-24 rounded-lg border border-dashed border-slate-300 bg-slate-100/70 flex flex-col items-center justify-center p-2 text-slate-300 select-none"
                                >
                                  <Ban className="w-4 h-4 text-slate-300" />
                                  <span className="text-[10px] font-mono mt-1">Aisle / Pillar</span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={`${r}-${c}`}
                                className={`h-24 rounded-lg border p-2 flex flex-col justify-between select-none ${
                                  candidate
                                    ? 'bg-white border-slate-400 shadow-xs'
                                    : concurrentAlloc
                                    ? 'bg-purple-50/70 border-purple-300 shadow-xs'
                                    : 'bg-slate-50 border-dashed border-slate-300'
                                }`}
                              >
                                {/* Desk Label & PC Indicator */}
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                                  <span className="font-mono font-bold text-xs text-slate-600">
                                    {seat.seatLabel}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {seat.hasComputer && (
                                      <span title="Computer Workstation">
                                        <Monitor className="w-3.5 h-3.5 text-sky-600" />
                                      </span>
                                    )}
                                    {concurrentAlloc && (
                                      <span className="text-[8px] font-bold text-purple-700 bg-purple-100 px-1 rounded font-mono">
                                        {concurrentPaper?.code}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Candidate Number / Class Identifier */}
                                {candidate ? (
                                  <div className="flex flex-col items-center justify-center my-auto">
                                    <div className="flex flex-col items-center">
                                      {candidate.classGroup && (
                                        <span className="text-[10px] font-bold text-slate-700 bg-slate-200/90 px-1.5 py-0.2 rounded mb-0.5">
                                          {candidate.classGroup}
                                        </span>
                                      )}
                                      <span className="font-mono font-black text-base text-slate-950 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 tracking-wider">
                                        {candidate.classGroup ? `#${candidate.indexNumber}` : candidate.indexNumber}
                                      </span>
                                    </div>
                                    {alloc?.shiftIndex && alloc.shiftIndex > 1 && (
                                      <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded mt-0.5">
                                        Shift {alloc.shiftIndex}
                                      </span>
                                    )}
                                  </div>
                                ) : concurrentAlloc ? (
                                  <div className="flex flex-col items-center justify-center my-auto">
                                    <span className="font-mono font-black text-base text-purple-950 bg-purple-100 px-2 py-0.5 rounded border border-purple-300 tracking-wider">
                                      {concurrentCand?.classGroup
                                        ? `${concurrentCand.classGroup} #${concurrentCand.indexNumber}`
                                        : concurrentCand?.indexNumber || concurrentAlloc.candidateId}
                                    </span>
                                    <span className="text-[9px] font-bold text-purple-700 mt-0.5">
                                      {concurrentPaper?.code}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-center py-2 text-[11px] text-slate-400 italic">
                                    Empty Desk
                                  </div>
                                )}

                                {/* Bottom Subtle Arrangement Indicator (No names) */}
                                <div className="text-[10px] text-center text-slate-500 border-t border-slate-100 pt-0.5">
                                  {concurrentAlloc ? (
                                    <span className="text-purple-700 font-bold font-mono text-[9px]">
                                      {concurrentPaper?.code}
                                    </span>
                                  ) : (() => {
                                    if (!candidate) return <span className="opacity-0">—</span>;
                                    const arr = getCandidatePaperArrangement(candidate, currentPaper?.code);
                                    if (arr && ((arr.extraTimePct ?? 0) > 0 || arr.frontSeatMobility || arr.needsSeparateRoom)) {
                                      return (
                                        <span className="font-bold text-indigo-700">
                                          {arr.extraTimePct ? `+${arr.extraTimePct}% AA` : 'Special Seat'}
                                        </span>
                                      );
                                    }
                                    return <span className="text-slate-300 font-mono text-[9px]">Standard</span>;
                                  })()}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Door Card Notice Footer */}
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Notice for Candidates: Confirm your 4-digit Index Number and proceed directly to your assigned seat.</span>
                      <span className="font-mono">Plexo Seating System</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 3. Desk Slips Template (8-Up Grid on A4) */}
        {reportType === 'DESK_SLIPS' && (
          <div className="space-y-6">
            {reportItems.length === 0 ? (
              <div className="no-print p-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No Allocation Data to Print</p>
                <p className="text-xs text-slate-400 mt-1">
                  Please run the allocation solver in Stage 4 first before generating desk slips.
                </p>
              </div>
            ) : (
              <>
                <div className="no-print pb-3 border-b border-slate-200 text-xs text-slate-500 font-medium">
                  Showing <strong>{reportItems.length}</strong> candidate desk slips (standard 8-up or 10-up layout).
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-4">
                  {reportItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="border-2 border-dashed border-slate-400 p-4 rounded-lg bg-white page-break-inside-avoid flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-300 pb-2 mb-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                            {scope === 'internal' ? 'School Examination Desk Slip' : 'SEAB Examination Desk Slip'}
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                            {item!.venue.name}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-2 mt-2">
                          {item!.candidate.classGroup ? (
                            <div>
                              <p className="text-[11px] text-slate-500">Class & Reg No</p>
                              <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {item!.candidate.classGroup}
                                </span>
                                <span className="font-mono font-black text-2xl text-slate-900 leading-tight">
                                  #{item!.candidate.indexNumber}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p className="text-[11px] text-slate-500">Index Number</p>
                              <p className="font-mono font-black text-2xl text-slate-900 leading-tight">
                                {item!.candidate.indexNumber}
                              </p>
                            </div>
                          )}
                          <div className="text-right">
                            <p className="text-[11px] text-slate-500">Seat Label</p>
                            <p className="font-mono font-black text-2xl text-indigo-700 leading-tight">
                              {item!.allocation.seatLabel}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3">
                          <p className="text-[11px] text-slate-500">Candidate Full Name</p>
                          <p className="font-bold text-slate-900 text-sm">{item!.candidate.fullName}</p>
                        </div>

                        {/* Paper-specific AA badge */}
                        {(() => {
                          const arr = getCandidatePaperArrangement(item!.candidate, item!.paper.code);
                          if (!arr || (!((arr.extraTimePct ?? 0) > 0) && !arr.needsSeparateRoom && !arr.frontSeatMobility && !arr.remarks)) {
                            return null;
                          }
                          return (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(arr.extraTimePct ?? 0) > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded">
                                  +{arr.extraTimePct}% EXTRA TIME
                                </span>
                              )}
                              {arr.needsSeparateRoom && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-rose-100 text-rose-900 border border-rose-300 rounded">
                                  SEPARATE ROOM
                                </span>
                              )}
                              {arr.frontSeatMobility && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-sky-100 text-sky-900 border border-sky-300 rounded">
                                  FRONT ROW / AUDIO
                                </span>
                              )}
                              {arr.remarks && (
                                <span className="text-[10px] italic text-slate-600 block w-full mt-0.5">
                                  Note: {arr.remarks}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="mt-4 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                        <span>{item!.paper.code} - {item!.paper.title}</span>
                        <span className="font-mono">{item!.paper.date} ({item!.paper.startTime})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 4. Invigilator Attendance & Script Tally Matrix */}
        {reportType === 'INVIGILATOR_MATRIX' && (
          <div className="space-y-6">
            {reportItems.length === 0 ? (
              <div className="no-print p-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No Allocation Data to Print</p>
                <p className="text-xs text-slate-400 mt-1">
                  Please run the allocation solver in Stage 4 first before generating invigilator rosters.
                </p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="border-b-2 border-slate-800 pb-4 flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-wide">
                      Invigilator Attendance & Script Verification Matrix
                    </h1>
                    <p className="text-xs text-slate-600 mt-1">
                      Paper: <strong>{currentPaper?.code} — {currentPaper?.title}</strong>
                      {currentPaper?.level && <span className="ml-1 text-blue-700 font-semibold">({currentPaper.level})</span>}
                      {' '}• Date: <strong>{currentPaper?.date}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right font-mono text-xs text-slate-700">
                      <p>Total Seated: <strong>{reportItems.length}</strong></p>
                      <p>Reporting: <strong>{currentPaper ? currentPaper.startTime : ''}</strong></p>
                    </div>
                    <img src={plexoLogo} alt="Plexo" className="h-10 w-auto object-contain rounded" />
                  </div>
                </div>

                {/* Attendance Table with Verification Checkboxes */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-300">
                    <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                      <tr>
                        <th className="px-3 py-2 border-r border-slate-300 w-16 text-center">Seat</th>
                        <th className="px-3 py-2 border-r border-slate-300 w-24">
                          {scope === 'internal' ? 'Class & Reg#' : 'Index'}
                        </th>
                        <th className="px-3 py-2 border-r border-slate-300">Candidate Name</th>
                        <th className="px-3 py-2 border-r border-slate-300 w-28">Venue</th>
                        <th className="px-3 py-2 border-r border-slate-300 w-20 text-center">Absent [ ]</th>
                        <th className="px-3 py-2 border-r border-slate-300 w-24 text-center">Script Collected</th>
                        <th className="px-3 py-2 w-32">Candidate Signature</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {reportItems.map((item, idx) => (
                        <tr key={idx} className="page-break-inside-avoid">
                          <td className="px-3 py-2.5 font-mono font-bold text-center text-slate-900 border-r border-slate-200 text-sm">
                            {item!.allocation.seatLabel}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-black text-slate-900 border-r border-slate-200">
                            {item!.candidate.classGroup
                              ? `${item!.candidate.classGroup} #${item!.candidate.indexNumber}`
                              : item!.candidate.indexNumber}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-slate-800 border-r border-slate-200">
                            {item!.candidate.fullName}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 border-r border-slate-200">
                            {item!.venue.name}
                          </td>
                          <td className="px-3 py-2.5 text-center border-r border-slate-200">
                            <span className="inline-block w-4 h-4 border border-slate-400 rounded-xs"></span>
                          </td>
                          <td className="px-3 py-2.5 text-center border-r border-slate-200">
                            <span className="inline-block w-4 h-4 border border-slate-400 rounded-xs"></span>
                          </td>
                          <td className="px-3 py-2.5 border-b border-dashed border-slate-300">
                            {/* Signature line placeholder */}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Invigilator Tally Summary Footer */}
                <div className="pt-4 border-t-2 border-slate-300 grid grid-cols-3 gap-4 text-xs font-semibold page-break-inside-avoid">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                    <p className="text-slate-500 uppercase text-[10px]">Total Scripts Distributed</p>
                    <p className="text-base font-bold text-slate-800 mt-1">______</p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                    <p className="text-slate-500 uppercase text-[10px]">Total Scripts Collected</p>
                    <p className="text-base font-bold text-slate-800 mt-1">______</p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                    <p className="text-slate-500 uppercase text-[10px]">Chief Invigilator Signature</p>
                    <p className="text-base font-bold text-slate-800 mt-1">__________________</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 5. Candidate Entry Proof & Timetable Slips */}
        {reportType === 'ENTRY_PROOF' && (
          <div className="space-y-6">
            {entryProofStudents.length === 0 ? (
              <div className="no-print p-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                <Award className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No Candidates Found</p>
                <p className="text-xs text-slate-400 mt-1">
                  {candidates.length === 0
                    ? 'Upload candidates in Stage 1 to generate official Entry Proofs.'
                    : 'No candidates match your current class filter or search query.'}
                </p>
              </div>
            ) : (
              <>
                {/* Print count banner (hidden in print) */}
                <div className="no-print p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between text-xs text-indigo-900">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    <span>
                      Ready to print <strong>{entryProofStudents.length}</strong> Student Entry Proof(s) in{' '}
                      <strong>{entryProofLayout === '1_UP' ? '1 Per Page' : '2 Per Page (Paper Saver)'}</strong> format.
                    </span>
                  </div>
                  <button
                    onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print All Entry Proofs</span>
                  </button>
                </div>

                {/* Entry Proof Cards list */}
                <div className="space-y-6">
                  {entryProofStudents.map((student, studentIdx) => {
                    const candidate = student.candidate;
                    const defaultAA = candidate.arrangements;
                    const isEven = studentIdx % 2 === 1;

                    return (
                      <div
                        key={candidate.id}
                        className={`bg-white border-2 border-slate-800 rounded-xl p-6 print:p-5 print:rounded-none shadow-xs text-slate-900 ${
                          entryProofLayout === '1_UP'
                            ? 'page-break-after'
                            : isEven
                            ? 'page-break-after'
                            : ''
                        }`}
                      >
                        {/* Header: School & Title */}
                        <div className="border-b-2 border-slate-800 pb-3 flex items-start justify-between gap-4">
                          <div>
                            <h2 className="text-base font-black uppercase tracking-wider text-slate-900">
                              {candidate.schoolName || (scope === 'internal' ? 'CANBERRA SECONDARY SCHOOL' : 'SINGAPORE EXAMINATIONS AND ASSESSMENT BOARD')}
                            </h2>
                            <p className="text-xs font-bold text-indigo-800 uppercase tracking-wide mt-0.5">
                              {scope === 'internal' ? '2026 End-of-Year Examination' : 'National Examination'} • Student Entry Proof & Timetable
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="no-print font-mono text-xs text-slate-500 font-semibold bg-slate-100 px-2 py-1 rounded">
                              #{studentIdx + 1} of {entryProofStudents.length}
                            </span>
                            <img src={plexoLogo} alt="Plexo" className="h-9 w-auto object-contain rounded" />
                          </div>
                        </div>

                        {/* Student Particulars Banner */}
                        <div className="my-3 p-3 bg-slate-50 border border-slate-300 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Candidate Full Name</span>
                            <span className="font-bold text-sm text-slate-900 leading-tight block truncate" title={candidate.fullName}>
                              {candidate.fullName}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">
                              {candidate.classGroup ? 'Class & Reg #' : 'Index Number'}
                            </span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                              {candidate.classGroup && (
                                <span className="font-bold text-slate-800 bg-white border border-slate-300 px-1.5 py-0.2 rounded text-[11px]">
                                  {candidate.classGroup}
                                </span>
                              )}
                              <span className="font-mono font-black text-sm text-indigo-900">
                                {candidate.classGroup ? `#${candidate.indexNumber}` : candidate.indexNumber}
                              </span>
                            </div>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Level / Stream</span>
                            <span className="font-semibold text-slate-800 mt-0.5 block">
                              {candidate.academicLevel || 'Secondary 1'}{candidate.stream ? ` (${candidate.stream})` : ''}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Form Teacher</span>
                            <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                              {candidate.formTeacher || '—'}
                            </span>
                          </div>
                        </div>

                        {/* Access Arrangements Alert if flagged */}
                        {(() => {
                          const paperAAs = candidate.paperArrangements ? Object.values(candidate.paperArrangements) : [];
                          const allAAs = [defaultAA, ...paperAAs].filter(Boolean) as AccessArrangement[];
                          const hasAA = allAAs.some(
                            (a) => (a.extraTimePct ?? 0) > 0 || a.needsSeparateRoom || a.frontSeatMobility || a.remarks
                          );
                          if (!hasAA) return null;

                          return (
                            <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900 flex flex-wrap items-center gap-2">
                              <span className="font-bold uppercase tracking-wide text-[10px] bg-amber-200 px-1.5 py-0.5 rounded">
                                Access Arrangement Approved:
                              </span>
                              {defaultAA?.extraTimePct ? (
                                <span className="font-semibold">+{defaultAA.extraTimePct}% Extra Time</span>
                              ) : null}
                              {defaultAA?.needsSeparateRoom ? (
                                <span className="font-semibold">• Separate Room</span>
                              ) : null}
                              {defaultAA?.frontSeatMobility ? (
                                <span className="font-semibold">• Front Row Seating</span>
                              ) : null}
                              {defaultAA?.remarks ? (
                                <span className="italic">({defaultAA.remarks})</span>
                              ) : null}
                            </div>
                          );
                        })()}

                        {/* Papers & Seat Schedule Table */}
                        <div className="overflow-x-auto border border-slate-300 rounded-lg">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                              <tr>
                                <th className="px-3 py-2 border-r border-slate-300 w-32">Date</th>
                                <th className="px-3 py-2 border-r border-slate-300 w-28">Exam Time</th>
                                <th className="px-3 py-2 border-r border-slate-300 w-24">Code</th>
                                <th className="px-3 py-2 border-r border-slate-300">Subject / Paper</th>
                                <th className="px-3 py-2 border-r border-slate-300 w-36">Venue</th>
                                <th className="px-3 py-2 w-20 text-center bg-indigo-50/70 text-indigo-950 font-black">Seat</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {student.entries.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="px-4 py-4 text-center text-slate-400 italic">
                                    No registered examination papers for this candidate.
                                  </td>
                                </tr>
                              ) : (
                                student.entries.map((entry, eIdx) => {
                                  const dateFormatted = formatExamDate(entry.date);

                                  return (
                                    <tr key={eIdx} className="hover:bg-slate-50/70">
                                      <td className="px-3 py-2 font-medium border-r border-slate-200 whitespace-nowrap">
                                        {dateFormatted.dayOfWeek.slice(0, 3)}, {dateFormatted.formattedDate}
                                      </td>
                                      <td className="px-3 py-2 font-mono border-r border-slate-200 whitespace-nowrap">
                                        <span className="font-semibold text-slate-900">{entry.startTime}</span>
                                        <span className="text-slate-400"> – </span>
                                        <span className="text-slate-600">{entry.endTime}</span>
                                      </td>
                                      <td className="px-3 py-2 font-mono font-bold text-slate-700 border-r border-slate-200">
                                        {entry.paper.code}
                                      </td>
                                      <td className="px-3 py-2 font-medium text-slate-900 border-r border-slate-200">
                                        <div className="flex items-center gap-1.5">
                                          <span>{entry.paper.title}</span>
                                          {entry.paper.requiresComputer && (
                                            <span className="text-[9px] font-bold text-sky-700 bg-sky-100 border border-sky-200 px-1 py-0.2 rounded">
                                              PC
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 border-r border-slate-200 font-semibold text-slate-800">
                                        {entry.venueName}
                                      </td>
                                      <td className="px-3 py-2 text-center bg-indigo-50/40">
                                        <span className="font-mono font-black text-xs text-indigo-900 bg-white border border-indigo-200 px-2 py-0.5 rounded shadow-2xs">
                                          {entry.seatLabel}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Instructions & Declarations */}
                        <div className="mt-3 pt-3 border-t border-slate-300 text-[10px] text-slate-600 space-y-1">
                          <p className="font-semibold text-slate-800">
                            Candidate Instructions & Regulations:
                          </p>
                          <p>
                            1. Bring this Entry Proof and valid student identification (School Smartcard / EZ-Link / NRIC) to every examination session.
                          </p>
                          <p>
                            2. Report to the assigned examination room at least <strong>30 minutes</strong> prior to the commencement of the paper.
                          </p>
                          <p>
                            3. No unauthorized devices, electronic dictionaries, mobile phones, or smartwatches are permitted on examination desks.
                          </p>
                        </div>

                        {/* Signatures */}
                        <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-3 gap-4 text-[10px] text-slate-700 page-break-inside-avoid">
                          <div>
                            <p className="font-semibold text-slate-800">Candidate's Signature</p>
                            <p className="mt-4 border-b border-slate-400 w-full"></p>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">Parent / Guardian Acknowledgement</p>
                            <p className="mt-4 border-b border-slate-400 w-full"></p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-slate-800">Examination Committee / School Stamp</p>
                            <p className="mt-4 border-b border-slate-400 w-full"></p>
                          </div>
                        </div>

                        {/* Cutting line if 2-Up mode and odd item */}
                        {entryProofLayout === '2_UP' && !isEven && studentIdx < entryProofStudents.length - 1 && (
                          <div className="no-print mt-6 pt-2 border-t-2 border-dashed border-slate-400 text-center text-[10px] text-slate-400 select-none flex items-center justify-center gap-2">
                            <Scissors className="w-3.5 h-3.5 text-slate-400" />
                            <span>CUT HERE FOR 2-UP PRINT</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* 6. Exam Packing Cover Page (2-Page Report Separated by Venue) */}
        {reportType === 'PACKING_COVER' && (
          <div className="space-y-6">
            {!currentPaper ? (
              <div className="no-print p-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                <PackageCheck className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No Paper Selected</p>
                <p className="text-xs text-slate-400 mt-1">Please select an examination paper from the dropdown above.</p>
              </div>
            ) : packingCoverVenues.length === 0 ? (
              <div className="no-print p-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                <PackageCheck className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No Allocation Data for {currentPaper.code}</p>
                <p className="text-xs text-slate-400 mt-1">
                  Please run the allocation solver in Stage 4 (Seating & Swap) before generating Exam Packing Covers.
                </p>
              </div>
            ) : (
              <>
                {/* On-Screen Informational Banner (Hidden in Print) */}
                <div className="no-print p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 text-amber-600" />
                    <span>
                      Exam Packing Cover ready for <strong>{currentPaper.code} — {currentPaper.title}</strong> across{' '}
                      <strong>{packingCoverVenues.length} venue(s)</strong>. Each venue generates a <strong>2-page report</strong> (Page 1: Paper & Candidate Details, Page 2: Seating Plan).
                    </span>
                  </div>
                  <button
                    onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Cover Sheets (A4)</span>
                  </button>
                </div>

                {/* List of Venues: Each Venue renders Page 1 + Page 2 */}
                <div className="space-y-10 print:space-y-0">
                  {packingCoverVenues.map((v, vIdx) => {
                    const venueAllocs = currentAllocations.filter((a) => a.venueId === v.id);
                    const concurrentInRoom = concurrentAllocations.filter((a) => a.venueId === v.id);
                    const concurrentPapersInRoom = Array.from(
                      new Set(
                        concurrentInRoom
                          .map((a) => papers.find((p) => p.id === a.paperId))
                          .filter((p): p is ExamPaper => Boolean(p))
                      )
                    );
                    const hasCombinedPapers = concurrentPapersInRoom.length > 0;
                    const dateDetails = formatExamDate(currentPaper.date);

                    const durationMins = currentPaper.durationMins || 60;
                    const startMin = parseTimeToMinutes(currentPaper.startTime);
                    const endMin = startMin + durationMins;
                    const endTime = minutesToTime(endMin);
                    const reportingTime = minutesToTime(Math.max(0, startMin - 30));
                    const dismissalTime = minutesToTime(endMin + 15);
                    const durHours = Math.floor(durationMins / 60);
                    const durMins = durationMins % 60;
                    const formattedDuration =
                      durHours > 0
                        ? durMins > 0
                          ? `${durHours}h ${durMins}m`
                          : `${durHours}h`
                        : `${durMins}m`;

                    const venueCandidates = venueAllocs
                      .map((alloc) => {
                        const candidate = candidates.find((c) => c.id === alloc.candidateId);
                        const arr = candidate
                          ? getCandidatePaperArrangement(candidate, currentPaper.code)
                          : undefined;
                        return { alloc, candidate, arr };
                      })
                      .sort((a, b) => {
                        if (a.candidate && b.candidate) {
                          if (
                            a.candidate.classGroup &&
                            b.candidate.classGroup &&
                            a.candidate.classGroup !== b.candidate.classGroup
                          ) {
                            return a.candidate.classGroup.localeCompare(
                              b.candidate.classGroup,
                              undefined,
                              { numeric: true, sensitivity: 'base' }
                            );
                          }
                          return a.candidate.indexNumber.localeCompare(
                            b.candidate.indexNumber,
                            undefined,
                            { numeric: true }
                          );
                        }
                        return a.alloc.seatLabel.localeCompare(b.alloc.seatLabel);
                      });

                    const classCounts = new Map<string, number>();
                    venueCandidates.forEach(({ candidate }) => {
                      const cls = candidate?.classGroup || 'Standard';
                      classCounts.set(cls, (classCounts.get(cls) || 0) + 1);
                    });
                    const classEntries = Array.from(classCounts.entries()).sort((a, b) =>
                      a[0].localeCompare(b[0], undefined, { numeric: true })
                    );

                    const indexNumbers = venueCandidates
                      .map(({ candidate }) => candidate?.indexNumber)
                      .filter((idx): idx is string => Boolean(idx))
                      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                    const firstIndex = indexNumbers[0] || '—';
                    const lastIndex = indexNumbers[indexNumbers.length - 1] || '—';

                    const aaCandidates = venueCandidates.filter(
                      ({ arr }) =>
                        arr &&
                        ((arr.extraTimePct ?? 0) > 0 ||
                          arr.needsSeparateRoom ||
                          arr.frontSeatMobility ||
                          arr.remarks)
                    );

                    return (
                      <div key={v.id} className="space-y-6">
                        {/* Visual separator on screen between venues */}
                        {vIdx > 0 && (
                          <div className="no-print pt-6 pb-2 border-t-2 border-dashed border-slate-300 text-center">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
                              Next Venue: {v.name}
                            </span>
                          </div>
                        )}

                        {/* ========================================================================= */}
                        {/* PAGE 1: EXAM PAPER DETAILS, CANDIDATURE SUMMARY & PACKING RECONCILIATION */}
                        {/* ========================================================================= */}
                        <div
                          className={`${
                            vIdx > 0 ? 'page-break-before-always ' : ''
                          }page-break-after bg-white border-2 border-slate-900 rounded-xl p-6 print:p-0 print:border-none print:rounded-none shadow-xs space-y-4`}
                        >
                          {/* Screen Header Badge */}
                          <div className="no-print flex items-center justify-between pb-2 border-b border-slate-200 text-xs">
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                              VENUE: {v.name} — PAGE 1 OF 2: PACKING DETAILS & CANDIDATE SUMMARY
                            </span>
                            <span className="text-slate-400 text-[11px]">
                              Prints on Sheet 1 for {v.name}
                            </span>
                          </div>

                          {/* Document Header */}
                          <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-red-800 text-white font-mono font-bold text-[10px] rounded uppercase tracking-wider">
                                  CONFIDENTIAL • EXAM PACKET COVER
                                </span>
                                <span className="text-xs font-bold text-indigo-800 uppercase tracking-wide">
                                  {scope === 'internal'
                                    ? 'CANBERRA SECONDARY SCHOOL'
                                    : 'SINGAPORE EXAMINATIONS AND ASSESSMENT BOARD'}
                                </span>
                              </div>
                              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
                                EXAMINATION QUESTION PAPER & SCRIPT PACKING COVER
                              </h1>
                              <p className="text-xs text-slate-600 mt-0.5 font-medium">
                                {scope === 'internal'
                                  ? '2026 End-of-Year Examination'
                                  : 'National Examination (SEAB)'}
                                {' '}• Official Packing Verification & Chief Invigilator Envelope Sheet
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="font-mono text-sm font-black text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded block">
                                  {v.name}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 block">
                                  PAGE 1 OF 2
                                </span>
                              </div>
                              <img
                                src={plexoLogo}
                                alt="Plexo"
                                className="h-10 w-auto object-contain rounded"
                              />
                            </div>
                          </div>

                          {/* Section 1: Paper Particulars Grid */}
                          <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50/50">
                            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 flex items-center justify-between text-xs font-bold text-slate-800">
                              <span>1. EXAMINATION PAPER PARTICULARS</span>
                              <span className="font-mono text-[11px] text-slate-500">
                                Date: {dateDetails.fullHeader}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-slate-300 text-xs">
                              <div className="p-2.5">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                                  Subject / Paper Code
                                </span>
                                <span className="font-mono font-black text-sm text-indigo-950 mt-0.5 block">
                                  {currentPaper.code}
                                </span>
                              </div>

                              <div className="p-2.5">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                                  Subject / Paper Title
                                </span>
                                <span className="font-bold text-slate-900 mt-0.5 block truncate" title={currentPaper.title}>
                                  {currentPaper.title}
                                </span>
                              </div>

                              <div className="p-2.5">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                                  Level / Stream
                                </span>
                                <span className="font-semibold text-slate-800 mt-0.5 block">
                                  {currentPaper.level || getPaperLevel(currentPaper, candidates)}
                                  {currentPaper.stream ? ` (${currentPaper.stream})` : ''}
                                </span>
                              </div>

                              <div className="p-2.5">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                                  Duration & Time
                                </span>
                                <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                                  {currentPaper.startTime} – {endTime} ({formattedDuration})
                                </span>
                              </div>

                              <div className="p-2.5">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                                  Reporting Time (In Room)
                                </span>
                                <span className="font-mono font-semibold text-emerald-800 mt-0.5 block">
                                  {reportingTime} (30 mins before)
                                </span>
                              </div>

                              <div className="p-2.5">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                                  Estimated Dismissal
                                </span>
                                <span className="font-mono text-slate-700 mt-0.5 block">
                                  {dismissalTime} (+15m buffer)
                                </span>
                              </div>

                              <div className="p-2.5">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                                  Assigned Venue
                                </span>
                                <span className="font-bold text-slate-900 mt-0.5 block">
                                  {v.name}
                                </span>
                              </div>

                              <div className="p-2.5">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                                  Venue Facilities
                                </span>
                                <span className="font-medium text-slate-700 mt-0.5 block text-[11px]">
                                  {v.isLab
                                    ? 'Science Practical Lab'
                                    : v.hasComputers
                                    ? `PC Lab (${v.computerStations || 0} PCs)`
                                    : 'Standard Exam Room'}
                                  {v.hasAudio ? ' • LC Audio Verified' : ''}
                                  {hasCombinedPapers ? ' • Shared Room' : ''}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Section 2: Venue Candidature & Enrolment Metrics */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {/* Metric 1: Total Seated */}
                            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg flex flex-col justify-between">
                              <span className="text-[10px] uppercase font-bold text-indigo-700">
                                Total Seated Candidates
                              </span>
                              <div className="mt-1">
                                <span className="font-mono font-black text-2xl sm:text-3xl text-indigo-950">
                                  {venueCandidates.length}
                                </span>
                                <span className="text-[11px] font-medium text-indigo-800 ml-1.5">
                                  candidates
                                </span>
                              </div>
                              <span className="text-[10px] text-indigo-600 mt-1 font-semibold">
                                Question Papers Required: {venueCandidates.length}
                              </span>
                            </div>

                            {/* Metric 2: Candidate Index Range */}
                            <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg flex flex-col justify-between">
                              <span className="text-[10px] uppercase font-bold text-slate-500">
                                Candidate Index Range
                              </span>
                              <div className="mt-1 font-mono font-black text-base sm:text-lg text-slate-900">
                                #{firstIndex} <span className="text-slate-400 font-normal">to</span> #{lastIndex}
                              </div>
                              <span className="text-[10px] text-slate-500 mt-1 font-medium">
                                Total Range Count: {indexNumbers.length}
                              </span>
                            </div>

                            {/* Metric 3: Class Distribution */}
                            <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg flex flex-col justify-between">
                              <span className="text-[10px] uppercase font-bold text-slate-500">
                                Class Distribution
                              </span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {classEntries.length > 0 ? (
                                  classEntries.map(([cls, cnt]) => (
                                    <span
                                      key={cls}
                                      className="px-1.5 py-0.5 bg-white border border-slate-300 text-slate-800 text-[10px] font-bold rounded"
                                    >
                                      {cls}: {cnt}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-slate-400 italic">None</span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 mt-1 font-medium">
                                {classEntries.length} class cohort(s)
                              </span>
                            </div>

                            {/* Metric 4: Access Arrangements */}
                            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-col justify-between">
                              <span className="text-[10px] uppercase font-bold text-amber-800">
                                Access Arrangements
                              </span>
                              <div className="mt-1">
                                <span className="font-mono font-black text-xl text-amber-950">
                                  {aaCandidates.length === 0 ? 'Standard (0)' : `${aaCandidates.length} Flagged`}
                                </span>
                              </div>
                              <span className="text-[10px] text-amber-800 mt-1 font-medium truncate" title={
                                aaCandidates.map((c) => `#${c.candidate?.indexNumber} (${c.arr?.extraTimePct ? `+${c.arr.extraTimePct}% ET` : 'AA'})`).join(', ') || 'No accommodations'
                              }>
                                {aaCandidates.length > 0
                                  ? aaCandidates.map((c) => `#${c.candidate?.indexNumber}`).join(', ')
                                  : 'No AA in this venue'}
                              </span>
                            </div>
                          </div>

                          {/* Section 2: Official Packing & Script Reconciliation Slip (SEAB Format) */}
                          <div className="border-2 border-slate-800 rounded-lg overflow-hidden bg-slate-50/70 text-xs">
                            <div className="bg-slate-800 text-white px-3 py-1.5 font-bold uppercase tracking-wider text-[11px] flex items-center justify-between">
                              <span>2. PACKING & SCRIPT RECONCILIATION VERIFICATION (SEAB COMPLIANCE)</span>
                              <span className="text-slate-300 font-normal text-[10px]">
                                To be signed during packaging, collection, and script return
                              </span>
                            </div>

                            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-300">
                              {/* Left: Department Packing Checklist */}
                              <div className="space-y-2 pr-0 md:pr-2">
                                <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wide block">
                                  A. Subject Department Packing Sign-off:
                                </span>
                                <div className="space-y-1 text-[11px] text-slate-700">
                                  <p className="flex items-center justify-between">
                                    <span>• Question Papers Enclosed:</span>
                                    <span className="font-mono font-bold">
                                      ______ (Exact: {venueCandidates.length} + Spares: ____)
                                    </span>
                                  </p>
                                  <p className="flex items-center justify-between">
                                    <span>• Answer Booklets / Writing Papers:</span>
                                    <span className="font-mono font-bold">______ copies</span>
                                  </p>
                                  <p className="flex items-center gap-3 pt-0.5 text-[10px]">
                                    <span>[ ] Seating Plan enclosed</span>
                                    <span>[ ] Desk slips enclosed</span>
                                    <span>[ ] Attendance list</span>
                                  </p>
                                </div>
                                <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2 text-[10px] text-slate-600">
                                  <div>
                                    <span className="block">Packed & Sealed By:</span>
                                    <span className="block mt-3 border-b border-slate-400"></span>
                                  </div>
                                  <div>
                                    <span className="block">Date & Signature:</span>
                                    <span className="block mt-3 border-b border-slate-400"></span>
                                  </div>
                                </div>
                              </div>

                              {/* Right: Invigilator Collection & Return Tally */}
                              <div className="space-y-2 pt-2 md:pt-0 md:pl-4">
                                <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wide block">
                                  B. Invigilation Collection & Script Return Tally:
                                </span>
                                <div className="space-y-1 text-[11px] text-slate-700">
                                  <p className="flex items-center justify-between">
                                    <span>• Collected by Chief Invigilator:</span>
                                    <span className="font-mono">Time: ________ Sign: ____________</span>
                                  </p>
                                  <div className="p-1.5 bg-white border border-slate-300 rounded grid grid-cols-3 gap-1 text-center text-[10px]">
                                    <div>
                                      <span className="text-slate-500 block">Present Scripts</span>
                                      <span className="font-mono font-bold text-slate-900">[ _____ ]</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block">Absentees</span>
                                      <span className="font-mono font-bold text-slate-900">[ _____ ]</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block">Total Returned</span>
                                      <span className="font-mono font-bold text-slate-900">[ _____ ]</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="pt-1 border-t border-slate-200 grid grid-cols-2 gap-2 text-[10px] text-slate-600">
                                  <div>
                                    <span className="block">CI Return Signature:</span>
                                    <span className="block mt-2.5 border-b border-slate-400"></span>
                                  </div>
                                  <div>
                                    <span className="block">Received at Exam Control:</span>
                                    <span className="block mt-2.5 border-b border-slate-400"></span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Page 1 Footer */}
                          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
                            <span>
                              Plexo Examination System • Cover Page for Exam Packing • Venue: {v.name} • {currentPaper.code}
                            </span>
                            <span className="font-mono font-semibold">End of Page 1</span>
                          </div>
                        </div>

                        {/* ========================================================================= */}
                        {/* PAGE 2: EXAM TITLE, VENUE HEADER & 2D SEATING PLAN FLOOR LAYOUT          */}
                        {/* ========================================================================= */}
                        <div
                          className="page-break-before-always page-break-after bg-white border-2 border-slate-900 rounded-xl p-6 print:p-0 print:border-none print:rounded-none shadow-xs space-y-4"
                        >
                          {/* Screen Header Badge */}
                          <div className="no-print flex items-center justify-between pb-2 border-b border-slate-200 text-xs">
                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              VENUE: {v.name} — PAGE 2 OF 2: OFFICIAL SEATING PLAN
                            </span>
                            <span className="text-slate-400 text-[11px]">
                              Prints on Sheet 2 for {v.name}
                            </span>
                          </div>

                          {/* Header: Exam Title, Subject, Date, Venue */}
                          <div className="border-b-2 border-slate-900 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 bg-slate-900 text-white font-mono font-bold text-xs rounded uppercase tracking-wider">
                                  SEAB / SCHOOL EXAMINATION SEATING PLAN
                                </span>
                                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                  {dateDetails.dayOfWeek}
                                </span>
                                {currentPaper.level && (
                                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                    {currentPaper.level}
                                  </span>
                                )}
                                {hasCombinedPapers && (
                                  <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                                    Combined Venue (+{concurrentPapersInRoom.map((p) => p.code).join(', ')})
                                  </span>
                                )}
                              </div>
                              <h2 className="text-2xl font-black text-slate-900 mt-1">
                                {currentPaper.code} — {currentPaper.title}
                              </h2>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1 font-medium">
                                <span>Day: <strong>{dateDetails.dayOfWeek}</strong></span>
                                <span>•</span>
                                <span>Date: <strong>{currentPaper.date}</strong></span>
                                <span>•</span>
                                <span>Exam Time: <strong>{currentPaper.startTime} – {endTime}</strong></span>
                                <span>•</span>
                                <span>Venue: <strong className="text-indigo-900 text-sm font-black">{v.name}</strong></span>
                                <span>•</span>
                                <span>
                                  Candidature: <strong>{venueAllocs.length + concurrentInRoom.length} candidates</strong>
                                  {hasCombinedPapers &&
                                    ` (${venueAllocs.length} for ${currentPaper.code}, ${concurrentInRoom.length} for ${concurrentPapersInRoom.map((p) => p.code).join('/')})`}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="font-mono text-sm font-black text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded block">
                                  {v.name}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 block">
                                  PAGE 2 OF 2
                                </span>
                              </div>
                              <img src={plexoLogo} alt="Plexo" className="h-10 w-auto object-contain rounded" />
                            </div>
                          </div>

                          {/* Teacher's Bench Banner */}
                          <div className="w-full py-2.5 px-4 bg-slate-100 border-2 border-slate-800 rounded-lg text-center shadow-xs">
                            <span className="font-extrabold uppercase tracking-widest text-xs md:text-sm text-slate-900">
                              ▲ TEACHER'S BENCH (FRONT OF EXAMINATION ROOM) ▲
                            </span>
                          </div>

                          {/* 2D Seating Floorplan Grid */}
                          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 print:bg-white print:border-none print:p-0 overflow-x-auto">
                            <div
                              className="grid gap-2.5 mx-auto justify-center"
                              style={{
                                gridTemplateColumns: `repeat(${v.cols}, minmax(110px, 1fr))`,
                                maxWidth: `${v.cols * 150}px`,
                              }}
                            >
                              {v.seatGrid.map((rowArr, r) =>
                                rowArr.map((seat, c) => {
                                  const alloc = currentAllocations.find(
                                    (a) => a.venueId === v.id && a.row === r && a.col === c
                                  );
                                  const candidate = alloc
                                    ? candidates.find((cand) => cand.id === alloc.candidateId)
                                    : null;

                                  const concurrentAlloc = !alloc
                                    ? concurrentInRoom.find((a) => a.row === r && a.col === c)
                                    : null;
                                  const concurrentCand = concurrentAlloc
                                    ? candidates.find((cand) => cand.id === concurrentAlloc.candidateId)
                                    : null;
                                  const concurrentPaper = concurrentAlloc
                                    ? papers.find((p) => p.id === concurrentAlloc.paperId)
                                    : null;

                                  if (!seat.isActive) {
                                    return (
                                      <div
                                        key={`${r}-${c}`}
                                        className="h-24 rounded-lg border border-dashed border-slate-300 bg-slate-100/70 flex flex-col items-center justify-center p-2 text-slate-300 select-none"
                                      >
                                        <Ban className="w-4 h-4 text-slate-300" />
                                        <span className="text-[10px] font-mono mt-1">Aisle / Pillar</span>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div
                                      key={`${r}-${c}`}
                                      className={`h-24 rounded-lg border p-2 flex flex-col justify-between select-none ${
                                        candidate
                                          ? 'bg-white border-slate-400 shadow-xs'
                                          : concurrentAlloc
                                          ? 'bg-purple-50/70 border-purple-300 shadow-xs'
                                          : 'bg-slate-50 border-dashed border-slate-300'
                                      }`}
                                    >
                                      {/* Desk Label & PC Indicator */}
                                      <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                                        <span className="font-mono font-bold text-xs text-slate-600">
                                          {seat.seatLabel}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          {seat.hasComputer && (
                                            <span title="Computer Workstation">
                                              <Monitor className="w-3.5 h-3.5 text-sky-600" />
                                            </span>
                                          )}
                                          {concurrentAlloc && (
                                            <span className="text-[8px] font-bold text-purple-700 bg-purple-100 px-1 rounded font-mono">
                                              {concurrentPaper?.code}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Candidate Number / Class & Full Name */}
                                      {candidate ? (
                                        <div className="flex flex-col items-center justify-center my-auto text-center">
                                          <div className="flex items-center gap-1 mb-0.5">
                                            {candidate.classGroup && (
                                              <span className="text-[9px] font-bold text-slate-700 bg-slate-200/90 px-1.5 py-0.2 rounded">
                                                {candidate.classGroup}
                                              </span>
                                            )}
                                            <span className="font-mono font-black text-sm text-slate-950 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-300 tracking-wider">
                                              #{candidate.indexNumber}
                                            </span>
                                          </div>
                                          <span className="text-[10px] font-bold text-slate-900 block truncate max-w-[110px]" title={candidate.fullName}>
                                            {candidate.fullName}
                                          </span>
                                          {alloc?.shiftIndex && alloc.shiftIndex > 1 && (
                                            <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded mt-0.5">
                                              Shift {alloc.shiftIndex}
                                            </span>
                                          )}
                                        </div>
                                      ) : concurrentAlloc ? (
                                        <div className="flex flex-col items-center justify-center my-auto text-center">
                                          <span className="font-mono font-black text-xs text-purple-950 bg-purple-100 px-2 py-0.5 rounded border border-purple-300 tracking-wider">
                                            {concurrentCand?.classGroup
                                              ? `${concurrentCand.classGroup} #${concurrentCand.indexNumber}`
                                              : concurrentCand?.indexNumber || concurrentAlloc.candidateId}
                                          </span>
                                          <span className="text-[10px] font-semibold text-purple-900 block truncate max-w-[110px]">
                                            {concurrentCand?.fullName || concurrentPaper?.code}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="text-center py-2 text-[11px] text-slate-400 italic">
                                          Empty Desk
                                        </div>
                                      )}

                                      {/* Bottom Arrangement Indicator */}
                                      <div className="text-[10px] text-center text-slate-500 border-t border-slate-100 pt-0.5">
                                        {concurrentAlloc ? (
                                          <span className="text-purple-700 font-bold font-mono text-[9px]">
                                            {concurrentPaper?.code}
                                          </span>
                                        ) : (() => {
                                          if (!candidate) return <span className="opacity-0">—</span>;
                                          const arr = getCandidatePaperArrangement(candidate, currentPaper?.code);
                                          if (arr && ((arr.extraTimePct ?? 0) > 0 || arr.frontSeatMobility || arr.needsSeparateRoom)) {
                                            return (
                                              <span className="font-bold text-indigo-700 text-[9px]">
                                                {arr.extraTimePct ? `+${arr.extraTimePct}% AA` : 'Special Seat'}
                                              </span>
                                            );
                                          }
                                          return <span className="text-slate-300 font-mono text-[9px]">Standard</span>;
                                        })()}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          {/* Seating Plan Verification & Invigilator Sign-off Footer */}
                          <div className="pt-3 border-t-2 border-slate-300 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs page-break-inside-avoid">
                            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                              <span className="text-[10px] font-bold text-slate-500 uppercase block">
                                Chief Invigilator Verification
                              </span>
                              <p className="text-[10px] text-slate-600 mt-1">
                                I confirm candidates are seated strictly according to this official plan.
                              </p>
                              <p className="mt-3 border-b border-slate-400 w-full"></p>
                            </div>

                            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                              <span className="text-[10px] font-bold text-slate-500 uppercase block">
                                Room Timing Verification
                              </span>
                              <div className="text-[10px] text-slate-700 mt-1 space-y-1">
                                <p>Actual Start Time: <strong>________</strong></p>
                                <p>Actual Concluded Time: <strong>________</strong></p>
                              </div>
                            </div>

                            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-right">
                              <span className="text-[10px] font-bold text-slate-500 uppercase block">
                                Venue & Document Audit
                              </span>
                              <p className="font-mono font-bold text-slate-800 text-xs mt-1">
                                {v.name} • {currentPaper.code}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-1">
                                Plexo Seating System • Page 2 of 2
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
