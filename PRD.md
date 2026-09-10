# Product Requirement Document (PRD): Plexo

## 1. Executive Summary

**Plexo** is a client-side, browser-based exam planning and seating optimization platform. It automates candidate ingestion, access arrangement (AA) segregation, exam venue seating generation (including Lab shifts and Listening Comprehension acoustic checks), manual visual overrides, and printable audit reports without requiring an external database or backend server.

---

## 2. Technical Stack & Constraints

* **Core Architecture:** Single Page Application (SPA), fully offline/client-side execution.
* **Runtime & Framework:** React 19 / TypeScript / Vite.
* **Styling:** Tailwind CSS (light, clean palette: slate, neutral slate borders, subtle indigo/sky accents, high-contrast readable typography).
* **Data Ingestion & Parsing:** `xlsx` (SheetJS) and native `FileReader` / CSV parsing.
* **State Management & Persistence:** `zustand` or React Context with `idb-keyval` / `localStorage` for session retention.
* **Document Generation / Print:** CSS `@media print` optimized views and printable PDF/XLSX exports.

---

## 3. Data Schema (TypeScript Interfaces)

```typescript
export type PaperType = 'STANDARD' | 'SCIENCE_LAB' | 'LISTENING_COMP';

export interface AccessArrangement {
  extraTimePct: number;       // e.g., 0, 15, 25
  needsSeparateRoom: boolean;
  frontSeatMobility: boolean;
  remarks?: string;
}

export interface SeabRawCandidateRow {
  academicLevel: string;          // e.g., "SECONDARY 4"
  nricFin: string;                // e.g., "T1072222A"
  statutoryName: string;          // e.g., "DENISSE VOO XIAO YOU"
  schoolName: string;             // e.g., "CANBERRA SECONDARY SCHOOL"
  indexNo: string;                // e.g., "15550005" (Exam Centre Code 1555 + Candidate 0005)
  subjectCode: string;            // e.g., "6127"
  subjectName: string;            // e.g., "ART (REVISED)"
  paperNo: string;                // e.g., "01"
  modeOfAssessment: string;       // e.g., "WRITTEN" | "PRACTICAL" | "LISTENING COMPREHENSION" | "ORAL"
  examSeries: string;             // e.g., "YEAR-END" | "MID-YEAR"
  postedSchoolCode: string;       // e.g., "3621"
  postedSchoolName: string;       // e.g., "CANBERRA SECONDARY SCHOOL"
  postedExamCentreCode: string;   // e.g., "1555"
}

export interface Candidate {
  id: string;                 // Candidate ID: Last 4 digits of Index No. (e.g. "0005" from "15550005"); IC is discarded
  indexNumber: string;        // 4-digit Index Number (e.g. "0005")
  fullName: string;           // Statutory Name (e.g. "DENISSE VOO XIAO YOU")
  academicLevel?: string;     // e.g. "SECONDARY 4"
  classGroup?: string;        // e.g. "4E1", "4N2" (if enriched/parsed)
  schoolName?: string;        // e.g. "CANBERRA SECONDARY SCHOOL"
  examCentreCode?: string;    // e.g. "1555" (optional audit reference)
  subjectCodes: string[];     // Array of registered paper IDs (e.g. ["6127/01", "6091/01", "6091/03"])
  arrangements?: AccessArrangement;
}

export interface ExamPaper {
  id: string;
  code: string;               // e.g., "5059/01" or "6127/01"
  title: string;              // e.g., "Physics Paper 1"
  durationMins: number;
  type: PaperType;
  requiresComputer: boolean;  // true for Computing, e-examinations, or digital lab papers
  allowCombine?: boolean;     // whether paper can share a venue with other papers on same day/slot (always false for LISTENING_COMP)
  date: string;               // YYYY-MM-DD
  startTime: string;          // HH:mm
}

export interface VenueSeat {
  row: number;
  col: number;
  seatLabel: string;          // e.g., "R1C1", "A01"
  isActive: boolean;          // false if obstructed desk, broken, or walkway
  hasComputer?: boolean;      // true if this specific desk is equipped with a PC terminal
}

export interface Venue {
  id: string;
  name: string;
  rows: number;               // Row count defined by user
  cols: number;               // Column count defined by user
  isLab: boolean;
  hasAudio: boolean;
  hasComputers: boolean;      // true if venue can be used for computer-based papers
  computerStations: number;   // Number of usable computer workstations / terminals
  isAaDesignated: boolean;
  seatGrid: VenueSeat[][];
}

export interface SeatAllocation {
  paperId: string;
  venueId: string;
  candidateId: string;
  shiftIndex: number;         // 1 for normal, 1 or 2 for lab shifts
  row: number;
  col: number;
  seatLabel: string;
}
```

