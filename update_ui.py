import re

html_path = r"C:\Users\hejia\Documents\Antigravity\AI Marker\app\static\index.html"
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Replace onclick on "View All" in Ready for Review
html = html.replace(
    '''<span class="text-xs text-indigo-400 hover:underline cursor-pointer" onclick="switchTab('review')">View All</span>''',
    '''<span class="text-xs text-indigo-400 hover:underline cursor-pointer" onclick="openBatchReviewModal()">Show All</span>'''
)

# Insert the modal HTML just before </body>
modal_html = """
    <!-- Batch Review Modal -->
    <div id="batch-review-modal" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm hidden z-50 flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div class="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-800/50">
                <div>
                    <h2 class="text-lg font-bold text-white flex items-center gap-2">
                        <i data-lucide="check-square" class="w-5 h-5 text-indigo-400"></i> Batch Review Pipeline
                    </h2>
                    <p class="text-xs text-slate-400 mt-1">Select works to run through the Parse -> Grade -> Direct Mark pipeline.</p>
                </div>
                <button onclick="closeBatchReviewModal()" class="text-slate-400 hover:text-white transition-colors">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="p-5 flex-1 overflow-y-auto">
                <div class="overflow-x-auto rounded-xl border border-slate-800">
                    <table class="w-full text-left text-sm text-slate-300">
                        <thead class="text-xs uppercase bg-slate-800 text-slate-400 border-b border-slate-700">
                            <tr>
                                <th class="px-4 py-3 w-10"><input type="checkbox" id="selectAllBatchSubs" onclick="toggleAllBatchSubs(this)" class="rounded bg-slate-900 border-slate-600 text-indigo-500 focus:ring-indigo-500"/></th>
                                <th class="px-4 py-3">Student Name</th>
                                <th class="px-4 py-3">Assignment</th>
                                <th class="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody id="batch-review-table-body" class="divide-y divide-slate-800 bg-slate-900/50">
                            <!-- Populated by JS -->
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="p-4 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3">
                <button onclick="closeBatchReviewModal()" class="px-4 py-2 text-slate-300 hover:text-white text-sm font-semibold transition-colors">Cancel</button>
                <button onclick="runBatchReviewPipeline()" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all">
                    <i data-lucide="play-circle" class="w-4 h-4"></i> Run Pipeline on Selected
                </button>
            </div>
        </div>
    </div>
"""

html = html.replace("</body>", modal_html + "\n</body>")

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)

js_path = r"C:\Users\hejia\Documents\Antigravity\AI Marker\app\static\js\app.js"
with open(js_path, "r", encoding="utf-8") as f:
    js = f.read()

js_code = """
let batchPendingSubs = [];

async function openBatchReviewModal() {
    document.getElementById('batch-review-modal').classList.remove('hidden');
    const tbody = document.getElementById('batch-review-table-body');
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-center text-slate-500">Loading works...</td></tr>`;
    
    try {
        const resp = await fetch("/api/assignments");
        const assignments = await resp.json();
        
        batchPendingSubs = [];
        for (const a of assignments) {
            const sResp = await fetch(`/api/submissions/assignment/${a.id}`);
            const subs = await sResp.json();
            const pending = subs.filter(s => s.status !== "approved");
            pending.forEach(s => s.assignment_title = a.title);
            batchPendingSubs.push(...pending);
        }
        
        if (batchPendingSubs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">No works pending review!</td></tr>`;
            return;
        }
        
        tbody.innerHTML = batchPendingSubs.map(s => {
            let statusColor = "bg-amber-950 text-amber-400 border-amber-800";
            if (s.status === "review_ready") statusColor = "bg-indigo-950 text-indigo-400 border-indigo-800";
            if (s.status === "marking") statusColor = "bg-rose-950 text-rose-400 border-rose-800";
            
            return `
                <tr class="hover:bg-slate-800 transition-colors">
                    <td class="px-4 py-3">
                        <input type="checkbox" class="batch-sub-checkbox rounded bg-slate-900 border-slate-600 text-indigo-500 focus:ring-indigo-500" value="${s.id}" />
                    </td>
                    <td class="px-4 py-3 font-semibold text-white">
                        ${s.student_name} <span class="text-xs text-slate-500 font-normal ml-2">${s.student_code || ''}</span>
                    </td>
                    <td class="px-4 py-3 text-slate-300 text-xs">
                        ${s.assignment_title}
                    </td>
                    <td class="px-4 py-3">
                        <span class="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border ${statusColor}">
                            ${s.status.replace('_', ' ')}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
        
        lucide.createIcons();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-center text-rose-400">Error loading data.</td></tr>`;
    }
}

function closeBatchReviewModal() {
    document.getElementById('batch-review-modal').classList.add('hidden');
}

function toggleAllBatchSubs(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.batch-sub-checkbox');
    checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
}

async function runBatchReviewPipeline() {
    const checkboxes = document.querySelectorAll('.batch-sub-checkbox:checked');
    if (checkboxes.length === 0) {
        alert("Please select at least one work.");
        return;
    }
    
    closeBatchReviewModal();
    startAiLiveMonitor(`Batch running full pipeline for ${checkboxes.length} submissions...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const cb of checkboxes) {
        const subId = cb.value;
        try {
            updateAiLiveMonitorText(`Processing ${subId}... (Extract -> Grade)`);
            const gradeResp = await fetch(`/api/submissions/${subId}/grade`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vision_model: "qwen3.8:latest",
                    reasoning_model: "qwen3.8:latest",
                    use_two_stage: true
                })
            });
            
            if (!gradeResp.ok) throw new Error("Grading failed");
            
            updateAiLiveMonitorText(`Processing ${subId}... (Direct Mark)`);
            const markResp = await fetch(`/api/submissions/${subId}/direct-mark?vision_model=qwen3.8:latest`, {
                method: "POST"
            });
            
            if (!markResp.ok) throw new Error("Direct marking failed");
            
            successCount++;
        } catch (e) {
            console.error(`Failed processing submission ${subId}:`, e);
            failCount++;
        }
    }
    
    stopAiLiveMonitor(failCount === 0, `Batch pipeline complete. Success: ${successCount}, Failed: ${failCount}`);
    loadDashboardData();
    loadSubmissionsQueue();
}
"""

with open(js_path, "a", encoding="utf-8") as f:
    f.write("\n" + js_code)

print("UI updated successfully")
