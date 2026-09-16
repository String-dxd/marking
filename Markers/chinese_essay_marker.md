# Chinese Essay Marker (华文作文阅卷引擎)
## Comprehensive Technical & Operational Guide

---

## 1. Overview & Domain Context

The **Chinese Essay Marker** (`chinese_essay`) is a specialized evaluation and visual red-pen annotation engine within Tallus designed for continuous Chinese compositions (华文作文 / 记叙文 / 说明文 / 议论文), primarily aligned with Singapore MOE secondary school and O-Level marking standards.

### Domain Challenges Addressed
1. **Continuous Handwritten Script**: Chinese compositions do not follow structured question-and-answer templates. Students write continuous paragraphs across multiple pages of manuscript paper.
2. **Paper Medium Variance**: Scripts are typically written on either **square grid paper** (方格纸 / 田字格, standard 16 columns) or **single-lined foolscap paper** (横线纸 / 行格纸, e.g., SCGS 29-line foolscap).
3. **Student Self-Edits & Scratch-Outs**: Students frequently cross out words, make interlinear caret insertions ($\land$), write additions in the side margins, or make large ink blotches. An automated marker must recognize student self-corrections without penalizing words the student intentionally struck out.
4. **Master-Teacher Red-Pen Pedagogical Marking**: Traditional teachers do not scatter disjointed single-character corrections across a page. They prioritize high-leverage pedagogical interventions: macro-level prompt alignment stars in the margin, structural narrative pruning, exemplar clause rewrites ("★改"), and micro-action descriptive insertions.

---

## 2. Grading Approach & Rubric Architecture

### 2.1 The Holistic 60-Mark Scale
Chinese essay grading uses a holistic **60-mark total**, divided equally into two primary dimensions:

$$\text{Total Score (60m)} = \text{内容 (Content, 30m)} + \text{语言与结构 (Language \& Structure, 30m)}$$

```
+-------------------------------------------------------------------------------+
|                        TOTAL ESSAY MARKS: 60 MARKS                            |
+---------------------------------------+---------------------------------------+
|          内容 (Content) [30m]          |    语言与结构 (Language) [30m]        |
+---------------------------------------+---------------------------------------+
| Band 1 (25 - 30m): 切题深刻，立意高远 | Band 1 (25 - 30m): 词汇丰富，句式优美 |
| Band 2 (19 - 24m): 主题明确，详略得当 | Band 2 (19 - 24m): 语句通顺，衔接自然 |
| Band 3 (13 - 18m): 内容基本完整，欠生动 | Band 3 (13 - 18m): 表达平实，少许语病 |
| Band 4 ( 7 - 12m): 偏离主题，情节空泛 | Band 4 ( 7 - 12m): 语句不通，错字较多 |
| Band 5 ( 1 -  6m): 严重偏题，结构混乱 | Band 5 ( 1 -  6m): 词不达意，语病严重 |
+---------------------------------------+---------------------------------------+
```

#### Criteria Breakdown
1. **内容 (Content - 30 Marks)**:
   - **切合题意 (Adherence to Theme & Keywords)**: E.g., if the prompt specifies "想尽办法" (exhausting all means to help), the student must depict multiple progressive micro-actions (e.g., searching navigation, calculating bus transfer, calling family) rather than a single trivial act.
   - **详略安排 (Pacing & Proportion)**: Ensuring the preamble/cause does not overshadow the core climax; pruning unnecessary travel or background descriptions.
   - **思想立意与真情实感 (Theme, Empathy, Maturity)**: Emotional depth, character motivations, and personal reflection.
