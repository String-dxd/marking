// Antigravity AI Marker - Frontend Logic

let currentSubmission = null;
let currentPages = [];
let currentPageIndex = 0;
let currentZoom = 1.0;
let directMarkingEnabled = true;
let currentAnnotations = [];
let classChartInstance = null;
let studentChartInstance = null;
let allStudents = [];
let currentIngestMode = "split_combined"; // 'split_combined' or 'multi_files'

function escapeHtml(str) {
    if (!str && str !== 0) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
    checkSystemHealth();
    checkGoogleClassroomStatus();
    loadDashboardData();
    loadAssignments();
    loadSubmissionsQueue();
    loadStudentsRoster();
    initSplitTrimControls();
});

window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "GOOGLE_AUTH_SUCCESS") {
        checkGoogleClassroomStatus();
    }
});

// Tab Navigation
let currentReviewMobileView = 'doc';

function switchTab(tabName, preserveReviewStation = false) {
    document.querySelectorAll(".tab-view").forEach(el => el.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".mobile-nav-btn").forEach(el => {
        el.classList.remove("text-indigo-400");
        el.classList.add("text-slate-400");
    });
    
    const targetView = document.getElementById(`view-${tabName}`);
    const targetBtn = document.getElementById(`tab-${tabName}`);
    const targetMobileBtn = document.getElementById(`mobile-tab-${tabName}`);
    
    if (targetView) targetView.classList.remove("hidden");
    if (targetBtn) targetBtn.classList.add("active");
    if (targetMobileBtn) {
        targetMobileBtn.classList.remove("text-slate-400");
        targetMobileBtn.classList.add("text-indigo-400");
    }
    
    if (tabName === "dashboard") loadDashboardData();
    if (tabName === "assignments") loadAssignments();
    if (tabName === "processing") loadSubmissionsQueue();
    if (tabName === "students") loadStudentsRoster();
    if (tabName === "review") {
        if (!preserveReviewStation) {
            showReviewAssignmentList();
        } else if (window.innerWidth < 1024) {
            switchReviewMobileView(currentReviewMobileView || 'doc');
        }
    }
    
    lucide.createIcons();
}

function switchReviewMobileView(view) {
    currentReviewMobileView = view;
    const docPanel = document.getElementById('review-panel-doc');
    const rubricPanel = document.getElementById('review-panel-rubric');
    const btnDoc = document.getElementById('review-mobile-btn-doc');
    const btnRubric = document.getElementById('review-mobile-btn-rubric');
    const btnFb = document.getElementById('review-mobile-btn-feedback');
    
    if (!docPanel || !rubricPanel) return;

    if (window.innerWidth < 1024) {
        if (view === 'doc') {
            docPanel.classList.remove('hidden');
            rubricPanel.classList.add('hidden');
            if (btnDoc) btnDoc.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-white bg-indigo-600 flex items-center justify-center gap-1 transition-all';
            if (btnRubric) btnRubric.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white flex items-center justify-center gap-1 transition-all';
            if (btnFb) btnFb.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white flex items-center justify-center gap-1 transition-all';
        } else if (view === 'rubric') {
            docPanel.classList.add('hidden');
            rubricPanel.classList.remove('hidden');
            if (btnDoc) btnDoc.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white flex items-center justify-center gap-1 transition-all';
            if (btnRubric) btnRubric.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-white bg-indigo-600 flex items-center justify-center gap-1 transition-all';
            if (btnFb) btnFb.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white flex items-center justify-center gap-1 transition-all';
            const qContainer = document.getElementById('questions-container');
            if (qContainer) qContainer.scrollIntoView({ behavior: 'smooth' });
        } else if (view === 'feedback') {
            docPanel.classList.add('hidden');
            rubricPanel.classList.remove('hidden');
            if (btnDoc) btnDoc.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white flex items-center justify-center gap-1 transition-all';
            if (btnRubric) btnRubric.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white flex items-center justify-center gap-1 transition-all';
            if (btnFb) btnFb.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-white bg-indigo-600 flex items-center justify-center gap-1 transition-all';
            const editOverall = document.getElementById('edit-overall-feedback');
            if (editOverall) editOverall.scrollIntoView({ behavior: 'smooth' });
        }
    } else {
        docPanel.classList.remove('hidden');
        rubricPanel.classList.remove('hidden');
    }
}

window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
        const docPanel = document.getElementById('review-panel-doc');
        const rubricPanel = document.getElementById('review-panel-rubric');
        if (docPanel) docPanel.classList.remove('hidden');
        if (rubricPanel) rubricPanel.classList.remove('hidden');
    } else {
        switchReviewMobileView(currentReviewMobileView);
    }
});

// Health Check
async function checkSystemHealth() {
    const indicator = document.getElementById("ollama-indicator");
    const text = document.getElementById("ollama-status-text");
    
    try {
        const resp = await fetch("/api/health");
        const data = await resp.json();
        
        if (data.ollama && data.ollama.online) {
            indicator.className = "w-2.5 h-2.5 rounded-full bg-emerald-400";
            text.innerHTML = `<span class="text-emerald-400 font-semibold">Online</span>`;
        } else {
            indicator.className = "w-2.5 h-2.5 rounded-full bg-amber-400";
            text.innerHTML = `<span class="text-amber-400 font-semibold">Offline</span>`;
        }
    } catch (err) {
        indicator.className = "w-2.5 h-2.5 rounded-full bg-rose-400";
        text.innerHTML = `<span class="text-rose-400 font-semibold">Offline</span>`;
    }
}

// 1. Dashboard
async function loadDashboardData() {
    try {
        const [assignmentsResp, studentsResp, cohortResp] = await Promise.all([
            fetch("/api/assignments"),
            fetch("/api/students"),
            fetch("/api/students/cohort/analytics")
        ]);
        
        const assignments = await assignmentsResp.json();
        const students = await studentsResp.json();
        const cohortData = await cohortResp.json();
        
        const statAssignments = document.getElementById("stat-assignments");
        const statStudents = document.getElementById("stat-students");
        const statAvgScore = document.getElementById("stat-avg-score");
        
        if (statAssignments) statAssignments.textContent = assignments.length;
        if (statStudents) statStudents.textContent = students.length;
        
        let totalScoreSum = 0;
        const approvedSubs = cohortData.approved_submissions || [];
        const approvedCount = approvedSubs.length;
        
        approvedSubs.forEach(s => {
            totalScoreSum += s.percentage || 0;
        });
        
        const avgScore = approvedCount > 0 ? (totalScoreSum / approvedCount).toFixed(1) : "--";
        if (statAvgScore) statAvgScore.textContent = avgScore !== "--" ? `${avgScore}%` : "--%";
        
        renderClassTrendChart(approvedSubs);
        
        const select = document.getElementById("trend-cohort-select");
        const uniqueClasses = [...new Set(students.map(s => s.class_name).filter(Boolean))];
        if (select) {
            select.innerHTML = '<option value="">All Classes</option>' + uniqueClasses.map(c => `<option value="${c}">${c}</option>`).join("");
        }
        
        loadQuickReviewQueue();
    } catch (e) {
        console.error("Error loading dashboard data", e);
    }
}

async function loadQuickReviewQueue() {
    const list = document.getElementById("quick-review-list");
    if (list) list.innerHTML = `<div class="text-xs text-slate-500 py-2">Loading queue...</div>`;
    
    try {
        const resp = await fetch("/api/assignments");
        const assignments = await resp.json();
        
        let pendingSubs = [];
        for (const a of assignments) {
            const sResp = await fetch(`/api/submissions/assignment/${a.id}`);
            const subs = await sResp.json();
            pendingSubs.push(...subs.filter(s => s.status !== "approved"));
        }
        
        const statPending = document.getElementById("stat-pending");
        if (statPending) statPending.textContent = pendingSubs.length;
        const reviewBadge = document.getElementById("review-pending-badge");
        const mobileReviewBadge = document.getElementById("mobile-review-pending-badge");
        if (pendingSubs.length > 0) {
            if (reviewBadge) {
                reviewBadge.textContent = pendingSubs.length;
                reviewBadge.classList.remove("hidden");
            }
            if (mobileReviewBadge) {
                mobileReviewBadge.classList.remove("hidden");
            }
        } else {
            if (reviewBadge) reviewBadge.classList.add("hidden");
            if (mobileReviewBadge) mobileReviewBadge.classList.add("hidden");
        }

        // Dashboard unprocessed badge
        const unprocessedCount = pendingSubs.filter(s => !s.is_pipeline_complete).length;
        const dashBadge = document.getElementById("dashboard-unprocessed-badge");
        if (dashBadge) {
            if (unprocessedCount > 0) {
                dashBadge.textContent = `${unprocessedCount} unpipelined`;
                dashBadge.classList.remove("hidden");
            } else {
                dashBadge.classList.add("hidden");
            }
        }
        
        if (pendingSubs.length === 0) {
            list.innerHTML = `<div class="text-xs text-slate-500 py-6 text-center">No submissions awaiting review 🎉</div>`;
            return;
        }
        
        list.innerHTML = pendingSubs.slice(0, 6).map(s => {
            const s1 = s.step1_done ? '<span class="text-emerald-400 font-bold" title="Step 1 Extract Complete">S1✓</span>' : '<span class="text-slate-500" title="Step 1 Extract Pending">S1⏳</span>';
            const s2 = s.step2_done ? '<span class="text-emerald-400 font-bold" title="Step 2 Mark Complete">S2✓</span>' : '<span class="text-slate-500" title="Step 2 Mark Pending">S2⏳</span>';
            const s3 = s.step3_done ? '<span class="text-emerald-400 font-bold" title="Step 3 Direct Mark Complete">S3✓</span>' : '<span class="text-slate-500" title="Step 3 Direct Mark Pending">S3⏳</span>';
            return `
            <div class="p-3 bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl transition-all flex items-center justify-between group">
                <div onclick="openReviewForSubmission(${s.id})" class="cursor-pointer flex-1">
                    <h5 class="text-xs font-bold text-white flex items-center gap-1.5">
                        ${escapeHtml(s.student_name)}
                        ${!s.is_existing_student ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800">New</span>' : ''}
                    </h5>
                    <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-[11px] text-slate-400">${escapeHtml(s.class_name)} • Status: <b class="${s.status === 'review_ready' ? 'text-indigo-400' : 'text-amber-400'}">${s.status}</b></span>
                        <span class="text-[10px] bg-slate-900 border border-slate-800 px-1.5 py-0.2 rounded font-mono">${s1} ${s2} ${s3}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5">
                    <button onclick="event.stopPropagation(); runSingleSubmissionPipelineFromQueue(${s.id})" title="Run 3-step pipeline on this script (auto-skips completed steps)" class="p-1.5 bg-violet-950/60 hover:bg-violet-900 text-violet-300 border border-violet-800/60 rounded-lg text-xs transition-all">
                        <i data-lucide="fast-forward" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="deleteSubmissionById(${s.id}, event)" title="Delete submission" class="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition-all">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="openReviewForSubmission(${s.id})" class="px-2.5 py-1 bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-medium hover:bg-indigo-600 hover:text-white">
                        Review
                    </button>
                </div>
            </div>
        `;
        }).join("");
        lucide.createIcons();
    } catch (e) {
        list.innerHTML = `<div class="text-xs text-rose-400">Failed to load review queue</div>`;
    }
}

function renderClassTrendChart(approvedSubs) {
    const ctx = document.getElementById("classTrendChart").getContext("2d");
    if (classChartInstance) classChartInstance.destroy();
    
    const sorted = [...approvedSubs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const labels = sorted.map((s, idx) => s.assignment_title ? `${s.assignment_title.substring(0, 15)} (${s.student_name.split(' ')[0]})` : `Task ${idx+1}`);
    const dataPoints = sorted.map(s => s.percentage || 0);
    
    classChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.length > 0 ? labels : ['No submissions yet'],
            datasets: [{
                label: 'Student Percentage (%)',
                data: dataPoints.length > 0 ? dataPoints : [0],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#818cf8',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(51, 65, 85, 0.4)' },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 45 }
                }
            }
        }
    });
}

// 2. Assignments
let allLoadedAssignments = [];
let selectedAssignmentIds = new Set();

async function loadAssignments(fetchFromApi = true) {
    const grid = document.getElementById("assignments-grid");
    const uploadSelect = document.getElementById("upload-target-assignment");
    
    try {
        if (fetchFromApi) {
            const resp = await fetch("/api/assignments");
            allLoadedAssignments = await resp.json();
            // Prune any selected IDs that no longer exist
            const existingIds = new Set(allLoadedAssignments.map(a => a.id));
            selectedAssignmentIds = new Set([...selectedAssignmentIds].filter(id => existingIds.has(id)));
        }
        const assignments = allLoadedAssignments;
        
        if (assignments.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
                    <i data-lucide="book-open" class="w-12 h-12 text-slate-600 mx-auto mb-3"></i>
                    <h3 class="text-sm font-bold text-slate-300">No Assignments Created Yet</h3>
                    <p class="text-xs text-slate-500 mt-1 mb-4">Create your first assignment and attach its marking scheme/rubric.</p>
                    <button onclick="openCreateAssignmentModal()" class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold">Create Assignment</button>
                </div>
            `;
            if (uploadSelect) uploadSelect.innerHTML = `<option value="" disabled selected>(No active assignments created yet)</option>`;
            updateAssignmentsBatchUI();
            lucide.createIcons();
            return;
        }
        
        const validAssignments = assignments.filter(a => a && a.id && (a.title || "").trim());
        if (uploadSelect) {
            uploadSelect.innerHTML = validAssignments.map(a => `<option value="${a.id}">${escapeHtml(a.title)} (${escapeHtml(a.class_name || 'General')} - ${escapeHtml(a.subject || 'General')})</option>`).join("");
        }
        
        grid.innerHTML = assignments.map(a => {
            const isSelected = selectedAssignmentIds.has(a.id);
            let markerBadge = "";
            if (a.marker_type === "lower_sec_science") markerBadge = `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">🔬 Science</span>`;
            else if (a.marker_type === "chinese_essay") markerBadge = `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">✍️ Chinese Essay</span>`;
            else if (a.marker_type === "general") markerBadge = `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">📝 General</span>`;

            return `
                <div class="bg-slate-900/90 border ${isSelected ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-500/10' : 'border-slate-800 hover:border-slate-700'} rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between group transition-all relative">
                    <div>
                        <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-2 flex-wrap">
                                <input type="checkbox" onchange="toggleAssignmentSelection(${a.id}, event)" ${isSelected ? 'checked' : ''} title="Select assignment" class="w-4 h-4 text-indigo-600 rounded bg-slate-800 border-slate-700 cursor-pointer shrink-0">
                                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-400 border border-indigo-800">${escapeHtml(a.subject)}</span>
                                ${markerBadge}
                            </div>
                            <span class="text-xs text-slate-400 font-medium">${escapeHtml(a.class_name)}</span>
                        </div>
                        <h3 class="text-base font-bold text-white mt-2">${escapeHtml(a.title)}</h3>
                        <p class="text-xs text-slate-400 mt-1 line-clamp-2">${escapeHtml(a.marking_scheme_text || 'No marking scheme details provided.')}</p>
                    </div>
                    
                    <div class="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                        <div>
                            <span class="text-slate-400">Max Marks: <b class="text-white">${a.max_marks}</b></span>
                            <span class="text-slate-600 mx-1.5">•</span>
                            <span class="text-slate-400">Marked: <b class="text-emerald-400">${a.approved_count}</b>/${a.submission_count}</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <button onclick="rerunPipelineSteps2And3ForAssignment(${a.id}, this, event)" title="Rerun Steps 2 & 3: Re-mark and re-annotate scripts using the updated marking scheme (preserves extracted student handwriting)" class="px-2 py-1 bg-violet-950 hover:bg-violet-900 text-violet-300 border border-violet-800 rounded-lg text-xs font-medium flex items-center gap-1 transition-all">
                                <i data-lucide="refresh-cw" class="w-3 h-3 text-violet-400"></i> Rerun 2 & 3
                            </button>
                            <button onclick="openReviewForAssignment(${a.id}, event)" title="Review submissions for this assignment" class="px-2 py-1 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded-lg text-xs font-medium flex items-center gap-1 transition-all">
                                <i data-lucide="check-check" class="w-3.5 h-3.5"></i> Review
                            </button>
                            <button onclick="openEditAssignmentModal(${a.id}, event)" title="Edit Assignment & Rubrics" class="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-950/50 rounded-lg transition-all">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button onclick="confirmDeleteAssignment(${a.id}, '${escapeHtml(a.title.replace(/'/g, "\\'"))}', event)" title="Delete Assignment and Submissions" class="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition-all">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");
        
        updateAssignmentsBatchUI();
        lucide.createIcons();
    } catch (e) {
        console.error("Error loading assignments", e);
    }
}

function toggleAssignmentSelection(assignmentId, event) {
    if (event) event.stopPropagation();
    if (selectedAssignmentIds.has(assignmentId)) {
        selectedAssignmentIds.delete(assignmentId);
    } else {
        selectedAssignmentIds.add(assignmentId);
    }
    loadAssignments(false);
}

function toggleSelectAllAssignments() {
    if (selectedAssignmentIds.size === allLoadedAssignments.length && allLoadedAssignments.length > 0) {
        selectedAssignmentIds.clear();
    } else {
        selectedAssignmentIds = new Set(allLoadedAssignments.map(a => a.id));
    }
    loadAssignments(false);
}

function clearAssignmentSelections() {
    selectedAssignmentIds.clear();
    loadAssignments(false);
}

function updateAssignmentsBatchUI() {
    const count = selectedAssignmentIds.size;
    const batchBar = document.getElementById("assignments-batch-actions");
    const countLabel = document.getElementById("assignments-selected-count");
    const selectAllBtn = document.getElementById("btn-select-all-assignments");

    if (batchBar && countLabel) {
        if (count > 0) {
            batchBar.classList.remove("hidden");
            countLabel.textContent = `${count} selected`;
        } else {
            batchBar.classList.add("hidden");
        }
    }

    if (selectAllBtn) {
        if (allLoadedAssignments.length > 0 && count === allLoadedAssignments.length) {
            selectAllBtn.innerHTML = `<i data-lucide="x-square" class="w-3.5 h-3.5 text-indigo-400"></i> Deselect All`;
        } else {
            selectAllBtn.innerHTML = `<i data-lucide="check-square" class="w-3.5 h-3.5 text-indigo-400"></i> Select All`;
        }
    }
}

async function handleBulkDeleteAssignments() {
    const ids = Array.from(selectedAssignmentIds);
    if (ids.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${ids.length} selected assignment(s)?\n\nThis will permanently delete all chosen assignments, their rubrics, and all student submissions and marked reports associated with them.`)) {
        return;
    }

    try {
        const resp = await fetch("/api/assignments/bulk-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assignment_ids: ids })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            selectedAssignmentIds.clear();
            await loadAssignments();
            await loadDashboardData();
            await loadSubmissionsQueue();
            populateExistingClassesAndSubjects();
        } else {
            alert("Failed to delete assignments: " + (data.detail || JSON.stringify(data)));
        }
    } catch (e) {
        alert("Error deleting assignments: " + e.message);
    }
}

async function confirmDeleteAssignment(assignmentId, title, event) {
    if (event) event.stopPropagation();
    if (!confirm(`Are you sure you want to delete assignment "${title}"?\n\nThis will permanently delete the assignment, its marking scheme, and all associated student submissions & reports.`)) return;
    
    try {
        const resp = await fetch(`/api/assignments/${assignmentId}`, { method: "DELETE" });
        const data = await resp.json();
        if (resp.ok && data.success) {
            selectedAssignmentIds.delete(assignmentId);
            loadAssignments();
            loadDashboardData();
            loadSubmissionsQueue();
            populateExistingClassesAndSubjects();
        } else {
            alert("Failed to delete assignment: " + (data.detail || JSON.stringify(data)));
        }
    } catch (e) {
        alert("Error deleting assignment: " + e.message);
    }
}

// State for structured rubrics in assignment modals
let createAssignmentRubric = [];
let editAssignmentRubric = [];

function switchRubricViewMode(mode, view) {
    const isCreate = mode === 'create';
    const structuredBtn = document.getElementById(isCreate ? 'btn-create-rubric-structured' : 'btn-edit-rubric-structured');
    const rawBtn = document.getElementById(isCreate ? 'btn-create-rubric-raw' : 'btn-edit-rubric-raw');
    const structuredView = document.getElementById(isCreate ? 'create-rubric-structured-view' : 'edit-rubric-structured-view');
    const rawView = document.getElementById(isCreate ? 'create-rubric-raw-view' : 'edit-rubric-raw-view');
    const textarea = document.getElementById(isCreate ? 'new-assignment-scheme' : 'edit-assignment-scheme');
    const rubricList = isCreate ? createAssignmentRubric : editAssignmentRubric;

    if (view === 'structured') {
        if (structuredBtn) structuredBtn.className = "px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow-sm flex items-center gap-1.5 transition-all";
        if (rawBtn) rawBtn.className = "px-3 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1.5 transition-all";
        if (structuredView) structuredView.classList.remove('hidden');
        if (rawView) rawView.classList.add('hidden');
        renderRubricCards(mode);
    } else {
        if (rawBtn) rawBtn.className = "px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow-sm flex items-center gap-1.5 transition-all";
        if (structuredBtn) structuredBtn.className = "px-3 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1.5 transition-all";
        if (rawView) rawView.classList.remove('hidden');
        if (structuredView) structuredView.classList.add('hidden');
        
        // If textarea is blank and structured items exist, format into markdown
        if (textarea && !textarea.value.trim() && rubricList && rubricList.length > 0) {
            textarea.value = formatRubricToMarkdown(rubricList);
        }
    }
    lucide.createIcons();
}

function formatRubricToMarkdown(items) {
    if (!items || !items.length) return "";
    return items.map((q, idx) => {
        let lines = [`### Question ${q.question_no || idx + 1}: ${q.question_title || ''} (${q.max_marks || 1} marks)`];
        if (q.criteria && q.criteria.length) {
            q.criteria.forEach((c, cIdx) => {
                lines.push(`- **${c.criterion || `Criterion ${cIdx + 1}`}** [${c.max || 1}m]${c.description ? `: ${c.description}` : ''}`);
            });
        }
        return lines.join('\n');
    }).join('\n\n');
}

function handleMaxMarksInput(mode) {
    recalculateRubricTotals(mode);
}

function recalculateRubricTotals(mode) {
    const isCreate = mode === 'create';
    const items = isCreate ? createAssignmentRubric : editAssignmentRubric;
    const totalLabel = document.getElementById(isCreate ? 'label-create-rubric-total' : 'label-edit-rubric-total');
    const targetLabel = document.getElementById(isCreate ? 'label-create-max-marks-target' : 'label-edit-max-marks-target');
    const marksInput = document.getElementById(isCreate ? 'new-assignment-marks' : 'edit-assignment-marks');
    const syncBtn = document.getElementById(isCreate ? 'btn-create-sync-marks' : 'btn-edit-sync-marks');

    let totalMarks = 0;
    (items || []).forEach(q => {
        totalMarks += parseFloat(q.max_marks) || 0;
    });
    totalMarks = Math.round(totalMarks * 10) / 10;

    const targetMax = parseFloat(marksInput?.value) || 0;

    if (totalLabel) totalLabel.textContent = totalMarks.toFixed(1);
    if (targetLabel) targetLabel.textContent = targetMax.toFixed(1);

    if (syncBtn) {
        if (totalMarks > 0 && Math.abs(totalMarks - targetMax) > 0.01) {
            syncBtn.classList.remove('hidden');
        } else {
            syncBtn.classList.add('hidden');
        }
    }
}

function syncRubricMarksToMax(mode) {
    const isCreate = mode === 'create';
    const items = isCreate ? createAssignmentRubric : editAssignmentRubric;
    let totalMarks = 0;
    (items || []).forEach(q => {
        totalMarks += parseFloat(q.max_marks) || 0;
    });
    totalMarks = Math.round(totalMarks * 10) / 10;
    const marksInput = document.getElementById(isCreate ? 'new-assignment-marks' : 'edit-assignment-marks');
    if (marksInput) {
        marksInput.value = totalMarks > 0 ? totalMarks : 100;
    }
    recalculateRubricTotals(mode);
}

