import React, { useState, useMemo } from 'react';
import { useExamStore } from '../store/useExamStore';
import { parseMultipleTimetableFiles, parseMultipleInternalTimetableFiles, syncInternalCandidateEnrollments } from '../services/candidateParser';
import { getDistinctLevels, getPaperLevel, isCandidateEligibleForPaper } from '../services/allocationEngine';
import type { ExamPaper, PaperType, Candidate } from '../types';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Monitor, 
  Headphones, 
  FlaskConical, 
  FileText, 
  Layers, 
  Trash2, 
  Edit3, 
  X,
  Users,
  Files,
  Download,
  CalendarX,
  GraduationCap
} from 'lucide-react';

function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutesToAdd;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const newH = Math.floor(wrapped / 60).toString().padStart(2, '0');
  const newM = (wrapped % 60).toString().padStart(2, '0');
  return `${newH}:${newM}`;
}

export const TimetableManager: React.FC = () => {
  const { 
    scope,
    papers, 
    autoCombineAaVenues,
    setAutoCombineAaVenues,
    addPaper, 
    updatePaper, 
    deletePaper, 
    deletePapersByDate, 
    deletePapersByDates, 
    deleteUnenrolledPapers, 
    mergePapers, 
    setPapers,
    candidates,
    setCandidates
  } = useExamStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPaper, setEditingPaper] = useState<ExamPaper | null>(null);
  const [isDeleteDaysModalOpen, setIsDeleteDaysModalOpen] = useState(false);
  const [dayToDeleteSingle, setDayToDeleteSingle] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('ALL');

  // Discover all distinct academic levels from schedule
  const distinctLevels = useMemo(() => {
    return getDistinctLevels(papers, candidates);
  }, [papers, candidates]);

  // Filter papers by level
  const filteredPapers = useMemo(() => {
    if (levelFilter === 'ALL') return papers;
    return papers.filter((p) => getPaperLevel(p, candidates) === levelFilter);
  }, [papers, candidates, levelFilter]);

  // Group papers by date for the calendar/agenda view
  const groupedPapers = useMemo(() => {
    const groups: Record<string, ExamPaper[]> = {};
    filteredPapers.forEach((paper) => {
      if (!groups[paper.date]) {
        groups[paper.date] = [];
      }
      groups[paper.date].push(paper);
    });

    // Sort papers within each date by start time
    Object.keys(groups).forEach((date) => {
      groups[date].sort((a, b) => a.startTime.localeCompare(b.startTime));
    });

    return groups;
  }, [filteredPapers]);

  const handleOpenAdd = () => {
    setEditingPaper(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (paper: ExamPaper) => {
    setEditingPaper(paper);
    setIsModalOpen(true);
  };

  const handleTimetableUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadMessage(null);

    try {
      if (scope === 'internal') {
        const result = await parseMultipleInternalTimetableFiles(files);
        // If current papers are only unexpanded mark sheet placeholders (or empty), replace cleanly
        const isPlaceholderOnly = papers.length === 0 || papers.every((p) => !p.code.includes('/') && p.date === new Date().toISOString().split('T')[0]);
        if (isPlaceholderOnly) {
          setPapers(result.mergedPapers);
        } else {
          mergePapers(result.mergedPapers);
        }

        const allPapersNow = isPlaceholderOnly ? result.mergedPapers : useExamStore.getState().papers;
        if (candidates.length > 0) {
          const updatedCandidates = syncInternalCandidateEnrollments(candidates, allPapersNow);
          setCandidates(updatedCandidates);
        }

        const summary = result.fileReports
          .map((r) => `${r.fileName} (${r.paperCount} papers)`)
          .join('; ');

        setUploadMessage(
          `Successfully imported ${result.mergedPapers.length} internal paper(s) from ${files.length} file(s): ${summary}. Candidate enrollments synchronized.`
        );
      } else {
        const result = await parseMultipleTimetableFiles(files);
        mergePapers(result.mergedPapers);

        const summary = result.fileReports
          .map((r) => `${r.fileName} (${r.paperCount} papers)`)
          .join('; ');

        setUploadMessage(`Successfully imported ${result.mergedPapers.length} paper(s) from ${files.length} file(s): ${summary}.`);
      }
    } catch (err: any) {
      setUploadMessage(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDownloadTimetableTemplate = () => {
    const headers = [
      'Paper Code',
      'Paper Title',
      'Date',
      'Start Time',
      'Duration (Mins)',
      'Paper Type',
      'Academic Level',
      'Requires Computer',
      'Allow Combine'
    ];
    const sampleRows = [
      '6127/01,Art (Revised) Paper 1,2026-10-15,08:00,120,WRITTEN,GCE O-Level,No,No',
      '1128/01,English Language Paper 1,2026-10-19,08:00,110,WRITTEN,GCE O-Level,No,No',
      '1128/03,English Language Paper 3 (LC),2026-10-20,14:00,45,LISTENING COMPREHENSION,GCE O-Level,No,No',
      '7155/01,Computing Paper 1,2026-10-22,08:00,120,WRITTEN,GCE O-Level,Yes,No',
      '6091/03,Physics Practical Paper 3,2026-10-27,08:00,110,PRACTICAL,GCE O-Level,No,No'
    ];
    const csvContent = [headers.join(','), ...sampleRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'exam_timetable_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Stage 2: Exam Timetable & Timing Engine</h2>
            <p className="text-sm text-slate-500 mt-1">
              Configure examination schedules by uploading official SEAB PDF or spreadsheet timetables (.pdf, .xlsx, .csv). Reporting time (-30 mins) and dismissal time (+15 mins) are automatically calculated.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Master Toggle: Auto-Combine AA Venues */}
            <label
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:border-slate-400 rounded-lg cursor-pointer transition-colors shadow-xs select-none"
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

            <button
              onClick={handleDownloadTimetableTemplate}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-medium rounded-lg shadow-xs cursor-pointer transition-colors"
              title="Download sample timetable CSV template"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Sample Template</span>
            </button>

            <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-medium rounded-lg shadow-xs cursor-pointer transition-colors">
              <Files className="w-4 h-4 text-slate-500" />
              <span>{isUploading ? 'Importing...' : 'Upload Timetable (.pdf / .xlsx / .csv)'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                multiple
                onChange={handleTimetableUpload}
                className="hidden"
                disabled={isUploading}
              />
            </label>

            {papers.length > 0 && (
              <button
                onClick={() => setIsDeleteDaysModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-rose-300 hover:border-rose-400 text-rose-700 text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
                title="Select and remove specific examination dates"
              >
                <CalendarX className="w-4 h-4 text-rose-500" />
                <span>Manage / Delete Days</span>
              </button>
            )}

            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Exam Paper</span>
            </button>
          </div>
        </div>

        {uploadMessage && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 flex items-center justify-between">
            <span>{uploadMessage}</span>
            <button onClick={() => setUploadMessage(null)} className="text-emerald-600 hover:text-emerald-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

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
                onClick={() => setLevelFilter('ALL')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  levelFilter === 'ALL'
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
                    onClick={() => setLevelFilter(lvl)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      levelFilter === lvl
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

      {/* Papers List grouped by Date */}
      {Object.keys(groupedPapers).length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 shadow-sm">
          <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="font-semibold text-slate-700">No Exam Papers Scheduled</p>
          <p className="text-xs text-slate-400 mt-1">
            Upload your exam timetable (.pdf, .xlsx, .csv) above, or click "Add Exam Paper" to configure your schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedPapers).map(([date, datePapers]) => (
            <div key={date} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-slate-800 text-sm">
                    {new Date(date).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-medium">
                    {datePapers.length} {datePapers.length === 1 ? 'Paper' : 'Papers'}
                  </span>
                  <button
                    onClick={() => setDayToDeleteSingle(date)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-md transition-colors cursor-pointer"
                    title={`Delete all ${datePapers.length} papers on this date`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Day</span>
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {datePapers.map((paper) => {
                  const reportingTime = addMinutesToTime(paper.startTime, -30);
                  const dismissalTime = addMinutesToTime(paper.startTime, paper.durationMins + 15);
                  const enrolledCount = candidates.filter((c) =>
                    isCandidateEligibleForPaper(c, paper)
                  ).length;

                  return (
                    <div
                      key={paper.id}
                      className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                    >
                      {/* Left: Code, Title, Badges */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-800 font-mono font-bold text-xs rounded-md">
                            {paper.code}
                          </span>

                          <h3 className="font-bold text-slate-800 text-base">{paper.title}</h3>

                          {/* Academic Level Badge */}
                          {paper.level && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200 font-semibold">
                              <GraduationCap className="w-3 h-3" />
                              {paper.level}
                            </span>
                          )}

                          {/* Stream Badge for Internal */}
                          {paper.stream && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded border border-indigo-200 font-bold">
                              <GraduationCap className="w-3 h-3" />
                              Stream {paper.stream}
                            </span>
                          )}

                          {/* Venue Badge */}
                          {paper.venueType && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded border border-slate-200 font-medium">
                              {paper.venueType}
                            </span>
                          )}

                          {/* Archetype Badges */}
                          {paper.type === 'STANDARD' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded border border-slate-300 font-medium">
                              <FileText className="w-3 h-3" />
                              Written Standard
                            </span>
                          )}
                          {paper.type === 'SCIENCE_LAB' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded border border-purple-300 font-medium">
                              <FlaskConical className="w-3 h-3" />
                              Science Lab (Shifts)
                            </span>
                          )}
                          {paper.type === 'LISTENING_COMP' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-900 text-xs rounded border border-amber-300 font-medium">
                              <Headphones className="w-3 h-3" />
                              Listening Comprehension
                            </span>
                          )}

                          {/* Computer Badge */}
                          {paper.requiresComputer && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-800 text-xs rounded border border-sky-300 font-medium">
                              <Monitor className="w-3 h-3" />
                              Requires Computer
                            </span>
                          )}

                          {/* Combination badge */}
                          {paper.type === 'LISTENING_COMP' ? (
                            <span className="text-xs text-slate-400 italic">No Combining (Acoustic Isolation)</span>
                          ) : paper.allowCombine ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                              <Layers className="w-3 h-3" /> Can Combine
                            </span>
                          ) : null}
                        </div>

                        {/* Timing details */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                          <div className="flex items-center gap-1 text-slate-700 font-medium">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Exam: {paper.startTime} ({paper.durationMins} mins)</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">Reporting (-30m):</span>
                            <span className="font-mono text-slate-700 font-semibold">{reportingTime}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">Dismissal (+15m):</span>
                            <span className="font-mono text-slate-700 font-semibold">{dismissalTime}</span>
                          </div>
                          <div className="flex items-center gap-1 text-slate-700 font-medium ml-2">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>{enrolledCount} Candidate{enrolledCount !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 self-end md:self-center">
                        <button
                          onClick={() => handleOpenEdit(paper)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit Paper"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deletePaper(paper.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Delete Paper"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Paper Modal */}
      {isModalOpen && (
        <PaperModal
          paper={editingPaper}
          onClose={() => setIsModalOpen(false)}
          onSave={(paperData) => {
            if (editingPaper) {
              updatePaper({ ...editingPaper, ...paperData });
            } else {
              addPaper({
                id: `paper-${Date.now()}`,
                ...paperData,
              });
            }
            setIsModalOpen(false);
          }}
        />
      )}

      {/* Single Day Delete Confirm Modal */}
      {dayToDeleteSingle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-100 rounded-full">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">Delete Exam Day</h3>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete all papers scheduled on{' '}
              <strong className="text-slate-800">
                {new Date(dayToDeleteSingle).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </strong>
              ? This will remove {groupedPapers[dayToDeleteSingle]?.length || 0} paper(s).
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDayToDeleteSingle(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deletePapersByDate(dayToDeleteSingle);
                  setDayToDeleteSingle(null);
                  setUploadMessage(`Deleted exam day and associated papers.`);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Date Management Modal */}
      {isDeleteDaysModalOpen && (
        <DeleteDaysModal
          onClose={() => setIsDeleteDaysModalOpen(false)}
          groupedPapers={groupedPapers}
          candidates={candidates}
          onDeleteDates={(dates) => {
            deletePapersByDates(dates);
            setIsDeleteDaysModalOpen(false);
            setUploadMessage(`Deleted ${dates.length} exam day(s).`);
          }}
          onDeleteUnenrolled={() => {
            deleteUnenrolledPapers();
            setIsDeleteDaysModalOpen(false);
            setUploadMessage(`Pruned all exam papers with 0 enrolled candidates.`);
          }}
        />
      )}
    </div>
  );
};

interface PaperModalProps {
  paper: ExamPaper | null;
  onClose: () => void;
  onSave: (paper: Omit<ExamPaper, 'id'>) => void;
}

const PaperModal: React.FC<PaperModalProps> = ({ paper, onClose, onSave }) => {
  const [code, setCode] = useState(paper?.code ?? '');
  const [title, setTitle] = useState(paper?.title ?? '');
  const [level, setLevel] = useState(paper?.level ?? '');
  const [date, setDate] = useState(paper?.date ?? new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(paper?.startTime ?? '08:00');
  const [durationMins, setDurationMins] = useState(paper?.durationMins ?? 120);
  const [type, setType] = useState<PaperType>(paper?.type ?? 'STANDARD');
  const [requiresComputer, setRequiresComputer] = useState(paper?.requiresComputer ?? false);
  const [allowCombine, setAllowCombine] = useState(paper?.allowCombine ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !title) return;

    onSave({
      code: code.trim(),
      title: title.trim(),
      level: level.trim() || undefined,
      date,
      startTime,
      durationMins: Number(durationMins),
      type,
      requiresComputer,
      allowCombine: type === 'LISTENING_COMP' ? false : allowCombine,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-slate-800">
            {paper ? 'Edit Examination Paper' : 'Add Examination Paper'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Paper Code *
              </label>
              <input
                type="text"
                placeholder="e.g. 6127/01 or 1184/03"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Duration (Mins) *
              </label>
              <input
                type="number"
                min={15}
                max={360}
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Paper Title *
              </label>
              <input
                type="text"
                placeholder="e.g. Art (Revised) Paper 1 or English LC"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Academic Level
              </label>
              <input
                type="text"
                placeholder="e.g. GCE O-Level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Date *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Start Time (HH:mm) *
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Archetype */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Paper Archetype
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('STANDARD')}
                className={`p-2.5 text-xs font-medium rounded-lg border text-center transition-all ${
                  type === 'STANDARD'
                    ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                }`}
              >
                Standard Written
              </button>
              <button
                type="button"
                onClick={() => setType('SCIENCE_LAB')}
                className={`p-2.5 text-xs font-medium rounded-lg border text-center transition-all ${
                  type === 'SCIENCE_LAB'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                }`}
              >
                Science Lab
              </button>
              <button
                type="button"
                onClick={() => setType('LISTENING_COMP')}
                className={`p-2.5 text-xs font-medium rounded-lg border text-center transition-all ${
                  type === 'LISTENING_COMP'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                }`}
              >
                Listening Compre
              </button>
            </div>
          </div>

          {/* Requires Computer Toggle */}
          <div className="pt-2 border-t border-slate-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresComputer}
                onChange={(e) => setRequiresComputer(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-semibold text-slate-800">Requires Computer Terminals</span>
                <p className="text-xs text-slate-500">
                  Enforces allocation exclusively to venues equipped with computers / PC labs.
                </p>
              </div>
            </label>
          </div>

          {/* Allow Combining Toggle (Disabled if LC) */}
          <div className="pt-2 border-t border-slate-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                disabled={type === 'LISTENING_COMP'}
                checked={type === 'LISTENING_COMP' ? false : allowCombine}
                onChange={(e) => setAllowCombine(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 disabled:opacity-50"
              />
              <div>
                <span className="text-sm font-semibold text-slate-800">
                  Allow Combining With Other Papers in Same Venue
                </span>
                <p className="text-xs text-slate-500">
                  {type === 'LISTENING_COMP'
                    ? 'Listening Comprehension papers are strictly forbidden from sharing venues (Acoustic Isolation).'
                    : 'Allow candidates of this paper to share large venues (e.g. School Hall) with other compatible papers on the same day/slot.'}
                </p>
              </div>
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors"
            >
              Save Paper
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface DeleteDaysModalProps {
  onClose: () => void;
  groupedPapers: Record<string, ExamPaper[]>;
  candidates: Candidate[];
  onDeleteDates: (dates: string[]) => void;
  onDeleteUnenrolled: () => void;
}

const DeleteDaysModal: React.FC<DeleteDaysModalProps> = ({
  onClose,
  groupedPapers,
  candidates,
  onDeleteDates,
  onDeleteUnenrolled,
}) => {
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [filterQuery, setFilterQuery] = useState('');

  const datesList = useMemo(() => {
    return Object.entries(groupedPapers).map(([date, datePapers]) => {
      const enrolledCount = candidates.filter((c) =>
        datePapers.some((p) => isCandidateEligibleForPaper(c, p))
      ).length;
      return {
        date,
        papers: datePapers,
        enrolledCount,
      };
    });
  }, [groupedPapers, candidates]);

  const filteredDates = useMemo(() => {
    const q = filterQuery.toLowerCase().trim();
    if (!q) return datesList;
    return datesList.filter(
      (d) =>
        d.date.includes(q) ||
        d.papers.some((p) => p.code.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))
    );
  }, [datesList, filterQuery]);

  const toggleDate = (date: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedDates(new Set(filteredDates.map((d) => d.date)));
  };

  const deselectAll = () => {
    setSelectedDates(new Set());
  };

  const selectZeroCandidates = () => {
    const zeroDates = filteredDates.filter((d) => d.enrolledCount === 0).map((d) => d.date);
    setSelectedDates(new Set(zeroDates));
  };

  const totalPapersInSelection = useMemo(() => {
    return Array.from(selectedDates).reduce(
      (acc, d) => acc + (groupedPapers[d]?.length || 0),
      0
    );
  }, [selectedDates, groupedPapers]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
              <CalendarX className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Manage & Delete Exam Days</h3>
              <p className="text-xs text-slate-500">Select specific examination dates to remove from your schedule</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-white space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer"
              >
                Select All ({filteredDates.length})
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer"
              >
                Deselect All
              </button>
              <button
                type="button"
                onClick={selectZeroCandidates}
                className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md cursor-pointer"
                title="Select all dates that have 0 candidates registered in your cohort"
              >
                Select 0-Candidate Days
              </button>
            </div>

            {candidates.length > 0 && (
              <button
                type="button"
                onClick={onDeleteUnenrolled}
                className="px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md cursor-pointer"
                title="Deletes all papers across any date where 0 candidates are registered"
              >
                Prune Unenrolled Papers
              </button>
            )}
          </div>

          <input
            type="text"
            placeholder="Search dates, paper code or title..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Dates list */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100">
          {filteredDates.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No matching dates found.</p>
          ) : (
            filteredDates.map((item) => {
              const isSelected = selectedDates.has(item.date);
              const formatted = new Date(item.date).toLocaleDateString('en-SG', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });

              return (
                <div
                  key={item.date}
                  onClick={() => toggleDate(item.date)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'bg-rose-50/70 border-rose-300 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="mt-1 w-4 h-4 rounded text-rose-600 border-slate-300 focus:ring-rose-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">{formatted}</span>
                        <span className="text-[11px] font-mono text-slate-400">{item.date}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {item.papers.map((p) => (
                          <span
                            key={p.id}
                            className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200"
                          >
                            {p.code}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="text-right whitespace-nowrap">
                    <span className="text-xs font-semibold text-slate-700 block">
                      {item.papers.length} {item.papers.length === 1 ? 'Paper' : 'Papers'}
                    </span>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full inline-block mt-1 ${
                        item.enrolledCount > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {item.enrolledCount} candidate{item.enrolledCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            {selectedDates.size} day(s) selected ({totalPapersInSelection} papers)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedDates.size === 0}
              onClick={() => onDeleteDates(Array.from(selectedDates))}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected Days ({selectedDates.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
