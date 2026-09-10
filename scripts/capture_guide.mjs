import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const htmlPath = 'C:\\Users\\hejia\\Documents\\Antigravity\\Plexo\\Plexo-v0.1-Standalone.html';
const outDir = 'C:/Users/hejia/.gemini/antigravity/brain/0c4da48d-5e71-45f2-9f65-8e31745a95f6/guide_assets';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function generateInitialSeatGrid(rows, cols, hasComputers = false, stationCount = 0) {
  const grid = [];
  let currentStations = 0;
  for (let r = 0; r < rows; r++) {
    const rowSeats = [];
    for (let c = 0; c < cols; c++) {
      const hasComp = hasComputers && currentStations < stationCount;
      if (hasComp) currentStations++;
      rowSeats.push({
        row: r,
        col: c,
        seatLabel: `R${r + 1}C${c + 1}`,
        isActive: !(r === 0 && (c === 0 || c === cols - 1) && rows > 3),
        hasComputer: hasComp,
      });
    }
    grid.push(rowSeats);
  }
  return grid;
}

const sampleVenues = [
  {
    id: 'venue-hall',
    name: 'School Main Hall',
    rows: 5,
    cols: 6,
    isLab: false,
    hasAudio: true,
    hasComputers: false,
    computerStations: 0,
    isAaDesignated: false,
    seatGrid: generateInitialSeatGrid(5, 6, false, 0),
  },
  {
    id: 'venue-cls4a',
    name: 'Classroom 4A',
    rows: 4,
    cols: 4,
    isLab: false,
    hasAudio: false,
    hasComputers: false,
    computerStations: 0,
    isAaDesignated: false,
    seatGrid: generateInitialSeatGrid(4, 4, false, 0),
  },
  {
    id: 'venue-quiet-aa',
    name: 'Quiet AA Room (Separate)',
    rows: 2,
    cols: 3,
    isLab: false,
    hasAudio: true,
    hasComputers: false,
    computerStations: 0,
    isAaDesignated: true,
    seatGrid: generateInitialSeatGrid(2, 3, false, 0),
  },
];

const samplePapers = [
  {
    id: 'paper-1128-01',
    code: '1128/01',
    title: 'English Language Paper 1',
    durationMins: 110,
    type: 'STANDARD',
    requiresComputer: false,
    date: '2026-10-14',
    startTime: '08:00',
  },
  {
    id: 'paper-1128-02',
    code: '1128/02',
    title: 'English Language Paper 2',
    durationMins: 110,
    type: 'STANDARD',
    requiresComputer: false,
    date: '2026-10-14',
    startTime: '10:45',
  },
  {
    id: 'paper-6091-01',
    code: '6091/01',
    title: 'Physics Paper 1',
    durationMins: 60,
    type: 'STANDARD',
    requiresComputer: false,
    date: '2026-10-15',
    startTime: '08:00',
  },
  {
    id: 'paper-6092-01',
    code: '6092/01',
    title: 'Chemistry Paper 1',
    durationMins: 60,
    type: 'STANDARD',
    requiresComputer: false,
    date: '2026-10-15',
    startTime: '08:00',
  },
  {
    id: 'paper-4048-01',
    code: '4048/01',
    title: 'Mathematics Paper 1',
    durationMins: 120,
    type: 'STANDARD',
    requiresComputer: false,
    date: '2026-10-16',
    startTime: '08:00',
  },
];

const sampleCandidates = [];
const names = [
  'TAN AH MENG', 'LIM XIAO LING', 'MUHAMMAD RYAN', 'SITI NURHALIZA', 'KWEK WEI JIE',
  'CHUA JIA EN', 'KUMAR S/O RAVI', 'DENISSE VOO XIAO YOU', 'BRYAN TAN WEI MING',
  'CHLOE LIM JIA EN', 'DANIEL CHEN JIAN HAO', 'EMILY TEO SHU HUI', 'FARHAN BIN ROSLI',
  'GABRIEL WONG ZI RUI', 'HANNAH KOH MEI LING', 'IAN TEO KAH WAI', 'JASMINE TAN EN TING',
  'KAVINDRAN NAIR', 'LEONARD SIM JUN JIE', 'MEGAN YEO ZI QI'
];