function renderRubricCards(mode) {
    const isCreate = mode === 'create';
    const container = document.getElementById(isCreate ? 'create-rubric-questions-container' : 'edit-rubric-questions-container');
    const badge = document.getElementById(isCreate ? 'badge-create-criteria-count' : 'badge-edit-criteria-count');
    const items = isCreate ? createAssignmentRubric : editAssignmentRubric;

    if (badge) {
        const totalCriteria = (items || []).reduce((sum, q) => sum + ((q.criteria && q.criteria.length) || 0), 0);
        badge.textContent = `${items.length} Qs / ${totalCriteria} crit`;
    }

    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="text-xs text-slate-500 p-6 border border-dashed border-slate-800 rounded-xl text-center space-y-2">
                <i data-lucide="scan-text" class="w-7 h-7 text-slate-600 mx-auto"></i>
                <div class="font-bold text-slate-300">No structured criteria breakdown yet</div>
                <p class="text-[11px] text-slate-500">Upload a marking scheme file above, or click <b>"Parse with AI"</b> on your scheme text, or click <b>"+ Add Question"</b> to build criteria manually.</p>
            </div>
        `;
        recalculateRubricTotals(mode);
        lucide.createIcons();
        return;
    }

    container.innerHTML = items.map((q, qIdx) => `
        <div class="q-rubric-card space-y-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800 hover:border-slate-700 transition-all" id="${mode}-q-card-${qIdx}">
            <!-- Question Header Row -->
            <div class="flex items-center justify-between gap-2.5">
                <div class="flex items-center gap-2 flex-1">
                    <span class="text-xs font-black text-indigo-400 shrink-0">Q</span>
                    <input type="text" value="${escapeHtml(q.question_no || String(qIdx + 1))}" oninput="updateRubricField('${mode}', ${qIdx}, null, 'question_no', this.value)" placeholder="${qIdx + 1}" class="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs font-bold text-white text-center focus:outline-none focus:border-indigo-500">
                    <input type="text" value="${escapeHtml(q.question_title || '')}" oninput="updateRubricField('${mode}', ${qIdx}, null, 'question_title', this.value)" placeholder="Question title or topic description..." class="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500">
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[11px] text-slate-400">Max Marks:</span>
                    <input type="number" step="0.5" value="${q.max_marks || 1}" oninput="updateRubricField('${mode}', ${qIdx}, null, 'max_marks', this.value)" class="w-16 bg-slate-900 border border-indigo-700/80 rounded-lg px-2 py-1 text-xs font-bold text-white text-center focus:outline-none focus:border-indigo-500">
                    <button type="button" onclick="removeRubricQuestion('${mode}', ${qIdx})" title="Delete question" class="text-slate-600 hover:text-rose-400 p-1 transition-all"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>

            <!-- Rubric Criteria Breakdown Container (Matching Review UI) -->
            <div class="space-y-1.5 pt-1">
                <div class="flex items-center justify-between text-[11px]">
                    <span class="font-semibold text-slate-400 flex items-center gap-1">
                        <i data-lucide="check-square" class="w-3 h-3 text-indigo-400"></i> Rubric Criteria Breakdown:
                    </span>
                    <button type="button" onclick="addRubricCriterion('${mode}', ${qIdx})" class="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                        <i data-lucide="plus" class="w-3 h-3"></i> Add Criterion
                    </button>
                </div>
                <div class="grid grid-cols-1 gap-2 bg-slate-900/90 p-3 rounded-lg border border-slate-800/80">
                    ${(q.criteria && q.criteria.length > 0) ? q.criteria.map((c, cIdx) => `
                        <div class="flex items-start justify-between gap-2.5 text-[11px] py-1.5 border-b border-slate-800/60 last:border-b-0">
                            <div class="flex-1 space-y-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-indigo-400 font-bold">•</span>
                                    <input type="text" value="${escapeHtml(c.criterion || '')}" oninput="updateRubricField('${mode}', ${qIdx}, ${cIdx}, 'criterion', this.value)" placeholder="Criterion requirement (e.g. Formula stated correctly)..." class="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                                </div>
                                <div class="pl-3.5">
                                    <input type="text" value="${escapeHtml(c.description || c.comment || '')}" oninput="updateRubricField('${mode}', ${qIdx}, ${cIdx}, 'description', this.value)" placeholder="Guidance, expected answer or band details (optional)..." class="w-full bg-slate-950/60 border border-slate-800/80 rounded px-2 py-0.5 text-[11px] text-slate-400 focus:outline-none focus:border-slate-700">
                                </div>
                            </div>
                            <div class="shrink-0 flex items-center gap-1.5 pt-0.5">
                                <span class="text-[10px] text-slate-500">Marks:</span>
                                <input type="number" step="0.5" value="${c.max || 1}" oninput="updateRubricField('${mode}', ${qIdx}, ${cIdx}, 'max', this.value)" class="w-14 bg-slate-950 border border-indigo-900/80 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-indigo-300 text-center focus:outline-none focus:border-indigo-500">
                                <button type="button" onclick="removeRubricCriterion('${mode}', ${qIdx}, ${cIdx})" title="Delete criterion" class="text-slate-600 hover:text-rose-400 p-1 transition-all"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                            </div>
                        </div>
                    `).join('') : `
                        <div class="text-[11px] text-slate-500 italic text-center py-2">
                            No criteria added yet. Click "+ Add Criterion" above.
                        </div>
                    `}
                </div>
            </div>
        </div>
    `).join('');

    recalculateRubricTotals(mode);
    lucide.createIcons();
}

function addRubricQuestion(mode) {
    const isCreate = mode === 'create';
    const items = isCreate ? createAssignmentRubric : editAssignmentRubric;
    const nextNo = String(items.length + 1);
    items.push({
        question_no: nextNo,
        question_title: `Question ${nextNo}`,
        max_marks: 2.0,
        criteria: [
            { criterion: "Expected answer and workings", max: 2.0, description: "" }
        ]
    });
    renderRubricCards(mode);
}

function removeRubricQuestion(mode, qIdx) {
    const isCreate = mode === 'create';
    const items = isCreate ? createAssignmentRubric : editAssignmentRubric;
    items.splice(qIdx, 1);
    renderRubricCards(mode);
}

function addRubricCriterion(mode, qIdx) {
    const isCreate = mode === 'create';
    const items = isCreate ? createAssignmentRubric : editAssignmentRubric;
    if (!items[qIdx]) return;
    if (!Array.isArray(items[qIdx].criteria)) items[qIdx].criteria = [];
    items[qIdx].criteria.push({
        criterion: `Criterion ${items[qIdx].criteria.length + 1}`,
        max: 1.0,
        description: ""
    });
    renderRubricCards(mode);
}

function removeRubricCriterion(mode, qIdx, cIdx) {
    const isCreate = mode === 'create';
    const items = isCreate ? createAssignmentRubric : editAssignmentRubric;
    if (!items[qIdx] || !items[qIdx].criteria) return;
    items[qIdx].criteria.splice(cIdx, 1);
    renderRubricCards(mode);
}

function updateRubricField(mode, qIdx, cIdx, field, value) {
    const isCreate = mode === 'create';
    const items = isCreate ? createAssignmentRubric : editAssignmentRubric;
    if (!items[qIdx]) return;

    if (cIdx === null) {
        if (field === 'max_marks') {
            items[qIdx].max_marks = parseFloat(value) || 0.0;
        } else {
            items[qIdx][field] = value;
        }
    } else {
        if (!items[qIdx].criteria || !items[qIdx].criteria[cIdx]) return;
        if (field === 'max') {
            items[qIdx].criteria[cIdx].max = parseFloat(value) || 0.0;
            // Recalculate question max marks from sum of criteria
            const critSum = items[qIdx].criteria.reduce((s, c) => s + (parseFloat(c.max) || 0), 0);
            if (critSum > 0) {
                items[qIdx].max_marks = Math.round(critSum * 10) / 10;
                const card = document.getElementById(`${mode}-q-card-${qIdx}`);
                const qMaxInput = card?.querySelector('.flex-1 + .flex input[type="number"]');
                if (qMaxInput) qMaxInput.value = items[qIdx].max_marks;
            }
        } else {
            items[qIdx].criteria[cIdx][field] = value;
        }
    }

    recalculateRubricTotals(mode);
}

async function parseCurrentSchemeText(mode) {
    const isCreate = mode === 'create';
    const textarea = document.getElementById(isCreate ? 'new-assignment-scheme' : 'edit-assignment-scheme');
    const parsingState = document.getElementById(isCreate ? 'create-rubric-parsing-state' : 'edit-rubric-parsing-state');
    const subjectInput = document.getElementById(isCreate ? 'new-assignment-subject' : 'edit-assignment-subject');
    const titleInput = document.getElementById(isCreate ? 'new-assignment-title' : 'edit-assignment-title');
    const marksInput = document.getElementById(isCreate ? 'new-assignment-marks' : 'edit-assignment-marks');
    const markerInput = document.getElementById(isCreate ? 'new-assignment-marker-type' : 'edit-assignment-marker-type');

    const text = textarea ? textarea.value.trim() : "";
    if (!text) {
        alert("Please enter or upload marking scheme / rubric text first.");
        return;
    }

    if (parsingState) parsingState.classList.remove('hidden');

    try {
        const resp = await fetch("/api/assignments/parse-rubric", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: text,
                subject: subjectInput ? subjectInput.value : "",
                title: titleInput ? titleInput.value : ""
            })
        });

        const data = await resp.json();
        if (data.success) {
            if (isCreate) {
                createAssignmentRubric = data.rubric_json || [];
            } else {
                editAssignmentRubric = data.rubric_json || [];
            }

            if (data.clean_marking_scheme) {
                textarea.value = data.clean_marking_scheme;
            }

            if (data.suggested_title && titleInput && !titleInput.value.trim()) {
                titleInput.value = data.suggested_title;
            }
            if (data.suggested_subject && subjectInput && !subjectInput.value.trim()) {
                subjectInput.value = data.suggested_subject;
            }
            if (data.suggested_max_marks && marksInput && (!marksInput.value || marksInput.value === "100")) {
                marksInput.value = data.suggested_max_marks;
            }
            if (data.suggested_marker_type && markerInput) {
                markerInput.value = data.suggested_marker_type;
            }

            switchRubricViewMode(mode, 'structured');
            renderRubricCards(mode);
            if (data.fallback_triggered && data.fallbacks && data.fallbacks.length > 0) {
                showFallbackNotice(data.fallbacks, "Rubric Parsing");
            }
        } else {
            alert("Failed to parse rubrics: " + (data.detail || "Unknown error"));
        }
    } catch (e) {
        alert("Error parsing rubric with AI: " + e.message);
    } finally {
        if (parsingState) parsingState.classList.add('hidden');
    }
}

function openCreateAssignmentModal() {
    const markerTypeSelect = document.getElementById("new-assignment-marker-type");
    if (markerTypeSelect) markerTypeSelect.value = "auto";
    createAssignmentRubric = [];
    switchRubricViewMode('create', 'structured');
    renderRubricCards('create');
    document.getElementById("modal-create-assignment").classList.remove("hidden");
    lucide.createIcons();
}

function closeCreateAssignmentModal() {
    document.getElementById("modal-create-assignment").classList.add("hidden");
}

async function handleSchemeFileUpload(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append("file", file);
    
    const textarea = document.getElementById("new-assignment-scheme");
    const parsingState = document.getElementById("create-rubric-parsing-state");
    if (textarea) textarea.value = "📄 Reading file and isolating relevant marking rubrics with local AI...";
    if (parsingState) parsingState.classList.remove("hidden");
    
    try {
        const resp = await fetch("/api/assignments/upload-scheme", {
            method: "POST",
            body: formData
        });
        const data = await resp.json();
        if (data.success) {
            if (textarea) textarea.value = data.clean_marking_scheme || data.raw_text || "";
            
            // Auto-prefill assignment details if suggested
            const titleInput = document.getElementById("new-assignment-title");
            const subjectInput = document.getElementById("new-assignment-subject");
            const marksInput = document.getElementById("new-assignment-marks");
            
            if (data.suggested_title && !titleInput.value) {
                titleInput.value = data.suggested_title;
            }
            if (data.suggested_subject && !subjectInput.value) {
                subjectInput.value = data.suggested_subject;
            }
            if (data.suggested_max_marks) {
                marksInput.value = data.suggested_max_marks;
            }
            if (data.suggested_marker_type) {
                const markerInput = document.getElementById('new-assignment-marker-type');
                if (markerInput) markerInput.value = data.suggested_marker_type;
            }

            if (data.rubric_json && Array.isArray(data.rubric_json) && data.rubric_json.length > 0) {
                createAssignmentRubric = data.rubric_json;
            } else {
                createAssignmentRubric = [];
            }
            switchRubricViewMode('create', 'structured');
            renderRubricCards('create');
            if (data.fallback_triggered && data.fallbacks && data.fallbacks.length > 0) {
                showFallbackNotice(data.fallbacks, "Marking Scheme Upload");
            }
        } else {
            if (textarea) textarea.value = "Failed to extract text from file.";
        }
    } catch (e) {
        if (textarea) textarea.value = "Error uploading file: " + e.message;
    } finally {
        if (parsingState) parsingState.classList.add("hidden");
    }
}

async function handleCreateAssignment(e) {
    e.preventDefault();
    const title = document.getElementById("new-assignment-title").value;
    const subject = document.getElementById("new-assignment-subject").value;
    const className = document.getElementById("new-assignment-class").value;
    const maxMarks = parseFloat(document.getElementById("new-assignment-marks").value) || 100;
    const markerType = document.getElementById("new-assignment-marker-type")?.value || "auto";
    let schemeText = document.getElementById("new-assignment-scheme").value;
    if (!schemeText.trim() && createAssignmentRubric.length > 0) {
        schemeText = formatRubricToMarkdown(createAssignmentRubric);
    }
    const rubricJson = JSON.stringify(createAssignmentRubric || []);
    
    try {
        const resp = await fetch("/api/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title, subject, class_name: className, max_marks: maxMarks, marker_type: markerType, marking_scheme_text: schemeText, rubric_json: rubricJson
            })
        });
        const data = await resp.json();
        if (data.success) {
            const assignmentId = data.id || data.assignment_id;
            const syncGC = document.getElementById("new-assignment-sync-gc")?.checked;
            const gcCourse = document.getElementById("new-assignment-gc-course")?.value;
            const gcCoursework = document.getElementById("new-assignment-gc-coursework")?.value;
            
            if (syncGC && gcCourse && assignmentId) {
                try {
                    await fetch(`/api/google/assignments/${assignmentId}/link`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            course_id: gcCourse,
                            coursework_id: gcCoursework === "create_new" ? null : gcCoursework,
                            create_new: gcCoursework === "create_new",
                            title: title,
                            max_marks: maxMarks
                        })
                    });
                } catch (gcErr) {
                    console.error("Google Classroom linking error:", gcErr);
                }
            }

            closeCreateAssignmentModal();
            loadAssignments();
            loadDashboardData();
        } else {
            alert("Failed to save assignment: " + (data.detail || JSON.stringify(data)));
        }
    } catch (e) {
        alert("Failed to save assignment: " + e.message);
    }
}

async function openEditAssignmentModal(assignmentId, event) {
    if (event) event.stopPropagation();
    try {
        const resp = await fetch(`/api/assignments/${assignmentId}`);
        if (!resp.ok) throw new Error("Could not load assignment details");
        const a = await resp.json();

        document.getElementById("edit-assignment-id").value = a.id;
        document.getElementById("edit-assignment-title").value = a.title || "";
        document.getElementById("edit-assignment-subject").value = a.subject || "";
        document.getElementById("edit-assignment-class").value = a.class_name || "";
        document.getElementById("edit-assignment-marks").value = a.max_marks || 100;
        document.getElementById("edit-assignment-scheme").value = a.marking_scheme_text || "";
        const editMarkerSelect = document.getElementById("edit-assignment-marker-type");
        if (editMarkerSelect) editMarkerSelect.value = a.marker_type || "auto";

        try {
            editAssignmentRubric = JSON.parse(a.rubric_json || "[]");
            if (!Array.isArray(editAssignmentRubric)) editAssignmentRubric = [];
        } catch (e) {
            editAssignmentRubric = [];
        }

        if (editAssignmentRubric.length > 0) {
            switchRubricViewMode('edit', 'structured');
        } else {
            switchRubricViewMode('edit', 'raw');
        }
        renderRubricCards('edit');

        populateExistingClassesAndSubjects();
        document.getElementById("modal-edit-assignment").classList.remove("hidden");
        lucide.createIcons();
    } catch (err) {
        alert("Error loading assignment: " + err.message);
    }
}

function closeEditAssignmentModal() {
    document.getElementById("modal-edit-assignment").classList.add("hidden");
}

async function handleEditSchemeFileUpload(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append("file", file);

    const textarea = document.getElementById("edit-assignment-scheme");
    const parsingState = document.getElementById("edit-rubric-parsing-state");
    if (textarea) textarea.value = "📄 Reading file and isolating relevant marking rubrics with local AI...";
    if (parsingState) parsingState.classList.remove("hidden");

    try {
        const resp = await fetch("/api/assignments/upload-scheme", {
            method: "POST",
            body: formData
        });
        const data = await resp.json();
        if (data.success) {
            if (textarea) textarea.value = data.clean_marking_scheme || data.raw_text || "";
            const marksInput = document.getElementById("edit-assignment-marks");
            if (data.suggested_max_marks && (!marksInput.value || marksInput.value == "100")) {
                marksInput.value = data.suggested_max_marks;
            }
            if (data.suggested_marker_type) {
                const markerInput = document.getElementById("edit-assignment-marker-type");
                if (markerInput) markerInput.value = data.suggested_marker_type;
            }

            if (data.rubric_json && Array.isArray(data.rubric_json) && data.rubric_json.length > 0) {
                editAssignmentRubric = data.rubric_json;
            } else {
                editAssignmentRubric = [];
            }
            switchRubricViewMode('edit', 'structured');
            renderRubricCards('edit');
        } else {
            if (textarea) textarea.value = "";
            alert("Could not extract marking scheme: " + (data.detail || "Server error"));
        }
    } catch (e) {
        if (textarea) textarea.value = "";
        alert("Upload failed: " + e.message);
    } finally {
        if (parsingState) parsingState.classList.add("hidden");
    }
}

async function handleEditAssignmentSubmit(event) {
    event.preventDefault();
    const assignmentId = document.getElementById("edit-assignment-id").value;
    const title = document.getElementById("edit-assignment-title").value.trim();
    const subject = document.getElementById("edit-assignment-subject").value.trim();
    const className = document.getElementById("edit-assignment-class").value.trim();
    const maxMarks = parseFloat(document.getElementById("edit-assignment-marks").value) || 100.0;
    const markerType = document.getElementById("edit-assignment-marker-type")?.value || "auto";
    let schemeText = document.getElementById("edit-assignment-scheme").value.trim();
    if (!schemeText && editAssignmentRubric.length > 0) {
        schemeText = formatRubricToMarkdown(editAssignmentRubric);
    }
    const rubricJson = JSON.stringify(editAssignmentRubric || []);

    if (!assignmentId || !title || !subject || !className) {
        alert("Please fill in all required assignment fields.");
        return;
    }

    try {
        const resp = await fetch(`/api/assignments/${assignmentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title,
                subject,
                class_name: className,
                max_marks: maxMarks,
                marker_type: markerType,
                marking_scheme_text: schemeText,
                rubric_json: rubricJson
            })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            closeEditAssignmentModal();
            loadAssignments();
            loadDashboardData();

            // Check if existing submissions exist to offer rerunning Steps 2 & 3
            try {
                const subsResp = await fetch(`/api/submissions/assignment/${assignmentId}`);
                const subs = await subsResp.json();
                const eligibleSubs = (subs || []).filter(s => s.step1_done || s.is_pipeline_complete || s.status === "approved" || s.total_score > 0);
                if (eligibleSubs.length > 0) {
                    const promptRerun = confirm(
                        `Assignment "${title}" updated successfully!\n\n` +
                        `Found ${eligibleSubs.length} student submission(s) with extracted handwriting.\n\n` +
                        `Would you like to rerun Pipeline Steps 2 & 3 (Re-mark & Re-annotate) now to update their marks against this new marking scheme?`
                    );
                    if (promptRerun) {
                        rerunPipelineSteps2And3ForAssignment(assignmentId);
                    }
                }
            } catch (checkErr) {
                console.warn("Could not check submissions for rerun prompt:", checkErr);
            }
        } else {
            alert("Failed to update assignment: " + (data.detail || JSON.stringify(data)));
        }
    } catch (e) {
        alert("Error saving assignment: " + e.message);
    }
}

async function handleEditAssignmentAndRerunPipeline() {
    const assignmentId = document.getElementById("edit-assignment-id").value;
    const title = document.getElementById("edit-assignment-title").value.trim();
    const subject = document.getElementById("edit-assignment-subject").value.trim();
    const className = document.getElementById("edit-assignment-class").value.trim();
    const maxMarks = parseFloat(document.getElementById("edit-assignment-marks").value) || 100.0;
    const markerType = document.getElementById("edit-assignment-marker-type")?.value || "auto";
    let schemeText = document.getElementById("edit-assignment-scheme").value.trim();
    if (!schemeText && editAssignmentRubric.length > 0) {
        schemeText = formatRubricToMarkdown(editAssignmentRubric);
    }
    const rubricJson = JSON.stringify(editAssignmentRubric || []);

    if (!assignmentId || !title || !subject || !className) {
        alert("Please fill in all required assignment fields.");
        return;
    }

    const btn = document.getElementById("btn-save-and-rerun-pipeline");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Saving...`;
        if (window.lucide) lucide.createIcons();
    }

    try {
        const resp = await fetch(`/api/assignments/${assignmentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title,
                subject,
                class_name: className,
                max_marks: maxMarks,
                marker_type: markerType,
                marking_scheme_text: schemeText,
                rubric_json: rubricJson
            })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            closeEditAssignmentModal();
            loadAssignments();
            loadDashboardData();
            await rerunPipelineSteps2And3ForAssignment(assignmentId);
        } else {
            alert("Failed to update assignment: " + (data.detail || JSON.stringify(data)));
        }
    } catch (e) {
        alert("Error saving assignment: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            if (window.lucide) lucide.createIcons();
        }
    }
}

// 3. Scan Ingestion, Auto-Splitting & Highlighting
let selectedTrimPages = new Set();

function initSplitTrimControls() {
    renderSplitTrimPillButtons();
}

function handlePagesPerStudentChange() {
    const input = document.getElementById("split-pages-per-student");
    let val = parseInt(input.value) || 1;
    if (val < 1) val = 1;
    if (val > 50) val = 50;
    input.value = val;
    
    // If trim last page is checked, ensure last page is in set and remove any pages > val
    const trimLast = document.getElementById("split-trim-last-page") ? document.getElementById("split-trim-last-page").checked : false;
    const newSet = new Set();
    selectedTrimPages.forEach(p => {
        if (p < val) newSet.add(p);
    });
    if (trimLast && val > 1) {
        newSet.add(val);
    }
    selectedTrimPages = newSet;
    syncCustomTrimInputFromSet();
    renderSplitTrimPillButtons();
}

function toggleTrimLastPage(isChecked) {
    const pagesPerStudent = parseInt(document.getElementById("split-pages-per-student")?.value) || 1;
    if (pagesPerStudent > 1) {
        if (isChecked) {
            selectedTrimPages.add(pagesPerStudent);
        } else {
            selectedTrimPages.delete(pagesPerStudent);
        }
    }
    syncCustomTrimInputFromSet();
    renderSplitTrimPillButtons();
}

function toggleTrimPage(pageNum) {
    const pagesPerStudent = parseInt(document.getElementById("split-pages-per-student")?.value) || 1;
    if (selectedTrimPages.has(pageNum)) {
        selectedTrimPages.delete(pageNum);
        if (pageNum === pagesPerStudent) {
            const lastCheck = document.getElementById("split-trim-last-page");
            if (lastCheck) lastCheck.checked = false;
        }
    } else {
        selectedTrimPages.add(pageNum);
        if (pageNum === pagesPerStudent) {
            const lastCheck = document.getElementById("split-trim-last-page");
            if (lastCheck) lastCheck.checked = true;
        }
    }
    syncCustomTrimInputFromSet();
    renderSplitTrimPillButtons();
}

function handleCustomTrimInput(val) {
    const pagesPerStudent = parseInt(document.getElementById("split-pages-per-student")?.value) || 1;
    const newSet = new Set();
    const parts = val.replace(/;/g, ",").split(",");
    parts.forEach(p => {
        const trimmed = p.trim().toLowerCase();
        if (trimmed === "last" && pagesPerStudent > 1) {
            newSet.add(pagesPerStudent);
        } else if (/^\d+$/.test(trimmed)) {
            const num = parseInt(trimmed);
            if (num >= 1 && num <= pagesPerStudent) {
                newSet.add(num);
            }
        }
    });
    selectedTrimPages = newSet;
    const lastCheck = document.getElementById("split-trim-last-page");
    if (lastCheck) {
        lastCheck.checked = selectedTrimPages.has(pagesPerStudent);
    }
    renderSplitTrimPillButtons(false);
}

function syncCustomTrimInputFromSet() {
    const input = document.getElementById("split-trim-pages-custom");
    if (!input) return;
    const arr = Array.from(selectedTrimPages).sort((a, b) => a - b);
    input.value = arr.join(", ");
}

