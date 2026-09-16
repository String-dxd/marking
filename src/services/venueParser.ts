import * as XLSX from 'xlsx';
import type { Venue, VenueSeat } from '../types';

export interface ParsedVenuesResult {
  venues: Venue[];
  totalVenues: number;
  totalCapacity: number;
  computerLabsCount: number;
  totalComputerStations: number;
  scienceLabsCount: number;
  aaRoomsCount: number;
  warnings: string[];
}

export interface MultipleVenuesFileReport {
  fileName: string;
  venueCount: number;
  totalCapacity: number;
}

export interface MultipleVenuesResult {
  mergedVenues: Venue[];
  fileReports: MultipleVenuesFileReport[];
  warnings: string[];
}

/**
 * Generates an initial VenueSeat 2D grid given row/col dimensions, computer capabilities,
 * and optional list of disabled seat labels.
 */
export function generateInitialSeatGrid(
  rows: number,
  cols: number,
  hasComputers: boolean = false,
  stationCount: number = 0,
  disabledSeatLabels: string[] = []
): VenueSeat[][] {
  const grid: VenueSeat[][] = [];
  let currentStations = 0;
  const effectiveStations = hasComputers ? (stationCount > 0 ? stationCount : rows * cols) : 0;

  const normalizedDisabled = new Set(
    disabledSeatLabels.map((s) => s.trim().toUpperCase())
  );

  for (let r = 0; r < rows; r++) {
    const rowSeats: VenueSeat[] = [];
    for (let c = 0; c < cols; c++) {
      const label = `R${r + 1}C${c + 1}`;
      const hasComp = hasComputers && currentStations < effectiveStations;
      if (hasComp) currentStations++;

      const isExplicitlyDisabled =
        normalizedDisabled.has(label) ||
        normalizedDisabled.has(`${r + 1},${c + 1}`) ||
        normalizedDisabled.has(`${r + 1}-${c + 1}`) ||
        normalizedDisabled.has(`ROW ${r + 1} COL ${c + 1}`);

      rowSeats.push({
        row: r,
        col: c,
        seatLabel: label,
        isActive: !isExplicitlyDisabled,
        hasComputer: hasComp,
      });
    }
    grid.push(rowSeats);
  }
  return grid;
}

/**
 * Helper to parse comma/semicolon/pipe separated disabled seats string into token array.
 * Supports ranges like R1C1-R5C1 or R1C3..R6C3
 */
export function parseDisabledSeatsList(rawStr: string): string[] {
  if (!rawStr || typeof rawStr !== 'string') return [];

  const tokens = rawStr
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const result: string[] = [];

  for (const token of tokens) {
    // Check for range like R1C3-R6C3 or R1C3..R6C3
    const rangeMatch = token.match(/R(\d+)C(\d+)\s*(?:-|to|\.\.)\s*R(\d+)C(\d+)/i);
    if (rangeMatch) {
      const rStart = parseInt(rangeMatch[1], 10);
      const cStart = parseInt(rangeMatch[2], 10);
      const rEnd = parseInt(rangeMatch[3], 10);
      const cEnd = parseInt(rangeMatch[4], 10);

      const minR = Math.min(rStart, rEnd);
      const maxR = Math.max(rStart, rEnd);
      const minC = Math.min(cStart, cEnd);
      const maxC = Math.max(cStart, cEnd);

      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          result.push(`R${r}C${c}`);
        }
      }
    } else {
      result.push(token.toUpperCase());
    }
  }

  return result;
}

function parseBooleanVal(val: any, defaultVal: boolean = false): boolean {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'boolean') return val;
  const str = String(val).trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 't', 'checked', 'enabled'].includes(str)) return true;
  if (['no', 'n', 'false', '0', 'f', 'unchecked', 'disabled'].includes(str)) return false;
  return defaultVal;
}

function parseNumberVal(val: any, defaultVal: number = 0): number {
  if (val === undefined || val === null || val === '') return defaultVal;
  const num = Number(val);
  return isNaN(num) ? defaultVal : num;
}

/**
 * Parses a single workbook file (.xlsx, .xls, .csv) into Venue definitions.
 */
