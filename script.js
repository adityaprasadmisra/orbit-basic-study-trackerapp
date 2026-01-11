// Core Configuration
const CONFIG = {
    courses: [
        { name: 'Embedded Systems', total: 49, id: 'embedded' },
        { name: 'DSP (Digital Signal Processing)', total: 107, id: 'dsp' },
        { name: 'Analog Circuit', total: 106, id: 'analog' },
        { name: 'Probability', total: 49, id: 'probability' },
        { name: 'Electromagnetic Waves', total: 28, id: 'emwaves' }
    ],
    // storageKey: 'orbit_tracker_v1', // No longer used
    // settingsKey: 'orbit_settings_v1'
};

// State Management
let store = {
    courses: JSON.parse(JSON.stringify(CONFIG.courses)).map(c => ({ ...c, completed: 0 })),
    logs: {}, // Key: YYYY-MM-DD
    streak: 0,
    lastLogin: null
};

let settings = {
    lcUsername: ''
};

// Icons mapper
const COURSE_ICONS = {
    'embedded': 'fa-microchip',
    'dsp': 'fa-wave-square',
    'analog': 'fa-bolt',
    'probability': 'fa-dice',
    'emwaves': 'fa-wifi'
};

// DOM Elements
const views = {
    dashboard: document.getElementById('dashboard'),
    tracker: document.getElementById('tracker'),
    analytics: document.getElementById('analytics'),
    history: document.getElementById('history')
};

// Chart Instances
let weeklyChartInstance = null;
let distChartInstance = null;
let trendChartInstance = null;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupNavigation();
    setupSettings();
    setupDSAVerification();
    renderAll();
    checkStreak();
});

// --- Core Logic (Backend Integration) ---

// --- Core Logic (Dual Mode: Local vs Server) ---

// --- Core Logic (Dual Mode: Local vs Server) ---

let useAPI = false;

async function checkServerHealth() {
    try {
        // Simple probe to check if we are running with the DB backend
        const res = await fetch('/api/settings', { method: 'HEAD' });
        return res.ok;
    } catch (e) {
        return false;
    }
}

async function loadData() {
    // 1. Determine Mode
    if (window.location.protocol.startsWith('http')) {
        const serverUp = await checkServerHealth();
        if (serverUp) {
            console.log("Connected to Orbit DB Server.");
            useAPI = true;
        } else {
            console.warn("Orbit Server unreachable. Running in Browser-Only mode (Vercel/Static).");
            useAPI = false;
        }
    } else {
        useAPI = false; // File protocol
    }

    if (useAPI) {
        try {
            // Server Mode: Fetch from API
            const logsRes = await fetch('/api/logs');
            if (logsRes.ok) store.logs = await logsRes.json();

            const metaRes = await fetch('/api/meta');
            if (metaRes.ok) {
                const meta = await metaRes.json();
                console.log("Meta loaded:", meta);

                if (meta && Array.isArray(meta.courses) && meta.courses.length > 0) {
                    store.courses = meta.courses;
                } else {
                    console.warn("Meta courses empty or invalid, using default config.");
                    if (!store.courses || store.courses.length === 0) {
                        store.courses = JSON.parse(JSON.stringify(CONFIG.courses)).map(c => ({ ...c, completed: 0 }));
                    }
                }

                if (meta && meta.streak) store.streak = meta.streak;
            }

            const setsRes = await fetch('/api/settings');
            if (setsRes.ok) {
                const sets = await setsRes.json();
                settings = { ...settings, ...sets };
            }
        } catch (e) {
            console.error("Server connection failed during load", e);
            useAPI = false; // Fallback immediately
        }
    }

    // Fallback or Local Logic
    if (!useAPI) {
        // Local File Mode: Use LocalStorage
        const raw = localStorage.getItem(CONFIG.storageKey);
        if (raw) {
            store = { ...store, ...JSON.parse(raw) };
        }
        const rawSettings = localStorage.getItem(CONFIG.settingsKey);
        if (rawSettings) {
            settings = { ...settings, ...JSON.parse(rawSettings) };
        }

        // Show indicator
        const dateEl = document.getElementById('currentDate');
        if (dateEl) dateEl.innerText += " (Offline)";
    }
}

async function saveData() {
    if (useAPI) {
        try {
            // Save global state (courses, streak)
            const meta = { ...store };
            delete meta.logs; // Logs are saved individually

            await fetch('/api/meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(meta)
            });
            updateLastUpdatedTime();
        } catch (e) {
            console.error("Save failed", e);
        }
    } else {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(store));
        updateLastUpdatedTime();
    }
}