function getSelectedTrimPagesString() {
    const arr = Array.from(selectedTrimPages).sort((a, b) => a - b);
    return arr.join(",");
}

function renderSplitTrimPillButtons(syncInput = true) {
    const container = document.getElementById("split-trim-pills-container");
    if (!container) return;
    
    const pagesPerStudent = parseInt(document.getElementById("split-pages-per-student")?.value) || 2;
    container.innerHTML = "";
    
    for (let p = 1; p <= pagesPerStudent; p++) {
        const isTrimmed = selectedTrimPages.has(p);
        const isLast = (p === pagesPerStudent && pagesPerStudent > 1);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.onclick = () => toggleTrimPage(p);
        
        let label = `Page ${p}`;
        if (isLast) label += " (Last)";
        
        if (isTrimmed) {
            btn.className = "px-2 py-1 text-[11px] font-bold rounded bg-rose-600 text-white border border-rose-500 shadow-sm flex items-center gap-1 transition-all";
            btn.innerHTML = `<i data-lucide="scissors" class="w-3 h-3"></i> <span>Trim ${label}</span>`;
        } else {
            btn.className = "px-2 py-1 text-[11px] font-medium rounded bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700 transition-all";
            btn.textContent = label;
        }
        container.appendChild(btn);
    }
    
    if (syncInput) {
        syncCustomTrimInputFromSet();
    }
    if (typeof lucide !== "undefined" && lucide.createIcons) {
        lucide.createIcons();
    }
}

function setIngestMode(mode) {
    currentIngestMode = mode;
    const btnSplit = document.getElementById("btn-mode-split");
    const btnMulti = document.getElementById("btn-mode-multi");
    const splitPanel = document.getElementById("split-settings-panel");
    const multiPanel = document.getElementById("multi-settings-panel");
    const fileInput = document.getElementById("scan-file-input");
    const label = document.getElementById("scan-file-label");
    const subtext = document.getElementById("scan-file-subtext");
    const submitBtn = document.getElementById("btn-upload-scan");
    
    if (mode === "split_combined") {
        btnSplit.className = "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 bg-indigo-600 text-white shadow-md shadow-indigo-600/20";
        btnMulti.className = "px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-all flex items-center gap-2 bg-slate-800 border border-slate-700";
        splitPanel.classList.remove("hidden");
        if (multiPanel) multiPanel.classList.add("hidden");
        renderSplitTrimPillButtons();
        fileInput.removeAttribute("multiple");
        label.textContent = "Click to select combined class PDF file";
        subtext.textContent = "e.g. 60-page PDF of 30 students' 2-page exams";
        submitBtn.innerHTML = `<i data-lucide="scissors" class="w-4 h-4"></i> Split, Auto-Parse & Ingest`;
    } else {
        btnMulti.className = "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 bg-indigo-600 text-white shadow-md shadow-indigo-600/20";
        btnSplit.className = "px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-all flex items-center gap-2 bg-slate-800 border border-slate-700";
        splitPanel.classList.add("hidden");
        if (multiPanel) multiPanel.classList.remove("hidden");
        fileInput.setAttribute("multiple", "multiple");
        label.textContent = "Click to select or drop multiple student script files";
        subtext.textContent = "Select individual student PDFs / images";
        submitBtn.innerHTML = `<i data-lucide="upload-cloud" class="w-4 h-4"></i> Batch Ingest & Auto-Parse`;
    }
    lucide.createIcons();
}

function updateIngestFileSelection(input) {
    const label = document.getElementById("scan-file-label");
    if (!input.files || input.files.length === 0) return;
    
    if (input.files.length === 1) {
        label.textContent = `Selected: ${input.files[0].name} (${(input.files[0].size / 1024).toFixed(0)} KB)`;
        label.classList.add("text-emerald-400");
    } else {
        let totalSize = 0;
        for (let i = 0; i < input.files.length; i++) totalSize += input.files[i].size;
        label.textContent = `Selected: ${input.files.length} files (${(totalSize / (1024*1024)).toFixed(1)} MB total)`;
        label.classList.add("text-emerald-400");
    }
}

async function handleIngestSubmit(e) {
    e.preventDefault();
    const assignmentId = document.getElementById("upload-target-assignment").value;
    const fileInput = document.getElementById("scan-file-input");
    
    if (!assignmentId) {
        alert("Please select or create an assignment first.");
        return;
    }
    if (!fileInput.files || fileInput.files.length === 0) {
        alert("Please select file(s) to process.");
        return;
    }
    
    const btn = document.getElementById("btn-upload-scan");
    btn.disabled = true;
    
    if (currentIngestMode === "split_combined") {
        // Mode 1: Split combined multi-student PDF
        const pagesPerStudent = parseInt(document.getElementById("split-pages-per-student").value) || 2;
        const reversePages = document.getElementById("split-reverse-pages").checked;
        const reverseEntire = document.getElementById("split-reverse-entire").checked;
        const trimLastPage = document.getElementById("split-trim-last-page") ? document.getElementById("split-trim-last-page").checked : false;
        const trimPages = getSelectedTrimPagesString();
        
        btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Truncating & Auto-Parsing Student Documents...`;
        
        const formData = new FormData();
        formData.append("assignment_id", assignmentId);
        formData.append("pages_per_student", pagesPerStudent);
        formData.append("reverse_pages_per_student", reversePages);
        formData.append("reverse_entire_scan", reverseEntire);
        formData.append("trim_last_page", trimLastPage);
        if (trimPages) {
            formData.append("trim_pages", trimPages);
        }
        formData.append("file", fileInput.files[0]);
        
        try {
            const resp = await fetch("/api/submissions/split-combined-scan", {
                method: "POST",
                body: formData
            });
            const data = await resp.json();
            
            if (resp.ok && data.success) {
                alert(`Successfully split into ${data.total_split} student document(s)!`);
                fileInput.value = "";
                loadSubmissionsQueue();
                loadDashboardData();
                loadStudentsRoster();
                if (data.submissions && data.submissions.length > 0) {
                    openReviewForSubmission(data.submissions[0].submission_id);
                }
            } else {
                alert("Splitting error: " + (data.detail || JSON.stringify(data)));
            }
        } catch (err) {
            alert("Error during split & ingestion: " + err.message);
        } finally {
            btn.disabled = false;
            setIngestMode("split_combined");
        }
    } else {
        // Mode 2: Multi-file batch upload
        const multiTrimLast = document.getElementById("multi-trim-last-page") ? document.getElementById("multi-trim-last-page").checked : false;
        const multiTrimPages = document.getElementById("multi-trim-pages") ? document.getElementById("multi-trim-pages").value.trim() : "";
        
        btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Uploading & Auto-Parsing ${fileInput.files.length} Files...`;
        const formData = new FormData();
        formData.append("assignment_id", assignmentId);
        formData.append("trim_last_page", multiTrimLast);
        if (multiTrimPages) {
            formData.append("trim_pages", multiTrimPages);
        }
        for (let i = 0; i < fileInput.files.length; i++) {
            formData.append("files", fileInput.files[i]);
        }
        
        try {
            const resp = await fetch("/api/submissions/batch-upload", {
                method: "POST",
                body: formData
            });
            const data = await resp.json();
            if (data.success) {
                alert(`Uploaded and auto-parsed ${data.total_uploaded} student scripts!`);
                fileInput.value = "";
                loadSubmissionsQueue();
                loadDashboardData();
                loadStudentsRoster();
                if (data.submissions && data.submissions.length > 0) {
                    openReviewForSubmission(data.submissions[0].submission_id);
                }
            } else {
                alert("Batch upload failed: " + (data.detail || "Unknown error"));
            }
        } catch (err) {
            alert("Error during upload: " + err.message);
        } finally {
            btn.disabled = false;
            setIngestMode("multi_files");
        }
    }
}

async function loadSubmissionsQueue() {
    const tbody = document.getElementById("submissions-table-body");
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-4 text-center text-slate-500">Loading queue...</td></tr>`;
    
    try {
        const aResp = await fetch("/api/assignments");
        const assignments = await aResp.json();
        
        let allSubs = [];
        for (const a of assignments) {
            const sResp = await fetch(`/api/submissions/assignment/${a.id}`);
            const subs = await sResp.json();
            subs.forEach(s => s.assignment_title = a.title);
            allSubs.push(...subs);
        }
        
        if (allSubs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500">No student scripts ingested yet. Use the upload & split tool above.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = allSubs.map(s => {
            let statusColor = "bg-slate-800 text-slate-400 border-slate-700";
            if (s.status === "approved") statusColor = "bg-emerald-950 text-emerald-400 border-emerald-800";
            if (s.status === "review_ready") statusColor = "bg-indigo-950 text-indigo-400 border-indigo-800";
            if (s.status === "marking") statusColor = "bg-amber-950 text-amber-400 border-amber-800";
            
            let pagesCount = 0;
            try {
                pagesCount = JSON.parse(s.pages_json || "[]").length;
            } catch(e){}
            
            const isNew = !s.is_existing_student;
            
            return `
                <tr class="hover:bg-slate-800/40 transition-colors ${isNew ? 'bg-amber-950/10' : ''}">
                    <td class="px-4 py-3">
                        <div class="font-semibold ${isNew ? 'text-amber-300 font-bold' : 'text-white'} flex items-center gap-1.5">
                            ${s.student_name}
                            <button onclick="openReviewForSubmission(${s.id})" title="Edit / Correct Name" class="text-slate-500 hover:text-indigo-400"><i data-lucide="edit-3" class="w-3 h-3"></i></button>
                        </div>
                        <div class="text-[11px] text-slate-500 font-normal">${s.class_name || 'General'}${s.subject ? ' • ' + s.subject : ''}</div>
                    </td>
                    <td class="px-4 py-3">
                        ${isNew 
                            ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-700 font-bold">⚠️ New (Unverified)</span>`
                            : `<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-semibold">✓ In Database</span>`
                        }
                    </td>
                    <td class="px-4 py-3 text-slate-300">${s.assignment_title || 'Assignment'}</td>
                    <td class="px-4 py-3 text-slate-400">${pagesCount} page(s)</td>
                    <td class="px-4 py-3">
                        <span class="text-xs px-2 py-0.5 rounded-full border ${statusColor} font-medium capitalize">${s.status.replace('_', ' ')}</span>
                    </td>
                    <td class="px-4 py-3 font-bold ${s.status === 'approved' ? 'text-emerald-400' : 'text-slate-400'}">
                        ${s.total_score ? `${s.total_score} (${s.percentage}%)` : '--'}
                    </td>
                    <td class="px-4 py-3 text-right space-x-1.5">
                        <button onclick="openReviewForSubmission(${s.id})" class="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all inline-block align-middle">
                            Review / Mark
                        </button>
                        ${(s.status === 'approved' || s.total_score != null) ? `
                            <a href="/api/reports/${s.id}/pdf" target="_blank" title="Download Individual PDF Report" class="px-2.5 py-1 bg-indigo-950 text-indigo-300 border border-indigo-800 hover:bg-indigo-900 rounded-lg text-xs font-semibold inline-block align-middle">
                                PDF
                            </a>
                        ` : ''}
                        <button onclick="deleteSubmissionById(${s.id}, event)" title="Delete submission" class="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-all inline-block align-middle">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
        lucide.createIcons();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-4 text-center text-rose-400">Failed to load submissions queue.</td></tr>`;
    }
}

function refreshSubmissionsQueue() {
    loadSubmissionsQueue();
}

let currentAssignmentSubmissions = [];
let currentSubmissionIndex = -1;
let isLoadingReviewTab = false;

function showReviewAssignmentList() {
    const listView = document.getElementById("review-assignment-list-view");
    const stationView = document.getElementById("review-station-view");
    if (listView) listView.classList.remove("hidden");
    if (stationView) stationView.classList.add("hidden");
    
    loadReviewAssignmentsList();
}

async function loadReviewAssignmentsList() {
    const listView = document.getElementById("review-assignment-list-view");
    const stationView = document.getElementById("review-station-view");
    if (listView) listView.classList.remove("hidden");
    if (stationView) stationView.classList.add("hidden");
    
    const grid = document.getElementById("review-assignments-grid");
    const queueBadge = document.getElementById("review-queue-badge");
    const completedSection = document.getElementById("review-completed-assignments-section");
    const completedGrid = document.getElementById("review-completed-assignments-grid");
    
    if (grid) {
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
                <div class="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p class="text-xs text-slate-400">Loading assignments awaiting review...</p>
            </div>
        `;
    }
    
    try {
        const resp = await fetch("/api/assignments");
        const assignments = await resp.json();
        
        if (!assignments || assignments.length === 0) {
            if (queueBadge) {
                queueBadge.textContent = "0 Assignments";
                queueBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700";
            }
            if (grid) {
                grid.innerHTML = `
                    <div class="col-span-full py-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
                        <i data-lucide="inbox" class="w-12 h-12 text-slate-600 mx-auto mb-3"></i>
                        <h3 class="text-sm font-bold text-slate-300">No Assignments Found</h3>
                        <p class="text-xs text-slate-500 mt-1 mb-4">Create an assignment and upload student scripts to begin reviewing.</p>
                        <button onclick="switchTab('assignments')" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all">Go to Assignments</button>
                    </div>
                `;
            }
            if (completedSection) completedSection.classList.add("hidden");
            if (window.lucide) lucide.createIcons();
            return;
        }
        
        // Fetch submissions count and details for each assignment in parallel
        const assignmentsWithStats = await Promise.all(assignments.map(async (a) => {
            try {
                const sResp = await fetch(`/api/submissions/assignment/${a.id}`);
                const subs = await sResp.json();
                const total = subs.length;
                const approved = subs.filter(s => s.status === 'approved').length;
                const pending = total - approved;
                const reviewReady = subs.filter(s => s.status === 'review_ready').length;
                return {
                    ...a,
                    total_submissions: total,
                    approved_submissions: approved,
                    pending_submissions: pending,
                    review_ready_submissions: reviewReady
                };
            } catch(e) {
                return {
                    ...a,
                    total_submissions: a.submission_count || 0,
                    approved_submissions: a.approved_count || 0,
                    pending_submissions: (a.submission_count || 0) - (a.approved_count || 0),
                    review_ready_submissions: 0
                };
            }
        }));
        
        const pendingAssignments = assignmentsWithStats.filter(a => a.pending_submissions > 0);
        const completedAssignments = assignmentsWithStats.filter(a => a.total_submissions > 0 && a.pending_submissions === 0);
        const emptyAssignments = assignmentsWithStats.filter(a => a.total_submissions === 0);
        
        const totalPendingWork = pendingAssignments.reduce((acc, a) => acc + a.pending_submissions, 0);
        
        if (queueBadge) {
            if (pendingAssignments.length > 0) {
                queueBadge.textContent = `${pendingAssignments.length} Assignment(s) • ${totalPendingWork} Scripts Awaiting Review`;
                queueBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30";
            } else if (emptyAssignments.length > 0 && completedAssignments.length === 0) {
                queueBadge.textContent = "No Submissions Ingested";
                queueBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700";
            } else {
                queueBadge.textContent = "All Caught Up 🎉";
                queueBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
            }
        }
        
        // Update top nav review badges
        const reviewBadge = document.getElementById("review-pending-badge");
        const mobileReviewBadge = document.getElementById("mobile-review-pending-badge");
        if (totalPendingWork > 0) {
            if (reviewBadge) { reviewBadge.textContent = totalPendingWork; reviewBadge.classList.remove("hidden"); }
            if (mobileReviewBadge) mobileReviewBadge.classList.remove("hidden");
        } else {
            if (reviewBadge) reviewBadge.classList.add("hidden");
            if (mobileReviewBadge) mobileReviewBadge.classList.add("hidden");
        }
        
        if (pendingAssignments.length === 0) {
            if (emptyAssignments.length > 0 && completedAssignments.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full py-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                        <i data-lucide="scan-line" class="w-12 h-12 text-slate-600 mx-auto mb-3"></i>
                        <h3 class="text-base font-bold text-white">No Student Scripts Uploaded Yet</h3>
                        <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">You have ${emptyAssignments.length} assignment(s) created, but no student scans have been ingested yet.</p>
                        <button onclick="switchTab('processing')" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all">Go to Upload & Processing</button>
                    </div>
                `;
            } else {
                grid.innerHTML = `
                    <div class="col-span-full py-10 text-center bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                        <div class="w-12 h-12 bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 rounded-2xl flex items-center justify-center mx-auto mb-3">
                            <i data-lucide="check-check" class="w-6 h-6"></i>
                        </div>
                        <h3 class="text-base font-bold text-white">All Assignments Reviewed!</h3>
                        <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">There are no student submissions currently awaiting your review. Great work!</p>
                    </div>
                `;
            }
        } else {
            grid.innerHTML = pendingAssignments.map(a => {
                const pct = a.total_submissions > 0 ? Math.round((a.approved_submissions / a.total_submissions) * 100) : 0;
                return `
                    <div onclick="openReviewForAssignment(${a.id})" class="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/70 hover:bg-slate-900 rounded-2xl p-5 cursor-pointer transition-all flex flex-col justify-between group shadow-sm hover:shadow-indigo-500/10 hover:shadow-lg relative">
                        <div class="space-y-3">
                            <div class="flex items-start justify-between gap-2">
                                <div class="flex items-center gap-2">
                                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-400 border border-indigo-800">${escapeHtml(a.subject || 'General')}</span>
                                    <span class="text-xs text-slate-400 font-medium">${escapeHtml(a.class_name || 'General')}</span>
                                </div>
                                <span class="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-950 text-amber-300 border border-amber-800/80 flex items-center gap-1 shrink-0">
                                    <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                                    ${a.pending_submissions} to review
                                </span>
                            </div>
                            
                            <div>
                                <h3 class="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">${escapeHtml(a.title)}</h3>
                                <p class="text-xs text-slate-400 mt-1 line-clamp-2">${escapeHtml(a.marking_scheme_text || 'No marking scheme details provided.')}</p>
                            </div>
                            
                            <!-- Progress Bar -->
                            <div class="space-y-1.5 pt-1">
                                <div class="flex justify-between text-[11px]">
                                    <span class="text-slate-400 font-medium">Review Progress</span>
                                    <span class="text-slate-300 font-bold">${a.approved_submissions} / ${a.total_submissions} (${pct}%)</span>
                                </div>
                                <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                                    <div class="bg-gradient-to-r from-indigo-500 to-emerald-500 h-2 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between">
                            <div class="text-[11px] text-slate-400">
                                Max Marks: <b class="text-white">${a.max_marks}</b>
                            </div>
                            <div class="flex items-center gap-2">
                                <button onclick="event.stopPropagation(); rerunPipelineSteps2And3ForAssignment(${a.id}, this)" title="Rerun Steps 2 & 3: Re-mark and re-annotate scripts with updated marking scheme" class="px-2.5 py-1.5 bg-violet-950 hover:bg-violet-900 text-violet-200 border border-violet-700/60 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm">
                                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-violet-400"></i> Rerun 2 & 3
                                </button>
                                <button onclick="event.stopPropagation(); runBatchPipelineOnUnprocessed(${a.id}, this)" title="Run 3-step pipeline on all unprocessed student scripts in this assignment" class="px-2.5 py-1.5 bg-violet-950 hover:bg-violet-900 text-violet-200 border border-violet-700/60 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm">
                                    <i data-lucide="fast-forward" class="w-3.5 h-3.5 text-violet-400"></i> Pipeline
                                </button>
                                <button onclick="event.stopPropagation(); openReviewForAssignment(${a.id})" class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/20">
                                    Review <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join("");
        }
        
        // Render completed assignments section if any exist
        if (completedSection && completedGrid) {
            if (completedAssignments.length > 0) {
                completedSection.classList.remove("hidden");
                completedGrid.innerHTML = completedAssignments.map(a => `
                    <div onclick="openReviewForAssignment(${a.id})" class="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl p-4 cursor-pointer transition-all flex items-center justify-between group">
                        <div class="min-w-0 flex-1 pr-3">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800">${escapeHtml(a.subject || 'General')}</span>
                                <span class="text-xs text-slate-500">${escapeHtml(a.class_name || 'General')}</span>
                            </div>
                            <h4 class="text-xs font-bold text-slate-200 group-hover:text-white truncate">${escapeHtml(a.title)}</h4>
                            <span class="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                                <i data-lucide="check" class="w-3 h-3"></i> ${a.approved_submissions} / ${a.total_submissions} Approved (100%)
                            </span>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <button onclick="event.stopPropagation(); rerunPipelineSteps2And3ForAssignment(${a.id}, this)" title="Rerun Steps 2 & 3: Re-mark and re-annotate with updated marking scheme" class="px-2 py-1 bg-violet-950 hover:bg-violet-900 text-violet-300 border border-violet-800 rounded-lg text-xs font-medium flex items-center gap-1 transition-all">
                                <i data-lucide="refresh-cw" class="w-3 h-3 text-violet-400"></i> Rerun 2 & 3
                            </button>
                            <button onclick="event.stopPropagation(); openReviewForAssignment(${a.id})" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium">
                                View
                            </button>
                        </div>
                    </div>
                `).join("");
            } else {
                completedSection.classList.add("hidden");
            }
        }
        
        if (window.lucide) lucide.createIcons();
    } catch (e) {
        console.error("Error loading review assignments list", e);
        if (grid) grid.innerHTML = `<div class="col-span-full py-6 text-center text-xs text-rose-400">Failed to load review queue. Please try refreshing.</div>`;
    }
}

async function loadReviewTab(targetSubmissionId = null, preferPending = false) {
    if (isLoadingReviewTab) return;
    
    if (window.innerWidth < 1024) {
        switchReviewMobileView(currentReviewMobileView || 'doc');
    }
    
    if (targetSubmissionId) {
        await openReviewForSubmission(targetSubmissionId);
        return;
    }
    
    // If a submission is already loaded and valid, and not forcing a jump to pending
    if (currentSubmission && currentSubmission.id) {
        if (!preferPending || currentSubmission.status !== 'approved') {
            await populateReviewAssignmentSelector(currentSubmission.assignment_id);
            return;
        }
    }
    
    // Default to the list view if no submission is currently active
    showReviewAssignmentList();
}

async function openReviewForAssignment(assignmentId, event) {
    if (event) event.stopPropagation();
    
    // Switch to split-screen station view
    const listView = document.getElementById("review-assignment-list-view");
    const stationView = document.getElementById("review-station-view");
    if (listView) listView.classList.add("hidden");
    if (stationView) stationView.classList.remove("hidden");
    
    switchTab("review", true);
    
    if (window.innerWidth < 1024) {
        switchReviewMobileView(currentReviewMobileView || 'doc');
    }
    
    await switchReviewAssignment(assignmentId);
}

async function switchReviewAssignment(assignmentId) {
    if (!assignmentId) return;
    const prevLoading = isLoadingReviewTab;
    isLoadingReviewTab = true;
    try {
        const resp = await fetch(`/api/submissions/assignment/${assignmentId}`);
        const subs = await resp.json();
        
        await populateReviewAssignmentSelector(Number(assignmentId));
        
        if (!subs || subs.length === 0) {
            showReviewEmptyState("No student submissions uploaded yet for this assignment.");
            const assignSelector = document.getElementById("review-assignment-selector");
            if (assignSelector) assignSelector.value = assignmentId;
            return;
        }
        
        const targetSub = subs.find(s => s.status !== "approved") || subs[0];
        await openReviewForSubmission(targetSub.id);
    } catch (err) {
        console.error("Failed to switch assignment in review", err);
    } finally {
        isLoadingReviewTab = prevLoading;
    }
}

async function populateReviewAssignmentSelector(selectedAssignmentId = null) {
    const selector = document.getElementById("review-assignment-selector");
    if (!selector) return;
    
    try {
        const resp = await fetch("/api/assignments");
        const assignments = await resp.json();
        
        if (!assignments || assignments.length === 0) {
            selector.innerHTML = `<option value="" disabled selected>(No assignments)</option>`;
            return;
        }
        
        const targetId = selectedAssignmentId || (currentSubmission ? currentSubmission.assignment_id : null) || assignments[0].id;
        selector.innerHTML = assignments.map(a => {
            const isSel = (a.id == targetId);
            return `<option value="${a.id}" ${isSel ? 'selected' : ''}>${escapeHtml(a.title)} (${escapeHtml(a.class_name || 'General')})</option>`;
        }).join("");
        
        selector.value = targetId;
    } catch (e) {
        console.error("Failed to populate review assignment selector", e);
    }
}

function showReviewEmptyState(message = "No student submissions available for review.") {
    const assignTitle = document.getElementById("review-assignment-title");
    if (assignTitle) assignTitle.textContent = "No Submissions";
    
    const selector = document.getElementById("review-student-selector");
    if (selector) selector.innerHTML = `<option value="" disabled selected>(No submissions)</option>`;
    
    const counterBadge = document.getElementById("review-student-counter-badge");
    if (counterBadge) counterBadge.textContent = "0 / 0";
    
    const progressBadge = document.getElementById("review-class-progress-badge");
    if (progressBadge) progressBadge.textContent = "0 / 0 Approved";
    
    const btnPrev = document.getElementById("btn-prev-student");
    const btnNext = document.getElementById("btn-next-student");
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    
    const nameInput = document.getElementById("review-edit-student-name");
    if (nameInput) nameInput.value = "";
    
    const statusBadge = document.getElementById("review-status-badge");
    if (statusBadge) {
        statusBadge.textContent = "EMPTY";
        statusBadge.className = "text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium shrink-0";
    }
    
    const thumbs = document.getElementById("thumbnails-strip");
    if (thumbs) thumbs.innerHTML = `<div class="text-xs text-slate-500 py-2 px-3">${escapeHtml(message)}</div>`;
    
    const mainImg = document.getElementById("main-scan-img");
    if (mainImg) mainImg.src = "";
    
    const svgOverlay = document.getElementById("direct-marking-svg");
    if (svgOverlay) svgOverlay.innerHTML = "";
    
    const qContainer = document.getElementById("questions-container");
    if (qContainer) {
        qContainer.innerHTML = `
            <div class="py-12 px-4 text-center bg-slate-950/60 border border-slate-800 rounded-2xl">
                <i data-lucide="inbox" class="w-10 h-10 text-slate-600 mx-auto mb-3"></i>
                <h4 class="text-sm font-bold text-slate-300">Review Queue Empty</h4>
                <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">${escapeHtml(message)}</p>
            </div>
        `;
    }
    if (window.lucide) lucide.createIcons();
}

// 4. Split-Screen Review Station & Student Identity Highlighting
async function openReviewForSubmission(submissionId) {
    const listView = document.getElementById("review-assignment-list-view");
    const stationView = document.getElementById("review-station-view");
    if (listView) listView.classList.add("hidden");
    if (stationView) stationView.classList.remove("hidden");
    
    switchTab("review", true);
    
    const prevLoading = isLoadingReviewTab;
    isLoadingReviewTab = true;
    
    try {
        const resp = await fetch(`/api/submissions/${submissionId}`);
        currentSubmission = await resp.json();
        
        // Load all sibling submissions in this assignment batch
        if (currentSubmission.assignment_id) {
            try {
                const batchResp = await fetch(`/api/submissions/assignment/${currentSubmission.assignment_id}`);
                currentAssignmentSubmissions = await batchResp.json();
                updateBatchNavigationUI();
            } catch (err) {
                console.error("Failed to load assignment batch submissions", err);
            }
        }
        
        const nameInput = document.getElementById("review-edit-student-name");
        const codeInput = document.getElementById("review-edit-student-code");
        
        if (nameInput) nameInput.value = currentSubmission.student_name || "";
        if (codeInput) codeInput.value = currentSubmission.student_code || "";
        
        const markerSelect = document.getElementById("review-active-marker-select");
        if (markerSelect) {
            markerSelect.value = currentSubmission.assignment_marker_type || "auto";
        }
        
        // Highlight field if NOT in database
        updateStudentHighlightUI(currentSubmission.is_existing_student);
        
        const statusBadge = document.getElementById("review-status-badge");
        if (statusBadge) {
            statusBadge.textContent = (currentSubmission.status || "PENDING").toUpperCase();
            statusBadge.className = `text-xs px-2.5 py-1 rounded-full border font-medium ${currentSubmission.status === 'approved' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-indigo-950 text-indigo-400 border-indigo-800'}`;
        }
        
        const printBtn = document.getElementById("btn-print-report");
        if (printBtn) {
            printBtn.href = `/api/reports/${submissionId}/html`;
            if (currentSubmission.status === "approved" || currentSubmission.total_score != null) {
                printBtn.classList.remove("hidden");
            } else {
                printBtn.classList.add("hidden");
            }
        }
        
        currentPages = currentSubmission.pages || [];
        currentAnnotations = currentSubmission.annotations || [];
        if ((!currentAnnotations || currentAnnotations.length === 0) && currentSubmission.question_grades && currentSubmission.question_grades.length > 0) {
            currentAnnotations = synthesizeClientAnnotations(currentSubmission.question_grades, currentPages);
            currentSubmission.annotations = currentAnnotations;
        }
        currentPageIndex = 0;
        currentZoom = 1.0;
        
        renderPagesViewer();
        renderGradingFields();
    } catch (e) {
        alert("Failed to load submission details: " + e.message);
    } finally {
        isLoadingReviewTab = prevLoading;
    }
}

function updateBatchNavigationUI() {
    if (!currentAssignmentSubmissions || currentAssignmentSubmissions.length === 0) return;
    
    currentSubmissionIndex = currentAssignmentSubmissions.findIndex(s => s.id === currentSubmission.id);
    if (currentSubmissionIndex === -1) currentSubmissionIndex = 0;
    
    const selector = document.getElementById("review-student-selector");
    const counterBadge = document.getElementById("review-student-counter-badge");
    const btnPrev = document.getElementById("btn-prev-student");
    const btnNext = document.getElementById("btn-next-student");
    const assignTitle = document.getElementById("review-assignment-title");
    const assignSelector = document.getElementById("review-assignment-selector");
    const progressBadge = document.getElementById("review-class-progress-badge");
    
    const totalCount = currentAssignmentSubmissions.length;
    const currentNum = currentSubmissionIndex + 1;
    
    if (counterBadge) counterBadge.textContent = `${currentNum} / ${totalCount}`;
    if (assignTitle) assignTitle.textContent = currentSubmission.assignment_title || "Assignment";
    if (assignSelector && currentSubmission && currentSubmission.assignment_id) {
        assignSelector.value = currentSubmission.assignment_id;
    }
    
    const approvedCount = currentAssignmentSubmissions.filter(s => s.status === 'approved').length;
    if (progressBadge) progressBadge.textContent = `${approvedCount} / ${totalCount} Approved`;
    
    if (selector) {
        const validSubmissions = (currentAssignmentSubmissions || []).filter(s => s && s.id);
        if (validSubmissions.length === 0) {
            selector.innerHTML = `<option value="" disabled selected>(No submissions in batch)</option>`;
        } else {
            selector.innerHTML = validSubmissions.map((s, idx) => {
                const isCur = (s.id === currentSubmission.id);
                const statusLabel = s.status === 'approved' ? '✓ Approved' : (s.status === 'review_ready' ? `Review Ready (${s.percentage || 0}%)` : 'Pending');
                const sName = (s.student_name && s.student_name.trim()) ? s.student_name.trim() : `Student ${idx+1}`;
                return `<option value="${s.id}" ${isCur ? 'selected' : ''}>Student ${idx+1}: ${escapeHtml(sName)} [${statusLabel}]</option>`;
            }).join("");
        }
    }
    
    if (btnPrev) btnPrev.disabled = (currentSubmissionIndex <= 0);
    if (btnNext) btnNext.disabled = (currentSubmissionIndex >= totalCount - 1);
}

function prevStudentSubmission() {
    if (currentSubmissionIndex > 0) {
        const prevSub = currentAssignmentSubmissions[currentSubmissionIndex - 1];
        if (prevSub) openReviewForSubmission(prevSub.id);
    }
}

function nextStudentSubmission() {
    if (currentSubmissionIndex < currentAssignmentSubmissions.length - 1) {
        const nextSub = currentAssignmentSubmissions[currentSubmissionIndex + 1];
        if (nextSub) openReviewForSubmission(nextSub.id);
    }
}

function updateStudentHighlightUI(isExisting) {
    const nameInput = document.getElementById("review-edit-student-name");
    const matchBadge = document.getElementById("student-match-badge");
    
    if (!isExisting) {
        if (nameInput) {
            nameInput.classList.add("student-input-new");
            nameInput.classList.remove("student-input-existing");
        }
        if (matchBadge) {
            matchBadge.className = "text-xs px-2.5 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-700 font-bold";
            matchBadge.innerHTML = "⚠️ New Student (Not in DB)";
        }
    } else {
        if (nameInput) {
            nameInput.classList.remove("student-input-new");
            nameInput.classList.add("student-input-existing");
        }
        if (matchBadge) {
            matchBadge.className = "text-xs px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold";
            matchBadge.innerHTML = "✓ In Database";
        }
    }
}

async function saveStudentInfoCorrection() {
    if (!currentSubmission) return;
    const nameEl = document.getElementById("review-edit-student-name");
    const codeEl = document.getElementById("review-edit-student-code");
    const name = nameEl ? (nameEl.value || "").trim() : (currentSubmission.student_name || "").trim();
    const code = codeEl ? (codeEl.value || "").trim() : (currentSubmission.student_code || "").trim();
    
    if (!name) return;
    
    try {
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/student-info`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: name,
                student_code: code || currentSubmission.student_code,
                class_name: currentSubmission.class_name || "General"
            })
        });
        const data = await resp.json();
        if (data.success) {
            currentSubmission.student_name = data.student.name;
            currentSubmission.student_code = data.student.student_id;
            loadStudentsRoster();
            updateStudentHighlightUI(true);
        }
    } catch (e) {
        console.error("Failed to update student identity:", e);
    }
}

async function triggerAutoDetectName() {
    if (!currentSubmission) return;
    const nameInput = document.getElementById("review-edit-student-name");
    const origVal = nameInput.value;
    nameInput.value = "AI reading header...";
    
    try {
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/auto-detect-name`, {
            method: "POST"
        });
        const data = await resp.json();
        if (data.success && data.student) {
            nameInput.value = data.student.name;
            document.getElementById("review-edit-student-code").value = data.student.student_id;
            currentSubmission.student_name = data.student.name;
            currentSubmission.student_code = data.student.student_id;
            loadStudentsRoster();
            updateStudentHighlightUI(true);
        } else {
            nameInput.value = origVal;
        }
    } catch (e) {
        nameInput.value = origVal;
        alert("Failed to auto-detect name with AI: " + e.message);
    }
}