---

## 4. User Flow & Core Features

### Stage 1: Candidate & Subject Ingestion

* **Multi-File Dropzone & Upload:** Upload single or multiple `.xlsx` / `.csv` candidate files concurrently (e.g. separate files by stream: Express, NA, NT, or subject enrollments).
* **Multi-File Aggregator:** Merges candidate profiles across multiple files by 4-digit Index Number without duplicating records or losing existing subject registrations.
* **SEAB Official Export Auto-Detection:**
  * Detects standard MOE / SEAB candidate register layout containing:
    `Academic Level`, `NRIC/FIN`, `Statutory Name`, `School Name`, `Index No.`, `Subject Code`, `Subject Name`, `Paper No`, `Mode of Assessment`, `Exam Series`, `Posted School Code`, `Posted School Name`, `Posted Exam Centre Code`.
  * **Privacy & ID Extraction:** Strips and **discards `NRIC/FIN` (IC)** immediately upon parsing (PDPA data privacy). Extracts the **last 4 digits of `Index No.`** (e.g. `15550005` $\to$ `0005`) to serve as both the unique candidate `id` and `indexNumber`.
  * **Row-per-Paper Aggregator:** Groups multi-row entries by the 4-digit Index Number into a single unique candidate profile.
  * **Composite Paper Code Generation:** Auto-creates composite paper identifiers (e.g., `Subject Code` + `/` + `Paper No` $\to$ `6127/01`, `6091/03`).
  * **Paper Archetype Inference:** Automatically categorizes `Mode of Assessment`:
    * `WRITTEN` $\to$ `STANDARD`
    * `PRACTICAL` $\to$ `SCIENCE_LAB`
    * `LISTENING COMPREHENSION` / `LISTENING` $\to$ `LISTENING_COMP`
* **Column Auto-Mapper Fallback:** For generic/custom CSVs, maps `Index Number`, `Name`, `Class`, and `Registered Papers`.
* **Validation Banner:** Immediate error flags for duplicate candidate IDs, missing index numbers, or candidates enrolled in zero papers.

### Stage 2: Access Arrangements (AA) Registry & Candidate Viewport

* **Interactive Candidate Viewport:**
  * Dedicated candidate browser table with instant live search filter by **Student Name** or **Index Number**.
  * Viewport card/drawer to view full candidate details (Index No, Statutory Name, Enrolled Papers).
  * Direct inline toggle/modal to assign AA provisions:
    * Extra Time (15%, 25%, 50%).
    * Separate Room requirement (segregated from main cohort, except for Listening Comprehension).
    * Preferential / Front-row seating (places candidate in Row 1 closest to audio source or exit).
    * Custom medical / accommodation remarks.
* **Batch Import & Quick Tagging:** Secondary CSV upload or rapid keyboard navigation to mark accommodations.
* **Summary Cards:** Instant tally of total candidates, standard candidates, and AA-flagged candidates.

### Stage 3: Exam Timetable & Timing Engine