async function saveSettings() {
    if (useAPI) {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
        } catch (e) {
            console.error("Settings save failed", e);
        }
    } else {
        localStorage.setItem(CONFIG.settingsKey, JSON.stringify(settings));
    }
}

async function saveDailyLog(date, logData) {
    store.logs[date] = logData; // Optimistic update

    if (useAPI) {
        try {
            await fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: date, log: logData })
            });
            await saveData(); // Save global stats
            return true;
        } catch (e) {
            console.error("Log save failed", e);
            showNotification("Failed to save log to DB");
            return false;
        }
    } else {
        saveData(); // In local mode, logs are part of the main store
        return true;
    }
}

// Migration Helper
function showMigrationOption() {
    // Check if we can reach the server
    fetch('http://localhost:3000/api/settings')
        .then(res => {
            if (res.ok) {
                const btn = document.createElement('button');
                btn.className = 'nav-btn accent-btn';
                btn.style.marginTop = '10px';
                btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> <span>Migrate to DB</span>';
                btn.onclick = migrateToDB;

                const nav = document.querySelector('.nav-links');
                if (nav) nav.appendChild(btn);
                showNotification("Database Server Detected! You can migrate your data.");
            }
        })
        .catch(() => { /* Server not running, ignore */ });
}

async function migrateToDB() {
    if (!confirm("This will upload your current local data to the database server. Continue?")) return;

    try {
        const payload = {
            store: store,
            settings: settings
        };

        const res = await fetch('http://localhost:3000/api/migrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("Migration Successful! You can now close this file and open http://localhost:3000");
            window.location.href = "http://localhost:3000";
        } else {
            alert("Migration failed.");
        }
    } catch (e) {
        alert("Error connecting to server.");
    }
}

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function updateLastUpdatedTime() {
    const date = new Date();
    document.getElementById('currentDate').innerText = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function checkStreak() {
    const today = getTodayString();
    let currentStreak = 0;
    let checkDate = new Date();

    for (let i = 0; i < 365; i++) {
        const dStr = checkDate.toISOString().split('T')[0];
        if (store.logs[dStr]) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            if (i === 0 && !store.logs[dStr]) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }
            break;
        }
    }

    store.streak = currentStreak;
    document.getElementById('headerStreak').innerText = store.streak;
}

// --- Navigation & Settings ---

function setupNavigation() {
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));

            btn.classList.add('active');
            const viewId = btn.dataset.view;
            document.getElementById(viewId).classList.add('active-view');

            if (viewId === 'dashboard') renderDashboard();
            if (viewId === 'analytics') renderAnalytics();
            if (viewId === 'history') renderHistory();
        });
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to reset ALL data? This cannot be undone.')) {
            localStorage.removeItem(CONFIG.storageKey);
            localStorage.removeItem(CONFIG.settingsKey);
            location.reload();
        }
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "daily_study_progress.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    document.getElementById('saveDayBtn').addEventListener('click', handleSaveDay);
}

function setupSettings() {
    const modal = document.getElementById('settingsModal');
    const btn = document.getElementById('dsaSettingsBtn');
    const close = document.querySelector('.close-modal');
    const save = document.getElementById('saveSettingsBtn');
    const input = document.getElementById('lcUsername');

    btn.addEventListener('click', () => {
        input.value = settings.lcUsername || '';
        modal.classList.add('active');
    });

    close.addEventListener('click', () => modal.classList.remove('active'));

    save.addEventListener('click', () => {
        settings.lcUsername = input.value.trim();
        saveSettings();
        modal.classList.remove('active');
        showNotification('Settings Saved');
    });
}

// --- DSA Verification Logic ---

