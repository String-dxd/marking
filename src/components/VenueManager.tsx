import React, { useState } from 'react';
import { useExamStore } from '../store/useExamStore';
import type { Venue, VenueSeat } from '../types';
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
  Ban
} from 'lucide-react';

function generateInitialSeatGrid(rows: number, cols: number, hasComputers: boolean = false, stationCount: number = 0): VenueSeat[][] {
  const grid: VenueSeat[][] = [];
  let currentStations = 0;

  for (let r = 0; r < rows; r++) {
    const rowSeats: VenueSeat[] = [];
    for (let c = 0; c < cols; c++) {
      const hasComp = hasComputers && currentStations < stationCount;
      if (hasComp) currentStations++;

      rowSeats.push({
        row: r,
        col: c,
        seatLabel: `R${r + 1}C${c + 1}`,
        isActive: true,
        hasComputer: hasComp,
      });
    }
    grid.push(rowSeats);
  }
  return grid;
}

export const VenueManager: React.FC = () => {
  const { venues, addVenue, updateVenue, deleteVenue } = useExamStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);

  const handleOpenAdd = () => {
    setEditingVenue(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (venue: Venue) => {
    setEditingVenue(venue);
    setIsModalOpen(true);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Stage 4: Venue Matrix & Capability Designer</h2>
          <p className="text-sm text-slate-500 mt-1">
            Define venue Row $\times$ Column dimensions, computer lab stations, and click desks to toggle aisles, pillars, or inactive desks.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Exam Venue</span>
        </button>
      </div>

      {/* Venues Grid */}
      {venues.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 shadow-sm">
          <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="font-semibold text-slate-700">No Exam Venues Configured</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Add Exam Venue" above to configure your School Hall, Classrooms, Science Labs, or Computer Labs.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {venues.map((venue) => {
            const totalDesks = venue.rows * venue.cols;
            const activeDesks = venue.seatGrid.flat().filter((s) => s.isActive).length;
            const inactiveDesks = totalDesks - activeDesks;

            return (
              <div
                key={venue.id}
                className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col justify-between"
              >
                {/* Venue Header */}
                <div className="p-5 border-b border-slate-200 bg-slate-50/50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-base">{venue.name}</h3>
                        <span className="font-mono text-xs text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded">
                          {venue.rows}R × {venue.cols}C
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-2">
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

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(venue)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Edit Venue"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteVenue(venue.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
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
                      <strong className="text-slate-800 font-semibold">{activeDesks}</strong>
                    </div>
                    {inactiveDesks > 0 && (
                      <div>
                        <span className="text-slate-400">Disabled (Pillars/Aisles): </span>
                        <strong className="text-slate-500 font-semibold">{inactiveDesks}</strong>
                      </div>
                    )}
                    <span className="text-xs text-slate-400 italic ml-auto">
                      Click any desk to toggle active / disabled
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

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <VenueModal
          venue={editingVenue}
          onClose={() => setIsModalOpen(false)}
          onSave={(venueData) => {
            if (editingVenue) {
              // If rows or cols changed, re-generate grid or resize
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
    venue?.computerStations ?? (venue?.hasComputers ? (venue.rows * venue.cols) : 0)
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
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200">
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
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
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
                className="w-4 h-4 rounded text-purple-600 border-slate-300 focus:ring-purple-500"
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
                className="w-4 h-4 rounded text-amber-600 border-slate-300 focus:ring-amber-500"
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
                className="w-4 h-4 rounded text-rose-600 border-slate-300 focus:ring-rose-500"
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
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors"
            >
              Save Venue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
