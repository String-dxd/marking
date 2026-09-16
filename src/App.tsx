import React, { useState } from 'react';
import { useExamStore } from './store/useExamStore';
import type { TabType } from './store/useExamStore';
import { CandidateViewport } from './components/CandidateViewport';
import { TimetableManager } from './components/TimetableManager';
import { VenueManager } from './components/VenueManager';
import { AllocationViewer } from './components/AllocationViewer';
import { ReportViewer } from './components/ReportViewer';
import { 
  Users, 
  Calendar, 
  Building2, 
  Grid, 
  Printer, 
  Trash2, 
  AlertCircle,
  Award,
  GraduationCap
} from 'lucide-react';
import plexoLogo from './assets/plexo-logo.png';

export const App: React.FC = () => {
  const { 
    scope, 
    setScope, 
    activeTab, 
    setActiveTab, 
    candidates, 
    papers, 
    venues, 
    resetCurrentScope,
    clearAllData 
  } = useExamStore();
  const [showClearConfirm, setShowClearConfirm] = useState<'current' | 'all' | null>(null);

  const tabs: { id: TabType; label: string; icon: React.FC<{ className?: string }>; count?: number }[] = [
    { id: 'candidates', label: '1. Candidates & AA', icon: Users, count: candidates.length },
    { id: 'timetable', label: '2. Timetable', icon: Calendar, count: papers.length },
    { id: 'venues', label: '3. Venues Matrix', icon: Building2, count: venues.length },
    { id: 'allocation', label: '4. Seating & Swap', icon: Grid },
    { id: 'reports', label: '5. Print & Audit', icon: Printer },
  ];

  const handleConfirmClear = () => {
    if (showClearConfirm === 'all') {
      clearAllData();
    } else {
      resetCurrentScope();
    }
    setShowClearConfirm(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Application Header (Hidden in Print) */}
      <header className="no-print bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo and Scope Selector */}
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="flex items-center gap-2">
                <img
                  src={plexoLogo}
                  alt="Plexo"
                  className="h-12 sm:h-14 w-auto object-contain"
                />
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200">
                  v0.2
                </span>
              </div>

              {/* Mode Toggle Pills */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setScope('national')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    scope === 'national'
                      ? 'bg-white text-indigo-700 shadow-xs border border-indigo-100'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 border border-transparent'
                  }`}
                  title="National Examinations (SEAB O/N/A-Level format)"
                >
                  <Award className={`w-3.5 h-3.5 ${scope === 'national' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>National Exam</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${scope === 'national' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-slate-200 text-slate-500'}`}>
                    SEAB
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('internal')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    scope === 'internal'
                      ? 'bg-white text-indigo-700 shadow-xs border border-indigo-100'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 border border-transparent'
                  }`}
                  title="Internal School Examinations (MOE Mark Sheet RE_RES_090 & EOY PDF Timetables)"
                >
                  <GraduationCap className={`w-3.5 h-3.5 ${scope === 'internal' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>Internal Exam</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${scope === 'internal' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-slate-200 text-slate-500'}`}>
                    School EOY
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowClearConfirm('current')}
                title={`Clear current ${scope === 'national' ? 'National' : 'Internal'} exam dataset`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-rose-300 text-slate-600 hover:text-rose-600 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset {scope === 'national' ? 'National' : 'Internal'}</span>
              </button>
            </div>
          </div>

          {/* Navigation Stage Tabs */}
          <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto py-2 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 py-2 px-3.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-indigo-200/80 text-indigo-900' : 'bg-slate-200/70 text-slate-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'candidates' && <CandidateViewport />}
        {activeTab === 'timetable' && <TimetableManager />}
        {activeTab === 'venues' && <VenueManager />}
        {activeTab === 'allocation' && <AllocationViewer />}
        {activeTab === 'reports' && <ReportViewer />}
      </main>

      {/* Reset Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-bold text-slate-900 text-base">
                {showClearConfirm === 'all'
                  ? 'Reset Entire Workspace?'
                  : `Reset ${scope === 'national' ? 'National' : 'Internal'} Exam Data?`}
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {showClearConfirm === 'all'
                ? 'This will clear all National and Internal candidates, timetables, venues, and seating allocations from browser storage.'
                : `This will clear only the active ${scope === 'national' ? 'National Exam (SEAB)' : 'Internal School Exam'} candidates, timetable papers, and seat allocations. Your venues and other exam dataset will remain safe.`}
            </p>
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              {showClearConfirm === 'current' ? (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm('all')}
                  className="text-[11px] text-rose-600 hover:text-rose-700 underline font-medium cursor-pointer"
                >
                  Wipe entire workspace instead
                </button>
              ) : <div />}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClear}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  {showClearConfirm === 'all' ? 'Yes, Wipe Everything' : `Reset ${scope === 'national' ? 'National' : 'Internal'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