function setupDSAVerification() {
    document.getElementById('verifyBtn').addEventListener('click', async () => {
        const linkInput = document.getElementById('dsaLink');
        const url = linkInput.value.trim();
        const statusEl = document.getElementById('verifyStatus');

        if (!url) {
            statusEl.innerText = 'Please enter a valid URL';
            statusEl.className = 'status-text status-error';
            return;
        }

        if (!settings.lcUsername) {
            statusEl.innerText = 'Please configure your username first (Gear Icon)';
            statusEl.className = 'status-text status-error';
            return;
        }

        // Parse Slug
        // URL format: https://leetcode.com/problems/two-sum/description/
        let slug = '';
        try {
            const matches = url.match(/problems\/([^\/]+)\/?/);
            if (matches && matches[1]) {
                slug = matches[1];
            } else {
                throw new Error('Invalid URL format');
            }
        } catch (e) {
            statusEl.innerText = 'Invalid LeetCode URL';
            statusEl.className = 'status-text status-error';
            return;
        }

        statusEl.innerText = 'Verifying with LeetCode API...';
        statusEl.className = 'status-text status-loading';

        try {
            // Using alfa-leetcode-api wrapper
            // Note: This API might be slow or rate-limited.
            const response = await fetch(`https://alfa-leetcode-api.onrender.com/${settings.lcUsername}/ac-submission?limit=20`);

            if (!response.ok) throw new Error('API Error');

            const data = await response.json();
            // data.submission is array of { title, titleSlug, timestamp, statusDisplay }

            const submission = data.submission.find(sub => sub.titleSlug === slug);

            if (submission) {
                // Check if submitted recently (e.g. within last 24 hours)
                // Timestmap is usually unix string
                const subTime = new Date(parseInt(submission.timestamp) * 1000);
                const now = new Date();
                const diffHours = (now - subTime) / (1000 * 60 * 60);

                if (diffHours < 24) {
                    addSolvedProblem({
                        id: slug,
                        title: submission.title,
                        link: url,
                        timestamp: new Date().toISOString()
                    });

                    linkInput.value = '';
                    statusEl.innerText = 'Accepted! Added to daily log.';
                    statusEl.className = 'status-text status-success';
                    triggerConfetti();
                } else {
                    statusEl.innerText = `Found solution, but it was submitted on ${subTime.toLocaleDateString()}. Solve it again today!`;
                    statusEl.className = 'status-text status-error';
                }
            } else {
                statusEl.innerText = 'No recent accepted submission found for this problem.';
                statusEl.className = 'status-text status-error';
            }

        } catch (err) {
            console.error(err);
            // Fallback for API failure
            if (confirm("API Verification failed (Servers might be busy). Did you honestly solve this today? Click OK to manually add it.")) {
                addSolvedProblem({
                    id: slug,
                    title: slug.replace(/-/g, ' ').toUpperCase(),
                    link: url,
                    timestamp: new Date().toISOString()
                });
                linkInput.value = '';
                statusEl.innerText = 'Manually verified.';
                statusEl.className = 'status-text status-success';
            } else {
                statusEl.innerText = 'Verification failed. Try again later.';
                statusEl.className = 'status-text status-error';
            }
        }
    });
}


async function saveDailyLog(date, logData) {
    try {
        store.logs[date] = logData; // Optimistic update
        await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: date, log: logData })
        });
        await saveData(); // Save global stats (courses)
        return true;
    } catch (e) {
        console.error("Log save failed", e);
        showNotification("Failed to save log to DB");
        return false;
    }
}

async function handleSaveDay() {
    const today = getTodayString();
    const prevLog = store.logs[today];

    // 1. Calculate Course Deltas
    const courseLog = {};
    store.courses.forEach((c, idx) => {
        const inputVal = parseInt(document.getElementById(`inp_${c.id}`).value) || 0;
        const prevVal = (prevLog && prevLog.courses && prevLog.courses[c.id]) ? prevLog.courses[c.id] : 0;
        const diff = inputVal - prevVal;

        store.courses[idx].completed += diff;
        if (store.courses[idx].completed < 0) store.courses[idx].completed = 0;
        if (store.courses[idx].completed > store.courses[idx].total) store.courses[idx].completed = store.courses[idx].total;

        courseLog[c.id] = inputVal;
    });

    // Preservation of DSA logs
    const currentDSA = (store.logs[today] && store.logs[today].dsaSolved) ? store.logs[today].dsaSolved : [];

    // 2. Build Daily Log Object
    const logData = {
        courses: courseLog,
        dsaSolved: currentDSA,
        vocab: {
            word: document.getElementById('greWord').value,
            def: document.getElementById('greDef').value
        },
        aptitude: document.getElementById('aptitudeCheck').checked,
        linux: document.getElementById('linuxCheck').checked,
        notes: document.getElementById('dailyNotes').value,
        timestamp: new Date().toISOString()
    };

    // Save to DB
    await saveDailyLog(today, logData);

    showNotification('Progress Saved Successfully!');
    checkStreak();
    renderDashboard();
}

// ... DSA Verification Logic ...

