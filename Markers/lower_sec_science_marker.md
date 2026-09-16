# Lower Secondary Science Marker (初中科学阅卷引擎)
## Comprehensive Technical & Operational Guide

---

## 1. Overview & Domain Context

The **Lower Secondary Science Marker** (`lower_sec_science`) is an automated grading and visual red-pen annotation engine within Tallus designed for secondary school science examinations (Physics, Chemistry, Biology, and General Science), aligned with Cambridge GCE / Singapore MOE Lower Secondary Science standards.

### Domain Challenges Addressed
1. **Multi-Part Structured Questions**: Exam papers consist of multiple sub-questions (e.g., Q1(a), Q1(b)(i), Q2, Q3) testing distinct scientific concepts, definitions, and experimental setups.
2. **Tabular Data Verification**: Students must fill in data tables with numerical measurements, observations, and derived values. Cell-by-cell validation with appropriate significant figures and units is essential.
3. **Graph Plotting & Spatial Analysis**: Students draw axes, label physical quantities and units, choose linear scales, plot experimental coordinates, and trace lines of best fit or curves. Automated grading must verify coordinate accuracy without confusing student hand-drawn plots with printed problem tables.
4. **Clean Spatial Annotation (Ticks, Crosses & Checklists)**: Marking graphs by scattering red marks randomly creates visual clutter. The system must generate neat, organized checklists in whitespace while circling specific erroneous points directly on the grid.
5. **Cross-Page Question Flow & Continuation Parts**: Structured questions frequently span multiple pages (e.g. Q5(a) and Q5(b) on Page 6, while parts (c) and (d) appear on Page 7 without a repeated "Question 5" header). The engine automatically detects continuing sub-parts, links them to their active parent question, and enriches them with official rubric criteria and titles.

---

## 2. Grading Approach & Rubric Architecture

### 2.1 Question-by-Question / Sub-Part Granular Evaluation
Unlike holistic essay grading, Science marking operates on a **point-by-point criteria-based model**. Each sub-question has an allocated maximum mark ($1.0$ to $5.0$ marks) broken down into explicit criteria:

```json
{
  "question_no": "1(b)",
  "question_title": "Graph Plotting: Temperature vs Time",
  "max_marks": 4.0,
  "awarded_marks": 3.0,
  "criteria": [
    {
      "criterion": "Axes & Labels",
      "max": 1.0,
      "awarded": 1.0,
      "comment": "✓ Correct quantities and units labelled on both axes."
    },
    {
      "criterion": "Linear Scale",
      "max": 1.0,
      "awarded": 0.0,
      "comment": "✗ Error: Y-axis scale numbered 1-5 instead of 0-60 °C. Expected: Linear scale 0-60 °C."
    },
    {
      "criterion": "Plotting Accuracy",
      "max": 1.0,
      "awarded": 1.0,
      "comment": "✓ Points plotted accurately within ±0.5 small square."
    },
    {
      "criterion": "Line Quality",
      "max": 1.0,
      "awarded": 1.0,
      "comment": "✓ Smooth curve drawn through plotted points."
    }
  ],
  "feedback_comment": "✗ Partial credit (3.0/4.0 marks). Linear Scale: Y-axis scale numbered 1-5 instead of 0-60 °C."
}
```

---

### 2.2 Specialized Science Evaluation Protocols

#### 1. Graph & Plot Evaluation Protocol (Standard 4 Criteria)
When evaluating student graphs, the marker applies four standardized criteria:
1. **Axes & Scales (1 mark)**:
   - Evaluates whether quantities and units are correctly labelled (e.g., $\text{Temperature } (^\circ\text{C})$ vs $\text{Time } (\text{s})$).
   - Verifies that the chosen scale is **linear and uniform** across the entire grid and covers $\ge 50\%$ of the available graphing area.
   - Detects non-linear increments (e.g., student jumping from $20$ to $50$ in one interval).
2. **Plotting Accuracy (1 mark)**:
   - Performs a coordinate-by-coordinate comparison between the student's physical marks and the expected data points.
   - Tolerates up to $\pm 0.5$ small square deviation.
   - Detects omitted points (e.g., missing $t=0$) or false plots (e.g., plotting at $(1, 2)$ instead of $(1, 24)$).