let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

function applyPanZoomTransform() {
    const container = document.getElementById("pan-zoom-container");
    const zoomLabel = document.getElementById("doc-zoom-label");
    if (zoomLabel) zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
    if (!container) return;
    const activePage = currentPages[currentPageIndex];
    const rotation = activePage ? (activePage.rotation || 0) : 0;
    container.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom}) rotate(${rotation}deg)`;
}

function setupPanZoomEvents() {
    const viewport = document.getElementById("doc-viewport");
    if (!viewport || viewport.dataset.panSetup === "true") return;
    viewport.dataset.panSetup = "true";
    
    // Mouse Drag Panning (Desktop)
    viewport.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return; // Left-click only
        isPanning = true;
        startX = e.clientX - panX;
        startY = e.clientY - panY;
        viewport.style.cursor = "grabbing";
    });
    
    window.addEventListener("mousemove", (e) => {
        if (!isPanning) return;
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        applyPanZoomTransform();
    });
    
    window.addEventListener("mouseup", () => {
        if (isPanning) {
            isPanning = false;
            const vp = document.getElementById("doc-viewport");
            if (vp) vp.style.cursor = "grab";
        }
    });
    
    // Wheel Zooming (Desktop)
    viewport.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        currentZoom = Math.max(0.3, Math.min(5.0, currentZoom + delta));
        applyPanZoomTransform();
    }, { passive: false });

    // Touch Gesture Support (Mobile & Tablet)
    let initialPinchDist = null;
    let initialZoom = 1.0;
    let touchStartX = 0;
    let touchStartY = 0;

    function getTouchDist(t1, t2) {
        return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }

    viewport.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) {
            isPanning = true;
            touchStartX = e.touches[0].clientX - panX;
            touchStartY = e.touches[0].clientY - panY;
        } else if (e.touches.length === 2) {
            isPanning = false;
            initialPinchDist = getTouchDist(e.touches[0], e.touches[1]);
            initialZoom = currentZoom;
        }
    }, { passive: true });

    viewport.addEventListener("touchmove", (e) => {
        if (e.touches.length === 1 && isPanning) {
            panX = e.touches[0].clientX - touchStartX;
            panY = e.touches[0].clientY - touchStartY;
            applyPanZoomTransform();
        } else if (e.touches.length === 2 && initialPinchDist) {
            const currentDist = getTouchDist(e.touches[0], e.touches[1]);
            const scaleFactor = currentDist / initialPinchDist;
            currentZoom = Math.max(0.3, Math.min(5.0, initialZoom * scaleFactor));
            applyPanZoomTransform();
        }
    }, { passive: true });

    viewport.addEventListener("touchend", (e) => {
        if (e.touches.length === 0) {
            isPanning = false;
            initialPinchDist = null;
        } else if (e.touches.length === 1) {
            isPanning = true;
            touchStartX = e.touches[0].clientX - panX;
            touchStartY = e.touches[0].clientY - panY;
            initialPinchDist = null;
        }
    }, { passive: true });
}

function renderPagesViewer() {
    const mainImg = document.getElementById("main-scan-img");
    const strip = document.getElementById("thumbnails-strip");
    const totalPagesSpan = document.getElementById("total-pages-num");
    const curPageSpan = document.getElementById("current-page-num");
    const mobilePageBadge = document.getElementById("mobile-doc-page-badge");
    
    if (totalPagesSpan) totalPagesSpan.textContent = currentPages ? currentPages.length : 0;
    setupPanZoomEvents();
    
    if (!currentPages || currentPages.length === 0) {
        if (mainImg) mainImg.src = "";
        if (strip) strip.innerHTML = `<span class="text-xs text-slate-500">No scanned pages</span>`;
        if (mobilePageBadge) mobilePageBadge.textContent = "P.0";
        return;
    }
    
    if (curPageSpan) curPageSpan.textContent = currentPageIndex + 1;
    if (mobilePageBadge) mobilePageBadge.textContent = `P.${currentPageIndex + 1}`;
    
    const activePage = currentPages[currentPageIndex];
    if (activePage && activePage.image_path) {
        const imagePath = activePage.image_path.replace(/\\/g, '/');
        const relativeWebPath = imagePath.includes('data/processed') ? imagePath.substring(imagePath.indexOf('data/processed')) : imagePath;
        if (mainImg) {
            // Clear SVG immediately when switching pages so stale marks don't flash
            const svg = document.getElementById("direct-marking-svg");
            if (svg) svg.innerHTML = "";
            mainImg.onload = () => renderDirectMarkingOverlay();
            mainImg.src = `/${relativeWebPath}?t=${Date.now()}`;
        }
    }
    
    applyPanZoomTransform();
    // Note: renderDirectMarkingOverlay() is called from mainImg.onload above
    
    if (strip) {
        strip.innerHTML = currentPages.map((p, idx) => {
            const thumbPath = (p.thumbnail_path || p.image_path || "").replace(/\\/g, '/');
            const relThumb = thumbPath.includes('data/processed') ? thumbPath.substring(thumbPath.indexOf('data/processed')) : thumbPath;
            return `
                <div onclick="selectPage(${idx})" class="thumb-card cursor-pointer shrink-0 rounded-lg overflow-hidden bg-slate-800 ${idx === currentPageIndex ? 'active' : ''}">
                    <img src="/${relThumb}?t=${Date.now()}" class="w-12 h-14 object-cover">
                    <div class="text-[10px] text-center bg-slate-950 text-slate-400 py-0.5">P${idx+1}</div>
                </div>
            `;
        }).join("");
    }
}

function selectPage(idx) {
    if (idx >= 0 && idx < currentPages.length) {
        currentPageIndex = idx;
        renderPagesViewer();
    }
}

function prevPage() {
    if (currentPageIndex > 0) {
        currentPageIndex--;
        renderPagesViewer();
    }
}

function nextPage() {
    if (currentPageIndex < currentPages.length - 1) {
        currentPageIndex++;
        renderPagesViewer();
    }
}

function zoomDoc(delta) {
    currentZoom = Math.max(0.3, Math.min(5.0, currentZoom + delta));
    applyPanZoomTransform();
}

function resetDocPanZoom() {
    currentZoom = 1.0;
    panX = 0;
    panY = 0;
    applyPanZoomTransform();
}

async function rotateCurrentPage() {
    if (!currentSubmission || currentPages.length === 0) return;
    try {
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/rotate-page`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ page_index: currentPageIndex, angle: 90 })
        });
        const data = await resp.json();
        if (data.success) {
            currentPages[currentPageIndex] = data.page;
            renderPagesViewer();
        }
    } catch (e) {
        alert("Failed to rotate page: " + e.message);
    }
}