async function addSolvedProblem(problem) {
    const today = getTodayString();
    if (!store.logs[today]) store.logs[today] = {};
    if (!store.logs[today].dsaSolved) store.logs[today].dsaSolved = [];

    // Avoid duplicates
    if (store.logs[today].dsaSolved.some(p => p.id === problem.id)) return;

    store.logs[today].dsaSolved.push(problem);

    // Save entire log for today
    // We need to preserve other fields if they exist
    const currentLog = store.logs[today];
    await saveDailyLog(today, currentLog);

    renderSolvedList();
}

// --- Rendering ---

function renderAll() {
    renderDashboard();
    renderTrackerForm();
    updateLastUpdatedTime();
}

function renderDashboard() {
    // 1. Calculate Aggregates
    let totalLectures = 0;
    let completedLectures = 0;

    store.courses.forEach(c => {
        totalLectures += c.total;
        completedLectures += c.completed;
    });

    const pct = Math.round((completedLectures / totalLectures) * 100) || 0;
    document.getElementById('dashTotalProgress').innerText = `${pct}%`;

    // 2. Count total DSA & Vocab from logs
    let totalDSA = 0;
    let totalVocab = 0;
    Object.values(store.logs).forEach(log => {
        // Updated logic for new DSA structure + backward compatibility
        if (log.dsaSolved) {
            totalDSA += log.dsaSolved.length;
        } else if (log.dsa && log.dsa.count) {
            totalDSA += parseInt(log.dsa.count);
        }

        if (log.vocab && log.vocab.word) totalVocab++;
    });

    document.getElementById('dashDSA').innerText = totalDSA;
    document.getElementById('dashVocab').innerText = totalVocab;
    document.getElementById('dashBestStreak').innerText = store.streak;

    // 3. Render Dashboard Course List
    const courseList = document.getElementById('dashboardCourses');
    courseList.innerHTML = '';

    store.courses.forEach((c, idx) => {
        const cPct = Math.round((c.completed / c.total) * 100);
        const icon = COURSE_ICONS[c.id] || 'fa-book';
        const gradClass = `gradient-${(idx % 4) + 1}`;

        const html = `
            <div class="course-item">
                <div class="course-header">
                    <span><i class="fa-solid ${icon}"></i> ${c.name}</span>
                    <span>${c.completed} / ${c.total}</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-fill ${gradClass}" style="width: ${cPct}%"></div>
                </div>
            </div>
        `;
        courseList.innerHTML += html;
    });

    renderWeeklyChart();
}