export async function parseVenueFile(file: File): Promise<ParsedVenuesResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const warnings: string[] = [];
  const parsedVenues: Venue[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) continue;

    // Check if rows represent tabular venue definitions
    for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex++) {
      const row = rawRows[rowIndex];

      const getVal = (possibleKeys: string[]): any => {
        for (const [k, v] of Object.entries(row)) {
          const cleanK = k.trim().toLowerCase();
          if (possibleKeys.some((pk) => cleanK === pk.toLowerCase() || cleanK.includes(pk.toLowerCase()))) {
            return v;
          }
        }
        return '';
      };

      const rawName = getVal(['venue name', 'room name', 'exam venue', 'venue', 'room', 'location', 'name']);
      const venueName = String(rawName).trim();

      // If no venue name found, skip row
      if (!venueName || venueName.startsWith('#') || venueName.startsWith('//')) {
        continue;
      }

      const rowsVal = parseNumberVal(getVal(['rows', 'row count', 'num rows', 'r', 'height', 'length']), 6);
      const colsVal = parseNumberVal(getVal(['columns', 'cols', 'col count', 'num cols', 'c', 'width']), 5);

      const rows = Math.max(1, Math.min(60, rowsVal));
      const cols = Math.max(1, Math.min(60, colsVal));

      const hasComputers = parseBooleanVal(
        getVal(['computer lab', 'has computers', 'computers', 'is computer lab', 'pc lab', 'e-exam', 'digital']),
        false
      );

      const stationsVal = parseNumberVal(
        getVal(['computer stations', 'stations', 'pc stations', 'number of computers', 'pc count', 'pcs']),
        hasComputers ? rows * cols : 0
      );
      const computerStations = hasComputers ? Math.max(1, Math.min(rows * cols, stationsVal)) : 0;

      const isLab = parseBooleanVal(
        getVal(['science lab', 'is lab', 'lab', 'practical lab', 'science', 'lab room']),
        false
      );

      const hasAudio = parseBooleanVal(
        getVal(['audio / lc equipped', 'audio equipped', 'audio', 'pa system', 'has audio', 'listening comp', 'lc', 'sound system']),
        true
      );

      const isAaDesignated = parseBooleanVal(
        getVal(['aa designated', 'is aa designated', 'designated aa', 'aa room', 'special needs', 'separate room', 'aa']),
        false
      );

      const rawDisabled = getVal([
        'disabled desks',
        'disabled seats',
        'inactive desks',
        'inactive seats',
        'pillars / aisles',
        'pillars',
        'aisles',
        'blocked seats',
        'unusable seats',
      ]);
      const disabledSeatLabels = parseDisabledSeatsList(String(rawDisabled));

      const seatGrid = generateInitialSeatGrid(rows, cols, hasComputers, computerStations, disabledSeatLabels);

      const venueId = `venue-${venueName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${rowIndex}`;

      parsedVenues.push({
        id: venueId,
        name: venueName,
        rows,
        cols,
        isLab,
        hasAudio,
        hasComputers,
        computerStations,
        isAaDesignated,
        seatGrid,
      });
    }
  }

  if (parsedVenues.length === 0) {
    throw new Error(
      `No valid exam venues found in "${file.name}". Please ensure your template includes a "Venue Name" column along with "Rows" and "Columns".`
    );
  }

  const totalVenues = parsedVenues.length;
  const totalCapacity = parsedVenues.reduce(
    (acc, v) => acc + v.seatGrid.flat().filter((s) => s.isActive).length,
    0
  );
  const computerLabsCount = parsedVenues.filter((v) => v.hasComputers).length;
  const totalComputerStations = parsedVenues.reduce((acc, v) => acc + (v.computerStations || 0), 0);
  const scienceLabsCount = parsedVenues.filter((v) => v.isLab).length;
  const aaRoomsCount = parsedVenues.filter((v) => v.isAaDesignated).length;

  return {
    venues: parsedVenues,
    totalVenues,
    totalCapacity,
    computerLabsCount,
    totalComputerStations,
    scienceLabsCount,
    aaRoomsCount,
    warnings,
  };
}

/**
 * Parses multiple venue template files and merges them cleanly.
 */
export async function parseMultipleVenueFiles(files: File[]): Promise<MultipleVenuesResult> {
  const fileReports: MultipleVenuesFileReport[] = [];
  const venueMap = new Map<string, Venue>();
  const allWarnings: string[] = [];

  for (const file of files) {
    try {
      const result = await parseVenueFile(file);
      fileReports.push({
        fileName: file.name,
        venueCount: result.totalVenues,
        totalCapacity: result.totalCapacity,
      });

      if (result.warnings.length > 0) {
        allWarnings.push(...result.warnings.map((w) => `[${file.name}] ${w}`));
      }

      // Merge venues by name (case-insensitive)
      for (const venue of result.venues) {
        const key = venue.name.trim().toLowerCase();
        venueMap.set(key, venue);
      }
    } catch (err: any) {
      allWarnings.push(`Failed to parse "${file.name}": ${err.message}`);
    }
  }

  const mergedVenues = Array.from(venueMap.values());
  return {
    mergedVenues,
    fileReports,
    warnings: allWarnings,
  };
}

/**
 * Generates sample CSV content for Singapore examination venues template.
 */