async function reverseAllPagesCurrent() {
    if (!currentSubmission || currentPages.length === 0) return;
    if (!confirm("Reverse the sequence of all pages for this submission?")) return;
    
    try {
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/reverse-pages`, {
            method: "POST"
        });
        const data = await resp.json();
        if (data.success) {
            currentPages = data.pages;
            currentPageIndex = 0;
            renderPagesViewer();
        }
    } catch (e) {
        alert("Failed to reverse pages: " + e.message);
    }
}

// Rubric & Feedback Grading Form
function renderGradingFields() {
    const qContainer = document.getElementById("questions-container");
    const questions = (currentSubmission && currentSubmission.question_grades) || [];
    const editStrengths = document.getElementById("edit-strengths");
    const editImprovements = document.getElementById("edit-improvements");
    const editOverall = document.getElementById("edit-overall-feedback");
    
    if (editStrengths) editStrengths.value = (currentSubmission && currentSubmission.strengths_feedback) || "";
    if (editImprovements) editImprovements.value = (currentSubmission && currentSubmission.improvement_feedback) || "";
    if (editOverall) editOverall.value = (currentSubmission && currentSubmission.overall_feedback) || "";
    
    if (!qContainer) return;
    
    if (questions.length === 0) {
        qContainer.innerHTML = `
            <div class="text-xs text-slate-500 p-6 border border-dashed border-slate-800 rounded-xl text-center space-y-3">
                <i data-lucide="scan-text" class="w-8 h-8 text-slate-600 mx-auto"></i>
                <div>
                    <div class="font-bold text-slate-300">No question breakdown generated yet</div>
                    <p class="text-[11px] text-slate-500 mt-1">Click <b>"Step 1A: Extract Text"</b> to transcribe the student's handwritten responses for your review.</p>
                </div>
            </div>
        `;
    } else {
        qContainer.innerHTML = questions.map((q, idx) => `
            <div class="q-card space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-all" id="q-card-${idx}">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2 flex-1">
                        <span class="text-xs font-black text-indigo-400 w-10 shrink-0">Q${q.question_no || (idx+1)}</span>
                        <input type="text" value="${q.question_title || ''}" placeholder="Topic or sub-criterion description..." class="q-title-input flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500">
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <span class="text-[11px] text-slate-400">Score:</span>
                        <input type="number" step="0.5" value="${q.awarded_marks || 0}" oninput="recalculateTotals()" class="q-awarded-input w-16 bg-slate-900 border border-indigo-700/80 rounded-lg px-2 py-1 text-xs font-bold text-white text-center">
                        <span class="text-xs text-slate-500">/</span>
                        <input type="number" step="0.5" value="${q.max_marks || 10}" oninput="recalculateTotals()" class="q-max-input w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-400 text-center">
                        <button onclick="removeQuestionField(${idx})" title="Delete question" class="text-slate-600 hover:text-rose-400 p-1 transition-all"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                    </div>
                </div>

                <!-- Verbatim Extracted Student Response (Editable in Step 1A before Step 1B) -->
                <div class="space-y-1">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="font-semibold text-sky-400 flex items-center gap-1">
                            <i data-lucide="edit-3" class="w-3 h-3"></i> Student Response (Verbatim Extracted):
                        </span>
                        <span class="text-[10px] text-slate-500">Editable prior to Step 1B</span>
                    </div>
                    <textarea class="q-extracted-answer-input w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500 transition-all leading-relaxed" rows="2" placeholder="Verbatim transcription of student handwriting, calculations, or graph details...">${q.extracted_answer || ''}</textarea>
                </div>

                <!-- Detailed Feedback & Error Diagnostic Area -->
                <div class="space-y-1.5">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="font-semibold text-indigo-400 flex items-center gap-1">
                            <i data-lucide="message-square" class="w-3 h-3"></i> AI Marking Feedback & Error Diagnostic:
                        </span>
                        ${Number(q.awarded_marks || 0) < Number(q.max_marks || 0) 
                            ? `<span class="text-[10px] text-rose-300 font-semibold px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-800">Deduction: -${((q.max_marks || 0) - (q.awarded_marks || 0)).toFixed(1)} (Error Identified)</span>` 
                            : `<span class="text-[10px] text-emerald-300 font-semibold px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800">Full Marks ✓</span>`
                        }
                    </div>
                    <textarea class="q-comment-input w-full bg-slate-900 border ${Number(q.awarded_marks || 0) < Number(q.max_marks || 0) ? 'border-amber-900/60 focus:border-amber-500' : 'border-slate-800 focus:border-indigo-500'} rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none leading-relaxed font-sans transition-all" rows="3" placeholder="Question-specific remark, clear error explanation, or deduction rationale...">${q.feedback_comment || ''}</textarea>
                </div>

                ${(q.criteria && Array.isArray(q.criteria) && q.criteria.length > 0) ? `
                <!-- Rubric Criteria Breakdown -->
                <div class="space-y-1.5 pt-1">
                    <div class="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                        <i data-lucide="check-square" class="w-3 h-3 text-indigo-400"></i> Rubric Criteria Breakdown:
                    </div>
                    <div class="grid grid-cols-1 gap-1.5 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                        ${q.criteria.map((c, cIdx) => `
                            <div class="flex items-start justify-between gap-2 text-[11px] py-1 border-b border-slate-800/50 last:border-b-0">
                                <div class="flex-1">
                                    <div class="font-medium ${Number(c.awarded || 0) >= Number(c.max || 1) ? 'text-emerald-400' : 'text-amber-300'} flex items-center gap-1.5">
                                        <span>${Number(c.awarded || 0) >= Number(c.max || 1) ? '✓' : '✗'}</span>
                                        <span>${c.criterion || `Criterion ${cIdx+1}`}</span>
                                    </div>
                                    ${c.comment ? `<div class="text-[10px] text-slate-400 pl-4 mt-0.5 leading-snug">${c.comment}</div>` : ''}
                                </div>
                                <div class="shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded ${Number(c.awarded || 0) >= Number(c.max || 1) ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' : 'bg-amber-950 text-amber-400 border border-amber-800/60'}">
                                    ${c.awarded || 0} / ${c.max || 1}
                                </div>
                            </div>
                        `).join("")}
                    </div>
                </div>
                ` : ''}
            </div>
        `).join("");
    }
    
    recalculateTotals();
    lucide.createIcons();
}

function addNewQuestionField() {
    const qContainer = document.getElementById("questions-container");
    const currentCount = qContainer.querySelectorAll(".q-card").length;
    const newIdx = currentCount;
    
    const div = document.createElement("div");
    div.className = "q-card space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-all";
    div.id = `q-card-${newIdx}`;
    div.innerHTML = `
        <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2 flex-1">
                <span class="text-xs font-black text-indigo-400 w-10 shrink-0">Q${newIdx + 1}</span>
                <input type="text" placeholder="Topic description..." class="q-title-input flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white">
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-[11px] text-slate-400">Score:</span>
                <input type="number" step="0.5" value="0" oninput="recalculateTotals()" class="q-awarded-input w-16 bg-slate-900 border border-indigo-700/80 rounded-lg px-2 py-1 text-xs font-bold text-white text-center">
                <span class="text-xs text-slate-500">/</span>
                <input type="number" step="0.5" value="10" oninput="recalculateTotals()" class="q-max-input w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-400 text-center">
                <button onclick="this.closest('.q-card').remove(); recalculateTotals();" class="text-slate-600 hover:text-rose-400 p-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>
        </div>
        <div class="space-y-1">
            <span class="text-[11px] font-semibold text-sky-400">Student Response (Verbatim Extracted):</span>
            <textarea class="q-extracted-answer-input w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono" rows="2" placeholder="Student's extracted response..."></textarea>
        </div>
        <div class="space-y-1.5">
            <span class="text-[11px] font-semibold text-indigo-400 flex items-center gap-1">
                <i data-lucide="message-square" class="w-3 h-3"></i> AI Marking Feedback & Error Diagnostic:
            </span>
            <textarea placeholder="Question-specific remark, clear error explanation, or deduction rationale..." class="q-comment-input w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none leading-relaxed font-sans transition-all" rows="3"></textarea>
        </div>
    `;
    qContainer.appendChild(div);
    recalculateTotals();
    lucide.createIcons();
}

function removeQuestionField(idx) {
    const card = document.getElementById(`q-card-${idx}`);
    if (card) card.remove();
    recalculateTotals();
}

function recalculateTotals() {
    const awardedInputs = document.querySelectorAll(".q-awarded-input");
    const maxInputs = document.querySelectorAll(".q-max-input");
    
    let totalAwarded = 0;
    let totalMax = 0;
    
    awardedInputs.forEach(input => totalAwarded += parseFloat(input.value) || 0);
    maxInputs.forEach(input => totalMax += parseFloat(input.value) || 0);
    
    if (totalMax === 0 && currentSubmission) {
        totalMax = currentSubmission.assignment_max_marks || 100;
    }
    
    const pct = totalMax > 0 ? ((totalAwarded / totalMax) * 100).toFixed(1) : 0;
    let letter = "U";
    if (pct >= 90) letter = "A*";
    else if (pct >= 80) letter = "A";
    else if (pct >= 70) letter = "B";
    else if (pct >= 60) letter = "C";
    else if (pct >= 50) letter = "D";
    else if (pct >= 40) letter = "E";
    const totalScoreEl = document.getElementById("computed-total-marks") || document.getElementById("review-total-score-badge");
    const gradeBadgeEl = document.getElementById("grade-badge") || document.getElementById("review-grade-badge");
    
    if (totalScoreEl) {
        totalScoreEl.textContent = `${totalAwarded} / ${totalMax} (${pct}%)`;
    }
    if (gradeBadgeEl) {
        gradeBadgeEl.textContent = `Grade: ${letter}`;
    }
}

function gatherReviewFormData() {
    const qCards = document.querySelectorAll(".q-card");
    const questions = [];
    
    qCards.forEach((card, idx) => {
        const qNo = card.querySelector(".text-indigo-400")?.textContent?.replace(/^Q/, "") || `${idx+1}`;
        const qTitle = card.querySelector(".q-title-input")?.value || `Question ${idx+1}`;
        const extracted = card.querySelector(".q-extracted-answer-input")?.value || "";
        const awarded = parseFloat(card.querySelector(".q-awarded-input")?.value) || 0;
        const max = parseFloat(card.querySelector(".q-max-input")?.value) || 0;
        const comment = card.querySelector(".q-comment-input")?.value || "";
        
        const existingQ = (currentSubmission && currentSubmission.question_grades) 
            ? currentSubmission.question_grades.find(item => String(item.question_no).trim().toLowerCase() === String(qNo).trim().toLowerCase()) 
            : null;
        const criteria = existingQ ? (existingQ.criteria || []) : [];

        questions.push({
            question_no: qNo,
            question_title: qTitle,
            extracted_answer: extracted,
            awarded_marks: awarded,
            max_marks: max,
            criteria: criteria,
            feedback_comment: comment
        });
    });
    
    return {
        overall_feedback: document.getElementById("edit-overall-feedback") ? document.getElementById("edit-overall-feedback").value : "",
        strengths_feedback: document.getElementById("edit-strengths") ? document.getElementById("edit-strengths").value : "",
        improvement_feedback: document.getElementById("edit-improvements") ? document.getElementById("edit-improvements").value : "",
        questions: questions
    };
}

let monitorInterval = null;
let monitorStartTime = null;

function startAiLiveMonitor(stageName) {
    const dot = document.getElementById("ai-monitor-dot");
    const ping = document.getElementById("ai-monitor-ping");
    const statusText = document.getElementById("ai-monitor-status-text");
    const stageText = document.getElementById("ai-monitor-stage-text");
    const timer = document.getElementById("ai-monitor-timer");
    const bar = document.getElementById("ai-monitor-progress-bar");

    // Dashboard live monitor elements
    const dashMonitor = document.getElementById("dashboard-live-monitor");
    const dashPing = document.getElementById("dash-monitor-ping");
    const dashDot = document.getElementById("dash-monitor-dot");
    const dashStatus = document.getElementById("dash-monitor-status");
    const dashStage = document.getElementById("dash-monitor-stage");
    const dashTimer = document.getElementById("dash-monitor-timer");
    const dashBar = document.getElementById("dash-monitor-bar");

    if (dashMonitor) dashMonitor.classList.remove("hidden");
    if (dashPing) dashPing.classList.remove("hidden");
    if (dashDot) dashDot.className = "relative inline-flex rounded-full h-2 w-2 bg-amber-400";
    if (dashStatus) dashStatus.innerHTML = `<span class="text-amber-400 font-bold">Pipeline Active</span>`;
    if (dashStage) dashStage.textContent = stageName || "Processing with local AI...";
    if (dashBar) dashBar.style.width = "30%";
    
    if (dot) dot.className = "relative inline-flex rounded-full h-3 w-3 bg-amber-400";
    if (ping) {
        ping.className = "animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75";
        ping.classList.remove("hidden");
    }
    if (statusText) statusText.innerHTML = `<span class="text-amber-400 font-bold">LLM Active / Working</span>`;
    if (stageText) stageText.textContent = stageName || "Processing with local AI...";
    if (bar) bar.style.width = "30%";
    
    monitorStartTime = Date.now();
    clearInterval(monitorInterval);
    monitorInterval = setInterval(async () => {
        const elapsed = ((Date.now() - monitorStartTime) / 1000).toFixed(1);
        if (timer) timer.textContent = `⏱️ ${elapsed}s`;
        if (dashTimer) dashTimer.textContent = `⏱️ ${elapsed}s`;
        
        try {
            const resp = await fetch("/api/health/workload");
            const data = await resp.json();
            const vramEl = document.getElementById("ai-monitor-vram");
            if (vramEl) {
                if (data.active_models && data.active_models.length > 0) {
                    const m = data.active_models[0];
                    vramEl.textContent = `Loaded: ${m.name} (${m.size_vram_gb || m.size_gb}GB VRAM)`;
                } else {
                    vramEl.textContent = "VRAM: Loading model...";
                }
            }
        } catch (e) {}
    }, 1200);
}

function updateAiLiveMonitorStage(stageName, percent = null) {
    const stageText = document.getElementById("ai-monitor-stage-text");
    const bar = document.getElementById("ai-monitor-progress-bar");
    const dashStage = document.getElementById("dash-monitor-stage");
    const dashBar = document.getElementById("dash-monitor-bar");

    if (stageText) stageText.textContent = stageName;
    if (dashStage) dashStage.textContent = stageName;

    if (percent !== null && percent !== undefined) {
        if (bar) bar.style.width = `${percent}%`;
        if (dashBar) dashBar.style.width = `${percent}%`;
    }
}

// Alias for safe pipeline progress logging
function updateAiLiveMonitorText(stageName, percent = null) {
    updateAiLiveMonitorStage(stageName, percent);
}

// Fallback Event Notification Modal Handler
function showFallbackNotice(fallbacks, contextTitle = "Automated AI Pipeline") {
    if (!fallbacks || !Array.isArray(fallbacks) || fallbacks.length === 0) return;
    const modal = document.getElementById("modal-fallback-notice");
    const listContainer = document.getElementById("fallback-notice-list");
    const subtitle = document.getElementById("fallback-notice-subtitle");
    if (!modal || !listContainer) return;

    if (subtitle) {
        subtitle.textContent = `${contextTitle} triggered ${fallbacks.length} fallback event${fallbacks.length > 1 ? 's' : ''}`;
    }

    listContainer.innerHTML = fallbacks.map((fb, idx) => `
        <div class="p-3 bg-slate-950/80 border border-amber-900/60 rounded-xl space-y-1.5 hover:border-amber-700/80 transition-all">
            <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
                    <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                    ${escapeHtml(fb.source || 'Pipeline Fallback')}
                </span>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-800/80">Event #${idx+1}</span>
            </div>
            <div class="text-slate-300 text-[11px] leading-snug">
                <span class="text-slate-400 font-medium">Trigger:</span> ${escapeHtml(fb.trigger || 'Non-standard output or boundary clamping')}
            </div>
            <div class="text-slate-200 text-[11px] leading-snug bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span class="text-amber-400 font-semibold">Action Taken:</span> ${escapeHtml(fb.action || 'Applied fallback')}
                ${fb.details ? `<div class="text-[10px] text-slate-400 mt-1 font-mono">${escapeHtml(fb.details)}</div>` : ''}
            </div>
        </div>
    `).join("");

    modal.classList.remove("hidden");
    if (window.lucide) lucide.createIcons();
}

function closeFallbackNotice() {
    const modal = document.getElementById("modal-fallback-notice");
    if (modal) modal.classList.add("hidden");
}

function stopAiLiveMonitor(success = true, finalMsg = "", fallbackTriggered = false) {
    clearInterval(monitorInterval);
    const dot = document.getElementById("ai-monitor-dot");
    const ping = document.getElementById("ai-monitor-ping");
    const statusText = document.getElementById("ai-monitor-status-text");
    const stageText = document.getElementById("ai-monitor-stage-text");
    const bar = document.getElementById("ai-monitor-progress-bar");

    // Dashboard live monitor elements
    const dashMonitor = document.getElementById("dashboard-live-monitor");
    const dashPing = document.getElementById("dash-monitor-ping");
    const dashDot = document.getElementById("dash-monitor-dot");
    const dashStatus = document.getElementById("dash-monitor-status");
    const dashStage = document.getElementById("dash-monitor-stage");
    const dashBar = document.getElementById("dash-monitor-bar");
    
    if (ping) ping.classList.add("hidden");
    if (dashPing) dashPing.classList.add("hidden");

    if (dot) {
        if (!success) {
            dot.className = "relative inline-flex rounded-full h-3 w-3 bg-rose-500";
        } else if (fallbackTriggered) {
            dot.className = "relative inline-flex rounded-full h-3 w-3 bg-amber-500";
        } else {
            dot.className = "relative inline-flex rounded-full h-3 w-3 bg-emerald-500";
        }
    }
    if (dashDot) {
        if (!success) {
            dashDot.className = "relative inline-flex rounded-full h-2 w-2 bg-rose-500";
        } else if (fallbackTriggered) {
            dashDot.className = "relative inline-flex rounded-full h-2 w-2 bg-amber-500";
        } else {
            dashDot.className = "relative inline-flex rounded-full h-2 w-2 bg-emerald-500";
        }
    }

    if (statusText) {
        if (!success) {
            statusText.innerHTML = `<span class="text-rose-400 font-bold">Error</span>`;
        } else if (fallbackTriggered) {
            statusText.innerHTML = `<span class="text-amber-400 font-bold">Completed (With Fallback)</span>`;
        } else {
            statusText.innerHTML = `<span class="text-emerald-400 font-bold">Completed Ready</span>`;
        }
    }
    if (dashStatus) {
        if (!success) {
            dashStatus.innerHTML = `<span class="text-rose-400 font-bold">Error</span>`;
        } else if (fallbackTriggered) {
            dashStatus.innerHTML = `<span class="text-amber-400 font-bold">Done (Fallback)</span>`;
        } else {
            dashStatus.innerHTML = `<span class="text-emerald-400 font-bold">Completed</span>`;
        }
    }

    if (stageText) stageText.textContent = finalMsg || (success ? "Finished. You can review and edit marks." : "Operation failed.");
    if (dashStage) dashStage.textContent = finalMsg || (success ? "Pipeline complete!" : "Operation failed.");
    if (bar) bar.style.width = success ? "100%" : "0%";
    if (dashBar) dashBar.style.width = success ? "100%" : "0%";

    if (dashMonitor && success) {
        setTimeout(() => {
            if (dashMonitor) dashMonitor.classList.add("hidden");
        }, 5000);
    }
}

async function ensureStudentNameParsedBeforeGrading() {
    const nameInput = document.getElementById("review-edit-student-name");
    if (!nameInput) return;
    const currentName = (nameInput.value || "").trim();
    if (!currentName || currentName === "Student Script" || currentName.startsWith("Student Script")) {
        startAiLiveMonitor("Pre-Check: Auto-parsing student name from Page 1...");
        await triggerAutoDetectName();
    }
}

async function triggerStep1Extraction() {
    if (!currentSubmission) return;
    await ensureStudentNameParsedBeforeGrading();
    
    const btn = document.getElementById("btn-step1-extract") || document.getElementById("btn-step1a-extract");
    const model = "qwen3.8:latest";
    
    if (btn) btn.disabled = true;
    startAiLiveMonitor("Step 1: Extracting student handwritten answers, diagram labels, & graphs verbatim...");
    
    try {
        const activeMarker = document.getElementById("review-active-marker-select")?.value || "auto";
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/extract`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vision_model: model, marker_type: activeMarker })
        });
        let data = {};
        try {
            data = await resp.json();
        } catch (err) {
            data = { detail: resp.statusText || "Server error" };
        }
        
        if (resp.ok && data.success) {
            const hasFb = Boolean(data.fallback_triggered && data.fallbacks && data.fallbacks.length > 0);
            stopAiLiveMonitor(true, `Step 1 Complete: ${data.results?.questions?.length || 0} student responses extracted verbatim. Review the text below, make any edits, then click Step 2.`, hasFb);
            if (hasFb) {
                showFallbackNotice(data.fallbacks, "Step 1 Extraction");
            }
            openReviewForSubmission(currentSubmission.id);
        } else {
            stopAiLiveMonitor(false, "Step 1 failed: " + (data.detail || JSON.stringify(data)));
            alert("Step 1 extraction failed: " + (data.detail || JSON.stringify(data)));
        }
    } catch (e) {
        stopAiLiveMonitor(false, "Error: " + e.message);
        alert("Error in Step 1: " + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function triggerStep2MarkAndComment() {
    if (!currentSubmission) return;
    await ensureStudentNameParsedBeforeGrading();
    await saveStudentInfoCorrection();
    
    const btn = document.getElementById("btn-step2-mark-and-comment") || document.getElementById("btn-step1b-marking");
    const model = "qwen3.8:latest";
    const formData = gatherReviewFormData();
    
    if (!formData.questions || formData.questions.length === 0) {
        alert("No extracted responses found. Please run Step 1 (Extract) first.");
        return;
    }
    
    if (btn) btn.disabled = true;
    startAiLiveMonitor("Step 2: Scoring responses against rubrics & synthesizing teacher remarks...");
    
    try {
        const activeMarker = document.getElementById("review-active-marker-select")?.value || "auto";
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/mark-and-comment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                reasoning_model: model,
                questions: formData.questions,
                marker_type: activeMarker
            })
        });
        let data = {};
        try {
            data = await resp.json();
        } catch (err) {
            data = { detail: resp.statusText || "Server error" };
        }
        
        if (resp.ok && data.success) {
            const hasFb = Boolean(data.fallback_triggered && data.fallbacks && data.fallbacks.length > 0);
            stopAiLiveMonitor(true, `Step 2 Complete: Scored ${data.results?.total_score} / ${data.results?.max_marks} marks and generated teacher remarks.`, hasFb);
            if (hasFb) {
                showFallbackNotice(data.fallbacks, "Step 2 Mark & Comment");
            }
            openReviewForSubmission(currentSubmission.id);
        } else {
            stopAiLiveMonitor(false, "Step 2 failed: " + (data.detail || JSON.stringify(data)));
            alert("Step 2 mark & comment failed: " + (data.detail || JSON.stringify(data)));
        }
    } catch (e) {
        stopAiLiveMonitor(false, "Error: " + e.message);
        alert("Error in Step 2: " + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function triggerDoAll() {
    if (!currentSubmission) return;
    await ensureStudentNameParsedBeforeGrading();
    
    const btn = document.getElementById("btn-do-all") || document.getElementById("btn-run-ai");
    const model = "qwen3.8:latest";
    
    if (btn) btn.disabled = true;
    startAiLiveMonitor("Do All Pipeline: Extracting verbatim text ➔ Scoring against rubrics ➔ Synthesizing remarks...");
    
    try {
        const activeMarker = document.getElementById("review-active-marker-select")?.value || "auto";
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/grade`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                vision_model: model,
                reasoning_model: model,
                use_two_stage: true
            })
        });
        let data = {};
        try {
            data = await resp.json();
        } catch (err) {
            data = { detail: resp.statusText || "Server error" };
        }
        
        if (resp.ok && data.success) {
            const hasFb = Boolean(data.fallback_triggered && data.fallbacks && data.fallbacks.length > 0);
            stopAiLiveMonitor(true, "Full Automated Marking Complete! Review and click Approve & Finalize.", hasFb);
            if (hasFb) {
                showFallbackNotice(data.fallbacks, "Do All Grading Pipeline");
            }
            openReviewForSubmission(currentSubmission.id);
        } else {
            stopAiLiveMonitor(false, "AI marking failed: " + (data.detail || JSON.stringify(data)));
            alert("AI marking failed: " + (data.detail || JSON.stringify(data)));
        }
    } catch (e) {
        stopAiLiveMonitor(false, "Error: " + e.message);
        alert("Error in Do All marking: " + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Aliases for full backward compatibility
const triggerStep1AExtraction = triggerStep1Extraction;
const triggerStep1BMarking = triggerStep2MarkAndComment;
const triggerStep2Remarks = triggerStep2MarkAndComment;
const triggerAiMarkingCurrent = triggerDoAll;

async function runPipelineForCurrentSubmission(forceAll = false, forceSteps2And3 = false) {
    if (!currentSubmission || !currentSubmission.id) {
        alert("No active student submission loaded.");
        return;
    }

    const btn = document.getElementById("btn-run-3step-pipeline") || document.getElementById("btn-do-all");
    const rerunBtn = document.getElementById("btn-rerun-steps2-3-submission");
    const origBtnHtml = btn ? btn.innerHTML : "";
    const origRerunBtnHtml = rerunBtn ? rerunBtn.innerHTML : "";

    const allStepsDone = Boolean(currentSubmission.step1_done && currentSubmission.step2_done && currentSubmission.step3_done);
    let forceSteps = [];

    if (forceSteps2And3) {
        forceSteps = ["step2", "step3"];
    } else if (allStepsDone && !forceAll) {
        const rerun = confirm(
            `All 3 steps are already completed for ${currentSubmission.student_name || 'this student'}.\n\n` +
            `Would you like to rerun Steps 2 & 3 (Re-mark & Direct Mark against updated marking scheme, preserving extracted handwriting)?`
        );
        if (!rerun) {
            return;
        }
        forceSteps = ["step2", "step3"];
    } else if (forceAll) {
        forceSteps = ["step1", "step2", "step3"];
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Running...`;
    }
    if (rerunBtn) {
        rerunBtn.disabled = true;
        rerunBtn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Running...`;
    }
    if (window.lucide) lucide.createIcons();

    startAiLiveMonitor(`3-Step Pipeline: Checking & running steps for ${currentSubmission.student_name || 'student'}...`);

    try {
        try {
            await ensureStudentNameParsedBeforeGrading();
            await saveStudentInfoCorrection();
        } catch (preErr) {
            console.warn("Pre-grading check warning:", preErr);
        }

        if (!forceSteps || forceSteps.length === 0 || forceSteps.includes('step3') || forceSteps.includes('step2')) {
            currentAnnotations = [];
            if (currentSubmission) currentSubmission.annotations = [];
            renderDirectMarkingOverlay();
        }

        const activeMarker = document.getElementById("review-active-marker-select")?.value || "auto";
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/run-pipeline`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                vision_model: "qwen3.8:latest",
                reasoning_model: "qwen3.8:latest",
                marker_type: activeMarker,
                force_steps: forceSteps
            })
        });

        let data = {};
        try {
            data = await resp.json();
        } catch (e) {
            data = { detail: resp.statusText || "Server error" };
        }

        if (resp.ok && data.success) {
            const executed = data.steps_executed || [];
            const skipped = data.steps_skipped || [];
            const hasFb = Boolean(data.fallback_triggered && data.fallbacks && data.fallbacks.length > 0);

            let summary = "3-Step Pipeline finished! ";
            if (executed.length > 0) {
                summary += `Executed: ${executed.join(", ")}. `;
            }
            if (skipped.length > 0) {
                summary += `Skipped (already done): ${skipped.join(", ")}.`;
            }
            if (executed.length === 0 && skipped.length > 0) {
                summary = "All 3 steps were already completed for this script!";
            }

            stopAiLiveMonitor(true, summary, hasFb);
            if (hasFb) {
                showFallbackNotice(data.fallbacks, "3-Step Pipeline");
            }
            await openReviewForSubmission(currentSubmission.id);
        } else {
            stopAiLiveMonitor(false, "3-Step Pipeline failed: " + (data.detail || JSON.stringify(data)));
            alert("3-Step Pipeline failed: " + (data.detail || JSON.stringify(data)));
        }
    } catch (err) {
        stopAiLiveMonitor(false, "Pipeline error: " + err.message);
        alert("Pipeline error: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origBtnHtml || `<i data-lucide="fast-forward" class="w-3.5 h-3.5"></i> Run 3-Step Pipeline`;
        }
        if (rerunBtn) {
            rerunBtn.disabled = false;
            rerunBtn.innerHTML = origRerunBtnHtml || `<i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-violet-400"></i> Rerun 2 & 3`;
        }
        if (window.lucide) lucide.createIcons();
    }
}

async function runSingleSubmissionPipelineFromQueue(submissionId) {
    if (!submissionId) return;

    startAiLiveMonitor(`3-Step Pipeline: Checking & running steps for submission #${submissionId}...`);

    try {
        const resp = await fetch(`/api/submissions/${submissionId}/run-pipeline`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                vision_model: "qwen3.8:latest",
                reasoning_model: "qwen3.8:latest"
            })
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
            const executed = data.steps_executed || [];
            const skipped = data.steps_skipped || [];
            const hasFb = Boolean(data.fallback_triggered && data.fallbacks && data.fallbacks.length > 0);

            let summary = `Pipeline finished for ${data.student_name || 'student'}! `;
            if (executed.length > 0) summary += `Ran: ${executed.join(', ')}. `;
            if (skipped.length > 0) summary += `Skipped: ${skipped.join(', ')}.`;

            stopAiLiveMonitor(true, summary, hasFb);
            loadQuickReviewQueue();
            loadDashboardData();
        } else {
            stopAiLiveMonitor(false, "Pipeline failed: " + (data.detail || data.error || JSON.stringify(data)));
            alert("Pipeline failed: " + (data.detail || data.error || JSON.stringify(data)));
        }
    } catch (err) {
        stopAiLiveMonitor(false, "Pipeline error: " + err.message);
        alert("Pipeline error: " + err.message);
    }
}

async function runPipelineForCurrentAssignment(btnElem = null) {
    const aid = currentSubmission?.assignment_id || document.getElementById("review-assignment-selector")?.value;
    if (!aid) {
        alert("No assignment selected.");
        return;
    }
    await runBatchPipelineOnUnprocessed(aid, btnElem);
}

async function rerunPipelineSteps2And3ForCurrentAssignment(btnElem = null) {
    const aid = currentSubmission?.assignment_id || document.getElementById("review-assignment-selector")?.value;
    if (!aid) {
        alert("No assignment selected.");
        return;
    }
    await rerunPipelineSteps2And3ForAssignment(aid, btnElem);
}

async function rerunPipelineSteps2And3ForAssignment(assignmentId, btnElem = null, event = null) {
    if (event) event.stopPropagation();
    if (!assignmentId) {
        alert("No assignment ID provided.");
        return;
    }

    const origBtnHtml = btnElem ? btnElem.innerHTML : "";
    if (btnElem) {
        btnElem.disabled = true;
        btnElem.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Checking...`;
        if (window.lucide) lucide.createIcons();
    }

    try {
        startAiLiveMonitor("Loading assignment submissions for Pipeline Steps 2 & 3 rerun...");
        const resp = await fetch(`/api/submissions/assignment/${assignmentId}`);
        const subs = await resp.json();
        if (!subs || subs.length === 0) {
            stopAiLiveMonitor(true, "No student submissions found for this assignment.");
            alert("No student submissions found for this assignment.");
            return;
        }

        const aTitle = subs[0]?.assignment_title || `Assignment #${assignmentId}`;
        const hasExtractedCount = subs.filter(s => s.step1_done).length;
        const confirmMsg = 
            `Rerun Pipeline Steps 2 & 3 (Re-mark & Re-annotate) for "${aTitle}"?\n\n` +
            `• Target submissions: ${subs.length}\n` +
            `• Preserves verbatim extracted handwriting (Step 1) for ${hasExtractedCount} script(s).\n` +
            `• Scores and direct annotations will re-evaluate against the latest marking scheme & rubrics.\n\n` +
            `Proceed?`;

        if (!confirm(confirmMsg)) {
            stopAiLiveMonitor(true, "Pipeline rerun cancelled.");
            return;
        }

        if (btnElem) {
            btnElem.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Rerunning...`;
            if (window.lucide) lucide.createIcons();
        }

        startAiLiveMonitor(`Rerunning Pipeline (Steps 2 & 3) for ${subs.length} script(s)...`);

        let successCount = 0;
        let failCount = 0;
        const allFallbacks = [];

        for (let i = 0; i < subs.length; i++) {
            const sub = subs[i];
            const sName = sub.student_name || `Submission #${sub.id}`;
            const pct = Math.round(((i + 1) / subs.length) * 100);
            updateAiLiveMonitorText(`[${i + 1}/${subs.length}] Re-marking & re-annotating ${sName}... (Preserving OCR)`, pct);

            try {
                const pipeResp = await fetch(`/api/submissions/${sub.id}/run-pipeline`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        vision_model: "qwen3.8:latest",
                        reasoning_model: "qwen3.8:latest",
                        force_steps: ["step2", "step3"]
                    })
                });
                const data = await pipeResp.json();
                if (pipeResp.ok && data.success) {
                    successCount++;
                    if (data.fallback_triggered && data.fallbacks) {
                        allFallbacks.push(...data.fallbacks);
                    }
                } else {
                    failCount++;
                    console.warn(`Pipeline rerun failed for submission ${sub.id}:`, data);
                }
            } catch (err) {
                failCount++;
                console.error(`Pipeline rerun network error for submission ${sub.id}:`, err);
            }

            if (i < subs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const hasFb = allFallbacks.length > 0;
        const finalMsg = `Rerun Steps 2 & 3 complete! Successfully re-marked: ${successCount}, Failed: ${failCount}.`;
        stopAiLiveMonitor(failCount === 0, finalMsg, hasFb);
        if (hasFb) {
            showFallbackNotice(allFallbacks, "Rerun Pipeline (Steps 2 & 3)");
        }

        // Refresh UI
        loadDashboardData();
        loadQuickReviewQueue();
        loadAssignments();
        if (document.getElementById("view-review") && !document.getElementById("view-review").classList.contains("hidden")) {
            loadReviewAssignmentsList();
            if (currentSubmission && currentSubmission.assignment_id === assignmentId) {
                openReviewForSubmission(currentSubmission.id);
            }
        }
    } catch (e) {
        stopAiLiveMonitor(false, "Pipeline rerun failed: " + e.message);
        alert("Pipeline rerun failed: " + e.message);
    } finally {
        if (btnElem) {
            btnElem.disabled = false;
            btnElem.innerHTML = origBtnHtml;
            if (window.lucide) lucide.createIcons();
        }
    }
}