3. **Line / Curve Quality (1 mark)**:
   - Evaluates whether the student drew the required line type:
     - **Best-fit line**: Single straight line balancing points on either side.
     - **Single straight line through all points**: Linear relation drawn with a ruler.
     - **Dot-to-dot line segments**: Straight line segments connecting successive points.
     - **Smooth curve**: Continuous smooth curve without kinks or sharp corners.
   - Explicitly notes whether lines were drawn with a ruler, if lines appear branched or "hairy" (sketched freehand), and whether the line correctly starts at the origin $(0,0)$ or the first recorded point.
4. **Gradient / Slope Calculation (1 mark)**:
   - Verifies coordinate substitution from the drawn line using a large gradient triangle (hypotenuse covering $\ge 50\%$ of the line).
   - Checks correct calculation: $\text{Gradient} = \frac{y_2 - y_1}{x_2 - x_1}$ and appropriate units.

#### 2. Tabular Data Evaluation Protocol
- Student tables are transcribed into structured format:
  `[Table: Header=["Time (min)", "Temp (°C)"], Rows=[["0", "24"], ["1", "30"], ...]]`
- Evaluated row-by-row and cell-by-cell against the answer key.
- Scientific rounding and standard significant figures (typically 2–3 s.f.) are accepted unless the question explicitly specifies decimal places.
- Specific cell errors are diagnosed explicitly:
  `✗ Error: Row 3 (Temp) written as '32'. Expected: '36'.`

#### 3. Fill-in-the-Blanks, Definitions & Working Steps
- **1-Mark Questions**: Provide a single concise diagnostic sentence:
  - *Correct*: `✓ Correct (1.0/1.0 marks). Matches marking scheme.`
  - *Error*: `✗ Error (0.0/1.0 marks). Close air-hole before lighting gas. Expected: Air-hole closed.`
- **Multi-Mark Numerical Questions**: Evaluates formula, intermediate substitution step, final numeric answer, and units. Deducts partial credit for missing units or arithmetic slips.

#### 4. Blank Answers
- If an answer field is blank, the marker records: `[Blank / No response]`.
- Awards $0.0$ marks with feedback: `No marks awarded (0/X). Question left blank.`
- On the physical script, places a single centered red cross without hallucinating criteria.

---

### 2.3 Feedback Synthesis (Step 2)
The synthesis stage summarizes overall performance into high-impact, actionable feedback:
1. **Overall Feedback**: Direct, encouraging, and brief (maximum 2–3 sentences).
2. **Strengths**: Exactly 2 concise bullet points highlighting what the student mastered (under 8 words each).
3. **Areas for Improvement**: Exactly 2 actionable bullet points referencing the specific question and mistake to fix (under 12 words each).

---

## 3. Spatial Grounding Architecture & Implementation

Science papers present unique spatial challenges due to diagrams, calculation working spaces, tables, and graph grids. Tallus implements coordinate grounding to guarantee that visual red-pen annotations align directly with handwritten steps and plotted features.

### 3.1 Coordinate Representation & Normalization
- All bounding boxes are normalized to an absolute **$[0..1000]$ integer coordinate space**:
  $$\text{bbox\_2d} = [y_{\min}, x_{\min}, y_{\max}, x_{\max}]$$
  where $y_{\min}, y_{\max}$ represent the vertical position (0 at top, 1000 at bottom), and $x_{\min}, x_{\max}$ represent horizontal position (0 at left, 1000 at right).