names.forEach((name, i) => {
  const indexNumber = String(i + 1).padStart(4, '0');
  const cand = {
    id: indexNumber,
    indexNumber,
    fullName: name,
    academicLevel: 'SECONDARY 4',
    schoolName: 'CANBERRA SECONDARY SCHOOL',
    examCentreCode: '1555',
    subjectCodes: ['1128/01', '1128/02', '6091/01', '6092/01', '4048/01'],
  };

  if (indexNumber === '0001') {
    cand.arrangements = { extraTimePct: 25, needsSeparateRoom: true, frontSeatMobility: false, remarks: 'ADHD accommodation' };
  } else if (indexNumber === '0002') {
    cand.paperArrangements = {
      '1128/01': { extraTimePct: 25, needsSeparateRoom: true, frontSeatMobility: false, remarks: 'Dyslexia Writing Extension' }
    };
  } else if (indexNumber === '0003') {
    cand.arrangements = { extraTimePct: 0, needsSeparateRoom: false, frontSeatMobility: true, remarks: 'Low hearing - preferential front seat' };
  }

  sampleCandidates.push(cand);
});

// Allocations for 1128/01
const sampleAllocations = {
  'paper-1128-01': [
    ...sampleCandidates.filter(c => c.id !== '0001').slice(0, 18).map((c, idx) => {
      const row = Math.floor(idx / 5);
      const col = (idx % 5) + 1;
      return {
        paperId: 'paper-1128-01',
        venueId: 'venue-hall',
        candidateId: c.id,
        shiftIndex: 1,
        row,
        col,
        seatLabel: `R${row + 1}C${col + 1}`,
      };
    }),
    {
      paperId: 'paper-1128-01',
      venueId: 'venue-quiet-aa',
      candidateId: '0001',
      shiftIndex: 1,
      row: 0,
      col: 1,
      seatLabel: 'R1C2',
    }
  ]
};