2. **语言与结构 (Language & Structure - 30 Marks)**:
   - **语句通顺与表达 (Syntactic Fluency)**: Natural sentence flow without awkward Westernized Chinese phrasing.
   - **错别字与错笔画 (Character Precision)**: Identification of homophone substitutions (同音错字) or stroke errors.
   - **助词运用 (Structural Particles)**: Strict verification of "的/地/得" usage (e.g., "温柔地问", "跑得快").
   - **词汇升级 (Vocabulary Upgrades)**: Upgrading weak/colloquial collocations (e.g., "放进手机" $\rightarrow$ "输入搜索引擎", "多了精神" $\rightarrow$ "更有精神").
   - **句式变化与段落过渡 (Transitions & Variety)**: Cohesion markers, direct/indirect speech balance, and rhetorical devices.

### 2.2 Realistic Teacher Scoring (Center-Compression)
Standard LLM prompting tends to produce grade inflation (awarding 26-28 marks in Band 1) or harsh binary penalties. Tallus implements **teacher center-compression**:
- Anchors realistic grading around **Band 2 to Band 3** (18–22 marks for Content, 17–20 marks for Language) for average-to-good secondary school scripts.
- Evaluates the composition holistically across all scanned pages before distributing component scores.

### 2.3 Student Self-Edit Recognition & Handwriting Hygiene
Tallus incorporates explicit heuristics to protect student corrections:
1. **Self-Strikethroughs (`self_strikethrough`)**: If a student crossed out or blacked out a word, **never place a red pen error marking on it**. The AI grades the intended text resulting from the revision.
2. **Interlinear Insertions (`interlinear_insertion`)**: Text written above the line with an inverted caret ($\land$) is read smoothly in context.
3. **Side Additions (`side_addition`) & Margin Overflows (`margin_overflow`)**: Words written in the left/right margins are recognized as continuation text.
4. **Handwriting Hygiene Diagnosis**: The system tallies total self-corrections and outputs constructive formatting advice (e.g., encouraging neat single-line strikethroughs rather than heavy ink blots; using standard insertion carets).

---

## 3. The 6-Pillar Pedagogical Annotation Hierarchy

Rather than producing generic or scattered red-pen corrections, the updated Chinese essay engine operates according to a strict **6-pillar pedagogical hierarchy**:

```
+---------------------------------------------------------------------------------+
|               6-PILLAR PEDAGOGICAL RED-PEN ANNOTATION HIERARCHY                 |
+---------------------------------------------------------------------------------+
| Pillar 1: 审题与详略边栏旁批 (margin_star)           [Priority 100]             |
|   -> Pinned to right margin: prompt keyword adherence & macro pacing            |
+---------------------------------------------------------------------------------+
| Pillar 2: 篇幅剪裁与过渡衔接 (block_prune)           [Priority 85]              |
|   -> Diagonal slash across bloated preamble with transition bridge sentence     |
+---------------------------------------------------------------------------------+
| Pillar 3: 下水示范分句升格 (clause_rewrite - "★改")   [Priority 75]              |
|   -> Replaces awkward/colloquial phrasing with expressive model exemplar clause |
+---------------------------------------------------------------------------------+
| Pillar 4: 情节常识与生活逻辑审核 (logic_cross)       [Priority 68]              |
|   -> Bold red ✗ on factual impossibilities or real-world rule contradictions   |
+---------------------------------------------------------------------------------+
| Pillar 5: 微动作与生动神态插入 (descriptive_caret)    [Priority 65]              |
|   -> Inverted caret (^) injecting character action, dialogue, or facial detail  |
+---------------------------------------------------------------------------------+
| Pillar 6: 基础字词与助词修正 (char_replace)          [Priority 50]              |
|   -> Circle erroneous character/particle and supply correction above            |
+---------------------------------------------------------------------------------+
```

### Pillar Definitions & Examples
1. **Pillar 1: 审题与详略边栏旁批 (`margin_star` / Priority 100)**:
   - Enforces core prompt keywords (e.g., *"★ 审题提示：你要想尽办法来帮他（建议用三件小事展开：1.搜地图 2.算换乘 3.打电话找家属）"*).
   - Enforces narrative pacing (e.g., *"★ 详略剪裁：起因交代比赛背景宜简练，把篇幅重心留给后续帮助老伯的过程。"*).