async function runBatchPipelineOnUnprocessed(assignmentId = null, btnElem = null) {
    const dashBtn = document.getElementById("btn-dashboard-run-pipeline");
    const reviewBtn = document.getElementById("btn-review-run-all-pipeline");
    const origDashHtml = dashBtn ? dashBtn.innerHTML : "";
    const origReviewHtml = reviewBtn ? reviewBtn.innerHTML : "";
    const origBtnElemHtml = btnElem ? btnElem.innerHTML : "";

    if (dashBtn) {
        dashBtn.disabled = true;
        dashBtn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Scanning...`;
    }
    if (reviewBtn) {
        reviewBtn.disabled = true;
        reviewBtn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Scanning...`;
    }
    if (btnElem) {
        btnElem.disabled = true;
        btnElem.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Scanning...`;
    }
    if (window.lucide) lucide.createIcons();

    let pendingSubs = [];
    startAiLiveMonitor("Scanning for unprocessed student submissions across pipeline steps...");

    try {
        if (assignmentId) {
            const resp = await fetch(`/api/submissions/assignment/${assignmentId}`);
            const subs = await resp.json();
            pendingSubs = (subs || []).filter(s => s.status !== "approved" && !s.is_pipeline_complete);
        } else {
            const aResp = await fetch("/api/assignments");
            const assignments = await aResp.json();
            // Fetch all assignments in parallel for fast response
            const subsResults = await Promise.all(
                (assignments || []).map(async a => {
                    try {
                        const sResp = await fetch(`/api/submissions/assignment/${a.id}`);
                        const subs = await sResp.json();
                        const unproc = (subs || []).filter(s => s.status !== "approved" && !s.is_pipeline_complete);
                        unproc.forEach(s => s.assignment_title = a.title);
                        return unproc;
                    } catch (e) {
                        return [];
                    }
                })
            );
            pendingSubs = subsResults.flat();
        }
    } catch (e) {
        stopAiLiveMonitor(false, "Failed to scan submissions: " + e.message);
        alert("Failed to scan unprocessed works: " + e.message);
        if (dashBtn) { dashBtn.disabled = false; dashBtn.innerHTML = origDashHtml; }
        if (reviewBtn) { reviewBtn.disabled = false; reviewBtn.innerHTML = origReviewHtml; }
        if (btnElem) { btnElem.disabled = false; btnElem.innerHTML = origBtnElemHtml; }
        if (window.lucide) lucide.createIcons();
        return;
    }

    if (pendingSubs.length === 0) {
        stopAiLiveMonitor(true, "All student works are already fully processed through the 3-step pipeline! 🎉");
        alert("All student works are already fully processed through the 3-step pipeline! 🎉");
        if (dashBtn) { dashBtn.disabled = false; dashBtn.innerHTML = origDashHtml; }
        if (reviewBtn) { reviewBtn.disabled = false; reviewBtn.innerHTML = origReviewHtml; }
        if (btnElem) { btnElem.disabled = false; btnElem.innerHTML = origBtnElemHtml; }
        if (window.lucide) lucide.createIcons();
        return;
    }

    const scopeName = assignmentId ? "this assignment" : "all classes";
    const confirmMsg = `Found ${pendingSubs.length} unprocessed student script(s) in ${scopeName}.\n\nRun them through the 3-step pipeline? Completed steps will be automatically skipped for each script.`;
    if (!confirm(confirmMsg)) {
        stopAiLiveMonitor(true, "Batch pipeline cancelled.");
        if (dashBtn) { dashBtn.disabled = false; dashBtn.innerHTML = origDashHtml; }
        if (reviewBtn) { reviewBtn.disabled = false; reviewBtn.innerHTML = origReviewHtml; }
        if (btnElem) { btnElem.disabled = false; btnElem.innerHTML = origBtnElemHtml; }
        if (window.lucide) lucide.createIcons();
        return;
    }

    if (dashBtn) dashBtn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Processing...`;
    if (reviewBtn) reviewBtn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Processing...`;
    if (btnElem) btnElem.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Processing...`;
    if (window.lucide) lucide.createIcons();

    startAiLiveMonitor(`Running 3-Step Pipeline on ${pendingSubs.length} student work(s)...`);

    let successCount = 0;
    let failCount = 0;
    const allFallbacks = [];

    try {
        for (let i = 0; i < pendingSubs.length; i++) {
            const sub = pendingSubs[i];
            const studentName = sub.student_name || `Submission #${sub.id}`;
            const pct = Math.round(((i + 1) / pendingSubs.length) * 100);
            updateAiLiveMonitorText(`[${i + 1}/${pendingSubs.length}] Processing ${studentName}... (Skipping completed steps)`, pct);

            try {
                const resp = await fetch(`/api/submissions/${sub.id}/run-pipeline`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        vision_model: "qwen3.8:latest",
                        reasoning_model: "qwen3.8:latest"
                    })
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    successCount++;
                    if (data.fallback_triggered && data.fallbacks) {
                        allFallbacks.push(...data.fallbacks);
                    }
                } else {
                    failCount++;
                    console.warn(`Pipeline failed for submission ${sub.id}:`, data);
                }
            } catch (err) {
                failCount++;
                console.error(`Pipeline network error for submission ${sub.id}:`, err);
            }

            if (i < pendingSubs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } finally {
        if (dashBtn) { dashBtn.disabled = false; dashBtn.innerHTML = origDashHtml; }
        if (reviewBtn) { reviewBtn.disabled = false; reviewBtn.innerHTML = origReviewHtml; }
        if (btnElem) { btnElem.disabled = false; btnElem.innerHTML = origBtnElemHtml; }
        if (window.lucide) lucide.createIcons();
    }

    const hasFb = allFallbacks.length > 0;
    stopAiLiveMonitor(failCount === 0, `3-Step Pipeline complete! Successfully processed: ${successCount}, Failed: ${failCount}`, hasFb);
    if (hasFb) {
        showFallbackNotice(allFallbacks, "Batch 3-Step Marking Pipeline");
    }

    // Refresh UI
    loadDashboardData();
    loadQuickReviewQueue();
    if (document.getElementById("view-review") && !document.getElementById("view-review").classList.contains("hidden")) {
        loadReviewAssignmentsList();
        if (currentSubmission && currentSubmission.id) {
            openReviewForSubmission(currentSubmission.id);
        }
    }
}

async function saveGradingDraft() {
    if (!currentSubmission) return;
    await saveStudentInfoCorrection();
    const payload = gatherReviewFormData();
    
    try {
        const resp = await fetch(`/api/grading/${currentSubmission.id}/save-draft`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (data.success) {
            alert("Draft saved successfully.");
        }
    } catch (e) {
        alert("Failed to save draft: " + e.message);
    }
}

async function approveSubmission() {
    if (!currentSubmission) return;
    await saveStudentInfoCorrection();
    const payload = gatherReviewFormData();
    
    try {
        const resp = await fetch(`/api/grading/${currentSubmission.id}/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (data.success) {
            alert("Submission approved! Final report is now generated.");
            loadDashboardData();
            
            // Advance to next student in batch if available
            if (currentSubmissionIndex < currentAssignmentSubmissions.length - 1) {
                const nextSub = currentAssignmentSubmissions[currentSubmissionIndex + 1];
                openReviewForSubmission(nextSub.id);
            } else {
                openReviewForSubmission(currentSubmission.id);
            }
        }
    } catch (e) {
        alert("Failed to approve: " + e.message);
    }
}

async function downloadCurrentPdfReport() {
    if (!currentSubmission || !currentSubmission.id) {
        alert("No active student submission selected.");
        return;
    }
    
    // Save any pending edits prior to report generation
    await saveStudentInfoCorrection();
    try {
        const payload = gatherReviewFormData();
        await fetch(`/api/grading/${currentSubmission.id}/save-draft`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.warn("Could not auto-save draft before PDF generation:", e);
    }
    
    // Open the PDF stream directly in a new tab / trigger download
    window.open(`/api/reports/${currentSubmission.id}/pdf`, '_blank');
}

function toggleDirectMarkingOverlay() {
    directMarkingEnabled = !directMarkingEnabled;
    const btn = document.getElementById("btn-toggle-overlay");
    const status = document.getElementById("overlay-toggle-status");
    if (status) status.textContent = directMarkingEnabled ? "ON" : "OFF";
    if (btn) {
        if (directMarkingEnabled) {
            btn.className = "px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 flex items-center gap-1 text-[11px] font-semibold";
        } else {
            btn.className = "px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 flex items-center gap-1 text-[11px] font-semibold";
        }
    }
    renderDirectMarkingOverlay();
}

function renderDirectMarkingOverlay() {
    const svg = document.getElementById("direct-marking-svg");
    if (!svg) return;
    
    if (!directMarkingEnabled || !currentAnnotations || currentAnnotations.length === 0) {
        svg.innerHTML = "";
        return;
    }

    const activePageNum = currentPageIndex + 1;
    const pageAnns = currentAnnotations.filter(a => Number(a.page_number || 1) === activePageNum);

    let markup = "";
    pageAnns.forEach((ann, idx) => {
        const bbox = ann.bbox_2d || [100, 100, 150, 400];
        const ymin = Number(bbox[0]);
        const xmin = Number(bbox[1]);
        const ymax = Number(bbox[2]);
        const xmax = Number(bbox[3]);
        const type = (ann.type || "tick").toLowerCase();
        let remark = ann.remark || "";
        const score  = ann.score  || "";

        // Strip question number prefixes: Q1:, Q(a):, Q2(b) [0/2]:, (a):, Page 7:, etc.
        if (remark && !remark.startsWith("*")) {
            remark = remark.replace(/^(?:(?:Question|Q|Page)\s*[0-9a-zA-Z()_-]+|\([a-zA-Z0-9_-]+\))\s*(?:\[[^\]]*\])?\s*[:\-–|]\s*/i, '').trim();
            remark = remark.replace(/^\[[0-9./\s]+(?:marks?)?\]\s*[:\-–]?\s*/i, '').trim();
            remark = remark.replace(/^\[[✓✗\s\w]+\]\s*[:\-–]?\s*/i, '').trim();
            remark = remark.replace(/^[•\-*]\s*(?:Step\s*\d+|Criterion\s*\d+)?\s*(?::\s*)?(?:[0-9./\s]+)?\s*/i, '').trim();
            remark = remark.replace(/^[✓✗\s]*(?:Correct|Error|Incorrect|Partial Credit)\s*[:\-–|.]\s*/i, '').trim();
            remark = remark.replace(/\s*(?:for\s+)?\b(?:Question|Q)\b\s*[0-9a-zA-Z()_-]+(?:\s*\([a-zA-Z0-9_-]+\))?/i, '').trim();
        }

        const fullTooltip = ann.original_remark || remark || (score ? `Score: ${score}` : '');

        // Standardise symbol size
        const lineH = Math.max(18, ymax - ymin);
        const sym = 18;
        const midY = ymin + (ymax - ymin) * 0.5;
        const sw = 2.5;

        const wrapSvgText = (text, startX, centerY, charsPerLine = 14, lineSpacing = 15) => {
            const raw = String(text || "").trim();
            if (!raw) return "";
            const lines = [];
            for (let i = 0; i < raw.length; i += charsPerLine) {
                lines.push(raw.slice(i, i + charsPerLine));
            }
            const totalH = (lines.length - 1) * lineSpacing;
            const startY = centerY - (totalH / 2) + 4;
            let tspans = "";
            lines.forEach((l, idx) => {
                tspans += `<tspan x="${startX}" y="${startY + idx * lineSpacing}">${escapeHtml(l)}</tspan>`;
            });
            return tspans;
        };

        const isChecklist = !!ann.is_graph_checklist;

        if (ann.suppress_symbol) {
            // Overall graph or composite question score at margin without orphan symbol
            if (score) {
                const isCritOrLeft = !!ann.is_criterion || xmax < 750;
                const scoreX = isCritOrLeft ? Math.min(880, xmax + 6) : 955;
                const anchor = isCritOrLeft ? "start" : "end";
                markup += `<text x="${scoreX}" y="${midY + 5}" class="font-bold fill-red-600 text-[15px]" style="font-family: Arial, sans-serif;" text-anchor="${anchor}">${escapeHtml(String(score))}</text>`;
            }

        } else if (type === "tick") {
            if (isChecklist) {
                // Graph checklist row: tick symbol with criterion name and score beside it
                const sx = Math.max(20, Math.min(880, xmin));
                const sy = midY - sym * 0.5;
                markup += `
                    <g class="annotation-item cursor-pointer" data-id="${ann.id || idx}">
                        <title>${escapeHtml(fullTooltip)}</title>
                        <path d="M ${sx} ${sy + sym*0.55} L ${sx + sym*0.38} ${sy + sym*0.95} L ${sx + sym} ${sy}" fill="none" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
                        <text x="${sx + sym + 8}" y="${midY + 5}" class="font-bold fill-red-600 text-[13px]" style="font-family: Arial, sans-serif;"><title>${escapeHtml(fullTooltip)}</title>${escapeHtml(remark || '✓ Point awarded')}</text>
                    </g>
                `;
            } else {
                // Regular tick anchored to student answer
                const isSingleLetterMcq = (xmax > 700) && ((xmax - xmin) < 50);
                const extraOffset = isSingleLetterMcq ? 16 : 4;
                const targetSx = (xmax > xmin) ? (xmax + extraOffset) : (xmin + 30);
                const sx = Math.max(20, Math.min(880, targetSx));
                const sy = midY - sym * 0.5;
                const tooltip = fullTooltip || (score ? `Score: ${score}` : '✓ Correct');
                markup += `
                    <g class="annotation-item cursor-pointer" data-id="${ann.id || idx}">
                        <title>${escapeHtml(tooltip)}</title>
                        <path d="M ${sx} ${sy + sym*0.55} L ${sx + sym*0.38} ${sy + sym*0.95} L ${sx + sym} ${sy}" fill="none" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
                    </g>
                `;
                if (score) {
                    const isCritOrLeft = !!ann.is_criterion || xmax < 750 || (sx + sym + 45 < 950);
                    const scoreX = isCritOrLeft ? Math.min(890, sx + sym + 6) : 955;
                    const anchor = isCritOrLeft ? "start" : "end";
                    markup += `<text x="${scoreX}" y="${midY + 5}" class="font-bold fill-red-600 text-[15px]" style="font-family: Arial, sans-serif;" text-anchor="${anchor}">${escapeHtml(String(score))}</text>`;
                }
            }

        } else if (type === "cross") {
            if (isChecklist) {
                // Graph checklist row: cross symbol with criterion name and score beside it
                const sx = Math.max(20, Math.min(880, xmin));
                const sy = midY - sym * 0.5;
                const h = sym;
                markup += `
                    <g class="annotation-item cursor-pointer" data-id="${ann.id || idx}">
                        <title>${escapeHtml(fullTooltip)}</title>
                        <line x1="${sx}"   y1="${sy}"   x2="${sx+h}" y2="${sy+h}" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                        <line x1="${sx+h}" y1="${sy}"   x2="${sx}"   y2="${sy+h}" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                        <text x="${sx + sym + 8}" y="${midY + 5}" fill="#dc2626" font-size="13" font-weight="600" font-family="Arial, sans-serif"><title>${escapeHtml(fullTooltip)}</title>${escapeHtml(remark || '✗ Not met')}</text>
                    </g>
                `;
            } else {
                // Regular cross anchored to student answer
                const isSingleLetterMcq = (xmax > 700) && ((xmax - xmin) < 50);
                const extraOffset = isSingleLetterMcq ? 16 : 4;
                const targetSx = (xmax > xmin) ? (xmax + extraOffset) : (xmin + 30);
                const sx = Math.max(20, Math.min(880, targetSx));
                const sy = midY - sym * 0.5;
                const h = sym;
                const tooltip = fullTooltip || (score ? `Score: ${score}` : '✗ Incorrect');
                markup += `
                    <g class="annotation-item cursor-pointer" data-id="${ann.id || idx}">
                        <title>${escapeHtml(tooltip)}</title>
                        <line x1="${sx}"   y1="${sy}"   x2="${sx+h}" y2="${sy+h}" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                        <line x1="${sx+h}" y1="${sy}"   x2="${sx}"   y2="${sy+h}" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                    </g>
                `;
                if (score) {
                    const isCritOrLeft = !!ann.is_criterion || xmax < 750 || (sx + sym + 45 < 950);
                    const scoreX = isCritOrLeft ? Math.min(890, sx + sym + 6) : 955;
                    const anchor = isCritOrLeft ? "start" : "end";
                    markup += `<text x="${scoreX}" y="${midY + 5}" fill="#dc2626" font-size="15" font-weight="700" font-family="Arial, sans-serif" text-anchor="${anchor}">${escapeHtml(String(score))}</text>`;
                }
            }

        } else if (type === "circle") {
            const cx = (xmin + xmax) / 2;
            const cy = (ymin + ymax) / 2;
            const rx = Math.max(12, (xmax - xmin) / 2 + 5);
            const ry = Math.max(10, (ymax - ymin) / 2 + 5);
            const tooltip = fullTooltip || (score ? `Score: ${score}` : 'Partial credit / review');
            markup += `
                <g class="annotation-item cursor-pointer" data-id="${ann.id || idx}">
                    <title>${escapeHtml(tooltip)}</title>
                    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#dc2626" stroke-width="${sw}"/>
                </g>
            `;
            if (score) {
                const isCritOrLeft = !!ann.is_criterion || xmax < 750;
                const scoreX = isCritOrLeft ? Math.min(880, cx + rx + 6) : 955;
                const anchor = isCritOrLeft ? "start" : "end";
                markup += `<text x="${scoreX}" y="${cy + 5}" fill="#dc2626" font-size="15" font-weight="700" font-family="Arial, sans-serif" text-anchor="${anchor}">${escapeHtml(String(score))}</text>`;
            }

        } else if (type === "graph_header") {
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <rect x="${xmin}" y="${ymin}" width="${Math.max(160, xmax - xmin)}" height="${ymax - ymin}" rx="4" fill="#fef2f2" stroke="#dc2626" stroke-width="1.2"/>
                    <text x="${xmin + 8}" y="${ymin + (ymax - ymin)*0.68}" fill="#b91c1c" font-size="12" font-weight="700" font-family="Arial, sans-serif">${escapeHtml(remark || 'Graph Marking')}</text>
                </g>
            `;

        } else if (type === "char_replace" || type === "replace") {
            const cx = (xmin + xmax) / 2;
            const cy = (ymin + ymax) / 2;
            const rx = Math.max(12, (xmax - xmin) / 2 + 5);
            const ry = Math.max(10, (ymax - ymin) / 2 + 5);
            const repl = ann.replacement || remark;
            const routing = ann.routing || {};
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#dc2626" stroke-width="${sw}"/>
                </g>
            `;
            if (repl) {
                if (routing.use_leader_line && routing.leader_line_coords) {
                    const c = routing.leader_line_coords;
                    markup += `
                        <line x1="${c[0][0]}" y1="${c[0][1]}" x2="${c[1][0]}" y2="${c[1][1]}" stroke="#dc2626" stroke-width="1.5"/>
                        <text x="${c[1][0] + 4}" y="${c[1][1] - 2}" fill="#dc2626" font-size="14" font-weight="700" font-family="'Microsoft YaHei', sans-serif">${escapeHtml(repl)}</text>
                    `;
                } else {
                    markup += `<text x="${xmin}" y="${Math.max(12, ymin - 4)}" fill="#dc2626" font-size="14" font-weight="700" font-family="'Microsoft YaHei', sans-serif">${escapeHtml(repl)}</text>`;
                }
            }

        } else if (type === "word_delete" || type === "delete" || type === "strikethrough") {
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <line x1="${xmin}" y1="${midY}" x2="${xmax}" y2="${midY}" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                </g>
            `;
            if (remark) {
                markup += `<text x="${xmax + 6}" y="${midY + 4}" fill="#dc2626" font-size="12" font-weight="600">${escapeHtml(remark)}</text>`;
            }

        } else if (type === "block_prune" || type === "prune") {
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <line x1="${xmin}" y1="${ymin}" x2="${xmax}" y2="${ymax}" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                </g>
            `;
            if (remark) {
                markup += `<text x="${xmin + 8}" y="${ymin - 4}" fill="#dc2626" font-size="12" font-weight="600">${escapeHtml(remark)}</text>`;
            }

        } else if (type === "caret_insert" || type === "insert" || type === "descriptive_caret") {
            const repl = ann.replacement || remark;
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <path d="M ${xmin - 5} ${ymin + 5} L ${xmin} ${ymin} L ${xmin + 5} ${ymin + 5}" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round"/>
                </g>
            `;
            if (repl) {
                markup += `<text x="${xmin - 4}" y="${Math.max(12, ymin - 5)}" fill="#dc2626" font-size="13" font-weight="700" font-family="'Microsoft YaHei', sans-serif">${escapeHtml(repl)}</text>`;
            }

        } else if (type === "clause_rewrite" || type === "star_gai" || type === "caigai" || type === "sentence_rewrite") {
            const repl = ann.replacement || remark || "";
            let cleanRepl = String(repl).replace(/⭐/g, "★").trim();
            if (!cleanRepl.startsWith("★改") && !cleanRepl.startsWith("改")) {
                cleanRepl = `★改：${cleanRepl}`;
            } else if (cleanRepl.startsWith("改")) {
                cleanRepl = `★${cleanRepl}`;
            }
            const leadX = Math.min(760, xmax + 4);
            const textTspans = wrapSvgText(cleanRepl, 775, midY, 14, 15);
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <path d="M ${xmin - 2} ${ymin - 2} Q ${xmin - 8} ${midY} ${xmin - 2} ${ymax + 2}" fill="none" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                    <path d="M ${xmax + 2} ${ymin - 2} Q ${xmax + 8} ${midY} ${xmax + 2} ${ymax + 2}" fill="none" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                    <line x1="${leadX}" y1="${midY}" x2="770" y2="${midY}" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="3,3"/>
                    <circle cx="${leadX}" cy="${midY}" r="2" fill="#dc2626"/>
                    <text x="775" y="${midY}" fill="#dc2626" font-size="12" font-weight="700" font-family="'Microsoft YaHei', sans-serif">
                        ${textTspans}
                    </text>
                </g>
            `;

        } else if (type === "margin_star" || type === "star" || type === "scaffolding") {
            let starText = String(remark || "").replace(/⭐/g, "★").trim();
            if (!starText.startsWith("★")) {
                starText = `★ ${starText}`;
            }
            const leadX = Math.min(760, xmax + 4);
            const textTspans = wrapSvgText(starText, 775, midY, 14, 15);
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <line x1="${leadX}" y1="${midY}" x2="770" y2="${midY}" stroke="#dc2626" stroke-width="1" stroke-dasharray="3,3"/>
                    <circle cx="${leadX}" cy="${midY}" r="2" fill="#dc2626"/>
                    <text x="775" y="${midY}" fill="#dc2626" font-size="12" font-weight="700" font-family="'Microsoft YaHei', sans-serif">
                        ${textTspans}
                    </text>
                </g>
            `;

        } else if (type === "logic_cross") {
            const h = sym;
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <line x1="${xmin}" y1="${midY - h*0.5}" x2="${xmin + h}" y2="${midY + h*0.5}" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                    <line x1="${xmin + h}" y1="${midY - h*0.5}" x2="${xmin}" y2="${midY + h*0.5}" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                    <rect x="${xmin - 4}" y="${ymin - 4}" width="${xmax - xmin + 8}" height="${ymax - ymin + 8}" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="2,2"/>
                </g>
            `;
            if (remark) {
                markup += `<text x="${xmin}" y="${Math.min(995, ymax + 14)}" fill="#dc2626" font-size="12" font-weight="700" font-family="'Microsoft YaHei', sans-serif">✗ ${escapeHtml(remark)}</text>`;
            }

        } else if (type === "lorms_badge") {
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <rect x="740" y="${midY - 10}" width="240" height="22" rx="4" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/>
                    <text x="750" y="${midY + 5}" fill="#dc2626" font-size="11" font-weight="700">${escapeHtml(remark)}</text>
                </g>
            `;

        } else if (type === "remark") {
            // Plain text annotation (supports multiple lines)
            if (remark) {
                const fontSize = Math.max(9, lineH * 0.48);
                const lines = String(remark).split('\n');
                const startY = Math.max(8, ymin - 4);
                
                markup += `<text x="${Math.max(2, xmin)}" y="${startY}" fill="#dc2626" font-size="${fontSize}" font-weight="600" font-family="Arial, sans-serif">`;
                lines.forEach((line, i) => {
                    markup += `<tspan x="${Math.max(2, xmin)}" dy="${i === 0 ? 0 : 1.2}em">${escapeHtml(line)}</tspan>`;
                });
                markup += `</text>`;
            }

        } else if (type === "footnote" || type === "bottom_remark") {
            // Suppressed to keep script overlay clean and free of overlapping comments
        }
    });

    svg.innerHTML = markup;
}

async function triggerDirectMarking() {
    if (!currentSubmission || !currentSubmission.id) {
        alert("No active submission loaded.");
        return;
    }
    const btn = document.getElementById("btn-direct-mark");
    if (btn) btn.disabled = true;

    // Ensure clear markings first in UI before carrying out new direct marking
    currentAnnotations = [];
    if (currentSubmission) currentSubmission.annotations = [];
    renderDirectMarkingOverlay();

    startAiLiveMonitor("Direct Marking (Beta): Generating grounded ticks, crosses, circles, and remarks on student script with qwen3.8:latest...");

    try {
        const activeMarker = document.getElementById("review-active-marker-select")?.value || "auto";
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/direct-mark`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ marker_type: activeMarker })
        });
        let data;
        const text = await resp.text();
        try {
            data = JSON.parse(text);
        } catch (e) {
            data = { detail: text || `Server error (${resp.status})` };
        }
        if (resp.ok && data.success) {
            currentAnnotations = data.annotations || [];
            currentSubmission.annotations = currentAnnotations;
            renderDirectMarkingOverlay();
            const hasFb = Boolean(data.fallback_triggered && data.fallbacks && data.fallbacks.length > 0);
            stopAiLiveMonitor(true, `Direct Marking Complete! ${currentAnnotations.length} annotations overlaid on script.`, hasFb);
            if (hasFb) {
                showFallbackNotice(data.fallbacks, "Direct Visual Marking");
            }
        } else {
            stopAiLiveMonitor(false, "Direct marking failed: " + (data.detail || JSON.stringify(data)));
            alert("Direct marking failed: " + (data.detail || "Server error"));
        }
    } catch (err) {
        stopAiLiveMonitor(false, "Direct marking error: " + err.message);
        alert("Direct marking error: " + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function clearDirectMarks() {
    if (!currentSubmission || !currentSubmission.id) {
        alert("No active student submission loaded.");
        return;
    }
    
    if (!confirm("Are you sure you want to clear all direct markings on this student's script?")) {
        return;
    }
    
    currentAnnotations = [];
    currentSubmission.annotations = [];
    currentSubmission.annotations_cleared = true;
    renderDirectMarkingOverlay();
    
    try {
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/annotations`, {
            method: "DELETE"
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            startAiLiveMonitor("Direct markings cleared.");
            setTimeout(() => stopAiLiveMonitor(true, "Direct markings cleared."), 1200);
        }
    } catch (e) {
        console.warn("Failed to clear annotations on server:", e);
    }
}

function synthesizeClientAnnotations(qGrades, pages) {
    if (!qGrades || qGrades.length === 0) return [];
    if (typeof currentSubmission !== "undefined" && currentSubmission) {
        const isChinese = currentSubmission.marker_type === "chinese_essay" ||
            currentSubmission.assignment_marker_type === "chinese_essay" ||
            (currentSubmission.assignment_subject && /chinese|华文|中文/i.test(currentSubmission.assignment_subject));
        if (isChinese) {
            return [];
        }
    }
    const numPages = Math.max(1, pages ? pages.length : 1);
    const totalQ = qGrades.length;
    const qsPerPage = Math.max(1, Math.ceil(totalQ / numPages));
    const annotations = [];
    const pageQCounts = {};

    // Detect whether page_number info is actually meaningful.
    // If all questions share page_number=1 (DB default) and there are multiple pages,
    // ignore the stored values and use sequential index-based page distribution instead.
    const allPageNums = qGrades.map(q => Number(q.page_number || 1));
    const hasRealPageInfo = numPages === 1 || allPageNums.some(p => p > 1);

    qGrades.forEach((q, idx) => {
        let pNum;
        if (hasRealPageInfo && q.page_number && Number(q.page_number) >= 1 && Number(q.page_number) <= numPages) {
            pNum = Number(q.page_number);
        } else {
            // Evenly distribute questions across pages by index
            pNum = Math.min(numPages, Math.floor(idx / qsPerPage) + 1);
        }

        const qIdxOnPage = pageQCounts[pNum] || 0;
        pageQCounts[pNum] = qIdxOnPage + 1;

        const awarded = parseFloat(q.awarded_marks || 0);
        const max = parseFloat(q.max_marks || 1);
        const qNo = String(q.question_no || (idx + 1)).trim();
        const comment = String(q.feedback_comment || "").trim();
        const isFull = (awarded >= max);
        const isZero = (awarded === 0);

        const slotHeight = Math.min(220, Math.max(100, Math.floor(680 / Math.max(1, qsPerPage))));
        const baseY = Math.min(880, 180 + (qIdxOnPage * slotHeight));
        const annType = isFull ? "tick" : (isZero ? "cross" : "circle");

        let remarkText = "";
        if (comment && !comment.toLowerCase().startsWith("evaluated")) {
            remarkText = `Q${qNo} [${awarded}/${max}]: ${comment}`;
        } else {
            const statusTag = isFull ? "✓ Correct" : (isZero ? "✗ Incorrect" : "Partial Credit");
            remarkText = `Q${qNo} [${statusTag}]: ${awarded} / ${max} marks`;
        }

        annotations.push({
            id: `ann_auto_${idx + 1}`,
            page_number: pNum,
            question_no: qNo,
            type: annType,
            bbox_2d: [baseY, 100, Math.min(950, baseY + 45), 750],
            remark: remarkText
        });

        const criteria = q.criteria || [];
        if (Array.isArray(criteria) && criteria.length > 1) {
            criteria.forEach((crit, cIdx) => {
                const cName = crit.criterion || `Step ${cIdx + 1}`;
                const cAwarded = parseFloat(crit.awarded || 0);
                const cMax = parseFloat(crit.max || 1);
                const cComment = crit.comment || "";
                const cType = (cAwarded >= cMax) ? "tick" : "cross";
                const subY = baseY + 50 + (cIdx * 30);
                if (subY + 20 < 960) {
                    annotations.push({
                        id: `ann_auto_${idx + 1}_c${cIdx + 1}`,
                        page_number: pNum,
                        question_no: qNo,
                        type: cType,
                        bbox_2d: [subY, 140, subY + 25, 720],
                        remark: `• ${cName}: ${cAwarded}/${cMax} ${cComment}`.trim()
                    });
                }
            });
        }
    });

    return annotations;
}

async function downloadDirectMarkingPdf() {
    if (!currentSubmission || !currentSubmission.id) {
        alert("No active student submission selected.");
        return;
    }
    
    // Auto-synthesize or preserve current annotations if empty
    if ((!currentAnnotations || currentAnnotations.length === 0) && currentSubmission.question_grades && currentSubmission.question_grades.length > 0) {
        currentAnnotations = synthesizeClientAnnotations(currentSubmission.question_grades, currentPages);
        currentSubmission.annotations = currentAnnotations;
        renderDirectMarkingOverlay();
    }

    if (currentAnnotations && currentAnnotations.length > 0) {
        try {
            await fetch(`/api/submissions/${currentSubmission.id}/annotations`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ annotations: currentAnnotations })
            });
        } catch (e) {
            console.warn("Could not pre-save annotations:", e);
        }
    }

    window.open(`/api/reports/${currentSubmission.id}/direct-marking-pdf`, '_blank');
}

