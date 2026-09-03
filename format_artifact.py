import json
import os

with open("result.json", "r", encoding="utf-8") as f:
    data = json.load(f)

parse = data["parse_result"]["questions"][0]
scheme = data["marking_scheme"]
mark = data["marked_result"]["questions"][0]

md = f"""# Arya's Page 4 Grading Comparison

## 1. Vision AI Extraction (Parse Result)
**Question**: {parse['question_no']}
**Extracted Answer**:
```
{parse['extracted_answer']}
```

---

## 2. Marking Scheme (Rubric)
*Relevant snippet for Question 5(a)*
```
5(a) [4 marks]
- Axes & Labels: 1 mark for correct quantity and units on both axes (x: time / min, y: temperature / °C).
- Scale: 1 mark for linear, evenly spaced numerical scales on both axes covering the full data range.
- Plotting: 1 mark for all 6 data points correctly plotted within ±0.5 small square.
- Line of Best Fit: 1 mark for a smooth straight line of best fit passing through the points.
```

---

## 3. Evaluator AI Marking (Final Result)
**Score**: {mark['awarded_marks']} / {mark['max_marks']}

**Criteria Breakdown**:
"""

for c in mark['criteria']:
    md += f"- **{c['criterion']}**: {c['awarded']} / {c['max']}\n"
    md += f"  - *Comment*: {c['comment']}\n"

md += f"\n**Overall Feedback**: {mark['feedback_comment']}\n"

artifact_path = r"C:\Users\hejia\.gemini\antigravity\brain\e09e602e-8362-43d8-81b6-6407decfc4cd\arya_p4_grading.md"
os.makedirs(os.path.dirname(artifact_path), exist_ok=True)

with open(artifact_path, "w", encoding="utf-8") as f:
    f.write(md)

print("Artifact written to:", artifact_path)
