import React, { useState, useMemo } from 'react';
import { useExamStore } from '../store/useExamStore';
import { parseMultipleCandidateFiles, parseMultipleInternalCandidateFiles } from '../services/candidateParser';
import { extractLevelNumber, getCanonicalLevelName } from '../services/allocationEngine';
import type { Candidate, AccessArrangement } from '../types';
import { 
  Upload, 
  Search, 
  Clock, 
  DoorOpen, 
  Volume2, 
  X,
  Files,
  Download,
  Layers,
  FileText,
  RotateCcw,
  Check,
  Trash2,
  AlertTriangle,
  GraduationCap
} from 'lucide-react';

export const CandidateViewport: React.FC = () => {
  const { scope, candidates, mergeCandidates, deleteCandidate, clearCandidates, saveCandidateAAConfig } = useExamStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState<Candidate | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('ALL');

  // Discover all distinct academic levels from candidates
  const distinctLevels = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((c) => {
      if (c.academicLevel) {
        const canonical = getCanonicalLevelName(c.academicLevel);
        if (canonical) set.add(canonical);
      } else if (c.classGroup) {
        const num = extractLevelNumber(c.classGroup);
        if (num !== undefined) set.add(`Secondary ${num}`);
      }
    });
    return Array.from(set).sort((a, b) => {
      const numA = extractLevelNumber(a) ?? 99;
      const numB = extractLevelNumber(b) ?? 99;
      return numA - numB;
    });
  }, [candidates]);

  // Filter candidates by level, name, index, or class
  const filteredCandidates = useMemo(() => {
    let list = candidates;
    if (levelFilter !== 'ALL') {
      list = list.filter((c) => {
        if (c.academicLevel) {
          return getCanonicalLevelName(c.academicLevel) === levelFilter;
        }
        if (c.classGroup) {
          const num = extractLevelNumber(c.classGroup);
          return num !== undefined && `Secondary ${num}` === levelFilter;
        }
        return false;
      });
    }
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.indexNumber.includes(q) ||
        (c.classGroup && c.classGroup.toLowerCase().includes(q))
    );
  }, [candidates, levelFilter, searchQuery]);

  // AA Metrics across default & paper-specific arrangements
  const stats = useMemo(() => {
    const total = candidates.length;
    let aaCount = 0;
    let extraTimeCount = 0;
    let separateRoomCount = 0;
    let frontRowPrefCount = 0;

    candidates.forEach((c) => {
      const defaultAA = c.arrangements;
      const paperAAs = c.paperArrangements ? Object.values(c.paperArrangements) : [];
      const allAAs = [defaultAA, ...paperAAs].filter(Boolean) as AccessArrangement[];

      const hasAnyAA = allAAs.some(
        (a) => (a.extraTimePct ?? 0) > 0 || a.needsSeparateRoom || a.frontSeatMobility
      );
      if (hasAnyAA) aaCount++;

      if (allAAs.some((a) => (a.extraTimePct ?? 0) > 0)) extraTimeCount++;
      if (allAAs.some((a) => a.needsSeparateRoom)) separateRoomCount++;
      if (allAAs.some((a) => a.frontSeatMobility)) frontRowPrefCount++;
    });

    return {
      total,
      standard: total - aaCount,
      aaCount,
      extraTimeCount,
      separateRoomCount,
      frontRowPrefCount,
    };
  }, [candidates]);

  // Handle multi-file drop / upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadMessage(null);

    try {
      if (scope === 'internal') {
        const result = await parseMultipleInternalCandidateFiles(files);
        mergeCandidates(result.mergedCandidates);

        const fileSummary = result.fileReports
          .map((r) => `${r.fileName} (${r.candidateCount} students, ${r.subjectCount} subjects)`)
          .join('; ');

        setUploadMessage(
          `Successfully processed ${files.length} internal mark sheet file(s): ${fileSummary}. Total ${result.mergedCandidates.length} students loaded across ${result.discoveredSubjects.length} subjects.`
        );
      } else {
        const result = await parseMultipleCandidateFiles(files);
        mergeCandidates(result.mergedCandidates);

        const fileSummary = result.fileReports
          .map((r) => `${r.fileName} (${r.candidateCount} candidates, ${r.format})`)
          .join('; ');

        setUploadMessage(
          `Successfully processed ${files.length} file(s): ${fileSummary}. Candidates merged cleanly (NRIC/FIN discarded; 4-digit Index IDs retained).`
        );
      }
    } catch (err: any) {
      setUploadMessage(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDownloadCandidateTemplate = () => {
    if (scope === 'internal') {
      const csvContent = [
        '# MOE School Cockpit Component Mark Sheet (Report ID: RE_RES_090) Guidance',
        '# Export directly from School Cockpit -> Results -> Component Mark Sheet for Primary and Secondary Schools (.xlsx)',
        '# Plexo will automatically parse tables across all sheets and extract students by Class, Reg#, Name, and Subject.',
        'Reg#,Name,Sex,Form Teacher,Class,Teaching Group,CMT,Weightings:,EL - G3',
        ',,,,,,,,Term 1 WA - 1',
        '1,ALICE WONG KAI XIN,F,HASLINDA BINTE JAAFAR,1 DILIGENCE,1J31_MARYAM,M,NOT APPLICABLE,75',
        '2,BRYAN TAN WEI MING,M,HASLINDA BINTE JAAFAR,1 DILIGENCE,1J31_MARYAM,M,NOT APPLICABLE,68',
        'Reg#,Name,Sex,Form Teacher,Class,Teaching Group,CMT,Weightings:,Maths - G2',
        ',,,,,,,,Term 1 WA - 1',
        '1,ALICE WONG KAI XIN,F,HASLINDA BINTE JAAFAR,1 DILIGENCE,1M21_LEE,M,NOT APPLICABLE,82',
      ].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Sample_Internal_Mark_Sheet_Template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const headers = [
      'Academic Level',
      'NRIC/FIN',
      'Statutory Name',
      'School Name',
      'Index No.',
      'Subject Code',
      'Subject Name',
      'Paper No',
      'Mode of Assessment',
      'Exam Series',
      'Posted School Code',
      'Posted School Name',
      'Posted Exam Centre Code'
    ];
    const sampleRows = [
      'SECONDARY 4,T1072222A,DENISSE VOO XIAO YOU,CANBERRA SECONDARY SCHOOL,15550005,6127,ART (REVISED),01,WRITTEN,YEAR-END,3621,CANBERRA SECONDARY SCHOOL,1555',
      'SECONDARY 4,T1083333B,BRYAN TAN WEI MING,CANBERRA SECONDARY SCHOOL,15550006,6127,ART (REVISED),01,WRITTEN,YEAR-END,3621,CANBERRA SECONDARY SCHOOL,1555',
      'SECONDARY 4,T1094444C,CHLOE LIM JIA EN,CANBERRA SECONDARY SCHOOL,15550007,1128,ENGLISH LANGUAGE,01,WRITTEN,YEAR-END,3621,CANBERRA SECONDARY SCHOOL,1555',
      'SECONDARY 4,T1094444C,CHLOE LIM JIA EN,CANBERRA SECONDARY SCHOOL,15550007,1128,ENGLISH LANGUAGE,03,LISTENING COMPREHENSION,YEAR-END,3621,CANBERRA SECONDARY SCHOOL,1555'
    ];
    const csvContent = [headers.join(','), ...sampleRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'candidate_list_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveAA = (
    defaultAA?: AccessArrangement,
    paperArrangements?: Record<string, AccessArrangement>
  ) => {
    if (!editingCandidate) return;
    saveCandidateAAConfig(editingCandidate.id, defaultAA, paperArrangements);
    setEditingCandidate(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Ingestion Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Stage 1: Candidate Directory & AA Registry</h2>
            <p className="text-sm text-slate-500 mt-1">
              Upload single or multiple SEAB candidate registration lists (multi-file supported). NRIC/FIN is discarded; last 4 digits of Index No. serve as Candidate ID.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleDownloadCandidateTemplate}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Download sample SEAB candidate CSV template"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Sample Template</span>
            </button>

            {candidates.length > 0 && (
              <button
                onClick={() => setIsPurgeModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-rose-300 hover:border-rose-400 text-rose-700 text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
                title="Purge all candidate records and associated allocations from current scope"
              >
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span>Purge Candidates</span>
              </button>
            )}

            <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg cursor-pointer shadow-sm transition-colors">
              <Files className="w-4 h-4" />
              <span>{isUploading ? 'Parsing...' : 'Upload Files (.xlsx / .csv)'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
            </label>
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
                All Levels ({candidates.length} candidates)
              </button>

              {distinctLevels.map((lvl) => {
                const count = candidates.filter((c) => {
                  if (c.academicLevel) return getCanonicalLevelName(c.academicLevel) === lvl;
                  if (c.classGroup) {
                    const num = extractLevelNumber(c.classGroup);
                    return num !== undefined && `Secondary ${num}` === lvl;
                  }
                  return false;
                }).length;

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

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Candidates</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
          <p className="text-xs text-slate-400 mt-1">Ingested cohort</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Standard Cohort</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{stats.standard}</p>
          <p className="text-xs text-slate-400 mt-1">Main hall / classroom</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Total AA Flagged</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">{stats.aaCount}</p>
          <p className="text-xs text-amber-600 mt-1">Access arrangements</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Extra Time</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{stats.extraTimeCount}</p>
          <p className="text-xs text-slate-400 mt-1">+15%, +25%, or +50%</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Separate Room</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{stats.separateRoomCount}</p>
          <p className="text-xs text-slate-400 mt-1">Segregated room (except LC)</p>
        </div>
      </div>

      {/* Candidate Viewport & Search */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Search toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                scope === 'internal'
                  ? 'Search candidate by name, register number, or class...'
                  : 'Search candidate by name or 4-digit index...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing {filteredCandidates.length} of {candidates.length} candidates ({scope === 'internal' ? 'Internal School' : 'National SEAB'})
          </div>
        </div>

        {/* Candidate Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-100/75 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">
                  {scope === 'internal' ? 'Class & Reg #' : 'Index No (ID)'}
                </th>
                <th className="px-4 py-3">
                  {scope === 'internal' ? 'Student Name' : 'Statutory Name'}
                </th>
                <th className="px-4 py-3">
                  {scope === 'internal' ? 'Form Teacher / Sex' : 'Level'}
                </th>
                <th className="px-4 py-3">
                  {scope === 'internal' ? 'Enrolled Subjects' : 'Registered Papers'}
                </th>
                <th className="px-4 py-3">Access Arrangements (AA)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    {candidates.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Upload className="w-8 h-8 text-slate-300" />
                        <p className="font-medium text-slate-600">No candidates uploaded yet</p>
                        <p className="text-xs text-slate-400">
                          {scope === 'internal'
                            ? 'Upload your MOE Component Mark Sheet (.xlsx) above to begin.'
                            : 'Upload your SEAB candidate spreadsheet (.xlsx / .csv) above to begin.'}
                        </p>
                      </div>
                    ) : (
                      'No candidates match your search query.'
                    )}
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((cand) => {
                  const defaultAA = cand.arrangements;
                  const hasDefaultAA = Boolean(
                    defaultAA &&
                      ((defaultAA.extraTimePct ?? 0) > 0 ||
                        defaultAA.needsSeparateRoom ||
                        defaultAA.frontSeatMobility)
                  );
                  const paperArrEntries = Object.entries(cand.paperArrangements || {}).filter(
                    ([, arr]) =>
                      (arr.extraTimePct ?? 0) > 0 || arr.needsSeparateRoom || arr.frontSeatMobility
                  );
                  const hasCustomPapers = paperArrEntries.length > 0;
                  const hasAnyAA = hasDefaultAA || hasCustomPapers;

                  return (
                    <tr key={cand.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono">
                        {scope === 'internal' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-xs">
                              {cand.classGroup || 'Class'}
                            </span>
                            <span className="font-bold text-indigo-700 text-xs">
                              #{cand.indexNumber}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-slate-900">{cand.indexNumber}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {cand.fullName}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {scope === 'internal' ? (
                          <div>
                            <div>{cand.formTeacher || '—'}</div>
                            {cand.gender && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                                Sex: {cand.gender}
                              </span>
                            )}
                          </div>
                        ) : (
                          cand.academicLevel || '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {cand.subjectCodes.map((code) => {
                            const isCustom = Boolean(cand.paperArrangements?.[code]);
                            return (
                              <span
                                key={code}
                                className={`px-2 py-0.5 border text-xs rounded font-mono ${
                                  isCustom
                                    ? 'bg-purple-50 border-purple-200 text-purple-700 font-semibold'
                                    : 'bg-slate-100 border-slate-200 text-slate-700'
                                }`}
                                title={isCustom ? `Custom AA configured for ${code}` : undefined}
                              >
                                {code}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {hasAnyAA ? (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {hasDefaultAA && (
                              <div className="flex items-center gap-1">
                                {(defaultAA?.extraTimePct ?? 0) > 0 && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-xs rounded font-medium">
                                    <Clock className="w-3 h-3" />
                                    +{defaultAA?.extraTimePct}%
                                  </span>
                                )}
                                {defaultAA?.needsSeparateRoom && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 text-xs rounded font-medium">
                                    <DoorOpen className="w-3 h-3" />
                                    Sep Room
                                  </span>
                                )}
                                {defaultAA?.frontSeatMobility && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-800 border border-sky-300 text-xs rounded font-medium">
                                    <Volume2 className="w-3 h-3" />
                                    Front Row
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Paper-specific override tags */}
                            {paperArrEntries.map(([code, arr]) => (
                              <span
                                key={code}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-300 text-xs rounded font-medium"
                                title={`Paper-specific AA for ${code}`}
                              >
                                <span className="font-mono font-bold">{code}:</span>
                                {[
                                  (arr.extraTimePct ?? 0) > 0 ? `+${arr.extraTimePct}%` : null,
                                  arr.needsSeparateRoom ? 'Sep' : null,
                                  arr.frontSeatMobility ? 'Front' : null,
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Standard</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingCandidate(cand)}
                            className={`px-3 py-1 border text-xs font-medium rounded-md shadow-xs transition-colors cursor-pointer ${
                              hasAnyAA
                                ? 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100'
                                : 'bg-white border-slate-300 hover:border-indigo-500 text-slate-700 hover:text-indigo-600'
                            }`}
                          >
                            {hasAnyAA ? 'Edit AA' : '+ Add AA'}
                          </button>
                          <button
                            onClick={() => setCandidateToDelete(cand)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            title="Delete candidate record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Purge All Candidates Modal */}
      {isPurgeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-100 rounded-full">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">Purge Candidate Directory</h3>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete all <strong className="text-slate-800">{candidates.length} candidate(s)</strong> from the{' '}
              <span className="font-semibold text-slate-700">{scope === 'internal' ? 'Internal School' : 'National SEAB'}</span> scope?
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>This will also clear all active candidate seating allocations and access arrangements for this cohort.</span>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPurgeModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const count = candidates.length;
                  clearCandidates();
                  setIsPurgeModalOpen(false);
                  setUploadMessage(`Successfully purged all ${count} candidate record(s) and reset seating allocations.`);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Confirm Purge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Candidate Modal */}
      {candidateToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-100 rounded-full">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">Delete Candidate</h3>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to remove candidate <strong className="text-slate-800">{candidateToDelete.fullName}</strong> ({candidateToDelete.classGroup ? `${candidateToDelete.classGroup} #${candidateToDelete.indexNumber}` : `Index ${candidateToDelete.indexNumber}`})?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCandidateToDelete(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCandidate(candidateToDelete.id);
                  setUploadMessage(`Removed candidate ${candidateToDelete.fullName}.`);
                  setCandidateToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Delete Candidate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AA Modal / Drawer */}
      {editingCandidate && (
        <AAModal
          candidate={editingCandidate}
          onClose={() => setEditingCandidate(null)}
          onSave={handleSaveAA}
        />
      )}
    </div>
  );
};

interface AAModalProps {
  candidate: Candidate;
  onClose: () => void;
  onSave: (
    defaultAA?: AccessArrangement,
    paperArrangements?: Record<string, AccessArrangement>
  ) => void;
}

const AAModal: React.FC<AAModalProps> = ({ candidate, onClose, onSave }) => {
  // Candidate's default AA
  const [defaultAA, setDefaultAA] = useState<AccessArrangement>({
    extraTimePct: candidate.arrangements?.extraTimePct ?? 0,
    needsSeparateRoom: candidate.arrangements?.needsSeparateRoom ?? false,
    frontSeatMobility: candidate.arrangements?.frontSeatMobility ?? false,
    remarks: candidate.arrangements?.remarks ?? '',
  });

  // Candidate's paper-specific overrides
  const [paperArrangements, setPaperArrangements] = useState<Record<string, AccessArrangement>>(
    candidate.paperArrangements ? { ...candidate.paperArrangements } : {}
  );

  // Active tab: '__default__' or a paperCode
  const [activeTab, setActiveTab] = useState<string>('__default__');
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const registeredPapers = candidate.subjectCodes;

  // Active arrangement being edited
  const isDefaultTab = activeTab === '__default__';
  const isPaperCustomized = !isDefaultTab && Boolean(paperArrangements[activeTab]);

  const currentArrangement: AccessArrangement = isDefaultTab
    ? defaultAA
    : paperArrangements[activeTab] || defaultAA;

  const handleUpdateCurrent = (updates: Partial<AccessArrangement>) => {
    if (isDefaultTab) {
      setDefaultAA((prev) => ({ ...prev, ...updates }));
    } else {
      setPaperArrangements((prev) => {
        const base = prev[activeTab] || { ...defaultAA };
        return {
          ...prev,
          [activeTab]: {
            ...base,
            ...updates,
          },
        };
      });
    }
  };

  const handleEnableCustomForPaper = (paperCode: string) => {
    setPaperArrangements((prev) => ({
      ...prev,
      [paperCode]: { ...defaultAA },
    }));
    setFeedbackNotice(`Custom settings enabled for ${paperCode}`);
    setTimeout(() => setFeedbackNotice(null), 2500);
  };

  const handleResetPaperToDefault = (paperCode: string) => {
    setPaperArrangements((prev) => {
      const next = { ...prev };
      delete next[paperCode];
      return next;
    });
    setFeedbackNotice(`Reset ${paperCode} to inherit default arrangements`);
    setTimeout(() => setFeedbackNotice(null), 2500);
  };

  const handleApplyDefaultToAll = () => {
    setPaperArrangements({});
    setFeedbackNotice('All registered papers now follow Default Accommodation');
    setTimeout(() => setFeedbackNotice(null), 2500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Clean up empty arrangements
    const cleanDefault =
      defaultAA.extraTimePct > 0 ||
      defaultAA.needsSeparateRoom ||
      defaultAA.frontSeatMobility ||
      defaultAA.remarks?.trim()
        ? defaultAA
        : undefined;

    const cleanPapers: Record<string, AccessArrangement> = {};
    Object.entries(paperArrangements).forEach(([code, arr]) => {
      if (
        arr.extraTimePct > 0 ||
        arr.needsSeparateRoom ||
        arr.frontSeatMobility ||
        arr.remarks?.trim()
      ) {
        cleanPapers[code] = arr;
      }
    });

    onSave(
      cleanDefault,
      Object.keys(cleanPapers).length > 0 ? cleanPapers : undefined
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800">Access Arrangement (AA) Configuration</h3>
              <span className="text-[11px] font-semibold uppercase px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
                Subject & Paper Granular
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Candidate: <span className="font-mono font-bold text-slate-800">{candidate.indexNumber}</span> •{' '}
              <strong className="text-slate-700">{candidate.fullName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation: Default vs Individual Papers */}
        <div className="border-b border-slate-200 bg-slate-100/80 px-4 pt-2.5 flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('__default__')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-t-lg border-t border-l border-r transition-all cursor-pointer whitespace-nowrap ${
              isDefaultTab
                ? 'bg-white text-indigo-700 border-slate-200 -mb-px shadow-xs'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>All Papers (Default)</span>
          </button>

          {registeredPapers.map((paperCode) => {
            const hasCustom = Boolean(paperArrangements[paperCode]);
            const isTabActive = activeTab === paperCode;
            return (
              <button
                key={paperCode}
                type="button"
                onClick={() => setActiveTab(paperCode)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-t border-l border-r transition-all cursor-pointer whitespace-nowrap ${
                  isTabActive
                    ? 'bg-white text-indigo-700 border-slate-200 -mb-px shadow-xs'
                    : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono">{paperCode}</span>
                {hasCustom && (
                  <span className="w-2 h-2 rounded-full bg-purple-600" title="Custom arrangement active" />
                )}
              </button>
            );
          })}
        </div>

        {/* Notice banner if action performed */}
        {feedbackNotice && (
          <div className="px-5 py-2 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-700 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            <span>{feedbackNotice}</span>
          </div>
        )}

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Tab Subtitle & Inheritance Controls */}
          {isDefaultTab ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">Default Accommodation Policy</p>
                <p className="text-slate-500 mt-0.5">
                  Applied to all papers unless individually customized in the tabs above.
                </p>
              </div>
              <button
                type="button"
                onClick={handleApplyDefaultToAll}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 hover:border-indigo-500 text-slate-700 hover:text-indigo-600 rounded text-xs font-medium cursor-pointer shadow-xs transition-colors"
                title="Clear any paper overrides and enforce this default for all registered papers"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Apply to All (Reset Overrides)</span>
              </button>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800">
                    Configuration for Paper <span className="font-mono text-indigo-700">{activeTab}</span>
                  </span>
                  <p className="text-slate-500 mt-0.5">
                    {isPaperCustomized
                      ? 'Custom settings override the default accommodation for this specific paper.'
                      : 'Currently inheriting default accommodation.'}
                  </p>
                </div>

                {isPaperCustomized ? (
                  <button
                    type="button"
                    onClick={() => handleResetPaperToDefault(activeTab)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-amber-300 hover:bg-amber-50 text-amber-700 rounded text-xs font-medium cursor-pointer shadow-xs transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset to Default</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleEnableCustomForPaper(activeTab)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium cursor-pointer shadow-xs transition-colors"
                  >
                    <span>+ Customize for {activeTab}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Form Fields container - disabled / dim if inheriting on paper tab */}
          <div className={!isDefaultTab && !isPaperCustomized ? 'opacity-60 pointer-events-none' : ''}>
            {/* Extra Time Allowance */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Extra Time Allowance
                </label>
                {!isDefaultTab && !isPaperCustomized && (
                  <span className="text-[11px] text-slate-500 italic">Inheriting default</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[0, 15, 25, 50].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleUpdateCurrent({ extraTimePct: pct })}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      currentArrangement.extraTimePct === pct
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                        : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {pct === 0 ? 'None (0%)' : `+${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Separate Room Toggle */}
            <div className="pt-3 mt-3 border-t border-slate-200">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(currentArrangement.needsSeparateRoom)}
                  onChange={(e) => handleUpdateCurrent({ needsSeparateRoom: e.target.checked })}
                  className="mt-1 w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-800">Requires Separate Room</span>
                  <p className="text-xs text-slate-500">
                    Allocates candidate into an AA-designated quiet venue for written exams (automatically rejoins main cohort for Listening Comprehension).
                  </p>
                </div>
              </label>
            </div>

            {/* Preferential Front-Row Seating Toggle */}
            <div className="pt-3 mt-3 border-t border-slate-200">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(currentArrangement.frontSeatMobility)}
                  onChange={(e) => handleUpdateCurrent({ frontSeatMobility: e.target.checked })}
                  className="mt-1 w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-800">Preferential / Front-Row Seating</span>
                  <p className="text-xs text-slate-500">
                    Places student in Row 1 nearest the audio playback source for Listening Comprehension, or near room exit for mobility accommodations.
                  </p>
                </div>
              </label>
            </div>

            {/* Accommodation Remarks */}
            <div className="pt-3 mt-3 border-t border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Accommodation Remarks {!isDefaultTab ? `(${activeTab})` : ''}
              </label>
              <input
                type="text"
                placeholder="e.g. Needs large print script, hearing aid, diabetic kit"
                value={currentArrangement.remarks || ''}
                onChange={(e) => handleUpdateCurrent({ remarks: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {Object.keys(paperArrangements).length > 0 ? (
                <span className="text-purple-700 font-medium">
                  {Object.keys(paperArrangements).length} custom paper override(s) active
                </span>
              ) : (
                <span>All papers following default policy</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Save Arrangements
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