* Calendar/Timetable view grouping papers by Date and Slot (AM/PM).
* **Multi-File Timetable Upload:** Upload single or multiple `.xlsx` / `.csv` timetable files (e.g. O-Level timetable, N-Level timetable, practical rotation schedules) to batch-import and merge examination schedules.
* **Buffer & Operational Times:**
  * **Reporting Time:** Automatically calculated as **30 minutes before** paper start time (`startTime - 30 mins`).
  * **Dismissal / Release Time:** Automatically calculated as **10–15 minutes after** paper completion (`startTime + durationMins + 15 mins`).
  * Used for room turnaround calculations, candidate arrival logistics, and collision checks.
* **Paper Archetypes & Options:**
  * `STANDARD` (Hall / Regular classroom).
  * `SCIENCE_LAB` (Flags need for capacity check, shift splits, and holding rooms).
  * `LISTENING_COMP` (Enforces rooms with acoustic verification; **strict no-combining rule**).
  * `REQUIRES_COMPUTER` toggle / badge: Indicates paper requires PC terminals.
* **Paper Combining Controls (Same-Day / Same-Slot):**
  * Different papers scheduled in the same time window may be combined into a single venue (e.g. Hall seating both History and Literature, or elective subjects).
  * User can toggle / adjust whether specific papers can be combined in the same venue.
  * **Hard Restriction:** Listening Comprehension (`LISTENING_COMP`) papers must **never be combined** with any other paper under any circumstance to prevent audio disruption.

### Stage 4: Venue Setup & Visual Grid Builder

* **Row $\times$ Column Dimension Configurator:**
  * Quick-add venue modal allows user to define exact grid dimensions: **Rows ($R$)** and **Columns ($C$)** (e.g., $6 \times 5$ for standard classroom, $10 \times 4$ for computer lab, $20 \times 15$ for School Hall).
  * Auto-generates initial seat grid with standard labels (e.g., `R1C1` or `A01`).
* **Computer Capability & Station Count Definition:**
  * Toggle: `Can be used for Computer (PC Lab / e-Exam)` (`hasComputers: boolean`).
  * Field: `Number of Computer Stations` (`computerStations: number`, e.g. 24, 32, 40).
  * Auto-sync / Per-Desk Tagging: Marks eligible active desks as computer-equipped (`hasComputer: true`).
* **Interactive Desk Matrix:**
  * Click a desk to toggle **Active / Disabled** (useful for pillars, aisles, walkways, or broken desks).
  * Click to toggle individual desk computer readiness if partially equipped.
  * Venue attributes: `Can be used for Computer` + `Station Count`, `Is Science Lab`, `Acoustic / PA Equipped`, `Designated for AA`.

### Stage 5: Allocation Engine & General Rooming Logic

* **Deterministic Allocation Strategy:**
  1. **Access Arrangements (AA) Routing & Listening Comprehension Exception:**
     * **General Rule:** Candidates tagged with AA (`extraTimePct > 0` or `needsSeparateRoom`) are routed to a separate, quiet AA-designated venue.
     * **Listening Comprehension (LC) Exception:** For `LISTENING_COMP` papers, AA candidates **do not separate**; they **join the rest of the cohort/class** in the main venue.
     * **Preferential Acoustic Placement:** If an AA candidate has preferential seating (e.g., `frontSeatMobility` or hearing accommodation), they are placed **strictly in the front row** (Row 1, closest to the audio playback source).
  2. **Venue Continuity for Back-to-Back Papers:**
     * If the time gap between consecutive papers on the same day is short ($\le 45$–$60$ mins between dismissal and the next reporting time, e.g. English Paper 1 and Paper 2), Plexo **locks the candidate's allocated venue and desk**.
     * Ideally, there is **no change of venue** across back-to-back papers to avoid student displacement and exam administration confusion.
  3. **Computer Lab Prioritization & Overflow Fallback:**
     * Computer labs (`hasComputers: true`) are **strictly prioritized for computer-required papers** (`requiresComputer: true`).
     * Computer labs may only be used for standard/non-computer papers under special capacity constraints or explicit user override.
  4. **Multi-Paper Venue Combination Rules:**
     * Compatible papers on the same day/session can be allocated to shared large venues (e.g. School Hall) based on user toggle.
     * **Never combine Listening Comprehension papers.**
  5. **Science Lab Shifts & Quarantine Holding Room:**
     * If `Enrolled Candidates > Lab Capacity`, cohort is divided into Shift 1 and Shift 2.
     * Shift 2 is assigned to an isolated classroom acting as the **Holding / Quarantine Room** before Shift 1 ends.
  6. **Serpentine / Snake Desk Fill:**
     * Traverses Column 1 (Front to Back), Column 2 (Back to Front) to minimize eye-line alignment.
     * Sorting selector allows `[Class Group + Index]` or `[Pure Index Order]`.