function renderTrackerForm() {
    const container = document.getElementById('courseInputs');
    container.innerHTML = '';
    const today = getTodayString();
    const todayLog = store.logs[today] || {};

    // Render Courses
    store.courses.forEach((c) => {
        const doneToday = (todayLog.courses && todayLog.courses[c.id]) ? todayLog.courses[c.id] : 0;

        const html = `
             <div class="input-group" style="margin-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 15px;">
                <label style="color:white; margin-bottom: 4px;">${c.name}</label>
                <div class="course-header" style="opacity: 0.7; margin-bottom: 10px;">
                    <small>Completed so far: ${c.completed}</small>
                </div>
                <div class="course-input-row">
                    <label>Completed Today (+):</label>
                    <div class="counter-input">
                        <button onclick="document.getElementById('inp_${c.id}').value = Math.max(0, (parseInt(document.getElementById('inp_${c.id}').value)||0) - 1)"><i class="fa-solid fa-minus"></i></button>
                        <input type="number" id="inp_${c.id}" value="${doneToday}" min="0">
                        <button onclick="document.getElementById('inp_${c.id}').value = (parseInt(document.getElementById('inp_${c.id}').value)||0) + 1"><i class="fa-solid fa-plus"></i></button>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += html;
    });

    // Render DSA List
    renderSolvedList();

    // Fill other inputs
    if (todayLog.vocab) {
        document.getElementById('greWord').value = todayLog.vocab.word || '';
        document.getElementById('greDef').value = todayLog.vocab.def || '';
    }
    document.getElementById('aptitudeCheck').checked = todayLog.aptitude || false;
    document.getElementById('linuxCheck').checked = todayLog.linux || false;
    document.getElementById('dailyNotes').value = todayLog.notes || '';
}

function renderSolvedList() {
    const list = document.getElementById('solvedList');
    const countDisplay = document.getElementById('dsaCountDisplay');
    const today = getTodayString();

    const solved = (store.logs[today] && store.logs[today].dsaSolved) ? store.logs[today].dsaSolved : [];

    list.innerHTML = '';

    if (solved.length === 0) {
        list.innerHTML = '<div class="empty-state">No problems verified yet today</div>';
    } else {
        solved.forEach(p => {
            const di = document.createElement('div');
            di.className = 'solved-item';
            di.innerHTML = `
                <span>${p.title}</span>
                <a href="${p.link}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
            `;
            list.appendChild(di);
        });
    }

    if (countDisplay) countDisplay.innerText = solved.length;
    const goalMet = document.getElementById('dsaGoalMet');
    if (goalMet) goalMet.checked = (solved.length >= 3);
}

// --- Charts & Analytics ---

function renderWeeklyChart() {
    const ctx = document.getElementById('weeklyChart').getContext('2d');
    const labels = [];
    const dataPoints = [];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));

        const log = store.logs[dStr];
        let score = 0;
        if (log) {
            if (log.courses) score += Object.values(log.courses).reduce((a, b) => a + b, 0);
            if (log.dsaSolved) score += log.dsaSolved.length;
            else if (log.dsa && log.dsa.count) score += parseInt(log.dsa.count);

            if (log.vocab && log.vocab.word) score += 1;
            if (log.aptitude) score += 1;
            if (log.linux) score += 1;
        }
        dataPoints.push(score);
    }

    if (weeklyChartInstance) weeklyChartInstance.destroy();

    weeklyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Activity Points',
                data: dataPoints,
                backgroundColor: '#8b5cf6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderAnalytics() {
    // Distribution Chart
    const ctxDist = document.getElementById('distributionChart').getContext('2d');
    const courseData = store.courses.map(c => c.completed);
    const courseLabels = store.courses.map(c => c.name);

    if (distChartInstance) distChartInstance.destroy();

    distChartInstance = new Chart(ctxDist, {
        type: 'doughnut',
        data: {
            labels: courseLabels,
            datasets: [{
                data: courseData,
                backgroundColor: ['#8b5cf6', '#3b82f6', '#06b6d4', '#ec4899', '#10b981'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#a0aec0' } }
            }
        }
    });

    // DSA Trend Chart
    const ctxTrend = document.getElementById('dsaTrendChart').getContext('2d');
    const trendLabels = [];
    const trendData = [];

    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        trendLabels.push(d.getDate());

        const log = store.logs[dStr];
        let dsaCount = 0;
        if (log) {
            if (log.dsaSolved) dsaCount = log.dsaSolved.length;
            else if (log.dsa && log.dsa.count) dsaCount = parseInt(log.dsa.count);
        }
        trendData.push(dsaCount);
    }

    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [{
                label: 'Questions Solved',
                data: trendData,
                borderColor: '#06b6d4',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(6, 182, 212, 0.1)'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderHistory() {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';

    const dates = Object.keys(store.logs).sort().reverse();

    dates.forEach(date => {
        const log = store.logs[date];
        let coursesSummary = '';
        if (log.courses) {
            Object.keys(log.courses).forEach(k => {
                if (log.courses[k] > 0) {
                    const cName = CONFIG.courses.find(c => c.id === k)?.name || k;
                    coursesSummary += `<span class="date-tag">${cName.substr(0, 8)}...: ${log.courses[k]}</span> `;
                }
            });
        }
        if (!coursesSummary) coursesSummary = '-';

        let dsaCount = 0;
        if (log.dsaSolved) dsaCount = log.dsaSolved.length;
        else if (log.dsa && log.dsa.count) dsaCount = log.dsa.count;

        const row = `
            <tr>
                <td style="color:var(--text-secondary)">${date}</td>
                <td>${coursesSummary}</td>
                <td>${dsaCount} Qs</td>
                <td>${(log.vocab && log.vocab.word) ? log.vocab.word : '-'}</td>
                <td>
                    ${dsaCount >= 3 ? '<span class="success-dot" title="Goal Met"></span>' : ''}
                    ${(log.aptitude && log.linux) ? '<i class="fa-solid fa-check" style="color:var(--accent-green)"></i>' : ''}
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

// --- Utilities ---

function showNotification(msg) {
    const area = document.getElementById('notificationArea');
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${msg}</span>`;

    area.appendChild(notif);

    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(20px)';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

function triggerConfetti() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
}
window.adjustCounter = function (id, val) {
    const el = document.getElementById(id);
    let curr = parseInt(el.value) || 0;
    curr += val;
    if (curr < 0) curr = 0;
    el.value = curr;
};
