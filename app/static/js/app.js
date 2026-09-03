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
    loadDashboardData();
    loadAssignments();
    loadSubmissionsQueue();
    loadStudentsRoster();
});

// Tab Navigation
let currentReviewMobileView = 'doc';

function switchTab(tabName) {
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
    if (tabName === "review" && window.innerWidth < 1024) {
        switchReviewMobileView(currentReviewMobileView || 'doc');
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
        if (reviewBadge) {
            if (pendingSubs.length > 0) {
                reviewBadge.textContent = pendingSubs.length;
                reviewBadge.classList.remove("hidden");
            } else {
                reviewBadge.classList.add("hidden");
            }
        }
        
        if (pendingSubs.length === 0) {
            list.innerHTML = `<div class="text-xs text-slate-500 py-6 text-center">No submissions awaiting review 🎉</div>`;
            return;
        }
        
        list.innerHTML = pendingSubs.slice(0, 6).map(s => `
            <div class="p-3 bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl transition-all flex items-center justify-between group">
                <div onclick="openReviewForSubmission(${s.id})" class="cursor-pointer flex-1">
                    <h5 class="text-xs font-bold text-white flex items-center gap-1.5">
                        ${s.student_name}
                        ${!s.is_existing_student ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800">New</span>' : ''}
                    </h5>
                    <span class="text-[11px] text-slate-400">${s.class_name} • Status: <b class="${s.status === 'review_ready' ? 'text-indigo-400' : 'text-amber-400'}">${s.status}</b></span>
                </div>
                <div class="flex items-center gap-1.5">
                    <button onclick="deleteSubmissionById(${s.id}, event)" title="Delete submission" class="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition-all">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="openReviewForSubmission(${s.id})" class="px-2.5 py-1 bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-medium hover:bg-indigo-600 hover:text-white">
                        Review
                    </button>
                </div>
            </div>
        `).join("");
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
            return `
                <div class="bg-slate-900/90 border ${isSelected ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-500/10' : 'border-slate-800 hover:border-slate-700'} rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between group transition-all relative">
                    <div>
                        <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <input type="checkbox" onchange="toggleAssignmentSelection(${a.id}, event)" ${isSelected ? 'checked' : ''} title="Select assignment" class="w-4 h-4 text-indigo-600 rounded bg-slate-800 border-slate-700 cursor-pointer shrink-0">
                                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-400 border border-indigo-800">${escapeHtml(a.subject)}</span>
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

function openCreateAssignmentModal() {
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
    textarea.value = "📄 Reading file and isolating relevant marking rubrics with local AI...";
    
    try {
        const resp = await fetch("/api/assignments/upload-scheme", {
            method: "POST",
            body: formData
        });
        const data = await resp.json();
        if (data.success) {
            textarea.value = data.clean_marking_scheme || data.raw_text || "";
            
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
        } else {
            textarea.value = "Failed to extract text from file.";
        }
    } catch (e) {
        textarea.value = "Error uploading file: " + e.message;
    }
}

async function handleCreateAssignment(e) {
    e.preventDefault();
    const title = document.getElementById("new-assignment-title").value;
    const subject = document.getElementById("new-assignment-subject").value;
    const className = document.getElementById("new-assignment-class").value;
    const maxMarks = parseFloat(document.getElementById("new-assignment-marks").value) || 100;
    const schemeText = document.getElementById("new-assignment-scheme").value;
    
    try {
        const resp = await fetch("/api/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title, subject, class_name: className, max_marks: maxMarks, marking_scheme_text: schemeText
            })
        });
        const data = await resp.json();
        if (data.success) {
            closeCreateAssignmentModal();
            loadAssignments();
            loadDashboardData();
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
    textarea.value = "📄 Reading file and isolating relevant marking rubrics with local AI...";

    try {
        const resp = await fetch("/api/assignments/upload-scheme", {
            method: "POST",
            body: formData
        });
        const data = await resp.json();
        if (data.success) {
            textarea.value = data.clean_marking_scheme || data.raw_text || "";
            const marksInput = document.getElementById("edit-assignment-marks");
            if (data.suggested_max_marks && (!marksInput.value || marksInput.value == "100")) {
                marksInput.value = data.suggested_max_marks;
            }
        } else {
            textarea.value = "";
            alert("Could not extract marking scheme: " + (data.detail || "Server error"));
        }
    } catch (e) {
        textarea.value = "";
        alert("Upload failed: " + e.message);
    }
}

async function handleEditAssignmentSubmit(event) {
    event.preventDefault();
    const assignmentId = document.getElementById("edit-assignment-id").value;
    const title = document.getElementById("edit-assignment-title").value.trim();
    const subject = document.getElementById("edit-assignment-subject").value.trim();
    const className = document.getElementById("edit-assignment-class").value.trim();
    const maxMarks = parseFloat(document.getElementById("edit-assignment-marks").value) || 100.0;
    const schemeText = document.getElementById("edit-assignment-scheme").value.trim();

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
                marking_scheme_text: schemeText
            })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            closeEditAssignmentModal();
            loadAssignments();
            loadDashboardData();
        } else {
            alert("Failed to update assignment: " + (data.detail || JSON.stringify(data)));
        }
    } catch (e) {
        alert("Error saving assignment: " + e.message);
    }
}

// 3. Scan Ingestion, Auto-Splitting & Highlighting
function setIngestMode(mode) {
    currentIngestMode = mode;
    const btnSplit = document.getElementById("btn-mode-split");
    const btnMulti = document.getElementById("btn-mode-multi");
    const splitPanel = document.getElementById("split-settings-panel");
    const fileInput = document.getElementById("scan-file-input");
    const label = document.getElementById("scan-file-label");
    const subtext = document.getElementById("scan-file-subtext");
    const submitBtn = document.getElementById("btn-upload-scan");
    
    if (mode === "split_combined") {
        btnSplit.className = "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 bg-indigo-600 text-white shadow-md shadow-indigo-600/20";
        btnMulti.className = "px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-all flex items-center gap-2 bg-slate-800 border border-slate-700";
        splitPanel.classList.remove("hidden");
        fileInput.removeAttribute("multiple");
        label.textContent = "Click to select combined class PDF file";
        subtext.textContent = "e.g. 60-page PDF of 30 students' 2-page exams";
        submitBtn.innerHTML = `<i data-lucide="scissors" class="w-4 h-4"></i> Split, Auto-Parse & Ingest`;
    } else {
        btnMulti.className = "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 bg-indigo-600 text-white shadow-md shadow-indigo-600/20";
        btnSplit.className = "px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-all flex items-center gap-2 bg-slate-800 border border-slate-700";
        splitPanel.classList.add("hidden");
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
        
        btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Truncating & Auto-Parsing Student Documents...`;
        
        const formData = new FormData();
        formData.append("assignment_id", assignmentId);
        formData.append("pages_per_student", pagesPerStudent);
        formData.append("reverse_pages_per_student", reversePages);
        formData.append("reverse_entire_scan", reverseEntire);
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
        btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Uploading & Auto-Parsing ${fileInput.files.length} Files...`;
        const formData = new FormData();
        formData.append("assignment_id", assignmentId);
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
                        <input type="checkbox" class="sub-checkbox rounded bg-slate-900 border-slate-600 text-indigo-500 focus:ring-indigo-500" value="${s.id}" />
                    </td>
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

// 4. Split-Screen Review Station & Student Identity Highlighting
async function openReviewForSubmission(submissionId) {
    switchTab("review");
    
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
    const progressBadge = document.getElementById("review-class-progress-badge");
    
    const totalCount = currentAssignmentSubmissions.length;
    const currentNum = currentSubmissionIndex + 1;
    
    if (counterBadge) counterBadge.textContent = `${currentNum} / ${totalCount}`;
    if (assignTitle) assignTitle.textContent = currentSubmission.assignment_title || "Assignment";
    
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
    const name = document.getElementById("review-edit-student-name").value.trim();
    const code = document.getElementById("review-edit-student-code").value.trim();
    
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

function updateAiLiveMonitorStage(stageName, percent) {
    const stageText = document.getElementById("ai-monitor-stage-text");
    const bar = document.getElementById("ai-monitor-progress-bar");
    if (stageText) stageText.textContent = stageName;
    if (bar) bar.style.width = `${percent}%`;
}

function stopAiLiveMonitor(success = true, finalMsg = "") {
    clearInterval(monitorInterval);
    const dot = document.getElementById("ai-monitor-dot");
    const ping = document.getElementById("ai-monitor-ping");
    const statusText = document.getElementById("ai-monitor-status-text");
    const stageText = document.getElementById("ai-monitor-stage-text");
    const bar = document.getElementById("ai-monitor-progress-bar");
    
    if (ping) ping.classList.add("hidden");
    if (dot) dot.className = `relative inline-flex rounded-full h-3 w-3 ${success ? 'bg-emerald-500' : 'bg-rose-500'}`;
    if (statusText) statusText.innerHTML = success ? `<span class="text-emerald-400 font-bold">Completed Ready</span>` : `<span class="text-rose-400 font-bold">Error</span>`;
    if (stageText) stageText.textContent = finalMsg || (success ? "Finished. You can review and edit marks." : "Operation failed.");
    if (bar) bar.style.width = success ? "100%" : "0%";
}

async function ensureStudentNameParsedBeforeGrading() {
    const nameInput = document.getElementById("review-edit-student-name");
    const currentName = nameInput.value.trim();
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
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/extract`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vision_model: model })
        });
        let data = {};
        try {
            data = await resp.json();
        } catch (err) {
            data = { detail: resp.statusText || "Server error" };
        }
        
        if (resp.ok && data.success) {
            stopAiLiveMonitor(true, `Step 1 Complete: ${data.results?.questions?.length || 0} student responses extracted verbatim. Review the text below, make any edits, then click Step 2.`);
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
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/mark-and-comment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                reasoning_model: model,
                questions: formData.questions
            })
        });
        let data = {};
        try {
            data = await resp.json();
        } catch (err) {
            data = { detail: resp.statusText || "Server error" };
        }
        
        if (resp.ok && data.success) {
            stopAiLiveMonitor(true, `Step 2 Complete: Scored ${data.results?.total_score} / ${data.results?.max_marks} marks and generated teacher remarks.`);
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
            stopAiLiveMonitor(true, "Full Automated Marking Complete! Review and click Approve & Finalize.");
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
        const remark = ann.remark || "";
        const score  = ann.score  || "";

        // Standardise symbol size
        const lineH = Math.max(18, ymax - ymin);
        const sym = 18;
        const midY = ymin + (ymax - ymin) * 0.5;
        const sw = 2.5;

        if (type === "tick") {
            // Estimate text width: ~10 units per char
            const estTextW = remark ? remark.length * 10 : 0;
            const maxSx = remark ? (1000 - 18 - 8 - estTextW - 10) : 910;
            // Tick placed immediately after the answer word, or at xmin for checklist items
            const sx = remark ? Math.min(maxSx, xmin) : Math.min(maxSx, xmax + 4);
            const sy = midY - sym * 0.5;
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <path d="M ${sx} ${sy + sym*0.55} L ${sx + sym*0.38} ${sy + sym*0.95} L ${sx + sym} ${sy}" fill="none" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
                </g>
            `;
            if (score) {
                // Fixed margin for scores, ~4% from the right edge
                const scoreX = 960; 
                markup += `<text x="${scoreX}" y="${sy + sym*0.75}" class="font-bold fill-red-600 text-[15px]" style="font-family: Arial, sans-serif;">${escapeHtml(String(score))}</text>`;
            }
            if (remark) {
                markup += `<text x="${sx + sym + 8}" y="${sy + sym*0.75}" class="font-bold fill-red-600 text-[15px]" style="font-family: Arial, sans-serif;">${escapeHtml(remark)}</text>`;
            }

        } else if (type === "cross") {
            const estTextW = remark ? remark.length * 10 : 0;
            const maxSx = remark ? (1000 - 18 - 8 - estTextW - 10) : 910;
            // Cross placed immediately after the answer word, or at xmin for checklist items
            const sx = remark ? Math.min(maxSx, xmin) : Math.min(maxSx, xmax + 4);
            const sy = midY - sym * 0.5;
            const h = sym;
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <line x1="${sx}"   y1="${sy}"   x2="${sx+h}" y2="${sy+h}" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                    <line x1="${sx+h}" y1="${sy}"   x2="${sx}"   y2="${sy+h}" stroke="#dc2626" stroke-width="${sw}" stroke-linecap="round"/>
                </g>
            `;
            // Score at right margin, same row
            if (score) {
                markup += `<text x="955" y="${midY + 5}" fill="#dc2626" font-size="15" font-weight="700" font-family="Arial, sans-serif" text-anchor="end">${escapeHtml(score)}</text>`;
            }
            // Remark beside cross
            if (remark) {
                markup += `<text x="${sx + sym + 8}" y="${midY + 5}" fill="#dc2626" font-size="14" font-weight="600" font-family="Arial, sans-serif">${escapeHtml(remark)}</text>`;
            }

        } else if (type === "circle") {
            // Tight ellipse hugging the error word
            const cx = (xmin + xmax) / 2;
            const cy = (ymin + ymax) / 2;
            const rx = Math.max(12, (xmax - xmin) / 2 + 5);
            const ry = Math.max(10, (ymax - ymin) / 2 + 5);
            markup += `
                <g class="annotation-item" data-id="${ann.id || idx}">
                    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#dc2626" stroke-width="${sw}"/>
                </g>
            `;
            // Plain comment text just below the circle — no box
            if (remark) {
                const ty = Math.min(995, ymax + ry + 4);
                markup += `<text x="${Math.max(2, xmin)}" y="${ty}" fill="#dc2626" font-size="${Math.max(9, sym * 0.48)}" font-weight="600" font-family="serif">${escapeHtml(remark)}</text>`;
            }

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

    startAiLiveMonitor("Direct Marking (Beta): Generating grounded ticks, crosses, circles, and remarks on student script with qwen3.8:latest...");

    try {
        const resp = await fetch(`/api/submissions/${currentSubmission.id}/direct-mark`, {
            method: "POST"
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            currentAnnotations = data.annotations || [];
            currentSubmission.annotations = currentAnnotations;
            renderDirectMarkingOverlay();
            stopAiLiveMonitor(true, `Direct Marking Complete! ${currentAnnotations.length} annotations overlaid on script.`);
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
                switchTab("processing");
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

function toggleAllSubs(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.sub-checkbox');
    checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
}

async function batchProcessSelected() {
    const checkboxes = document.querySelectorAll('.sub-checkbox:checked');
    if (checkboxes.length === 0) {
        alert("Please select at least one submission to batch process.");
        return;
    }
    
    if (!confirm(`Are you sure you want to run extraction, grading, and direct marking for ${checkboxes.length} submissions? This may take some time.`)) {
        return;
    }
    
    startAiLiveMonitor(`Batch processing ${checkboxes.length} submissions (Extract -> Grade -> Direct Mark)...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const cb of checkboxes) {
        const subId = cb.value;
        try {
            // 1. Grade (Extract + Grade + Remarks)
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
            
            // 2. Direct Mark
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
    
    stopAiLiveMonitor(failCount === 0, `Batch processing complete. Success: ${successCount}, Failed: ${failCount}`);
    loadSubmissionsQueue();
}


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
            const stageText = document.getElementById("ai-monitor-stage-text");
            if(stageText) stageText.textContent = `Processing ${subId}... (Extract -> Grade)`;
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
            
            if(stageText) stageText.textContent = `Processing ${subId}... (Direct Mark)`;
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
