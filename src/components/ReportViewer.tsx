import React, { useState, useMemo } from 'react';
import { useExamStore } from '../store/useExamStore';
import { getCandidatePaperArrangement } from '../types';
import type { ExamPaper } from '../types';
import { 
  Printer, 
  Download, 
  FileText, 
  LayoutGrid, 
  Calendar, 
  DoorOpen, 
  Building2, 
  Monitor,
  Ban
} from 'lucide-react';
import * as XLSX from 'xlsx';
import plexoLogo from '../assets/plexo-logo.png';

export type ReportType = 'ROOM_USE_OVERVIEW' | 'DOOR_CARD' | 'DESK_SLIPS' | 'INVIGILATOR_MATRIX';

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
  const { papers, candidates, venues, allocations } = useExamStore();
  const [reportType, setReportType] = useState<ReportType>('ROOM_USE_OVERVIEW');

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

  // Papers scheduled on activeDate
  const dayPapers = useMemo(() => {
    return papers.filter((p) => p.date === activeDate);
  }, [papers, activeDate]);

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

  // Current active paper for Door Card / Desk Slips
  const currentPaper = useMemo(() => {
    return papers.find((p) => p.id === selectedPaperId) || papers[0] || null;
  }, [papers, selectedPaperId]);

  const currentAllocations = useMemo(() => {
    if (!currentPaper) return [];
    return allocations[currentPaper.id] || [];
  }, [allocations, currentPaper]);

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
      .sort((a, b) => a!.candidate.indexNumber.localeCompare(b!.candidate.indexNumber));
  }, [filteredAllocations, candidates, venues, currentPaper]);

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

    const data = reportItems.map((item) => ({
      'Index Number': item!.candidate.indexNumber,
      'Candidate Name': item!.candidate.fullName,
      'Academic Level': item!.candidate.academicLevel || '',
      'Paper Code': item!.paper.code,
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
          </div>

          {/* Conditional Filters depending on active report */}
          {reportType === 'ROOM_USE_OVERVIEW' ? (
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
                  {papers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.title}
                    </option>
                  ))}
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
                          <span>Candidature: <strong>{venueAllocs.length} candidates</strong></span>
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
                                    : 'bg-slate-50 border-dashed border-slate-300'
                                }`}
                              >
                                {/* Desk Label & PC Indicator */}
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                                  <span className="font-mono font-bold text-xs text-slate-600">
                                    {seat.seatLabel}
                                  </span>
                                  {seat.hasComputer && (
                                    <span title="Computer Workstation">
                                      <Monitor className="w-3.5 h-3.5 text-sky-600" />
                                    </span>
                                  )}
                                </div>

                                {/* ONLY Candidate Number (Strictly NO NAMES) */}
                                {candidate ? (
                                  <div className="flex flex-col items-center justify-center my-auto">
                                    <span className="font-mono font-black text-base text-slate-950 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 tracking-wider">
                                      {candidate.indexNumber}
                                    </span>
                                    {alloc?.shiftIndex && alloc.shiftIndex > 1 && (
                                      <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded mt-0.5">
                                        Shift {alloc.shiftIndex}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-center py-2 text-[11px] text-slate-400 italic">
                                    Empty Desk
                                  </div>
                                )}

                                {/* Bottom Subtle Arrangement Indicator (No names) */}
                                <div className="text-[10px] text-center text-slate-500 border-t border-slate-100 pt-0.5">
                                  {(() => {
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
                            SEAB Examination Desk Slip
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                            {item!.venue.name}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-2 mt-2">
                          <div>
                            <p className="text-[11px] text-slate-500">Index Number</p>
                            <p className="font-mono font-black text-2xl text-slate-900 leading-tight">
                              {item!.candidate.indexNumber}
                            </p>
                          </div>
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
                      Paper: <strong>{currentPaper?.code} — {currentPaper?.title}</strong> • Date: <strong>{currentPaper?.date}</strong>
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
                        <th className="px-3 py-2 border-r border-slate-300 w-20">Index</th>
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
                            {item!.candidate.indexNumber}
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
      </div>
    </div>
  );
};