* **Visual Grid & Drag-and-Drop Override:**
  * Displays each room's grid populated with candidate pill cards.
  * Enables clicking or dragging any two students to swap desks safely with immediate conflict warnings.

### Stage 6: Audit & Print Reports

* **Desk Slips:** 8-up or 10-up grid template with Candidate Name, Index Number, Paper Name, and Seat Label, ready for standard A4 sticker/paper printing.
* **Door Noticeboard Sheet:** Sorted by Candidate Name/Index $\to$ Venue $\to$ Desk Number.
* **Invigilator Attendance Matrix:** Visual 2D desk plan with signature boxes for candidate verification and script tallying.

---

## 5. UI/UX & Design Tokens (Light Palette)

| Component | Tailwind Tokens | Description |
| --- | --- | --- |
| **App Background** | `bg-slate-50 text-slate-800` | Clean, low-fatigue neutral backdrop |
| **Cards & Modals** | `bg-white border border-slate-200 shadow-sm` | Crisp cards with subtle definition |
| **Primary Actions** | `bg-indigo-600 hover:bg-indigo-700 text-white` | Clear visual hierarchy for execution buttons |
| **Desk (Available)** | `bg-white border-dashed border-slate-300` | Unassigned active desk |
| **Desk (Assigned)** | `bg-slate-50 border-slate-300 text-slate-700` | Standard seated candidate |
| **Desk (Computer Station)** | `bg-sky-50/50 border-sky-300 text-sky-800` | Desk equipped with PC workstation badge |
| **Desk (AA Flagged)** | `bg-amber-50 border-amber-300 text-amber-800` | Highlighted accommodation desk |
| **Desk (Disabled)** | `bg-slate-100 text-slate-300 cursor-not-allowed` | Pillar / broken desk placeholder |

---

## 6. Implementation Checklist

1. **Phase 1: Ingestion & Store Setup**
   * Scaffold Vite + React + Tailwind + Lucide Icons.
   * Configure Zustand store with persistent browser storage.
   * Write SheetJS parser for candidate and timetable files.

2. **Phase 2: Venue Matrix Designer**
   * Build the configurable $R \times C$ venue creator.
   * Add click-to-disable matrix toggle for irregular room layouts.

3. **Phase 3: The Allocation Solver & Rooming Engine**
   * Implement the deterministic assignment algorithm:
     * Partition AA candidates into quiet venues, with **LC exception** (rejoining cohort + front-row acoustic placement).
     * Enforce **venue continuity** across short-gap back-to-back papers (no room changes).
     * Route computer-required papers to computer labs with station capacity checks.
     * Evaluate science lab shifts $\to$ Shift 1/2 split with quarantine holding room.
     * Support combining compatible same-session papers while strictly isolating Listening Comprehension.
     * Serpentine desk traversal and multi-key sorting (`Class + Index` or `Pure Index`).
   * Add conflict check: ensure no candidate or venue is double-booked across overlapping reporting/dismissal windows.

4. **Phase 4: Visual Review & Swapping**
   * Render venue grids with seated candidate cards.
   * Implement simple click-to-swap desk reordering.

5. **Phase 5: Print & Export Templates**
   * Configure print-specific CSS (`@media print`) hides navigation bars and formats A4 page breaks.
   * Generate Desk Slips, Door Lists, and Attendance Records.
