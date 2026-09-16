import React, { useState, useMemo } from 'react';
import { useExamStore } from '../store/useExamStore';
import { getCandidatePaperArrangement } from '../types';
import type { ExamPaper, AccessArrangement } from '../types';
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
  GraduationCap
} from 'lucide-react';
import * as XLSX from 'xlsx';
import plexoLogo from '../assets/plexo-logo.png';

export type ReportType = 'ROOM_USE_OVERVIEW' | 'DOOR_CARD' | 'DESK_SLIPS' | 'INVIGILATOR_MATRIX' | 'ENTRY_PROOF';

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

  // Group papers by consolidated time slot on activeDate
  const dayTimeSlots = useMemo(() => {
    const map = new Map<string, ExamPaper[]>();
    dayPapers.forEach((p) => {
      const list = map.get(p.startTime) || [];
      list.push(p);
      map.set(p.startTime, list);
    });

    return Array.from(map.entries())
      .sort(([timeA], [timeB]) => timeA.localeCompare(timeB))
      .map(([timeSlot, slotPapers]) => {
        const maxDuration = Math.max(...slotPapers.map((p) => p.durationMins || 60));
        const [h, m] = timeSlot.split(':').map(Number);
        const endMinutesTotal = h * 60 + m + maxDuration;
        const endH = String(Math.floor(endMinutesTotal / 60) % 24).padStart(2, '0');
        const endM = String(endMinutesTotal % 60).padStart(2, '0');
        const timeRange = `${timeSlot} – ${endH}:${endM}`;

        return {
          timeSlot,
          timeRange,
          papers: slotPapers,
        };
      });
  }, [dayPapers]);

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

      const studentPapers = papers.filter((paper) => {
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

  // Helper for Room Use cell content
  const getRoomSlotAllocations = (venueId: string, slotPapers: ExamPaper[]) => {
    const entries: { paper: ExamPaper; candidature: number }[] = [];
    let total = 0;

    for (const p of slotPapers) {
      const pAllocs = allocations[p.id] || [];
      const inRoom = pAllocs.filter((a) => a.venueId === venueId);
      if (inRoom.length > 0) {
        entries.push({ paper: p, candidature: inRoom.length });
        total += inRoom.length;
      }
    }
    return { entries, total };
  };

  // Export Excel / CSV depending on the active report
  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new();

    if (reportType === 'ROOM_USE_OVERVIEW') {
      const headers = ['Exam Room', 'Capacity', ...dayTimeSlots.map((s) => `${s.timeSlot} (${s.timeRange})`), 'Total Day Candidature'];
      const rows: any[] = [];

      venues.forEach((v) => {
        let venueDayTotal = 0;
        const rowCells = dayTimeSlots.map((slot) => {
          const { entries, total } = getRoomSlotAllocations(v.id, slot.papers);
          venueDayTotal += total;
          if (entries.length === 0) return '—';
          return entries.map((e) => `${e.paper.code} (${e.candidature} cands)`).join(', ');
        });

        rows.push([v.name, v.rows * v.cols, ...rowCells, venueDayTotal]);
      });

      const bottomTotals = dayTimeSlots.map((slot) => {
        let slotTotal = 0;
        slot.papers.forEach((p) => {
          slotTotal += (allocations[p.id] || []).length;
        });
        return slotTotal;
      });
      const dayGrandTotal = bottomTotals.reduce((a, b) => a + b, 0);
      rows.push(['Total Candidature', '', ...bottomTotals, dayGrandTotal]);

      const worksheet = XLSX.utils.aoa_to_sheet([
        [`SEAB Room Use Overview — ${dateInfo.fullHeader}`],
        headers,
        ...rows,
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'RoomUseOverview');
      XLSX.writeFile(workbook, `Plexo_RoomUse_${activeDate}.xlsx`);
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
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Exam Day Selector
                </label>
                <select
                  value={activeDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                <p className="text-xs text-slate-500 mt-1">
                  Horizontal axis: Consolidated time of day • Vertical axis: Examination rooms • Cells: Paper code, title & candidature count
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right font-mono text-xs text-slate-600">
                  <p>Day Papers: <strong>{dayPapers.length}</strong></p>
                  <p>Time Slots: <strong>{dayTimeSlots.length}</strong></p>
                </div>
                <img src={plexoLogo} alt="Plexo" className="h-10 w-auto object-contain rounded" />
              </div>
            </div>

            {/* Matrix Table */}
            {dayTimeSlots.length === 0 ? (
              <div className="no-print p-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No Examination Papers Scheduled on this Date</p>
                <p className="text-xs text-slate-400 mt-1">
                  Select another day using the Exam Day Selector above, or upload timetables in Stage 2.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-300 rounded-lg shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-800 font-bold border-b-2 border-slate-400">
                    <tr>
                      <th className="px-4 py-3 border-r border-slate-300 w-52 bg-slate-200/90 sticky left-0 z-10">
                        Exam Room / Venue
                      </th>
                      {dayTimeSlots.map((slot, sIdx) => (
                        <th key={sIdx} className="px-4 py-3 border-r border-slate-300 min-w-[220px] text-center">
                          <div className="text-sm font-black text-indigo-900">{slot.timeSlot}</div>
                          <div className="text-[11px] font-semibold text-slate-600">{slot.timeRange}</div>
                          <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                            {slot.papers.map((p) => p.code).join(', ')}
                          </div>
                        </th>
                      ))}
                      <th className="px-4 py-3 w-32 text-center bg-slate-200/80 font-bold">
                        Daily Room Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {venues.map((v) => {
                      let roomDailyTotal = 0;
                      return (
                        <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 border-r border-slate-300 font-semibold text-slate-900 bg-slate-50/50 sticky left-0">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-slate-500" />
                              <span>{v.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal pl-5">
                              Capacity: {v.seatGrid ? v.seatGrid.flat().filter(s => s.isActive).length : v.rows * v.cols} desks {v.hasComputers ? '• PC' : ''}
                            </div>
                          </td>

                          {dayTimeSlots.map((slot, sIdx) => {
                            const { entries, total } = getRoomSlotAllocations(v.id, slot.papers);
                            roomDailyTotal += total;

                            return (
                              <td key={sIdx} className="px-3 py-2.5 border-r border-slate-300 align-top">
                                {entries.length === 0 ? (
                                  <div className="h-full flex items-center justify-center text-slate-300 italic text-[11px] py-2">
                                    —
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    {entries.map(({ paper, candidature }, pIdx) => (
                                      <div
                                        key={pIdx}
                                        className="p-2 rounded bg-indigo-50/70 border border-indigo-200 text-indigo-950 text-xs"
                                      >
                                        <div className="font-bold font-mono text-indigo-900 flex items-center justify-between">
                                          <span>{paper.code}</span>
                                          <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold">
                                            {candidature} {candidature === 1 ? 'cand' : 'cands'}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-600 line-clamp-1 mt-0.5" title={paper.title}>
                                          {paper.title}
                                        </div>
                                      </div>
                                    ))}
                                    {entries.length > 1 && (
                                      <div className="text-right text-[10px] font-bold text-slate-500 pt-0.5 border-t border-slate-200">
                                        Slot Candidature: {total}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          <td className="px-4 py-3 text-center font-bold font-mono text-sm bg-slate-50/40">
                            {roomDailyTotal > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-white text-xs font-bold">
                                {roomDailyTotal}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-800">
                    <tr>
                      <td className="px-4 py-2.5 border-r border-slate-300 uppercase text-[11px] tracking-wider text-slate-600 sticky left-0 bg-slate-100">
                        Slot Total Candidature
                      </td>
                      {dayTimeSlots.map((slot, sIdx) => {
                        let slotTotal = 0;
                        venues.forEach((v) => {
                          const { total } = getRoomSlotAllocations(v.id, slot.papers);
                          slotTotal += total;
                        });
                        return (
                          <td key={sIdx} className="px-4 py-2.5 border-r border-slate-300 text-center font-mono font-black text-indigo-900 text-sm">
                            {slotTotal}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-center font-mono font-black text-slate-900 text-sm bg-slate-200">
                        {(() => {
                          let grandTotal = 0;
                          dayTimeSlots.forEach((slot) => {
                            venues.forEach((v) => {
                              const { total } = getRoomSlotAllocations(v.id, slot.papers);
                              grandTotal += total;
                            });
                          });
                          return grandTotal;
                        })()}
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
      </div>
    </div>
  );
};