async function run() {
  console.log('Launching browser to capture user guide screenshots...');
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    defaultViewport: { width: 1366, height: 860, deviceScaleFactor: 2 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });

  // 1. Capture Stage 1 Ingestion Banner
  console.log('Capturing: 01_candidate_ingestion_banner.png');
  const bannerEl = await page.$('main > div.space-y-6 > div.bg-white.border');
  if (bannerEl) {
    await bannerEl.screenshot({ path: path.join(outDir, '01_candidate_ingestion_banner.png') });
  }

  // 2. Capture Navigation Header
  console.log('Capturing: 02_navigation_header.png');
  const headerEl = await page.$('header');
  if (headerEl) {
    await headerEl.screenshot({ path: path.join(outDir, '02_navigation_header.png') });
  }

  // Inject dataset into localStorage
  console.log('Injecting sample SEAB dataset into client-side store...');
  await page.evaluate((data) => {
    const storeData = {
      state: {
        candidates: data.candidates,
        papers: data.papers,
        venues: data.venues,
        allocations: data.allocations,
        activeTab: 'candidates',
        selectedPaperId: 'paper-1128-01',
        selectedVenueId: 'venue-hall',
      },
      version: 0
    };
    localStorage.setItem('plexo_exam_store_v0.1_dist', JSON.stringify(storeData));
  }, {
    candidates: sampleCandidates,
    papers: samplePapers,
    venues: sampleVenues,
    allocations: sampleAllocations,
  });

  // Reload page
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));

  // 3. Populated Candidate Roster
  console.log('Capturing: 03_candidate_roster_table.png');
  const candidateTableCard = await page.$('main > div.space-y-6 > div.bg-white.rounded-xl');
  if (candidateTableCard) {
    await candidateTableCard.screenshot({ path: path.join(outDir, '03_candidate_roster_table.png') });
  }

  // 4. Granular AA Modal
  console.log('Opening AA Modal for candidate 0002...');
  const editButtons = await page.$$('table tbody tr button');
  if (editButtons.length > 0) {
    await editButtons[1].click();
    await new Promise(r => setTimeout(r, 600));
    const modalEl = await page.$('.fixed.inset-0 .bg-white.rounded-xl');
    if (modalEl) {
      await modalEl.screenshot({ path: path.join(outDir, '04_granular_aa_modal.png') });
    }
    const closeBtn = await page.$('.fixed.inset-0 button');
    if (closeBtn) await closeBtn.click();
    await new Promise(r => setTimeout(r, 400));
  }

  // 5. Navigate to Stage 2: Timetable
  console.log('Navigating to Stage 2: Timetable...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('nav button'));
    const tTab = tabs.find(b => b.textContent.includes('Timetable'));
    if (tTab) tTab.click();
  });
  await new Promise(r => setTimeout(r, 700));

  console.log('Capturing: 05_timetable_calendar.png');
  const timetableMain = await page.$('main > div.space-y-6');
  if (timetableMain) {
    await timetableMain.screenshot({ path: path.join(outDir, '05_timetable_calendar.png') });
  }

  // 6. Navigate to Stage 3: Venues Matrix
  console.log('Navigating to Stage 3: Venues Matrix...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('nav button'));
    const vTab = tabs.find(b => b.textContent.includes('Venues'));
    if (vTab) vTab.click();
  });
  await new Promise(r => setTimeout(r, 700));

  console.log('Capturing: 06_venues_matrix.png');
  const venuesCard = await page.$('main > div.space-y-6');
  if (venuesCard) {
    await venuesCard.screenshot({ path: path.join(outDir, '06_venues_matrix.png') });
  }

  // 7. Navigate to Stage 4: Seating & Swap
  console.log('Navigating to Stage 4: Seating & Swap...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('nav button'));
    const aTab = tabs.find(b => b.textContent.includes('Seating & Swap'));
    if (aTab) aTab.click();
  });
  await new Promise(r => setTimeout(r, 800));

  console.log('Capturing: 07_seating_floorplan_visualizer.png');
  const seatVisualizer = await page.$('main > div.space-y-6 > div.space-y-4');
  if (seatVisualizer) {
    await seatVisualizer.screenshot({ path: path.join(outDir, '07_seating_floorplan_visualizer.png') });
  }

  // Click seat for cross-room swap
  console.log('Triggering seat swap toolbar...');
  const seatedDesks = await page.$$('div[class*="h-28"][class*="cursor-pointer"]');
  if (seatedDesks.length > 0) {
    await seatedDesks[0].click();
    await new Promise(r => setTimeout(r, 600));
    const swapBar = await page.$('.border-indigo-300');
    if (swapBar) {
      await swapBar.screenshot({ path: path.join(outDir, '08_cross_room_swap_bar.png') });
    }
  }

  // 8. Navigate to Stage 5: Print & Audit (Room Use Overview)
  console.log('Navigating to Stage 5: Print & Audit...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('nav button'));
    const rTab = tabs.find(b => b.textContent.includes('Print & Audit'));
    if (rTab) rTab.click();
  });
  await new Promise(r => setTimeout(r, 800));

  console.log('Capturing: 09_room_use_overview_report.png');
  const roomUseReport = await page.$('main > div.space-y-6 > div.bg-white');
  if (roomUseReport) {
    await roomUseReport.screenshot({ path: path.join(outDir, '09_room_use_overview_report.png') });
  }

  // 9. Switch to Door Card tab
  console.log('Switching to Door Card tab...');
  await page.evaluate(() => {
    const reportTabs = Array.from(document.querySelectorAll('button'));
    const doorTab = reportTabs.find(b => b.textContent.includes('Door Card'));
    if (doorTab) doorTab.click();
  });
  await new Promise(r => setTimeout(r, 800));

  console.log('Capturing: 10_door_card_report.png');
  const doorCardReport = await page.$('main > div.space-y-6 > div.bg-white');
  if (doorCardReport) {
    await doorCardReport.screenshot({ path: path.join(outDir, '10_door_card_report.png') });
  }

  // 10. Switch to Desk Slips tab
  console.log('Switching to Desk Slips tab...');
  await page.evaluate(() => {
    const reportTabs = Array.from(document.querySelectorAll('button'));
    const slipTab = reportTabs.find(b => b.textContent.includes('Desk Slips'));
    if (slipTab) slipTab.click();
  });
  await new Promise(r => setTimeout(r, 800));

  console.log('Capturing: 11_desk_slips_report.png');
  const deskSlipReport = await page.$('main > div.space-y-6 > div.bg-white');
  if (deskSlipReport) {
    await deskSlipReport.screenshot({ path: path.join(outDir, '11_desk_slips_report.png') });
  }

  await browser.close();
  console.log('SUCCESS: All 11 user guide screenshots captured!');
}

run().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
