import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { marked } from 'marked';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const mdPath = 'c:\\Users\\hejia\\Documents\\Antigravity\\Plexo\\docs\\USER_GUIDE.md';
const imagesDir = 'c:\\Users\\hejia\\Documents\\Antigravity\\Plexo\\docs\\images';
const pdfOutPath = 'c:\\Users\\hejia\\Documents\\Antigravity\\Plexo\\Plexo-v0.1-User-Guide.pdf';
const artifactPdfPath = 'C:\\Users\\hejia\\.gemini\\antigravity\\brain\\0c4da48d-5e71-45f2-9f65-8e31745a95f6\\Plexo-v0.1-User-Guide.pdf';

let mdContent = fs.readFileSync(mdPath, 'utf8');

// Replace mermaid block with clean styled HTML diagram
const mermaidRegex = /```mermaid[\s\S]*?```/;
const architectureHtml = `
<div class="arch-box">
  <div class="arch-col local-col">
    <div class="arch-title">💻 Your School Device (Managed Laptop / MOE SOE)</div>
    <div class="arch-card"><strong>Plexo-v0.1-Standalone.html</strong> (Zero-Install Single File)</div>
    <div class="arch-card"><strong>Browser Sandbox Memory</strong> (React 19 Client Engine)</div>
    <div class="arch-card"><strong>Local Browser Storage</strong> (Isolated Device DB)</div>
    <div class="arch-card"><strong>In-Browser Parsers</strong> (PDF.js / SheetJS Excel)</div>
  </div>
  <div class="arch-arrow">⮂ 🛡️ ⮂<br><span style="font-size:10px;font-weight:bold;color:#4f46e5;">100% AIR-GAPPED</span></div>
  <div class="arch-col remote-col">
    <div class="arch-title">🌐 External World (Blocked)</div>
    <div class="arch-card danger">❌ NO Cloud Uploads</div>
    <div class="arch-card danger">❌ NO External Servers</div>
    <div class="arch-card danger">❌ NO Data Leaves Laptop</div>
    <div class="arch-card danger">🛡️ PDPA & MOE Compliant</div>
  </div>
</div>
`;
mdContent = mdContent.replace(mermaidRegex, architectureHtml);

// Replace GitHub Alerts (> [!IMPORTANT], > [!TIP])
mdContent = mdContent.replace(/> \[!IMPORTANT\]\n([\s\S]*?)(?=\n\n|$)/g, (match, p1) => {
  const innerHtml = marked.parse(p1.replace(/^> /gm, ''));
  return `<div class="callout callout-important"><div class="callout-header">⚠️ IMPORTANT: DATA PRIVACY & COMPLIANCE</div><div class="callout-body">${innerHtml}</div></div>`;
});

mdContent = mdContent.replace(/> \[!TIP\]\n([\s\S]*?)(?=\n\n|$)/g, (match, p1) => {
  const innerHtml = marked.parse(p1.replace(/^> /gm, ''));
  return `<div class="callout callout-tip"><div class="callout-header">💡 OPERATIONAL TIP</div><div class="callout-body">${innerHtml}</div></div>`;
});

// Inline images as Base64 data URIs
const imgRegex = /!\[(.*?)\]\(\.\/images\/(.*?)\)/g;
mdContent = mdContent.replace(imgRegex, (match, alt, filename) => {
  const fullImgPath = path.join(imagesDir, filename);
  if (fs.existsSync(fullImgPath)) {
    const b64 = fs.readFileSync(fullImgPath).toString('base64');
    return `
<figure class="guide-figure">
  <div class="figure-frame">
    <img src="data:image/png;base64,${b64}" alt="${alt}" />
  </div>
  <figcaption><span class="fig-label">Figure:</span> ${alt}</figcaption>
</figure>`;
  }
  return match;
});

const bodyHtml = marked.parse(mdContent);

const fullHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Plexo v0.1 Official User Guide</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm 20mm 16mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }

    /* Cover / Title styling */
    h1 {
      font-size: 22pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
      margin-top: 0;
      margin-bottom: 4px;
      line-height: 1.2;
    }
    h2:first-of-type {
      font-size: 13pt;
      font-weight: 600;
      color: #4f46e5;
      margin-top: 0;
      margin-bottom: 20px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 10px;
    }
    h2 {
      font-size: 14pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 26px;
      margin-bottom: 12px;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 6px;
      page-break-after: avoid;
    }
    h3 {
      font-size: 11.5pt;
      font-weight: 700;
      color: #1e293b;
      margin-top: 18px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }
    h4 {
      font-size: 10.5pt;
      font-weight: 700;
      color: #334155;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }
    p, ul, ol {
      margin-top: 0;
      margin-bottom: 10px;
    }
    ul, ol {
      padding-left: 22px;
    }
    li {
      margin-bottom: 4px;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9pt;
      background: #f1f5f9;
      color: #0f172a;
      padding: 1.5px 4px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    strong {
      color: #0f172a;
    }
    hr {
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 20px 0;
    }

    /* Architecture diagram */
    .arch-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      padding: 14px;
      margin: 16px 0;
      page-break-inside: avoid;
    }
    .arch-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .arch-title {
      font-size: 9.5pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
      text-align: center;
    }
    .arch-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 8.5pt;
      text-align: center;
      color: #334155;
    }
    .arch-card.danger {
      background: #fef2f2;
      border-color: #fca5a5;
      color: #991b1b;
      font-weight: 600;
    }
    .arch-arrow {
      font-weight: 800;
      font-size: 12pt;
      text-align: center;
      color: #4f46e5;
      line-height: 1.2;
    }

    /* Callouts */
    .callout {
      border-radius: 8px;
      padding: 12px 14px;
      margin: 14px 0;
      page-break-inside: avoid;
      font-size: 9.5pt;
    }
    .callout-header {
      font-weight: 800;
      font-size: 9pt;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .callout-important {
      background: #fffbeb;
      border: 1.5px solid #fcd34d;
      color: #92400e;
    }
    .callout-important .callout-header {
      color: #b45309;
    }
    .callout-tip {
      background: #eef2ff;
      border: 1.5px solid #c7d2fe;
      color: #3730a3;
    }
    .callout-tip .callout-header {
      color: #4338ca;
    }
    .callout-body p:last-child {
      margin-bottom: 0;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin: 14px 0;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 700;
      color: #0f172a;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }

    /* Figures & Screenshots */
    .guide-figure {
      margin: 16px 0;
      text-align: center;
      page-break-inside: avoid;
    }
    .figure-frame {
      display: inline-block;
      max-width: 100%;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      background: #f8fafc;
    }
    .figure-frame img {
      display: block;
      max-width: 100%;
      max-height: 480px;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    figcaption {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 6px;
      font-style: italic;
    }
    .fig-label {
      font-weight: 700;
      color: #475569;
      font-style: normal;
    }

    /* Section breaks */
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

async function generatePdf() {
  console.log('Launching headless Edge for PDF generation...');
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

  console.log('Rendering print PDF document...');
  const pdfBuffer = await page.pdf({
    path: pdfOutPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '16mm',
      bottom: '18mm',
      left: '14mm',
      right: '14mm'
    },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width:100%;font-family:sans-serif;font-size:7pt;color:#94a3b8;display:flex;justify-content:space-between;padding:0 14mm;border-bottom:0.5px solid #e2e8f0;padding-bottom:3px;">
        <span>PLEXO: SINGAPORE SCHOOL EXAM SEATING ENGINE (v0.1)</span>
        <span>OFFICIAL OPERATIONS MANUAL</span>
      </div>
    `,
    footerTemplate: `
      <div style="width:100%;font-family:sans-serif;font-size:7pt;color:#94a3b8;display:flex;justify-content:space-between;padding:0 14mm;border-top:0.5px solid #e2e8f0;padding-top:3px;">
        <span>CONFIDENTIAL • FOR SCHOOL EXAMINATION OPERATIONS ONLY</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `
  });

  // Also copy to artifact directory
  fs.writeFileSync(artifactPdfPath, pdfBuffer);

  await browser.close();
  console.log('SUCCESS! PDF generated:');
  console.log(' -> Project root:', pdfOutPath);
  console.log(' -> Artifact directory:', artifactPdfPath);
}

generatePdf().catch(err => {
  console.error('PDF generation error:', err);
  process.exit(1);
});
