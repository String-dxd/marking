import React, { useState, useMemo } from 'react';
import { useExamStore } from '../store/useExamStore';
import type { Venue } from '../types';
import {
  parseMultipleVenueFiles,
  generateSampleVenueCsv,
  generateSampleVenueXlsxBlob,
  exportVenuesToCsv,
  exportVenuesToXlsxBlob,
  generateInitialSeatGrid,
} from '../services/venueParser';
import {
  Building2,
  Plus,
  Monitor,
  Headphones,
  FlaskConical,
  ShieldCheck,
  Trash2,
  Edit3,
  X,
  Ban,
  Download,
  Upload,
  Files,
  Copy,
  Search,
  Check,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';

export const VenueManager: React.FC = () => {
  const { 
    venues, 
    autoCombineAaVenues, 
    setAutoCombineAaVenues, 
    addVenue, 
    mergeVenues, 
    updateVenue, 
    deleteVenue 
  } = useExamStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'computer' | 'science' | 'audio' | 'aa'>('all');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  // Filtered venues based on search query and category filters
  const filteredVenues = useMemo(() => {
    return venues.filter((v) => {
      const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      if (!matchesSearch) return false;

      if (filterType === 'computer') return v.hasComputers;
      if (filterType === 'science') return v.isLab;
      if (filterType === 'audio') return v.hasAudio;
      if (filterType === 'aa') return v.isAaDesignated;
      return true;
    });
  }, [venues, searchQuery, filterType]);

  // Venue summary statistics
  const stats = useMemo(() => {
    const totalVenues = venues.length;
    let totalDesks = 0;
    let activeDesks = 0;
    let computerLabs = 0;
    let totalComputerStations = 0;
    let scienceLabs = 0;
    let aaRooms = 0;

    venues.forEach((v) => {
      const venueTotal = v.rows * v.cols;
      const venueActive = v.seatGrid.flat().filter((s) => s.isActive).length;
      totalDesks += venueTotal;
      activeDesks += venueActive;

      if (v.hasComputers) {
        computerLabs++;
        totalComputerStations += v.computerStations || 0;
      }
      if (v.isLab) scienceLabs++;
      if (v.isAaDesignated) aaRooms++;
    });

    return {
      totalVenues,
      totalDesks,
      activeDesks,
      disabledDesks: totalDesks - activeDesks,
      computerLabs,
      totalComputerStations,
      scienceLabs,
      aaRooms,
    };
  }, [venues]);

  const handleOpenAdd = () => {
    setEditingVenue(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (venue: Venue) => {
    setEditingVenue(venue);
    setIsModalOpen(true);
  };

  const handleCloneVenue = (venue: Venue) => {
    const clonedName = `${venue.name} (Copy)`;
    const newGrid = venue.seatGrid.map((rowArr) =>
      rowArr.map((seat) => ({ ...seat }))
    );

    addVenue({
      ...venue,
      id: `venue-${crypto.randomUUID()}`,
      name: clonedName,
      seatGrid: newGrid,
    });

    setUploadMessage({
      type: 'success',
      text: `Cloned "${venue.name}" into "${clonedName}" with identical layout and capabilities.`,
    });
  };

  // Toggle seat active status in matrix
  const handleToggleSeatActive = (venueId: string, r: number, c: number) => {
    const venue = venues.find((v) => v.id === venueId);
    if (!venue) return;

    const newGrid = venue.seatGrid.map((rowArr, rowIdx) =>
      rowArr.map((seat, colIdx) => {
        if (rowIdx === r && colIdx === c) {
          return { ...seat, isActive: !seat.isActive };
        }
        return seat;
      })
    );

    updateVenue({ ...venue, seatGrid: newGrid });
  };

  // Handle template file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadMessage(null);

    try {
      const result = await parseMultipleVenueFiles(files);
      if (result.mergedVenues.length === 0) {
        throw new Error('No valid venues found in the uploaded file(s).');
      }

      mergeVenues(result.mergedVenues);

      const totalCap = result.mergedVenues.reduce(
        (acc, v) => acc + v.seatGrid.flat().filter((s) => s.isActive).length,
        0
      );
      const pcCount = result.mergedVenues.reduce((acc, v) => acc + (v.computerStations || 0), 0);
      const sciCount = result.mergedVenues.filter((v) => v.isLab).length;
      const aaCount = result.mergedVenues.filter((v) => v.isAaDesignated).length;

      const summaryDetails = [
        `${totalCap} active desks`,
        pcCount > 0 ? `${pcCount} PC stations` : null,
        sciCount > 0 ? `${sciCount} science labs` : null,
        aaCount > 0 ? `${aaCount} AA rooms` : null,
      ]
        .filter(Boolean)
        .join(', ');

      const fileList = result.fileReports
        .map((r) => `${r.fileName} (${r.venueCount} venues)`)
        .join('; ');

      setUploadMessage({
        type: 'success',
        text: `Successfully imported ${result.mergedVenues.length} venue(s) from ${files.length} file(s) [${fileList}]: ${summaryDetails}.`,
      });
    } catch (err: any) {
      setUploadMessage({
        type: 'error',
        text: `Upload error: ${err.message}`,
      });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Download Sample Template (CSV)
  const handleDownloadSampleCsv = () => {
    const csvContent = generateSampleVenueCsv();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'exam_venues_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowTemplateMenu(false);
  };

  // Download Sample Template (XLSX)
  const handleDownloadSampleXlsx = () => {
    const blob = generateSampleVenueXlsxBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'exam_venues_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowTemplateMenu(false);
  };

  // Export Venues to CSV
  const handleExportCsv = () => {
    if (venues.length === 0) return;
    const csvContent = exportVenuesToCsv(venues);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'configured_exam_venues.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  // Export Venues to XLSX
  const handleExportXlsx = () => {
    if (venues.length === 0) return;
    const blob = exportVenuesToXlsxBlob(venues);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'configured_exam_venues.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Ingestion Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Stage 3: Examination Venues Matrix & Floorplan Designer
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Configure examination halls, classrooms, science laboratories, and computer labs. Upload spreadsheet templates (.xlsx / .csv), download sample formats, or customize desk floorplans interactively.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 relative">
            {/* Sample Template Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowTemplateMenu(!showTemplateMenu);
                  setShowExportMenu(false);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
                title="Download sample venue templates"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Sample Template</span>
              </button>

              {showTemplateMenu && (
                <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Download Template
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>CSV Format (.csv)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSampleXlsx}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                    <span>Excel Workbook (.xlsx)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Template File Upload Button */}
            <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg cursor-pointer shadow-sm transition-colors">
              <Files className="w-4 h-4" />
              <span>{isUploading ? 'Importing Venues...' : 'Upload Template (.xlsx / .csv)'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
            </label>

            {/* Export Dropdown */}
            {venues.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(!showExportMenu);
                    setShowTemplateMenu(false);
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
                  title="Export current venue setups"
                >
                  <Upload className="w-4 h-4 text-slate-500 rotate-180" />
                  <span>Export</span>
                </button>

                {showExportMenu && (
                  <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5 animate-in fade-in zoom-in-95">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Export Configured Venues
                    </div>
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span>Export as CSV (.csv)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportXlsx}
                      className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                      <span>Export as Excel (.xlsx)</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Add Venue Manual Button */}
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Venue</span>
            </button>
          </div>
        </div>

        {/* Upload feedback banner */}
        {uploadMessage && (
          <div
            className={`mt-4 p-3.5 rounded-lg text-sm flex items-center justify-between border ${
              uploadMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {uploadMessage.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{uploadMessage.text}</span>
            </div>
            <button
              onClick={() => setUploadMessage(null)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Venues</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalVenues}</p>
          <p className="text-xs text-slate-400 mt-1">Halls & Classrooms</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Capacity</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{stats.activeDesks}</p>
          <p className="text-xs text-slate-400 mt-1">
            {stats.disabledDesks > 0 ? `${stats.disabledDesks} disabled pillars/aisles` : 'All desks active'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-sky-700 uppercase tracking-wider">Computer Labs</p>
          <p className="text-2xl font-bold text-sky-800 mt-1">{stats.computerLabs}</p>
          <p className="text-xs text-slate-400 mt-1">{stats.totalComputerStations} PC stations available</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Science Labs</p>
          <p className="text-2xl font-bold text-purple-800 mt-1">{stats.scienceLabs}</p>
          <p className="text-xs text-slate-400 mt-1">Practical shifts enabled</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">AA Quiet Rooms</p>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase ${
                  autoCombineAaVenues
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-200 text-slate-600 border border-slate-300'
                }`}
              >
                Auto-Combine {autoCombineAaVenues ? 'ON' : 'OFF'}
              </span>
            </div>
            <p className="text-2xl font-bold text-rose-800 mt-1">{stats.aaRooms}</p>
          </div>
          <label className="mt-2 flex items-center gap-1.5 cursor-pointer text-xs text-slate-500 hover:text-slate-800 select-none pt-1 border-t border-slate-100">
            <input
              type="checkbox"
              checked={autoCombineAaVenues}
              onChange={(e) => setAutoCombineAaVenues(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-[11px] font-medium text-slate-600">Auto-combine AA rooms</span>
          </label>
        </div>
      </div>

      {/* Venues Explorer & Search/Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Search & Filter bar */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search venue name (e.g. Hall, Lab 1, 4-1)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              All ({venues.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('computer')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filterType === 'computer'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Computer Labs ({stats.computerLabs})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('science')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filterType === 'science'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Science Labs ({stats.scienceLabs})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('aa')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filterType === 'aa'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>AA Rooms ({stats.aaRooms})</span>
            </button>
          </div>
        </div>

        {/* Venues Grid Cards */}
        {filteredVenues.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            {venues.length === 0 ? (
              <>
                <p className="font-semibold text-slate-700">No Exam Venues Configured</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Click <strong>"Upload Template (.xlsx / .csv)"</strong> above to batch import your school rooms, or download the <strong>"Sample Template"</strong> to start.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    onClick={handleDownloadSampleCsv}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Sample Template (.csv)</span>
                  </button>
                </div>
              </>
            ) : (
              <p className="font-medium text-slate-600">No venues match the selected search or filter.</p>
            )}
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6 bg-slate-50/30">
            {filteredVenues.map((venue) => {
              const totalDesks = venue.rows * venue.cols;
              const activeDesks = venue.seatGrid.flat().filter((s) => s.isActive).length;
              const inactiveDesks = totalDesks - activeDesks;

              return (
                <div
                  key={venue.id}
                  className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-colors"
                >
                  {/* Venue Card Header */}
                  <div className="p-5 border-b border-slate-200 bg-slate-50/60">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-base">{venue.name}</h3>
                          <span className="font-mono text-xs text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded font-semibold">
                            {venue.rows}R × {venue.cols}C
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {venue.hasComputers && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-800 text-xs rounded border border-sky-300 font-semibold">
                              <Monitor className="w-3 h-3" />
                              Computer Lab ({venue.computerStations} Stations)
                            </span>
                          )}
                          {venue.isLab && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded border border-purple-300 font-medium">
                              <FlaskConical className="w-3 h-3" />
                              Science Lab
                            </span>
                          )}
                          {venue.hasAudio && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded border border-amber-300 font-medium">
                              <Headphones className="w-3 h-3" />
                              Audio / LC Equipped
                            </span>
                          )}
                          {venue.isAaDesignated && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-800 text-xs rounded border border-rose-300 font-medium">
                              <ShieldCheck className="w-3 h-3" />
                              Designated AA Room
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCloneVenue(venue)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Clone / Duplicate Venue"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(venue)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Venue"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteVenue(venue.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Delete Venue"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Summary counts */}
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
                      <div>
                        <span className="text-slate-400">Active Capacity: </span>
                        <strong className="text-slate-800 font-semibold">{activeDesks} desks</strong>
                      </div>
                      {inactiveDesks > 0 && (
                        <div>
                          <span className="text-slate-400">Disabled (Pillars/Aisles): </span>
                          <strong className="text-slate-500 font-semibold">{inactiveDesks}</strong>
                        </div>
                      )}
                      <span className="text-xs text-slate-400 italic ml-auto hidden sm:inline">
                        Click desk to toggle active / aisle
                      </span>
                    </div>
                  </div>

                  {/* Visual Desk Matrix */}
                  <div className="p-5 overflow-x-auto bg-slate-50/20">
                    <div className="text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 border-b border-dashed border-slate-300 pb-1">
                      ▲ FRONT OF ROOM (WHITEBOARD / AUDIO SPEAKER) ▲
                    </div>

                    <div
                      className="grid gap-1.5 mx-auto justify-center"
                      style={{
                        gridTemplateColumns: `repeat(${venue.cols}, minmax(42px, 1fr))`,
                        maxWidth: `${venue.cols * 64}px`,
                      }}
                    >
                      {venue.seatGrid.map((rowArr, r) =>
                        rowArr.map((seat, c) => (
                          <button
                            key={`${r}-${c}`}
                            type="button"
                            onClick={() => handleToggleSeatActive(venue.id, r, c)}
                            title={
                              seat.isActive
                                ? `${seat.seatLabel} (Active)${seat.hasComputer ? ' - PC Station' : ''}`
                                : `${seat.seatLabel} (Disabled Pillar/Aisle)`
                            }
                            className={`h-11 rounded-lg border text-[10px] font-mono flex flex-col items-center justify-center p-1 transition-all cursor-pointer select-none ${
                              seat.isActive
                                ? seat.hasComputer
                                  ? 'bg-sky-50 border-sky-300 text-sky-800 hover:border-sky-400 shadow-xs'
                                  : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-400 shadow-xs'
                                : 'bg-slate-100 border-dashed border-slate-200 text-slate-300'
                            }`}
                          >
                            {seat.isActive ? (
                              <>
                                <span className="font-bold leading-none">{seat.seatLabel}</span>
                                {seat.hasComputer && (
                                  <Monitor className="w-3 h-3 text-sky-600 mt-0.5" />
                                )}
                              </>
                            ) : (
                              <Ban className="w-3.5 h-3.5 text-slate-300" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <VenueModal
          venue={editingVenue}
          onClose={() => setIsModalOpen(false)}
          onSave={(venueData) => {
            if (editingVenue) {
              const sizeChanged =
                venueData.rows !== editingVenue.rows || venueData.cols !== editingVenue.cols;
              const seatGrid = sizeChanged
                ? generateInitialSeatGrid(
                    venueData.rows,
                    venueData.cols,
                    venueData.hasComputers,
                    venueData.computerStations
                  )
                : editingVenue.seatGrid;

              updateVenue({
                ...editingVenue,
                ...venueData,
                seatGrid,
              });
            } else {
              const seatGrid = generateInitialSeatGrid(
                venueData.rows,
                venueData.cols,
                venueData.hasComputers,
                venueData.computerStations
              );
              addVenue({
                id: `venue-${Date.now()}`,
                ...venueData,
                seatGrid,
              });
            }
            setIsModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

interface VenueModalProps {
  venue: Venue | null;
  onClose: () => void;
  onSave: (venue: Omit<Venue, 'id' | 'seatGrid'>) => void;
}

const VenueModal: React.FC<VenueModalProps> = ({ venue, onClose, onSave }) => {
  const [name, setName] = useState(venue?.name ?? '');
  const [rows, setRows] = useState(venue?.rows ?? 6);
  const [cols, setCols] = useState(venue?.cols ?? 5);
  const [isLab, setIsLab] = useState(venue?.isLab ?? false);
  const [hasAudio, setHasAudio] = useState(venue?.hasAudio ?? true);
  const [hasComputers, setHasComputers] = useState(venue?.hasComputers ?? false);
  const [computerStations, setComputerStations] = useState(
    venue?.computerStations ?? (venue?.hasComputers ? venue.rows * venue.cols : 0)
  );
  const [isAaDesignated, setIsAaDesignated] = useState(venue?.isAaDesignated ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    onSave({
      name: name.trim(),
      rows: Math.max(1, Number(rows)),
      cols: Math.max(1, Number(cols)),
      isLab,
      hasAudio,
      hasComputers,
      computerStations: hasComputers ? Math.max(1, Number(computerStations)) : 0,
      isAaDesignated,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-slate-800">
            {venue ? 'Edit Venue Setup' : 'Add New Venue'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Venue Name *
            </label>
            <input
              type="text"
              placeholder="e.g. School Hall, Classroom 4-1, Physics Lab 2, Computer Lab 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Row x Column Dimension Definition */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Rows (Front to Back) *
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Columns (Left to Right) *
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={cols}
                onChange={(e) => setCols(Number(e.target.value))}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500 italic">
            Total Desks: {rows * cols} desks (You can disable pillars/aisles on the visual matrix after creation).
          </p>

          {/* Computer Lab and Stations Definition */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasComputers}
                onChange={(e) => {
                  setHasComputers(e.target.checked);
                  if (e.target.checked && computerStations === 0) {
                    setComputerStations(rows * cols);
                  }
                }}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="text-sm font-semibold text-slate-800">
                  Can be used for Computer (PC Lab / e-Exam)
                </span>
                <p className="text-xs text-slate-500">
                  Enables this venue to host papers with computer terminal requirements.
                </p>
              </div>
            </label>

            {hasComputers && (
              <div className="pl-7 animate-in fade-in">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Number of Usable Computer Stations *
                </label>
                <input
                  type="number"
                  min={1}
                  max={rows * cols}
                  value={computerStations}
                  onChange={(e) => setComputerStations(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Allocations for computer papers will strictly enforce this station limit.
                </p>
              </div>
            )}
          </div>

          {/* Other Capabilities */}
          <div className="pt-3 border-t border-slate-200 space-y-2.5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isLab}
                onChange={(e) => setIsLab(e.target.checked)}
                className="w-4 h-4 rounded text-purple-600 border-slate-300 focus:ring-purple-500 cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium text-slate-800">Science Laboratory</span>
                <p className="text-xs text-slate-400">Equipped for Physics/Chemistry/Biology practical shifts.</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAudio}
                onChange={(e) => setHasAudio(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 border-slate-300 focus:ring-amber-500 cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium text-slate-800">PA / Audio Sound System Verified</span>
                <p className="text-xs text-slate-400">Suitable for Listening Comprehension acoustic broadcast.</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isAaDesignated}
                onChange={(e) => setIsAaDesignated(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium text-slate-800">Designated for Access Arrangements (AA)</span>
                <p className="text-xs text-slate-400">Quiet separate room for students with extra time or separate venue provisions.</p>
              </div>
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2">
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
              Save Venue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