2. **Pillar 2: 篇幅剪裁与过渡衔接 (`block_prune` / Priority 85)**:
   - Draws a diagonal strike across bloated preambles.
   - Provides an explicit **`transition_bridge`** (承上启下过渡句) showing how the narrative should connect directly to the core event (e.g., *"当我正要转身离开时，那时，背后传来..."*).
3. **Pillar 3: 下水示范分句升格 (`clause_rewrite` "★改" / Priority 75)**:
   - When a student's sentence is overly colloquial, awkward, or structurally broken, the marker avoids disjointed single-character replacement and provides a complete, expressive model clause rewrite starting with **`★改：`**:
     - Student: *"对自己的比赛的兴奋太忙了"* $\rightarrow$ **★改：内心充满着对比赛的期待。**
     - Student: *"冷模吧？"* $\rightarrow$ **★改：还会冷漠地忽视他人的困境吧？**
     - Student: *"仍然，而他那瘦小的他最后无法挤出车门"* $\rightarrow$ **★改：被人群紧紧困在原地**
4. **Pillar 4: 情节常识与生活逻辑审核 (`logic_cross` / Priority 68)**:
   - Draws a red ✗ on real-world impossibilities (e.g., *"迟到了就无法参加比赛"*).
   - Distinguishes real logical contradictions from normal dramatic dilemmas (e.g., waiting for the grandfather's relative before running to the pitch is valid narrative progression, not a logical contradiction).
5. **Pillar 5: 微动作与生动神态插入 (`descriptive_caret` / Priority 65)**:
   - Uses an inverted caret ($\land$) above the line to inject vivid sensory, emotional, or character descriptions:
     - Student: *"阳光透过窗"* $\rightarrow$ $\land$ **温暖的**
     - Student: *"正站在我后面"* $\rightarrow$ $\land$ **满脸期待地看着我**
6. **Pillar 6: 基础字词与助词修正 (`char_replace` / Priority 50)**:
   - Circles wrong characters or homophones (e.g., "冷模" $\rightarrow$ "漠", "一目" $\rightarrow$ "幕").
   - Strictly corrects "的/地/得" misuse (e.g., "一个小声的" $\rightarrow$ "地").
   - Upgrades informal vocabulary (e.g., "走法" $\rightarrow$ "途径", "放进手机" $\rightarrow$ "输入搜索引擎").

---

## 4. Master Teacher Annotation Density & Clutter Control Engine

A critical challenge in automated marking is **visual clutter**: an AI model can easily generate 30+ annotations on a single page, rendering the student's paper unreadable.

Tallus implements the **`filter_and_rank_annotations`** engine ([`app/core/essay_marker.py`](file:///c:/Users/hejia/Documents/Antigravity/AI%20Marker/app/core/essay_marker.py)):

```
+--------------------------------------------------------------------+
|                FILTER AND RANK ANNOTATION ENGINE                   |
+--------------------------------------------------------------------+
|  1. Ingest raw model annotations across page                       |
|  2. Assign priority weight based on 6-Pillar Hierarchy (25..100)   |
|  3. Partition into Margin Annotations vs Inline Annotations        |
|  4. Enforce Strict Density Caps:                                   |
|     - Maximum 5 Inline Annotations per page                        |
|     - Maximum 2 Lateral Margin Notes per page                      |
|  5. Sort selected annotations in natural vertical reading order    |
+--------------------------------------------------------------------+
```

### Density Budget per Page
- **Maximum 5 Inline Annotations**: High-leverage clause rewrites, structural prunes, and core character corrections are retained; low-priority stylistic nitpicks (`word_delete`, generic `remark`) are automatically pruned.
- **Maximum 2 Margin Notes**: Prevents the right margin from overflowing and colliding with vertical lines.
- **Natural Vertical Reading Order**: After filtering, annotations are re-sorted by $(y_{\min}, x_{\min})$ so the teacher and student read annotations in smooth top-to-bottom sequence.

---

## 5. Spatial Grounding Architecture & Implementation

### 5.1 Coordinate Normalization
- All internal coordinate arrays use the **normalized $[0..1000]$ integer format**:
  $$\text{bbox\_2d} = [y_{\min}, x_{\min}, y_{\max}, x_{\max}]$$
  where $(0, 0)$ represents top-left, and $(1000, 1000)$ represents bottom-right.
- Image rendering converts this to physical pixels:
  $$y_{\text{px}} = \frac{y_{\text{norm}}}{1000} \times H, \quad x_{\text{px}} = \frac{x_{\text{norm}}}{1000} \times W$$

### 5.2 Coordinate Orientation & Transposition Defense
Vision models frequently transpose coordinates on non-English text spans ($[x_{\min}, y_{\min}, x_{\max}, y_{\max}]$ instead of $[y_{\min}, x_{\min}, y_{\max}, x_{\max}]$).
The `sanitize_coordinate_orientation` function dynamically intercepts and rectifies this:
1. Computes $\text{span}_0 = |v_2 - v_0|$ and $\text{span}_1 = |v_3 - v_1|$.
2. In standard horizontal Chinese script, a multi-character phrase must have width ($\text{span}_x$) significantly larger than height ($\text{span}_y$).
3. If $\text{span}_0 > 1.3 \times \text{span}_1$ for horizontal text of length $\ge 2$, the dimensions are inverted.
4. Inline corrections are clamped to a standard row height of $\approx 35$ normalized units, centering on the target text line to eliminate vertical drift.

### 5.3 Text-to-Grid Cell Grounding (Square Grid Paper)
On square grid composition paper (`STANDARD_CHINESE_GRID`), the layout is determined by physical grid rows and 16 horizontal columns:
1. **Anchor Search (`find_best_anchor_in_lines`)**:
   - Matches the target character or phrase in the transcribed text lines.
   - Exact phrase match with relative position disambiguation using the `"evidence"` context snippet.
   - Common OCR misread correction table (e.g., mapping misread "偶然" $\rightarrow$ "仍然", "还好" $\rightarrow$ "心想").
   - Longest continuous substring matching (length $\ge 2$).
2. **Grid Coordinate Calculation (`get_grid_cell_bbox`)**:
   - Maps the identified `(start_line, start_col, end_line, end_col)` to physical row and column boundaries.
3. **Ink-Level Shrink-Wrapping (`tighten_to_ink`)**:
   - Crops the cell image patch, converts it to grayscale, computes the median background brightness $B_{\text{med}}$, and creates a binary ink mask:
     $$\text{Mask}(y, x) = \text{Pixel}(y, x) < \min(160, B_{\text{med}} - 20)$$
   - Finds the bounding box of non-zero mask pixels and applies a conservative $3\text{px}$ padding. This shrink-wraps the bounding box tightly around the physical ink strokes.

### 5.4 Ruled Line Grounding (SCGS Lined Foolscap)
On ruled single-lined foolscap (`SCGS_LINED_GEOMETRY`), vertical grid borders do not exist. Grounding uses horizontal ruled baselines:
1. **Rule Detection (`profile_ruled_lines`)**:
   - Uses adaptive thresholding with a horizontal morphological opening kernel ($\text{kernel} = (0.12 \times W, 1)$) to isolate ruled baselines.
2. **Horizontal Pitch Estimation (`get_lined_word_bbox`)**:
   - Calibrated horizontal pitch ($\approx 25.8$ normalized units per character) prevents short sentences from stretching artificially to the right margin.
   - Clamped and tightened to physical ink strokes within a horizontal search window.

### 5.5 Student Self-Strikethrough Masking
Before any red-pen annotation is committed, the engine passes it through `is_inside_student_strikethrough`:
- If an identified error character falls within the `cell_span` of a student's self-drawn strikethrough, **the annotation is dropped**.
- Guarantees zero false-positive error marks on text the student already self-corrected.

### 5.6 3-Tier Collision Avoidance Layout Engine
The `LayoutEngine` ([`app/core/layout_engine.py`](file:///c:/Users/hejia/Documents/Antigravity/AI%20Marker/app/core/layout_engine.py)) resolves visual collisions based on interlinear headroom clearance:
- **Tier A (Interlinear Float)**: Headroom $\ge 14\text{px} \rightarrow$ annotation placed directly above word.
- **Tier B (Leader-Line Callout)**: Headroom $< 14\text{px} \rightarrow$ target circled, leader line drawn at $45^\circ$ to clear space.
- **Tier C (Lateral Margin Pinning)**: Macro-level star notes (`margin_star`) and exemplar model sentences (`scaffolding`) are pinned in the lateral right margin ($x \ge 845$), connected to the text anchor by a horizontal leader line.

---

## 6. Context Window Sizing & Token Budget Allocation

Context budgeting is configured in [`app/core/config.py`](file:///c:/Users/hejia/Documents/Antigravity/AI%20Marker/app/core/config.py):
- `DEFAULT_OCR_NUM_CTX = 8192`
- `DEFAULT_GRADING_NUM_CTX = 8192`

| Task Stage | Primary Model | Input Tokens (Est.) | Output Budget (`num_predict`) | Context Budget (`num_ctx`) | Rationale / Contents |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page Transcription (Step 1A)** | `qwen3.8:latest` (Vision) | ~2,500 – 3,200 | 1,000 | 8,192 | 150 DPI image embedding (~1,800–2,400 vision tokens) + prompt ~250 tokens; handwriting output ~400–800 tokens. |
| **Holistic Essay Grading** | `qwen3.8:latest` (Reasoning) | ~4,000 – 5,500 | 2,000 | 8,192 | Concatenated 3-page essay text (~2,200–3,500 tokens) + full 60-mark rubric table (~1,200 tokens) + prompt (~600 tokens); JSON output ~600 tokens. |
| **Feedback Synthesis (Step 2)** | `qwen3.8:latest` (Text) | ~2,000 – 2,500 | 1,000 | 8,192 | Scored questions summary (~1,200 tokens) + prompt instructions (~500 tokens); output JSON ~400 tokens. |
| **Direct Marking (Red Pen)** | `qwen3.8:latest` (Vision) | ~3,200 – 4,500 | 2,000 | 8,192 | Page image embedding (~2,000 tokens) + marking scheme (~1,000 tokens) + 6-pillar rules (~800 tokens); output annotation list ~800 tokens. |

---

## 7. Prompt Engineering: Direct Prescriptive Rules vs. Rejection Cases

### 7.1 The "Refusal Trap" in Multimodal Grading
Negative constraints such as *"Do not grade if illegible"* or *"Reject submissions with poor handwriting"* cause models to hedge, issue disclaimers (*"As an AI, I cannot reliably read handwriting"*), or fail to return JSON.

### 7.2 The Prescriptive Affirmative Strategy
Tallus system prompts explicitly **eliminate negative rejection triggers** and replace them with **affirmative, closed-world operational rules**:
1. **Mandatory Positive Execution Branches**:
   - Blank Pages: `若该页无手写内容，输出 [Blank / No handwriting detected]。`
   - Struck-Out Words: `若学生有划掉/涂改的字词，请直接忽略被划除文字，转录其最终书写的有效文字。`
   - Margin & Caret Additions: `遇到行间或边栏补字，按阅读顺畅位置转录。`
2. **Evidence-First Anchoring**:
   - The prompt requires an `"evidence"` string quoting the exact surrounding text from the image before generating the correction, anchoring the attention tokens directly to visual features.
3. **Strict Schema Enforcement**:
   - Enforced via `format_json=True` in Ollama API calls. Fallback bounds checks in Python clamp scores within realistic pedagogical intervals ($10.0 \le \text{score} \le 25.0$).

---

## 8. API Calls & Protocol Specifications

### 8.1 FastAPI Endpoints

#### 1. Upload Submission
- **Method**: `POST /api/submissions/upload`
- **Form Data**:
  - `assignment_id` (int): Target assignment ID.
  - `file` (UploadFile): Student essay scan (PDF, PNG, JPG).
  - `reverse_order` (bool, optional): Reverse page order if scanned back-to-front.
- **Action**: Converts scan to high-res JPEG page images ($150\text{ DPI}$ producing coordinates in $0..1000$ space), extracts student name from Page 1, and initializes submission record.

#### 2. Step 1A: Verbatim Page Transcription
- **Method**: `POST /api/submissions/{id}/grade-step1a` (or `/extract`)
- **Body**:
  ```json
  {
    "vision_model": "qwen3.8:latest",
    "marker_type": "chinese_essay"
  }
  ```
- **Action**: Transcribes student handwriting page-by-page, ignoring printed headers.

#### 3. Full Holistic AI Grading
- **Method**: `POST /api/submissions/{id}/grade`
- **Body**:
  ```json
  {
    "vision_model": "qwen3.8:latest",
    "reasoning_model": "qwen3.8:latest",
    "marker_type": "chinese_essay"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "results": {
      "total_score": 37.0,
      "max_marks": 60.0,
      "percentage": 61.7,
      "grade_letter": "B",
      "questions": [
        {
          "question_no": "1",
          "question_title": "内容 (Content)",
          "max_marks": 30.0,
          "awarded_marks": 19.0,
          "criteria": [
            {"criterion": "内容充实度与切合题意", "max": 15.0, "awarded": 9.5, "comment": "叙事主题明确，起因经过交代基本完整。"},
            {"criterion": "层次与条理 (详略安排)", "max": 15.0, "awarded": 9.5, "comment": "详略部分需调整，重点段落宜增加细节描写。"}
          ],
          "feedback_comment": "内容还算充实，切合题意，有基本起承转合；但详略需进一步优化，重点环节应丰富细节描写。"
        },
        {
          "question_no": "2",
          "question_title": "语言与结构 (Language & Structure)",
          "max_marks": 30.0,
          "awarded_marks": 18.0,
          "criteria": [
            {"criterion": "语句通顺与词语运用", "max": 15.0, "awarded": 9.0, "comment": "语句基本通顺，需注意错别字与动词搭配。"},
            {"criterion": "句式变化与段落衔接", "max": 15.0, "awarded": 9.0, "comment": "句式较单一，转折衔接可更加自然紧凑。"}
          ],
          "feedback_comment": "语句基本通顺，段落衔接尚可；有少许错别字与动词搭配升级空间，句式可更加丰富。"
        }
      ],
      "overall_feedback": "评：详略的部分要理清，把描写的技巧放在帮助老伯方面。",
      "strengths_feedback": "故事主题鲜明，能表达出同理心与换位思考；叙事起因发展交代清楚。",
      "improvement_feedback": "建议压缩起因部分的铺垫，将笔墨集中在核心帮助情节上，运用具体的动作、神态与对话生动刻画。\n\n【卷面自纠与书写诊断】全篇共识别学生自主修改 6 处...",
      "ai_model_used": "qwen3.8:latest + qwen3.8:latest",
      "marker_used": "chinese_essay"
    }
  }
  ```

#### 4. Direct Marking (Red Pen On-Script Annotations)
- **Method**: `POST /api/submissions/{id}/direct-mark`
- **Body**:
  ```json
  {
    "vision_model": "qwen3.8:latest",
    "marker_type": "chinese_essay"
  }
  ```
- **Response**: Generates filtered, ranked annotations adhering to the 6-pillar hierarchy and density caps.

#### 5. Teacher Approval Station
- **Method**: `POST /api/grading/{submission_id}/approve`
- **Body**: Updates final teacher-adjusted marks and marks status as `approved`.

---

## 9. End-to-End Parser & Grading Pipeline

```
+---------------------------------------------------------------------------------+
|                       TALLUS CHINESE ESSAY PIPELINE                              |
+---------------------------------------------------------------------------------+

  [ 1. Ingest & Pre-processing ]
  ├── Upload Scan (PDF / Images) via /api/submissions/upload
  ├── PyMuPDF: Render pages to 150 DPI JPEG (data/processed/{sub_id}/page_N.jpg)
  ├── Page Reordering / Rotation (90°, 180°, 270°) if needed
  └── Extract Student Identity (Handwritten name OCR on page 1)

                    │
                    ▼

  [ 2. Medium & Geometry Profiling ]
  ├── detect_paper_medium (CV Morphology: column lines count)
  │   ├── Grid Paper  -> Standard 16 Columns (STANDARD_CHINESE_GRID)
  │   └── Lined Paper -> SCGS Foolscap Baselines (SCGS_LINED_GEOMETRY)
  └── LayoutEngine: Profile horizontal text lines & interlinear headroom

                    │
                    ▼

  [ 3. Step 1A: Verbatim Transcription & Edit Parsing ]
  ├── Multimodal Vision Call (qwen3.8:latest, temp=0.0, num_ctx=8192)
  ├── Extract student handwriting page-by-page (ignoring printed prompts)
  ├── extract_student_edits:
  │   ├── Self-Strikethroughs (omit from penalty)
  │   ├── Caret Insertions (integrate into intended text)
  │   └── Margin Additions (append smoothly)
  └── Assemble clean intended reading text across all pages

                    │
                    ▼

  [ 4. Step 1B / 2: Holistic Grading & Feedback ]
  ├── Reasoning LLM Call (qwen3.8:latest, temp=0.1, format_json=True, num_ctx=8192)
  ├── Score Content (0..30) & Language (0..30) with center-compression
  ├── Generate diagnostic criterion feedback (审题, 详略, 词语搭配)
  └── Compile handwriting hygiene diagnostic report

                    │
                    ▼

  [ 5. Direct Marking & Coordinate Grounding ]
  ├── Vision Model generates candidate annotations via 6-Pillar Hierarchy
  ├── Student strikethrough guard: filter out false positives in struck zones
  ├── Grounding Pass:
  │   ├── Grid: find_best_anchor_in_lines -> get_grid_cell_bbox -> tighten_to_ink
  │   └── Lined: find_target_in_lined_lines -> get_lined_word_bbox -> tighten_to_ink
  ├── 3-Tier LayoutEngine Routing:
  │   ├── Tier A: Interlinear correction / caret insertion / inline strikethrough
  │   ├── Tier B: 45° leader-line callout if headroom < 14px
  │   └── Tier C: Margin star / pedagogical remarks pinned to x >= 845
  └── filter_and_rank_annotations: Enforce Max 5 Inline / Max 2 Margin per page

                    │
                    ▼

  [ 6. Teacher Review Station & Persistence ]
  ├── Split-screen interactive review (/api/grading/{sub_id}/save-draft)
  ├── Live canvas annotation overlay with drag/drop and edit capabilities
  ├── One-click teacher approval (/api/grading/{sub_id}/approve)
  └── Persistent SQLite storage & ReportLab publication-ready A4 PDF export
```

### Pipeline Key Invariants
- **100% Offline & Private**: 100% executed locally through Ollama on local hardware.
- **Privacy & Safety**: Student identities, essay texts, and marks remain entirely on the local device.
- **Master Teacher Clutter Control**: Caps annotations to prevent cognitive overload while emphasizing high-leverage pedagogical rewrites ("★改") and prompt keyword alignment.
- **Deterministic Coordinate Grounding**: Raw bounding boxes from the vision model are grounded to physical ruled lines or grid boxes and tightened to actual ink strokes, guaranteeing clean red-pen rendering without floating or skewed boxes.