- The `normalize_bbox` utility in [`app/core/direct_marker.py`](file:///c:/Users/hejia/Documents/Antigravity/AI%20Marker/app/core/direct_marker.py) validates and sanitizes bounding boxes:
  1. Clamps coordinates within $[0, 1000]$.
  2. Ensures positive spans ($y_{\max} > y_{\min}$ and $x_{\max} > x_{\min}$). If inverted or collapsed, it assigns default minimal spans ($\Delta y \ge 50$, $\Delta x \ge 80$).
  3. Translates to physical rendering pixels:
     $$y_{\text{px}} = \frac{y_{\text{norm}}}{1000} \times H_{\text{page}}, \quad x_{\text{px}} = \frac{x_{\text{norm}}}{1000} \times W_{\text{page}}$$

### 3.2 Evidence Anchoring to Prevent Coordinate Drift
A critical design element of the science marker is the `"evidence"` field requirement in every annotation:
```json
{
  "evidence": "3 - 1 = 2",
  "type": "tick",
  "bbox_2d": [320, 142, 345, 198],
  "score": "1",
  "remark": ""
}
```
- By requiring the model to extract the exact handwritten text snippet alongside the bounding box, cross-attention in the vision transformer binds the spatial box to the specific character tokens.
- Bounding boxes are strictly constrained: **ticks and crosses must tightly surround only the relevant word, formula, or unit**, rather than spanning the full width of the answer line.

### 3.3 Graph Grounding & Coordinate Verification Protocol
For graph questions, grounding operates in two complementary spatial modalities:

```
+--------------------------------------------------------------------+
| GRAPH PLOTTING GRID                                                |
|                                         +------------------------+ |
|                                         | ✓ Axes & Labels (1/1)  | |  <- Vertical Checklist
|         x                               | ✗ Linear Scale  (0/1)  | |     in empty whitespace
|        /                                | ✓ Plot Accuracy (1/1)  | |     (stacked bbox_2d)
|       /                                 | ✓ Smooth Curve  (1/1)  | |
|      /                                  +------------------------+ |
|     x  ⭕ [Circle around wrong point]                              |
|    /      (tightly surrounds plotted coordinate)                   |
|   x                                                                |
+--------------------------------------------------------------------+
```

1. **The Vertical Checklist in Whitespace**:
   - Rather than scattering ticks over the curve, the model stacks criteria annotations vertically in the white margin adjacent to the graph (e.g., $y \in [550..650], x \in [700..950]$).
   - Each criterion has its own `tick` or `cross`, with the `"remark"` field containing the criterion title.
2. **Point-Level Circling on the Grid (`circle`)**:
   - If a student plots a point with coordinate error exceeding $\pm 0.5$ small square, a separate annotation of type `"circle"` is created.
   - Its bounding box tightly encloses the specific wrongly plotted point, and its `"remark"` succinctly states the error (e.g., `"plotted (1,2) exp (1,24)"`).

---

## 4. Context Window Sizing & Token Budget Allocation

Context budgeting must account for the token overhead of multimodal vision patches alongside structured multi-part rubrics and parallel sub-question evaluation.

### 4.1 Global Context Limits
Configured in [`app/core/config.py`](file:///c:/Users/hejia/Documents/Antigravity/AI%20Marker/app/core/config.py):
- `DEFAULT_OCR_NUM_CTX = 8192`: Accommodates high-res image patches plus multi-question OCR extraction.
- `DEFAULT_GRADING_NUM_CTX = 8192`: Accommodates complete marking schemes, structured graph guidance, and reasoning steps.

### 4.2 Token Budget by Question Type & Operation

| Operation / Question Type | Model Mode | Input Budget | Output Limit (`num_predict`) | Context Limit (`num_ctx`) | Detailed Breakdown & Token Dynamics |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page OCR Extraction (Step 1A)** | Vision (`qwen3.8:latest`) | ~2,500 – 3,200 | 1,500 | 8,192 | Page image embedding (150 DPI) consumes ~1,800–2,400 vision tokens; prompt ~350 tokens; structured OCR text output ~400–1,200 tokens. |
| **1-Mark Discrete Item (e.g. Q1a)** | Text (`qwen3.8:latest`) | ~1,200 – 1,800 | 500 | 8,192 | Assignment rubric context (~1,000–1,500 tokens) + short student answer (~20 tokens); JSON output ~120 tokens. |
| **Multi-Mark Numerical / Formula (e.g. Q2b, 3m)** | Text (`qwen3.8:latest`) | ~1,500 – 2,200 | 1,000 | 8,192 | Rubric formula & method criteria (~1,200 tokens) + student multi-line working (~100 tokens); JSON criteria array output ~350 tokens. |
| **Data Table Question (e.g. Q3a, 3m)** | Text (`qwen3.8:latest`) | ~1,800 – 2,500 | 1,500 | 8,192 | Expected table key (~400 tokens) + parsed `[Table: ...]` string (~250 tokens) + rubric (~1,200 tokens); output criteria ~450 tokens. |
| **Graph Plotting Question (e.g. Q1e, 4m)** | Text (`qwen3.8:latest`) | ~2,800 – 3,800 | **3,000** | 8,192 | Full marking scheme (~1,500 tokens) + `SCIENCE_GRAPH_EVALUATION_GUIDANCE` (~600 tokens) + parsed `[Graph: ...]` string (~300 tokens); detailed 4-criteria JSON output ~800 tokens (`num_predict=3000` prevents truncation). |
| **Overall Feedback Synthesis (Step 2)** | Text (`qwen3.8:latest`) | ~2,000 – 3,000 | **1,500** | 8,192 | Question-by-question summary of all marks and notes (~1,500 tokens) + synthesis prompt (~500 tokens); concise JSON output ~300 tokens. |
| **Direct Marking (Red Pen On-Script)** | Vision (`qwen3.8:latest`) | ~3,200 – 4,500 | 2,000 | 8,192 | Scanned page image (~2,200 tokens) + marking scheme (~1,200 tokens) + red-pen rules (~800 tokens); JSON annotations list ~600–1,200 tokens. |

---

## 5. Prompt Engineering: Direct Prescriptive Rules vs. Rejection Cases

### 5.1 The "Refusal & Hedging Trap" in Science Marking
Standard LLMs frequently refuse to mark technical student work when prompted with negative constraints, such as:
- *"Do not grade if the graph is hand-drawn or uncalibrated."*
- *"Reject if student working is untidy or coordinates cannot be verified with 100% certainty."*
- *"Do not evaluate lines without a physical ruler measurement."*

When faced with such negative phrasing, models routinely output disclaimers:
> *"As an AI, I am unable to measure physical graph coordinates or verify ruler straightness. Please have a human teacher review this script."*

This completely halts automated marking.

### 5.2 The Prescriptive Protocol Strategy
Tallus system prompts eliminate all negative refusal triggers and mandate **deterministic, affirmative evaluation protocols**:

#### 1. Prescriptive Grid Inspection Protocol
Instead of asking the model if it can verify coordinates, the prompt directly specifies **how** to transcribe and evaluate:
```
STRICT GRID FIDELITY FOR GRAPHS (NEVER COPY FROM PRINTED DATA TABLES):
1. Look directly at the student's physical handwritten axis numbers on the grid.
   - If the student wrote '1, 2, 3, 4, 5' on the vertical axis instead of tens, transcribe Y-axis scale as '1, 2, 3, 4, 5'.
2. Read the EXACT visual coordinates where each hand-drawn cross 'x' or dot was physically marked on the grid.
   - Do NOT copy the table's expected numbers. Transcribe the actual grid intersections marked.
   - If the student omitted a data point (e.g. t=0) or started from origin (0,0), explicitly note it.
```
This forces the model into an active recording role rather than an epistemological judgment of its own optical limitations.

#### 2. Deterministic Positive Branches for Edge Cases
Every potential edge case has an explicit affirmative execution path:
- **Blank Spaces**:
  `If blank, write: Question <No>: [Blank / No response]`
  `Place a SINGLE "cross" centered in the empty space. "score": "0". "remark": "".`
- **Rounding & Significant Figures**:
  `Allow reasonable scientific rounding / standard significant figures unless exact decimal places are specified.`
- **Partial Credit for Erroneous Units**:
  Rather than "Do not award marks if units are wrong", the prompt instructs:
  `If numerical value is correct but unit is missing or incorrect, award method marks and deduct unit mark.`

#### 3. Structured Intermediate Formats
To prevent the model from getting confused between the question's printed data and the student's actual answers, the extraction prompt enforces intermediate structured notations:
- **Tables**: `[Table: Header=[...], Rows=[[...], ...]]`
- **Graphs**: `[Graph: X-axis="...", Y-axis="...", Plotted Points=[...], Line="..."]`

This cleanly decouples the **visual OCR extraction** from the **reasoning evaluation**, allowing the reasoning model to perform mathematical and coordinate comparisons deterministically on verified text.

---

## 6. API Calls & Protocol Specifications

### 6.1 FastAPI Endpoints

#### 1. Ingest & Auto-Split Combined Class Scan
- **Method**: `POST /api/submissions/split-combined-scan`
- **Form Data**:
  - `assignment_id` (int): Target assignment.
  - `pages_per_student` (int): Number of pages per student (e.g., 2).
  - `reverse_pages_per_student` (bool): If true, reverses page order per student.
  - `file` (UploadFile): Multi-student PDF scan.
- **Action**: Auto-splits combined class PDF into individual student submissions, runs Page 1 name OCR, and matches against student database.

#### 2. Step 1A: Verbatim Student Response Extraction
- **Method**: `POST /api/submissions/{id}/grade-step1a` (or `/extract`)
- **Body**:
  ```json
  {
    "vision_model": "qwen3.8:latest",
    "marker_type": "lower_sec_science"
  }
  ```
- **Action**: Extracts student answers, tables, and graph structures question-by-question.

#### 3. Step 1B: Mark Extracted Questions
- **Method**: `POST /api/submissions/{id}/grade-step1b`
- **Body**:
  ```json
  {
    "reasoning_model": "qwen3.8:latest",
    "marker_type": "lower_sec_science"
  }
  ```
- **Action**: Evaluates extracted answers against the marking scheme, assigns criterion-level marks, and synthesizes feedback.

#### 4. Full-Auto 2-Step Grading
- **Method**: `POST /api/submissions/{id}/grade`
- **Body**:
  ```json
  {
    "vision_model": "qwen3.8:latest",
    "reasoning_model": "qwen3.8:latest",
    "marker_type": "lower_sec_science"
  }
  ```

#### 5. Direct Marking (Red-Pen Visual Annotations)
- **Method**: `POST /api/submissions/{id}/direct-mark`
- **Body**:
  ```json
  {
    "vision_model": "qwen3.8:latest",
    "marker_type": "lower_sec_science"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "submission_id": 42,
    "marker_used": "lower_sec_science",
    "annotations": [
      {
        "id": "ann_p1_1",
        "page_number": 1,
        "type": "tick",
        "bbox_2d": [320, 142, 345, 198],
        "score": "1",
        "remark": ""
      },
      {
        "id": "ann_p1_2",
        "page_number": 1,
        "type": "circle",
        "bbox_2d": [410, 260, 432, 310],
        "score": "",
        "remark": "wrong unit"
      },
      {
        "id": "ann_p1_3",
        "page_number": 1,
        "type": "tick",
        "bbox_2d": [550, 700, 580, 950],
        "score": "1",
        "remark": "Axes labelled"
      },
      {
        "id": "ann_p1_4",
        "page_number": 1,
        "type": "cross",
        "bbox_2d": [580, 700, 610, 950],
        "score": "0",
        "remark": "Linear scale"
      }
    ]
  }
  ```

---

### 6.2 Local Ollama Prompts & Payloads

#### A. Step 1A: Science OCR & Graph Extraction Prompt
```
Extract student handwriting from Page {p_idx} of {total_pages}.

CRITICAL RULES:
1. ONLY transcribe HANDWRITTEN student answers. Ignore all pre-printed question text.
2. STRICT GRID FIDELITY FOR GRAPHS (NEVER COPY FROM PRINTED DATA TABLES):
   - Look directly at the student's physical handwritten axis numbers on the grid.
   - Read the EXACT visual coordinates where each hand-drawn cross 'x' or dot was physically marked on the grid.
   - Transcribe graph format strictly as:
     Question <No>: [Graph: X-axis="<Label & Unit>" (Scale: <Scale>), Y-axis="<Label & Unit>" (Scale: <Scale>), Plotted Points: [(x1, y1), (x2, y2)...] (Total N points), Line: "<Detailed description: ruler usage, best fit, curve, origin>"]
3. TABULAR DATA:
   - Transcribe filled-in cells row-by-row into:
     Question <No>: [Table: Header=["<Col1>", "<Col2>"], Rows=[["<Val1>", "<Val2>"], ...]]
4. FILL-IN-THE-BLANKS & MEASUREMENTS:
   - Extract exact handwritten value and unit.
5. If blank, write: Question <No>: [Blank / No response]

Output format strictly:
Question <No>: <Answer>
```

#### B. Step 1B: Science Question Evaluation Prompt
```
You are an expert science examiner grading Question {q_no}.

Subject: {subject}
Assignment: {assignment_title}
Question: {q_no} - {q_title}
Maximum Marks: {q_max}

OFFICIAL MARKING SCHEME & RUBRIC:
{marking_scheme}

TABULAR DATA & GRAPH EVALUATION PROTOCOLS:
1. Tabular: evaluate row-by-row against expected table; check units and standard rounding.
2. Graph: standard 4 criteria (Axes & Labels, Linear Scale, Plotting Accuracy, Line/Curve Quality).

STUDENT EXTRACTED ANSWER / WORKING FOR QUESTION {q_no}:
{extracted}

GRADING & FEEDBACK INSTRUCTIONS:
1. Evaluate every rubric criterion and determine awarded_marks (0.0 to {q_max}).
2. Populate 'criteria' array with criterion, max, awarded, and comment.
3. For feedback_comment: provide a comprehensive diagnostic summary stating specific errors and expected correct values.
4. Return STRICTLY valid JSON:
{
  "awarded_marks": 3.0,
  "criteria": [
    {"criterion": "Axes & Labels", "max": 1.0, "awarded": 1.0, "comment": "✓ Quantity and units labelled correctly."},
    {"criterion": "Linear Scale", "max": 1.0, "awarded": 0.0, "comment": "✗ Error: Y-axis scale numbered 1-5 instead of 0-60 °C."}
  ],
  "feedback_comment": "✗ Error: Y-axis scale numbered 1-5 instead of 0-60 °C; points plotted accurately."
}
```

#### C. Step 2: Concise Science Feedback Synthesis Prompt
```
You are an encouraging science teacher writing concise feedback for {student_name}'s science assignment.

Subject: {subject}
Assignment: {assignment_title}
Overall Result: {computed_awarded} / {computed_max} marks ({pct}%) - Grade {grade}

QUESTION-BY-QUESTION SUMMARY:
{summary_text}

RULES FOR CONCISE SUMMARY (STRICT):
1. 'overall_feedback': Direct and brief (MAX 2-3 sentences).
2. 'strengths': 2 short bullet points highlighting what went well (under 8 words each).
3. 'areas_for_improvement': 2 short bullet points stating exact question and error to fix (under 12 words each).
4. Return STRICTLY JSON:
{
  "overall_feedback": "Dear {student_name}, solid effort scoring {computed_awarded}/{computed_max} ({pct}%). Review the specific errors highlighted below to master key science concepts.",
  "strengths": [
    "Accurate graph axis scaling",
    "Precise scientific terminology"
  ],
  "areas_for_improvement": [
    "Review Question 2(a): close air-hole before lighting gas",
    "Review Question 1(e): ensure graph line is drawn with ruler"
  ]
}
```

#### D. Direct Marking Vision Prompt (Red Pen On-Script)
```
You are a teacher marking a student's scanned handwritten script using a RED PEN.

Subject: {subject}
Assignment: {assignment_title}
Total Marks: {max_marks}

MARKING SCHEME:
{marking_scheme}

MARKING RULES:
TICKS ("tick"): Draw tick immediately after correct word/step. bbox_2d tight around word. score field populated.
CROSSES ("cross"): Draw cross immediately after wrong step. score "0".
CIRCLES ("circle"): Circle SPECIFIC erroneous word, number, or unit. remark <=8 words (e.g., "wrong unit").
GRAPHS: Do NOT scatter individual marks. Create a vertical checklist in empty whitespace near graph with criterion names in remarks. In addition, circle erroneously plotted points.
BLANK ANSWERS: Place a SINGLE centered cross in empty space. score "0".

bbox_2d = [ymin, xmin, ymax, xmax] on absolute 0..1000 scale.
Return STRICTLY valid JSON:
{
  "page_annotations": [
    {"evidence": "3 - 1 = 2", "type": "tick", "bbox_2d": [320, 142, 345, 198], "score": "1", "remark": ""},
    {"evidence": "32 °C", "type": "circle", "bbox_2d": [410, 260, 432, 310], "score": "", "remark": "wrong unit"}
  ]
}
```

---

## 7. End-to-End Parser & Grading Pipeline

```
+---------------------------------------------------------------------------------+
|                    TALLUS LOWER SEC SCIENCE PIPELINE                            |
+---------------------------------------------------------------------------------+

  [ 1. Ingest & Bulk Document Splitting ]
  ├── Upload Combined Class PDF via /api/submissions/split-combined-scan
  ├── PyMuPDF: Chunk into student documents (e.g. 2 pages / student)
  ├── Automatic page reversal & rotation handling (90°, 180°, 270°)
  └── Extract Student Identity (Handwritten name OCR on page 1) -> Match Roster

                    │
                    ▼

  [ 2. Rubric Ingestion & Scheme Structuring ]
  ├── Upload marking scheme (.docx, .pdf, image) via /api/assignments/upload-marking-scheme
  ├── extract_text_and_tables_from_docx or Vision OCR on image rubrics
  └── extract_relevant_marking_scheme: isolate clean questions, marks, and answers

                    │
                    ▼

  [ 3. Step 1A: Verbatim Response Extraction ]
  ├── Vision Model Call (qwen3.8:latest, temp=0.0, num_ctx=8192)
  ├── Transcribe question-by-question student handwriting
  ├── Strict Grid Fidelity: transcribe actual physical grid coordinates & axis numbers
  └── Transcribe structured tables: [Table: Header=[...], Rows=[[...]]]

                    │
                    ▼

  [ 4. Teacher Verification Checkpoint (Optional) ]
  ├── Teacher views verbatim student responses in dashboard UI
  └── Quick text adjustments if scan had extreme handwriting ambiguity

                    │
                    ▼

  [ 5. Step 1B: Concurrent Rubric Evaluation ]
  ├── ThreadPoolExecutor: evaluate sub-questions in parallel (up to 3 threads)
  ├── Science Graph Evaluation Protocol:
  │   ├── Check 1: Axes & Labels (quantity + unit)
  │   ├── Check 2: Linear Scale (>=50% grid, uniform interval)
  │   ├── Check 3: Plotting Accuracy (±0.5 small square tolerance)
  │   └── Check 4: Line Quality (ruler, best fit, curve, origin)
  ├── Table Evaluation Protocol: cell-by-cell matching with sig figs/rounding
  └── Award criteria marks & compile diagnostic comments

                    │
                    ▼

  [ 6. Step 2: Feedback Synthesis ]
  ├── Reasoning Model Call (qwen3.8:latest, temp=0.1, num_predict=1500, num_ctx=8192)
  ├── Direct overall feedback (2-3 sentences)
  ├── 2 concise strengths (<8 words each)
  └── 2 actionable improvement targets (<12 words each)

                    │
                    ▼

  [ 7. Direct Marking: Spatial Red Pen Annotations ]
  ├── Vision Model generates grounded coordinates [ymin, xmin, ymax, xmax] (0..1000)
  ├── Graph Checklist Placement: vertical checklist in graph whitespace
  ├── Erroneous points circled directly on the grid
  └── Margin scoring & single centered cross for blank responses

                    │
                    ▼

  [ 8. Teacher Review Station & Persistence ]
  ├── Split-screen verification (scan on left, marks & comments on right)
  ├── One-click teacher approval (/api/grading/{sub_id}/approve)
  ├── Persistent SQLite database update & student trajectory tracking
  └── Generate publication-ready A4 PDF report (/api/reports/{sub_id}/pdf)
```

### Pipeline Key Invariants
- **100% Offline & Private**: Zero external cloud APIs. All models run on local Ollama server.
- **Granular Diagnostic Feedback**: Students receive exact error explanations (e.g., stating the exact wrong coordinate and the expected value) rather than generic score deductions.
- **Clean Graph Feedback**: Spatial checklists prevent graphical clutter, keeping student working legible under the red pen markings.