export function generateSampleVenueCsv(): string {
  const headers = [
    'Venue Name',
    'Rows',
    'Columns',
    'Computer Lab',
    'Computer Stations',
    'Science Lab',
    'Audio / LC Equipped',
    'AA Designated',
    'Disabled Desks (Pillars/Aisles)'
  ];

  const sampleRows = [
    'Classroom 1-1,6,5,No,0,No,Yes,No,',
    'Classroom 1-2,6,5,No,0,No,Yes,No,',
    'Classroom 1-3,6,5,No,0,No,Yes,No,',
    'Classroom 4-1,6,5,No,0,No,Yes,No,',
    'Classroom 4-2,6,5,No,0,No,Yes,No,',
    'RR1,5,4,No,0,No,Yes,No,',
    'RR2,5,4,No,0,No,Yes,No,',
    'AVA Room,6,5,No,0,No,Yes,No,',
    'School Hall,12,10,No,0,No,Yes,No,"R1C1, R1C10, R12C1, R12C10"',
    'Computer Lab 1,8,4,Yes,30,No,Yes,No,"R1C1, R8C1"',
    'Physics Lab 1,6,6,No,0,Yes,No,No,"R1C3, R2C3, R3C3, R4C3, R5C3, R6C3"',
    'Chemistry Lab 1,6,6,No,0,Yes,No,No,"R1C3, R2C3, R3C3, R4C3, R5C3, R6C3"',
    'AA Quiet Room 1,4,3,No,0,No,Yes,Yes,',
    'AA Quiet Room 2,4,3,No,0,No,Yes,Yes,'
  ];

  return [headers.join(','), ...sampleRows].join('\n');
}

/**
 * Generates sample XLSX Blob with rich formatting and comments.
 */
export function generateSampleVenueXlsxBlob(): Blob {
  const headers = [
    'Venue Name',
    'Rows',
    'Columns',
    'Computer Lab',
    'Computer Stations',
    'Science Lab',
    'Audio / LC Equipped',
    'AA Designated',
    'Disabled Desks (Pillars/Aisles)'
  ];

  const rows = [
    ['Classroom 1-1', 6, 5, 'No', 0, 'No', 'Yes', 'No', ''],
    ['Classroom 1-2', 6, 5, 'No', 0, 'No', 'Yes', 'No', ''],
    ['Classroom 1-3', 6, 5, 'No', 0, 'No', 'Yes', 'No', ''],
    ['Classroom 4-1', 6, 5, 'No', 0, 'No', 'Yes', 'No', ''],
    ['Classroom 4-2', 6, 5, 'No', 0, 'No', 'Yes', 'No', ''],
    ['RR1', 5, 4, 'No', 0, 'No', 'Yes', 'No', ''],
    ['RR2', 5, 4, 'No', 0, 'No', 'Yes', 'No', ''],
    ['AVA Room', 6, 5, 'No', 0, 'No', 'Yes', 'No', ''],
    ['School Hall', 12, 10, 'No', 0, 'No', 'Yes', 'No', 'R1C1, R1C10, R12C1, R12C10'],
    ['Computer Lab 1', 8, 4, 'Yes', 30, 'No', 'Yes', 'No', 'R1C1, R8C1'],
    ['Physics Lab 1', 6, 6, 'No', 0, 'Yes', 'No', 'No', 'R1C3, R2C3, R3C3, R4C3, R5C3, R6C3'],
    ['Chemistry Lab 1', 6, 6, 'No', 0, 'Yes', 'No', 'No', 'R1C3, R2C3, R3C3, R4C3, R5C3, R6C3'],
    ['AA Quiet Room 1', 4, 3, 'No', 0, 'No', 'Yes', 'Yes', ''],
    ['AA Quiet Room 2', 4, 3, 'No', 0, 'No', 'Yes', 'Yes', ''],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Exam Venues');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Exports current configured venues to CSV format string.
 */
export function exportVenuesToCsv(venues: Venue[]): string {
  const headers = [
    'Venue Name',
    'Rows',
    'Columns',
    'Computer Lab',
    'Computer Stations',
    'Science Lab',
    'Audio / LC Equipped',
    'AA Designated',
    'Disabled Desks (Pillars/Aisles)'
  ];

  const rows = venues.map((v) => {
    const disabledSeats = v.seatGrid
      .flat()
      .filter((s) => !s.isActive)
      .map((s) => s.seatLabel)
      .join(', ');

    const escapedDisabled = disabledSeats.includes(',') ? `"${disabledSeats}"` : disabledSeats;

    return [
      `"${v.name.replace(/"/g, '""')}"`,
      v.rows,
      v.cols,
      v.hasComputers ? 'Yes' : 'No',
      v.computerStations || 0,
      v.isLab ? 'Yes' : 'No',
      v.hasAudio ? 'Yes' : 'No',
      v.isAaDesignated ? 'Yes' : 'No',
      escapedDisabled,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Exports current configured venues to XLSX Blob.
 */
export function exportVenuesToXlsxBlob(venues: Venue[]): Blob {
  const headers = [
    'Venue Name',
    'Rows',
    'Columns',
    'Computer Lab',
    'Computer Stations',
    'Science Lab',
    'Audio / LC Equipped',
    'AA Designated',
    'Disabled Desks (Pillars/Aisles)'
  ];

  const rows = venues.map((v) => {
    const disabledSeats = v.seatGrid
      .flat()
      .filter((s) => !s.isActive)
      .map((s) => s.seatLabel)
      .join(', ');

    return [
      v.name,
      v.rows,
      v.cols,
      v.hasComputers ? 'Yes' : 'No',
      v.computerStations || 0,
      v.isLab ? 'Yes' : 'No',
      v.hasAudio ? 'Yes' : 'No',
      v.isAaDesignated ? 'Yes' : 'No',
      disabledSeats,
    ];
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Exam Venues');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