async function deleteSubmissionById(subId, event) {
    if (event) event.stopPropagation();
    if (!confirm("Are you sure you want to delete this submission? This will permanently remove its recorded workings, marks, and feedback.")) {
        return;
    }
    
    try {
        const resp = await fetch(`/api/submissions/${subId}`, {
            method: "DELETE"
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            loadSubmissionsQueue();
            loadDashboardData();
            loadStudentsRoster();
            populateExistingClassesAndSubjects();
        } else {
            alert("Error deleting submission: " + (data.detail || data.error || "Unknown error"));
        }
    } catch (e) {
        alert("Failed to delete submission: " + e.message);
    }
}

async function deleteCurrentSubmission() {
    if (!currentSubmission || !currentSubmission.id) {
        alert("No active submission loaded to delete.");
        return;
    }
    
    const sName = currentSubmission.student_name || "this student";
    if (!confirm(`Are you sure you want to delete the submission for ${sName}?`)) {
        return;
    }
    
    const subIdToDelete = currentSubmission.id;
    try {
        const resp = await fetch(`/api/submissions/${subIdToDelete}`, {
            method: "DELETE"
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            const remaining = currentAssignmentSubmissions.filter(s => s.id !== subIdToDelete);
            currentAssignmentSubmissions = remaining;
            
            loadSubmissionsQueue();
            loadDashboardData();
            loadStudentsRoster();
            populateExistingClassesAndSubjects();
            
            if (remaining.length > 0) {
                const nextIndex = Math.min(currentSubmissionIndex, remaining.length - 1);
                openReviewForSubmission(remaining[nextIndex].id);
            } else {
                showReviewAssignmentList();
            }
        } else {
            alert("Error deleting submission: " + (data.detail || data.error || "Unknown error"));
        }
    } catch (e) {
        alert("Failed to delete submission: " + e.message);
    }
}

// 5. Student Performance Profiles
let selectedStudentIds = new Set();

async function loadStudentsRoster() {
    const list = document.getElementById("students-roster-list");
    const countBadge = document.getElementById("student-count-badge");
    
    try {
        const resp = await fetch("/api/students");
        allStudents = await resp.json();
        
        // Prune any selected student IDs that no longer exist
        const existingIds = new Set(allStudents.map(s => s.id));
        selectedStudentIds = new Set([...selectedStudentIds].filter(id => existingIds.has(id)));
        
        if (countBadge) countBadge.textContent = allStudents.length;
        renderStudentsList(allStudents);
        updateStudentsBatchUI();
        populateExistingClassesAndSubjects();
    } catch (e) {
        if (list) list.innerHTML = `<div class="text-xs text-rose-400">Failed to load students roster.</div>`;
    }
}

let currentSelectedStudentId = null;
let currentSelectedStudentName = "";
let currentSelectedStudentData = null;

function renderStudentsList(students) {
    const list = document.getElementById("students-roster-list");
    if (!list) return;
    
    if (students.length === 0) {
        list.innerHTML = `<div class="text-xs text-slate-500 py-6 text-center">No students recorded yet.</div>`;
        updateStudentsBatchUI();
        return;
    }
    
    list.innerHTML = students.map(st => {
        const isSelected = selectedStudentIds.has(st.id);
        const isCurrent = (currentSelectedStudentId === st.id);
        return `
            <div onclick="selectStudentProfile(${st.id})" class="p-3 bg-slate-950 border ${isSelected ? 'border-indigo-500 bg-indigo-950/20 shadow-sm' : isCurrent ? 'border-indigo-700 bg-slate-900' : 'border-slate-800 hover:border-indigo-500/60'} rounded-xl cursor-pointer transition-all flex items-center justify-between group">
                <div class="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                    <input type="checkbox" onchange="toggleStudentSelection(${st.id}, event)" ${isSelected ? 'checked' : ''} title="Select student" class="w-4 h-4 text-indigo-600 rounded bg-slate-800 border-slate-700 cursor-pointer shrink-0">
                    <div class="truncate">
                        <h4 class="text-xs font-bold text-white truncate">${escapeHtml(st.name)}</h4>
                        <p class="text-[11px] text-slate-400 truncate">${escapeHtml(st.class_name || 'General')}${st.subject ? ' • ' + escapeHtml(st.subject) : ''}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button type="button" onclick="event.stopPropagation(); deleteStudentById(${st.id}, '${escapeHtml(st.name.replace(/'/g, "\\'"))}')" title="Delete Student" class="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 transition-all">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                    <i data-lucide="chevron-right" class="w-4 h-4 text-slate-600"></i>
                </div>
            </div>
        `;
    }).join("");
    
    updateStudentsBatchUI();
    lucide.createIcons();
}

function filterStudentsList() {
    const searchInput = document.getElementById("search-students");
    const query = (searchInput ? searchInput.value : "").toLowerCase().trim();
    const filtered = allStudents.filter(s => 
        s.name.toLowerCase().includes(query) || 
        (s.class_name && s.class_name.toLowerCase().includes(query)) ||
        (s.subject && s.subject.toLowerCase().includes(query))
    );
    renderStudentsList(filtered);
}

function toggleStudentSelection(studentId, event) {
    if (event) event.stopPropagation();
    if (selectedStudentIds.has(studentId)) {
        selectedStudentIds.delete(studentId);
    } else {
        selectedStudentIds.add(studentId);
    }
    filterStudentsList();
}

function toggleSelectAllStudents(checked) {
    if (checked) {
        selectedStudentIds = new Set(allStudents.map(s => s.id));
    } else {
        selectedStudentIds.clear();
    }
    filterStudentsList();
}

function clearStudentSelections() {
    selectedStudentIds.clear();
    const chk = document.getElementById("students-select-all-checkbox");
    if (chk) chk.checked = false;
    filterStudentsList();
}

function updateStudentsBatchUI() {
    const count = selectedStudentIds.size;
    const batchBar = document.getElementById("students-batch-bar");
    const label = document.getElementById("students-batch-label");
    const badge = document.getElementById("students-selected-badge");
    const selectAllChk = document.getElementById("students-select-all-checkbox");

    if (badge) {
        if (count > 0) {
            badge.textContent = `${count} selected`;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    }

    if (batchBar && label) {
        if (count > 0) {
            batchBar.classList.remove("hidden");
            label.textContent = `${count} student(s) selected`;
        } else {
            batchBar.classList.add("hidden");
        }
    }

    if (selectAllChk) {
        selectAllChk.checked = (allStudents.length > 0 && count === allStudents.length);
    }
}

async function handleBulkDeleteStudents() {
    const ids = Array.from(selectedStudentIds);
    if (ids.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${ids.length} selected student profile(s)?\n\nThis will permanently remove the student profiles and all their submissions & marks.`)) {
        return;
    }

    try {
        const resp = await fetch("/api/students/bulk-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ student_ids: ids })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            if (ids.includes(currentSelectedStudentId)) {
                currentSelectedStudentId = null;
                currentSelectedStudentName = "";
                currentSelectedStudentData = null;
                const emptyState = document.getElementById("student-detail-empty");
                const contentState = document.getElementById("student-detail-content");
                if (emptyState) emptyState.classList.remove("hidden");
                if (contentState) contentState.classList.add("hidden");
            }

            selectedStudentIds.clear();
            await loadStudentsRoster();
            await loadDashboardData();
            await loadSubmissionsQueue();
            populateExistingClassesAndSubjects();
        } else {
            alert("Failed to delete students: " + (data.detail || JSON.stringify(data)));
        }
    } catch (e) {
        alert("Error deleting students: " + e.message);
    }
}

async function selectStudentProfile(studentId) {
    const emptyState = document.getElementById("student-detail-empty");
    const contentState = document.getElementById("student-detail-content");
    
    try {
        const resp = await fetch(`/api/students/${studentId}/performance`);
        const data = await resp.json();
        
        currentSelectedStudentId = studentId;
        currentSelectedStudentName = (data.student && data.student.name) || "";
        currentSelectedStudentData = data.student || {};
        
        if (emptyState) emptyState.classList.add("hidden");
        if (contentState) contentState.classList.remove("hidden");
        
        const nameEl = document.getElementById("profile-student-name");
        const metaEl = document.getElementById("profile-student-meta");
        const avgScoreEl = document.getElementById("profile-avg-score");
        
        if (nameEl) nameEl.textContent = (data.student && data.student.name) || "";
        if (metaEl) metaEl.textContent = `Class: ${(data.student && data.student.class_name) || 'General'} • Subject: ${(data.student && data.student.subject) || 'All Subjects'}${(data.student && data.student.email) ? ' • ' + data.student.email : ''}`;
        if (avgScoreEl) avgScoreEl.textContent = data.average_percentage > 0 ? `${data.average_percentage}%` : "--%";
        
        renderStudentHistoryChart(data.trend_data || []);
        
        const historyTbody = document.getElementById("student-history-table");
        const history = data.recent_submissions || [];
        
        if (historyTbody) {
            if (history.length === 0) {
                historyTbody.innerHTML = `<tr><td colspan="5" class="px-3 py-4 text-center text-slate-500">No approved assignments yet.</td></tr>`;
            } else {
                historyTbody.innerHTML = history.map(h => `
                    <tr class="hover:bg-slate-800/40">
                        <td class="px-3 py-2 font-semibold text-white">${h.assignment_title}</td>
                        <td class="px-3 py-2 text-slate-400">${h.subject}</td>
                        <td class="px-3 py-2 font-bold text-emerald-400">${h.total_score} / ${h.assignment_max_marks} (${h.percentage}%)</td>
                        <td class="px-3 py-2 font-bold">${h.grade_letter}</td>
                        <td class="px-3 py-2 text-right space-x-1">
                            <a href="/api/reports/${h.id}/html" target="_blank" class="px-2 py-0.5 bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded text-[11px] inline-block hover:bg-indigo-600 hover:text-white">View</a>
                            <a href="/api/reports/${h.id}/pdf" target="_blank" class="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded text-[11px] inline-block hover:bg-slate-700 hover:text-white">PDF</a>
                        </td>
                    </tr>
                `).join("");
            }
        }
    } catch (e) {
        alert("Failed to load student profile: " + e.message);
    }
}

async function deleteCurrentStudentProfile() {
    if (!currentSelectedStudentId) return;
    await deleteStudentById(currentSelectedStudentId, currentSelectedStudentName);
}

async function deleteStudentById(studentId, studentName) {
    const displayName = studentName || "this student";
    if (!confirm(`Are you sure you want to delete ${displayName}? This will remove the student profile and their submissions.`)) {
        return;
    }
    
    try {
        const resp = await fetch(`/api/students/${studentId}`, {
            method: "DELETE"
        });
        const data = await resp.json();
        
        if (resp.ok && data.success) {
            selectedStudentIds.delete(studentId);
            if (currentSelectedStudentId === studentId) {
                currentSelectedStudentId = null;
                currentSelectedStudentName = "";
                const emptyState = document.getElementById("student-detail-empty");
                const contentState = document.getElementById("student-detail-content");
                if (emptyState) emptyState.classList.remove("hidden");
                if (contentState) contentState.classList.add("hidden");
            }
            
            await loadStudentsRoster();
            await loadDashboardData();
        } else {
            alert("Failed to delete student: " + (data.detail || "Server error"));
        }
    } catch (err) {
        alert("Error deleting student: " + err.message);
    }
}

function renderStudentHistoryChart(trendData) {
    const ctx = document.getElementById("studentTrendChart").getContext("2d");
    if (studentChartInstance) studentChartInstance.destroy();
    
    const labels = trendData.map(t => t.assignment_title || t.date);
    const scores = trendData.map(t => t.percentage);
    
    studentChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.length > 0 ? labels : ['No data'],
            datasets: [{
                label: 'Score (%)',
                data: scores.length > 0 ? scores : [0],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#34d399',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(51, 65, 85, 0.4)' },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                }
            }
        }
    });
}

// 6. Roster Upload Modal & Handlers
function openUploadRosterModal() {
    const modal = document.getElementById("modal-upload-roster");
    if (modal) {
        modal.classList.remove("hidden");
        const statusDiv = document.getElementById("roster-upload-status");
        if (statusDiv) {
            statusDiv.classList.add("hidden");
            statusDiv.innerHTML = "";
        }
        const fileInput = document.getElementById("roster-file-input");
        if (fileInput) fileInput.value = "";
        const label = document.getElementById("roster-file-label");
        if (label) label.textContent = "Click to select CSV or Excel roster file";
        lucide.createIcons();
    }
}

function closeUploadRosterModal() {
    const modal = document.getElementById("modal-upload-roster");
    if (modal) modal.classList.add("hidden");
}

function updateRosterFileSelection(input) {
    const label = document.getElementById("roster-file-label");
    const subtext = document.getElementById("roster-file-subtext");
    if (input.files && input.files[0]) {
        const file = input.files[0];
        label.textContent = `Selected: ${file.name}`;
        subtext.textContent = `${(file.size / 1024).toFixed(1)} KB • Click to change file`;
    }
}

function downloadRosterTemplate() {
    window.location.href = "/api/students/roster-template";
}

async function handleRosterUpload(event) {
    event.preventDefault();
    const fileInput = document.getElementById("roster-file-input");
    const submitBtn = document.getElementById("btn-submit-roster");
    const statusDiv = document.getElementById("roster-upload-status");
    
    if (!fileInput.files || !fileInput.files[0]) {
        alert("Please select a CSV or Excel file to upload.");
        return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("file", file);
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-block animate-spin mr-1.5">⏳</span> Ingesting...`;
    
    statusDiv.classList.remove("hidden");
    statusDiv.className = "text-xs rounded-xl p-3 bg-indigo-950/70 border border-indigo-800 text-indigo-300 flex items-center gap-2";
    statusDiv.innerHTML = `<span>Processing roster and assigning unique student records...</span>`;
    
    try {
        const resp = await fetch("/api/students/upload-roster", {
            method: "POST",
            body: formData
        });
        const data = await resp.json();
        
        if (resp.ok && data.success) {
            statusDiv.className = "text-xs rounded-xl p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300";
            statusDiv.innerHTML = `<b>✓ Success:</b> ${data.message}`;
            
            // Reload students list and dashboard stats
            await loadStudentsRoster();
            await loadDashboardData();
            
            setTimeout(() => {
                closeUploadRosterModal();
            }, 1200);
        } else {
            statusDiv.className = "text-xs rounded-xl p-3 bg-rose-950/80 border border-rose-800 text-rose-300";
            statusDiv.innerHTML = `<b>Upload Error:</b> ${data.detail || "Failed to process roster"}`;
        }
    } catch (err) {
        statusDiv.className = "text-xs rounded-xl p-3 bg-rose-950/80 border border-rose-800 text-rose-300";
        statusDiv.innerHTML = `<b>Error:</b> ${err.message}`;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="upload" class="w-3.5 h-3.5"></i> Ingest Roster`;
        lucide.createIcons();
    }
}

// 7. Dynamic Class & Subject Dropdowns
async function populateExistingClassesAndSubjects() {
    let classesSet = new Set();
    let subjectsSet = new Set();

    // Fetch fresh active students list
    try {
        const sResp = await fetch("/api/students");
        if (sResp.ok) {
            const freshStudents = await sResp.json();
            allStudents = freshStudents;
            freshStudents.forEach(s => {
                const c = (s.class_name || "").trim();
                const subj = (s.subject || "").trim();
                if (c && !["null", "undefined", "--", "none"].includes(c.toLowerCase())) classesSet.add(c);
                if (subj && !["null", "undefined", "--", "none"].includes(subj.toLowerCase())) subjectsSet.add(subj);
            });
        }
    } catch (e) {
        if (allStudents && allStudents.length > 0) {
            allStudents.forEach(s => {
                const c = (s.class_name || "").trim();
                const subj = (s.subject || "").trim();
                if (c && !["null", "undefined", "--", "none"].includes(c.toLowerCase())) classesSet.add(c);
                if (subj && !["null", "undefined", "--", "none"].includes(subj.toLowerCase())) subjectsSet.add(subj);
            });
        }
    }

    // Fetch fresh active assignments
    try {
        const resp = await fetch("/api/assignments");
        if (resp.ok) {
            const assignments = await resp.json();
            assignments.forEach(a => {
                const c = (a.class_name || "").trim();
                const subj = (a.subject || "").trim();
                if (c && !["null", "undefined", "--", "none"].includes(c.toLowerCase())) classesSet.add(c);
                if (subj && !["null", "undefined", "--", "none"].includes(subj.toLowerCase())) subjectsSet.add(subj);
            });
        }
    } catch (e) {
        console.warn("Could not fetch assignments for class/subject lists:", e);
    }

    const classesList = Array.from(classesSet).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const subjectsList = Array.from(subjectsSet).filter(Boolean).sort((a, b) => a.localeCompare(b));

    const buildSelectOptions = (list, defaultPlaceholder) => {
        if (list.length === 0) {
            return `<option value="" disabled selected>(No existing ${defaultPlaceholder.toLowerCase()})</option>`;
        }
        return `<option value="">Select Existing ${defaultPlaceholder}...</option>` + list.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
    };

    const buildDatalistOptions = (list) => {
        return list.map(item => `<option value="${escapeHtml(item)}">`).join("");
    };

    // Populate Datalists
    const setInner = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };

    // Student Add & Edit Datalists / Selects
    setInner("existing-classes-list", buildDatalistOptions(classesList));
    setInner("existing-subjects-list", buildDatalistOptions(subjectsList));
    setInner("manual-select-existing-class", buildSelectOptions(classesList, "Class"));
    setInner("manual-select-existing-subject", buildSelectOptions(subjectsList, "Subject"));
    setInner("edit-select-existing-class", buildSelectOptions(classesList, "Class"));
    setInner("edit-select-existing-subject", buildSelectOptions(subjectsList, "Subject"));

    // Assignment Create Datalists / Selects
    setInner("new-assignment-classes-list", buildDatalistOptions(classesList));
    setInner("new-assignment-subjects-list", buildDatalistOptions(subjectsList));
    setInner("create-assignment-select-existing-class", buildSelectOptions(classesList, "Class"));
    setInner("create-assignment-select-existing-subject", buildSelectOptions(subjectsList, "Subject"));

    // Assignment Edit Datalists / Selects
    setInner("edit-assignment-classes-list", buildDatalistOptions(classesList));
    setInner("edit-assignment-subjects-list", buildDatalistOptions(subjectsList));
    setInner("edit-assignment-select-existing-class", buildSelectOptions(classesList, "Class"));
    setInner("edit-assignment-select-existing-subject", buildSelectOptions(subjectsList, "Subject"));
}

function openAddStudentModal() {
    const modal = document.getElementById("modal-add-student");
    if (modal) {
        modal.classList.remove("hidden");
        const statusDiv = document.getElementById("manual-student-status");
        if (statusDiv) {
            statusDiv.classList.add("hidden");
            statusDiv.innerHTML = "";
        }
        document.getElementById("manual-student-name").value = "";
        document.getElementById("manual-student-class").value = "";
        document.getElementById("manual-student-subject").value = "";
        document.getElementById("manual-student-email").value = "";
        document.getElementById("manual-student-notes").value = "";
        populateExistingClassesAndSubjects();
        lucide.createIcons();
    }
}

function closeAddStudentModal() {
    const modal = document.getElementById("modal-add-student");
    if (modal) modal.classList.add("hidden");
}

async function handleManualStudentSubmit(event) {
    event.preventDefault();
    const name = document.getElementById("manual-student-name").value.trim();
    const className = document.getElementById("manual-student-class").value.trim();
    const subject = document.getElementById("manual-student-subject").value.trim();
    const email = document.getElementById("manual-student-email").value.trim();
    const notes = document.getElementById("manual-student-notes").value.trim();
    const submitBtn = document.getElementById("btn-save-manual-student");
    const statusDiv = document.getElementById("manual-student-status");

    if (!name) {
        alert("Student Name is required.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-block animate-spin mr-1.5">⏳</span> Saving...`;

    try {
        const resp = await fetch("/api/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: name,
                class_name: className || "General",
                subject: subject || "",
                email: email || "",
                notes: notes || ""
            })
        });
        const data = await resp.json();

        if (resp.ok && data.success) {
            statusDiv.className = "text-xs rounded-xl p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300";
            statusDiv.innerHTML = `<b>✓ Success:</b> Student profile saved successfully.`;
            statusDiv.classList.remove("hidden");

            await loadStudentsRoster();
            await loadDashboardData();

            if (data.student_id) {
                selectStudentProfile(data.student_id);
            }

            setTimeout(() => {
                closeAddStudentModal();
            }, 1000);
        } else {
            statusDiv.className = "text-xs rounded-xl p-3 bg-rose-950/80 border border-rose-800 text-rose-300";
            statusDiv.innerHTML = `<b>Error:</b> ${data.detail || "Failed to save student profile"}`;
            statusDiv.classList.remove("hidden");
        }
    } catch (err) {
        statusDiv.className = "text-xs rounded-xl p-3 bg-rose-950/80 border border-rose-800 text-rose-300";
        statusDiv.innerHTML = `<b>Error:</b> ${err.message}`;
        statusDiv.classList.remove("hidden");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> Save Student Profile`;
        lucide.createIcons();
    }
}

// 8. Edit Student Modal & Handlers
function openEditStudentModal() {
    if (!currentSelectedStudentId || !currentSelectedStudentData) {
        alert("Please select a student to edit.");
        return;
    }
    const modal = document.getElementById("modal-edit-student");
    if (modal) {
        modal.classList.remove("hidden");
        const statusDiv = document.getElementById("edit-student-status");
        if (statusDiv) {
            statusDiv.classList.add("hidden");
            statusDiv.innerHTML = "";
        }
        document.getElementById("edit-student-name").value = currentSelectedStudentData.name || "";
        document.getElementById("edit-student-class").value = currentSelectedStudentData.class_name || "";
        document.getElementById("edit-student-subject").value = currentSelectedStudentData.subject || "";
        document.getElementById("edit-student-email").value = currentSelectedStudentData.email || "";
        document.getElementById("edit-student-notes").value = currentSelectedStudentData.notes || "";
        populateExistingClassesAndSubjects();
        lucide.createIcons();
    }
}

function closeEditStudentModal() {
    const modal = document.getElementById("modal-edit-student");
    if (modal) modal.classList.add("hidden");
}

async function handleEditStudentSubmit(event) {
    event.preventDefault();
    if (!currentSelectedStudentId) return;

    const name = document.getElementById("edit-student-name").value.trim();
    const className = document.getElementById("edit-student-class").value.trim();
    const subject = document.getElementById("edit-student-subject").value.trim();
    const email = document.getElementById("edit-student-email").value.trim();
    const notes = document.getElementById("edit-student-notes").value.trim();
    const submitBtn = document.getElementById("btn-save-edit-student");
    const statusDiv = document.getElementById("edit-student-status");

    if (!name) {
        alert("Student Name is required.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-block animate-spin mr-1.5">⏳</span> Updating...`;

    try {
        const resp = await fetch(`/api/students/${currentSelectedStudentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: name,
                class_name: className || "General",
                subject: subject || "",
                email: email || "",
                notes: notes || ""
            })
        });
        const data = await resp.json();

        if (resp.ok && data.success) {
            statusDiv.className = "text-xs rounded-xl p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300";
            statusDiv.innerHTML = `<b>✓ Success:</b> Profile updated successfully.`;
            statusDiv.classList.remove("hidden");

            currentSelectedStudentData = data.student;
            await selectStudentProfile(currentSelectedStudentId);
            await loadStudentsRoster();
            await loadDashboardData();

            setTimeout(() => {
                closeEditStudentModal();
            }, 800);
        } else {
            statusDiv.className = "text-xs rounded-xl p-3 bg-rose-950/80 border border-rose-800 text-rose-300";
            statusDiv.innerHTML = `<b>Error:</b> ${data.detail || "Failed to update profile"}`;
            statusDiv.classList.remove("hidden");
        }
    } catch (err) {
        statusDiv.className = "text-xs rounded-xl p-3 bg-rose-950/80 border border-rose-800 text-rose-300";
        statusDiv.innerHTML = `<b>Error:</b> ${err.message}`;
        statusDiv.classList.remove("hidden");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> Update Profile`;
        lucide.createIcons();
    }
}

// Global Keyboard Navigation for Review Station
document.addEventListener("keydown", (e) => {
    const isReviewActive = !document.getElementById("view-review").classList.contains("hidden");
    if (!isReviewActive) return;
    
    const tag = e.target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    
    if (e.key === "ArrowLeft" || (e.altKey && e.key === "ArrowLeft")) {
        e.preventDefault();
        prevStudentSubmission();
    } else if (e.key === "ArrowRight" || (e.altKey && e.key === "ArrowRight")) {
        e.preventDefault();
        nextStudentSubmission();
    }
});
function openBulkEditStudentsModal() {
    const ids = Array.from(selectedStudentIds);
    if (ids.length === 0) return;
    document.getElementById("bulk-edit-students-count").textContent = ids.length + " student(s) selected";
    document.getElementById("bulk-edit-student-class").value = "";
    document.getElementById("bulk-edit-student-subject").value = "";
    document.getElementById("modal-bulk-edit-students").classList.remove("hidden");
}

function closeBulkEditStudentsModal() {
    document.getElementById("modal-bulk-edit-students").classList.add("hidden");
}

async function handleBulkEditStudentsSubmit(e) {
    e.preventDefault();
    const ids = Array.from(selectedStudentIds);
    if (ids.length === 0) return;

    const className = document.getElementById("bulk-edit-student-class").value.trim();
    const subjectName = document.getElementById("bulk-edit-student-subject").value.trim();

    if (!className && !subjectName) {
        alert("Please enter a new Class or Subject to update.");
        return;
    }

    const btn = document.getElementById("btn-save-bulk-edit-students");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Updating...';

    try {
        const payload = { student_ids: ids };
        if (className) payload.class_name = className;
        if (subjectName) payload.subject = subjectName;

        const resp = await fetch("/api/students/bulk-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        const data = await resp.json();
        if (resp.ok && data.success) {
            closeBulkEditStudentsModal();
            clearStudentSelections();
            await loadStudentsRoster();
            populateExistingClassesAndSubjects();
        } else {
            alert("Error: " + (data.detail || JSON.stringify(data)));
        }
    } catch (err) {
        console.error(err);
        alert("Failed to update students.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (window.lucide) window.lucide.createIcons();
    }
}

// ==================== Google Classroom Integration ====================

let googleClassroomStatus = {
    client_secret_configured: false,
    authenticated: false,
    user_email: ""
};

let cachedGoogleCourses = [];

async function checkGoogleClassroomStatus() {
    try {
        const resp = await fetch("/api/google/status");
        if (!resp.ok) return;
        const data = await resp.json();
        googleClassroomStatus = data;
        updateGoogleClassroomUI();
    } catch (err) {
        console.error("Failed to check Google Classroom status:", err);
    }
}

function updateGoogleClassroomUI() {
    const dot = document.getElementById("google-status-dot");
    const text = document.getElementById("google-status-text");
    const bannerDot = document.getElementById("google-modal-status-dot");
    const bannerTitle = document.getElementById("google-modal-status-title");
    const bannerDesc = document.getElementById("google-modal-status-desc");
    const disconnectBtn = document.getElementById("google-btn-disconnect");
    const setupView = document.getElementById("google-setup-view");
    const connectedView = document.getElementById("google-connected-view");
    const secretBadge = document.getElementById("google-secret-status-badge");
    const connectBtn = document.getElementById("google-btn-connect");

    if (googleClassroomStatus.authenticated) {
        if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-400";
        if (text) text.textContent = googleClassroomStatus.user_email ? googleClassroomStatus.user_email.split('@')[0] : "Classroom";
        
        if (bannerDot) bannerDot.className = "w-3 h-3 rounded-full bg-emerald-500";
        if (bannerTitle) bannerTitle.textContent = "Connected to Google Classroom";
        if (bannerDesc) bannerDesc.textContent = googleClassroomStatus.user_email || "Account authorized";
        if (disconnectBtn) disconnectBtn.classList.remove("hidden");
        
        if (setupView) setupView.classList.add("hidden");
        if (connectedView) connectedView.classList.remove("hidden");
    } else {
        if (dot) dot.className = "w-2 h-2 rounded-full bg-slate-500";
        if (text) text.textContent = "Classroom";
        
        if (bannerDot) bannerDot.className = "w-3 h-3 rounded-full bg-slate-600";
        if (bannerTitle) bannerTitle.textContent = "Not Connected";
        if (bannerDesc) bannerDesc.textContent = googleClassroomStatus.client_secret_configured ? "Client secret ready. Please sign in." : "Upload client_secret.json to start.";
        if (disconnectBtn) disconnectBtn.classList.add("hidden");
        
        if (setupView) setupView.classList.remove("hidden");
        if (connectedView) connectedView.classList.add("hidden");
        
        if (secretBadge) {
            if (googleClassroomStatus.client_secret_configured) {
                secretBadge.className = "px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800";
                secretBadge.textContent = "Ready";
                if (connectBtn) connectBtn.disabled = false;
            } else {
                secretBadge.className = "px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400";
                secretBadge.textContent = "Missing";
                if (connectBtn) connectBtn.disabled = true;
            }
        }
    }
}

function openGoogleClassroomModal() {
    checkGoogleClassroomStatus();
    document.getElementById("modal-google-classroom").classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
}

function closeGoogleClassroomModal() {
    document.getElementById("modal-google-classroom").classList.add("hidden");
}

async function handleUploadClientSecret(event) {
    const file = event.target.files[0];
    if (!file) return;

    const label = document.getElementById("google-upload-filename");
    if (label) label.textContent = file.name;

    const formData = new FormData();
    formData.append("file", file);

    try {
        const resp = await fetch("/api/google/upload-credentials", {
            method: "POST",
            body: formData
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            await checkGoogleClassroomStatus();
            alert("Google OAuth credentials saved successfully!");
        } else {
            alert("Failed to save credentials: " + (data.detail || JSON.stringify(data)));
        }
    } catch (err) {
        console.error(err);
        alert("Upload error: " + err.message);
    }
}

async function connectGoogleAccount() {
    try {
        const resp = await fetch("/api/google/auth-url");
        if (!resp.ok) {
            const errData = await resp.json();
            throw new Error(errData.detail || "Failed to generate authorization URL");
        }
        const data = await resp.json();
        const authUrl = data.auth_url;

        // Open OAuth popup window
        const width = 550;
        const height = 650;
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;
        window.open(
            authUrl,
            "google_oauth_popup",
            `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`
        );
    } catch (err) {
        console.error(err);
        alert("Google sign-in error: " + err.message);
    }
}

async function disconnectGoogleAccount() {
    if (!confirm("Are you sure you want to disconnect your Google account from Tallus?")) return;
    try {
        const resp = await fetch("/api/google/disconnect", { method: "POST" });
        if (resp.ok) {
            googleClassroomStatus.authenticated = false;
            googleClassroomStatus.user_email = "";
            updateGoogleClassroomUI();
        }
    } catch (err) {
        console.error(err);
    }
}

// Course and Roster Import
async function openImportGoogleClassroomModal() {
    if (!googleClassroomStatus.authenticated) {
        openGoogleClassroomModal();
        return;
    }
    document.getElementById("modal-import-google-classroom").classList.remove("hidden");
    await loadGoogleCoursesList();
    if (window.lucide) window.lucide.createIcons();
}

function closeImportGoogleClassroomModal() {
    document.getElementById("modal-import-google-classroom").classList.add("hidden");
}

async function loadGoogleCoursesList() {
    const select = document.getElementById("gc-course-select");
    if (!select) return;
    select.innerHTML = '<option value="">Loading courses from Google Classroom...</option>';

    try {
        const resp = await fetch("/api/google/courses");
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || "Failed to load courses");
        }
        const courses = await resp.json();
        cachedGoogleCourses = courses;

        if (courses.length === 0) {
            select.innerHTML = '<option value="">No active Google Classroom courses found</option>';
            return;
        }

        select.innerHTML = '<option value="">-- Select a Google Classroom Course --</option>' +
            courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.section ? ' (' + escapeHtml(c.section) + ')' : ''}</option>`).join('');
    } catch (err) {
        console.error(err);
        select.innerHTML = `<option value="">Error loading courses: ${escapeHtml(err.message)}</option>`;
    }
}

async function handleSelectGoogleCourse() {
    const select = document.getElementById("gc-course-select");
    const courseId = select ? select.value : "";
    const importBtn = document.getElementById("btn-gc-do-import");
    const countBadge = document.getElementById("gc-students-count");
    const previewList = document.getElementById("gc-students-preview-list");
    const loading = document.getElementById("gc-students-loading");
    const subjectInput = document.getElementById("gc-import-subject");

    if (!courseId) {
        if (importBtn) importBtn.disabled = true;
        if (countBadge) countBadge.textContent = "0";
        if (previewList) previewList.innerHTML = '<div class="text-slate-500 italic text-center py-4">Select a course above to view students</div>';
        return;
    }

    const selectedCourse = cachedGoogleCourses.find(c => String(c.id) === String(courseId));
    if (selectedCourse && subjectInput && !subjectInput.value) {
        subjectInput.value = selectedCourse.section || selectedCourse.name || "";
    }

    if (loading) loading.classList.remove("hidden");
    if (previewList) previewList.innerHTML = '<div class="text-slate-400 italic text-center py-4">Fetching enrolled students...</div>';

    try {
        const resp = await fetch(`/api/google/courses/${courseId}/students`);
        if (!resp.ok) throw new Error("Could not fetch students");
        const students = await resp.json();

        if (countBadge) countBadge.textContent = String(students.length);
        if (importBtn) importBtn.disabled = students.length === 0;

        if (students.length === 0) {
            if (previewList) previewList.innerHTML = '<div class="text-slate-500 italic text-center py-4">No students currently enrolled in this course</div>';
        } else {
            if (previewList) {
                previewList.innerHTML = students.map((s, idx) => `
                    <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <div class="flex items-center gap-2">
                            <span class="w-5 h-5 rounded-full bg-slate-800 text-indigo-300 font-bold flex items-center justify-center text-[10px]">${idx + 1}</span>
                            <span class="font-semibold text-white">${escapeHtml(s.name)}</span>
                        </div>
                        <span class="text-slate-400 text-[10px] font-mono">${escapeHtml(s.email || "No email")}</span>
                    </div>
                `).join('');
            }
        }
    } catch (err) {
        console.error(err);
        if (previewList) previewList.innerHTML = `<div class="text-rose-400 italic text-center py-4">Error: ${escapeHtml(err.message)}</div>`;
    } finally {
        if (loading) loading.classList.add("hidden");
        if (window.lucide) window.lucide.createIcons();
    }
}

async function executeImportGoogleRoster() {
    const select = document.getElementById("gc-course-select");
    const courseId = select ? select.value : "";
    const subjectInput = document.getElementById("gc-import-subject");
    const subject = subjectInput ? subjectInput.value.trim() : "";
    const btn = document.getElementById("btn-gc-do-import");

    if (!courseId) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Importing...';

    try {
        const resp = await fetch(`/api/google/courses/${courseId}/import`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject: subject })
        });
        const data = await resp.json();
        if (resp.ok) {
            closeImportGoogleClassroomModal();
            await loadStudentsRoster();
            populateExistingClassesAndSubjects();
            alert(`✅ Successfully imported ${data.total} student(s) from ${data.class_name}!\nCreated: ${data.created}, Updated: ${data.updated}`);
        } else {
            alert("Failed to import roster: " + (data.detail || JSON.stringify(data)));
        }
    } catch (err) {
        console.error(err);
        alert("Import error: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (window.lucide) window.lucide.createIcons();
    }
}

// Assignment Creation: Google Classroom toggle
async function toggleCreateAssignmentGCOptions(checked) {
    const fields = document.getElementById("create-assignment-gc-fields");
    if (!fields) return;
    if (checked) {
        if (!googleClassroomStatus.authenticated) {
            document.getElementById("new-assignment-sync-gc").checked = false;
            openGoogleClassroomModal();
            return;
        }
        fields.classList.remove("hidden");
        await loadCreateAssignmentGCCourses();
    } else {
        fields.classList.add("hidden");
    }
}

async function loadCreateAssignmentGCCourses() {
    const courseSelect = document.getElementById("new-assignment-gc-course");
    if (!courseSelect) return;
    courseSelect.innerHTML = '<option value="">Loading courses...</option>';

    try {
        const resp = await fetch("/api/google/courses");
        if (!resp.ok) throw new Error("Could not load courses");
        const courses = await resp.json();
        cachedGoogleCourses = courses;

        courseSelect.innerHTML = '<option value="">-- Select Google Classroom Course --</option>' +
            courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.section ? ' (' + escapeHtml(c.section) + ')' : ''}</option>`).join('');
    } catch (err) {
        courseSelect.innerHTML = `<option value="">Error loading courses</option>`;
    }
}

async function handleSelectCreateAssignmentGCCourse() {
    const courseId = document.getElementById("new-assignment-gc-course")?.value;
    const cwSelect = document.getElementById("new-assignment-gc-coursework");
    if (!cwSelect) return;

    if (!courseId) {
        cwSelect.innerHTML = '<option value="create_new">✨ Create New Assignment in Classroom</option>';
        return;
    }

    try {
        const resp = await fetch(`/api/google/courses/${courseId}/coursework`);
        const coursework = resp.ok ? await resp.json() : [];

        cwSelect.innerHTML = '<option value="create_new">✨ Create New Assignment in Classroom</option>' +
            (coursework || []).map(cw => `<option value="${cw.id}">Link to: ${escapeHtml(cw.title)} (${cw.maxPoints} pts)</option>`).join('');
    } catch (err) {
        cwSelect.innerHTML = '<option value="create_new">✨ Create New Assignment in Classroom</option>';
    }
}

// Release Marked Submission back to Google Classroom
async function releaseCurrentSubmissionToClassroom() {
    if (!currentSubmission || !currentSubmission.id) {
        alert("Please select a student submission first.");
        return;
    }

    if (currentSubmission.status !== "approved") {
        const proceed = confirm("This submission has not been marked as 'Approved' yet. Would you like to approve and release it now?");
        if (!proceed) return;
        await approveSubmission();
    }

    const btn = document.getElementById("btn-release-classroom");
    const originalHtml = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Releasing...';

    try {
        const resp = await fetch(`/api/google/submissions/${currentSubmission.id}/release`, {
            method: "POST"
        });
        const data = await resp.json();

        if (resp.ok && data.success) {
            btn.className = "px-2.5 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1 shrink-0 shadow-sm";
            btn.innerHTML = '<i data-lucide="check-check" class="w-3.5 h-3.5"></i> Released';
            
            let msg = `✅ Successfully released marked script for ${data.student_name}!\n• Grade: ${data.score} assigned\n• Submission officially returned`;
            if (data.drive_link) {
                msg += `\n• Marked PDF: ${data.drive_link}`;
            }
            alert(msg);
        } else {
            // Check if error is missing linkage
            if (data.detail && data.detail.includes("not linked")) {
                const linkNow = confirm("This assignment is not yet linked to a Google Classroom course. Would you like to link it now?");
                if (linkNow) {
                    await promptLinkAssignmentToClassroom(currentSubmission.assignment_id);
                }
            } else {
                alert("Release error: " + (data.detail || JSON.stringify(data)));
            }
            btn.innerHTML = originalHtml;
        }
    } catch (err) {
        console.error(err);
        alert("Failed to release submission: " + err.message);
        btn.innerHTML = originalHtml;
    } finally {
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
    }
}

async function promptLinkAssignmentToClassroom(assignmentId) {
    if (!googleClassroomStatus.authenticated) {
        openGoogleClassroomModal();
        return;
    }
    const resp = await fetch("/api/google/courses");
    if (!resp.ok) {
        alert("Failed to load Google Classroom courses.");
        return;
    }
    const courses = await resp.json();
    if (courses.length === 0) {
        alert("No active Google Classroom courses found.");
        return;
    }

    const courseNames = courses.map((c, i) => `${i + 1}. ${c.name} ${c.section || ''}`).join('\n');
    const choice = prompt(`Select Google Classroom Course (enter number 1-${courses.length}):\n${courseNames}`);
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= courses.length) return;

    const selectedCourse = courses[idx];
    try {
        const linkResp = await fetch(`/api/google/assignments/${assignmentId}/link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                course_id: selectedCourse.id,
                create_new: true
            })
        });
        const linkData = await linkResp.json();
        if (linkResp.ok && linkData.success) {
            alert(`✅ Assignment linked to ${selectedCourse.name}! You can now click 'Classroom' to release marked scripts.`);
        } else {
            alert("Error linking assignment: " + (linkData.detail || JSON.stringify(linkData)));
        }
    } catch (err) {
        alert("Linking failed: " + err.message);
    }
}

