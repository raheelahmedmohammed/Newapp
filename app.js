/* ============================================================
   STUDYFLOW — app.js
   Student Study Planner with Subject Manager, Topic Checklist,
   Per-topic Timer and Progress Tracking.
   Data persisted in localStorage.
   ============================================================ */

/* ---- STATE ---- */
const S = {
  subjects:         [],    // [{id, name, icon, color, topics:[...]}]
  activeTopicId:    null,
  activeSubjectId:  null,
  timerStart:       null,
  timerInterval:    null,
  sessionStart:     Date.now(),
  sessionInterval:  null,
  currentView:      'dashboard',
  currentSubjectId: null,
  editingSubjectId: null,
  chosenColor:      '#7C5CFC',
  streak:           0,
  lastStudyDate:    null,
  dragSrcIdx:       null,
};

/* ============================================================
   UTILITIES
   ============================================================ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function fmtSecs(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = n => String(n).padStart(2,'0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

function fmtDuration(s) {
  if (!s || s < 60) return s + 's';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function hexDim(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function toast(msg, type = 'tip') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

function $id(id) { return document.getElementById(id); }

/* ============================================================
   PERSIST
   ============================================================ */
function save() {
  localStorage.setItem('sf_v2', JSON.stringify({
    subjects: S.subjects,
    streak:   S.streak,
    lastStudyDate: S.lastStudyDate,
  }));
}

function load() {
  try {
    const raw = localStorage.getItem('sf_v2');
    if (!raw) return;
    const d = JSON.parse(raw);
    S.subjects      = d.subjects || [];
    S.streak        = d.streak || 0;
    S.lastStudyDate = d.lastStudyDate || null;
  } catch(e) { console.warn('Load failed', e); }
}

/* ============================================================
   STREAK
   ============================================================ */
function checkStreak() {
  const today = new Date().toDateString();
  const yest  = new Date(Date.now()-86400000).toDateString();
  if (!S.lastStudyDate) { S.streak = 0; }
  else if (S.lastStudyDate !== today && S.lastStudyDate !== yest) { S.streak = 0; save(); }
  $id('streakText').textContent = S.streak > 0 ? `${S.streak}-day streak 🔥` : 'Start your streak!';
}

function bumpStreak() {
  const today = new Date().toDateString();
  if (S.lastStudyDate === today) return;
  const yest  = new Date(Date.now()-86400000).toDateString();
  S.streak = (S.lastStudyDate === yest) ? S.streak + 1 : 1;
  S.lastStudyDate = today;
  $id('streakText').textContent = `${S.streak}-day streak 🔥`;
  save();
}

/* ============================================================
   SESSION TIMER (global clock since page opened)
   ============================================================ */
function startSessionTimer() {
  S.sessionStart = Date.now();
  S.sessionInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - S.sessionStart) / 1000);
    $id('sessionTimerDisplay').textContent = fmtSecs(elapsed);
  }, 1000);
}

/* ============================================================
   VIEW SWITCHING
   ============================================================ */
function switchView(view, subjectId = null) {
  S.currentView      = view;
  S.currentSubjectId = subjectId;

  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

  // Nav highlight
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === view && !subjectId);
  });
  document.querySelectorAll('.subj-nav').forEach(n => {
    n.classList.toggle('active', n.dataset.id === subjectId);
  });

  if (view === 'dashboard') {
    $id('view-dashboard').style.display = 'block';
    $id('pageTitle').textContent = 'Dashboard';
    renderDashboard();
  } else if (view === 'subject' && subjectId) {
    $id('view-subject').style.display = 'block';
    renderSubjectDetail(subjectId);
  } else if (view === 'progress') {
    $id('view-progress').style.display = 'block';
    $id('pageTitle').textContent = 'Progress';
    renderProgress();
  }

  // Close mobile sidebar
  if (window.innerWidth <= 800) {
    $id('sidebar').classList.remove('open');
  }
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const allTopics   = S.subjects.flatMap(s => s.topics);
  const totalSecs   = allTopics.reduce((a, t) => a + (t.timeSpent || 0), 0);
  const doneCount   = allTopics.filter(t => t.completed).length;

  $id('statSubjects').textContent  = S.subjects.length;
  $id('statTopics').textContent    = allTopics.length;
  $id('statCompleted').textContent = doneCount;
  $id('statHours').textContent     = fmtDuration(totalSecs);

  const grid   = $id('subjectsGrid');
  const empty  = $id('emptyDash');

  if (!S.subjects.length) {
    grid.innerHTML  = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = S.subjects.map(sub => {
    const tot  = sub.topics.length;
    const done = sub.topics.filter(t => t.completed).length;
    const pct  = tot > 0 ? Math.round(done / tot * 100) : 0;
    const secs = sub.topics.reduce((a,t) => a + (t.timeSpent||0), 0);
    const dim  = hexDim(sub.color, 0.14);

    return `
      <div class="subject-card"
           style="--sc-color:${sub.color}; --sc-dim:${dim}"
           onclick="switchView('subject','${sub.id}')">
        <div class="sc-top">
          <span class="sc-icon">${sub.icon}</span>
          <span class="sc-badge">${pct}% done</span>
        </div>
        <div class="sc-name">${esc(sub.name)}</div>
        <div class="sc-meta">${tot} topic${tot!==1?'s':''} &middot; ${done} completed</div>
        <div class="sc-prog">
          <div class="sc-bar"><div class="sc-bar-fill" style="width:${pct}%"></div></div>
          <div class="sc-foot">
            <span>${done}/${tot} topics</span>
            <span>⏱ ${fmtDuration(secs)}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ============================================================
   SIDEBAR SUBJECTS
   ============================================================ */
function renderSidebarSubjects() {
  const list = $id('subjectsList');
  const hint = $id('reorderHint');

  if (!S.subjects.length) {
    list.innerHTML = '';
    hint.style.display = 'none';
    return;
  }

  hint.style.display = 'block';

  list.innerHTML = S.subjects.map((sub, idx) => {
    const done = sub.topics.filter(t => t.completed).length;
    const tot  = sub.topics.length;
    return `
      <div class="subj-nav ${S.currentSubjectId===sub.id ? 'active' : ''}"
           data-id="${sub.id}" data-idx="${idx}"
           style="--sn-color:${sub.color}"
           draggable="true"
           ondragstart="dStart(event,${idx})"
           ondragover="dOver(event)"
           ondragleave="dLeave(event)"
           ondrop="dDrop(event,${idx})"
           onclick="switchView('subject','${sub.id}')">
        <span class="subj-drag" title="Drag to reorder">⠿</span>
        <span class="subj-dot" style="background:${sub.color}"></span>
        <span class="subj-label">${sub.icon} ${esc(sub.name)}</span>
        <span class="subj-badge">${done}/${tot}</span>
      </div>`;
  }).join('');
}

/* ============================================================
   SUBJECT DETAIL
   ============================================================ */
function renderSubjectDetail(subjectId) {
  const sub = S.subjects.find(s => s.id === subjectId);
  if (!sub) { switchView('dashboard'); return; }

  $id('pageTitle').textContent       = sub.name;
  $id('subjectIconWrap').textContent = sub.icon;
  $id('subjectDetailName').textContent = sub.name;

  const tot   = sub.topics.length;
  const done  = sub.topics.filter(t => t.completed).length;
  const pct   = tot > 0 ? Math.round(done / tot * 100) : 0;
  const secs  = sub.topics.reduce((a,t) => a + (t.timeSpent||0), 0);

  $id('subjectMeta').textContent         = `${tot} topics · ${fmtDuration(secs)} studied`;
  $id('subjectProgressBar').style.width  = pct + '%';
  $id('subjectProgressBar').style.background = sub.color;
  $id('subjectProgressLabel').textContent = `${done} / ${tot} topics completed (${pct}%)`;
  $id('subjectTimeLabel').textContent     = `Total: ${fmtDuration(secs)}`;

  renderTopics(sub);
}

/* ============================================================
   TOPICS
   ============================================================ */
function renderTopics(sub) {
  const list  = $id('topicsList');
  const empty = $id('emptyTopics');

  if (!sub.topics.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = sub.topics.map(t => {
    const isLive = S.activeTopicId === t.id;
    const dispTime = isLive
      ? fmtSecs((t.timeSpent || 0) + Math.floor((Date.now() - S.timerStart) / 1000))
      : fmtSecs(t.timeSpent || 0);

    return `
      <div class="topic-row ${t.completed ? 'done' : ''}" id="tr-${t.id}">
        <button class="t-check ${t.completed ? 'checked' : ''}"
                onclick="toggleTopic('${sub.id}','${t.id}')"
                title="${t.completed ? 'Mark incomplete' : 'Mark complete'}">
          ${t.completed ? '✓' : ''}
        </button>
        <div class="t-content">
          <div class="topic-name">${esc(t.name)}</div>
          ${t.notes ? `<div class="topic-notes">📝 ${esc(t.notes)}</div>` : ''}
        </div>
        <div class="t-actions">
          <div class="t-time ${isLive ? 'live' : ''}" id="tt-${t.id}">
            ${isLive ? '<span class="t-dot"></span>' : '⏱'}
            <span id="td-${t.id}">${dispTime}</span>
          </div>
          <button class="t-timer-btn ${isLive ? 'stop-btn' : 'play'}"
                  onclick="${isLive ? 'stopTimer()' : `startTimer('${sub.id}','${t.id}')`}"
                  title="${isLive ? 'Stop timer' : 'Start timer'}">
            ${isLive ? '⏹' : '▶'}
          </button>
          <button class="t-del" onclick="deleteTopic('${sub.id}','${t.id}')" title="Delete topic">✕</button>
        </div>
      </div>`;
  }).join('');
}

/* ============================================================
   SUBJECT CRUD
   ============================================================ */
function openAddSubjectModal(editId = null) {
  S.editingSubjectId = editId;
  $id('modalSubjectTitle').textContent = editId ? 'Edit Subject' : 'Add Subject';

  if (editId) {
    const sub = S.subjects.find(s => s.id === editId);
    $id('inputSubjectName').value = sub.name;
    $id('inputSubjectIcon').value = sub.icon;
    S.chosenColor = sub.color;
    document.querySelectorAll('.color-dot').forEach(d => {
      d.classList.toggle('selected', d.dataset.color === sub.color);
    });
  } else {
    $id('inputSubjectName').value = '';
    $id('inputSubjectIcon').value = '';
    S.chosenColor = '#7C5CFC';
    document.querySelectorAll('.color-dot').forEach((d, i) => {
      d.classList.toggle('selected', i === 0);
    });
  }

  $id('modalSubject').classList.add('open');
  setTimeout(() => $id('inputSubjectName').focus(), 60);
}

function openEditSubjectModal() {
  if (S.currentSubjectId) openAddSubjectModal(S.currentSubjectId);
}

function saveSubject() {
  const name = $id('inputSubjectName').value.trim();
  const icon = $id('inputSubjectIcon').value.trim() || '📘';

  if (!name) { toast('Please enter a subject name', 'err'); return; }

  if (S.editingSubjectId) {
    const sub = S.subjects.find(s => s.id === S.editingSubjectId);
    sub.name  = name;
    sub.icon  = icon;
    sub.color = S.chosenColor;
  } else {
    S.subjects.push({ id: uid(), name, icon, color: S.chosenColor, topics: [] });
  }

  save();
  closeModal('modalSubject');
  renderSidebarSubjects();

  if (S.currentView === 'dashboard') renderDashboard();
  else if (S.currentSubjectId && S.editingSubjectId === S.currentSubjectId) renderSubjectDetail(S.currentSubjectId);

  toast(S.editingSubjectId ? '✏️ Subject updated!' : '📚 Subject added!', 'ok');
  S.editingSubjectId = null;
}

function deleteCurrentSubject() {
  if (!S.currentSubjectId) return;
  if (!confirm('Delete this subject and ALL its topics? This cannot be undone.')) return;

  if (S.activeSubjectId === S.currentSubjectId) stopTimer(true);

  S.subjects = S.subjects.filter(s => s.id !== S.currentSubjectId);
  save();
  toast('Subject deleted', 'tip');
  switchView('dashboard');
  renderSidebarSubjects();
}

/* ============================================================
   TOPIC CRUD
   ============================================================ */
function openAddTopicModal() {
  $id('modalTopicTitle').textContent = 'Add Topic';
  $id('inputTopicName').value  = '';
  $id('inputTopicNotes').value = '';
  $id('modalTopic').classList.add('open');
  setTimeout(() => $id('inputTopicName').focus(), 60);
}

function saveTopic() {
  const name  = $id('inputTopicName').value.trim();
  const notes = $id('inputTopicNotes').value.trim();

  if (!name) { toast('Please enter a topic name', 'err'); return; }

  const sub = S.subjects.find(s => s.id === S.currentSubjectId);
  if (!sub) return;

  sub.topics.push({ id: uid(), name, notes, completed: false, timeSpent: 0 });

  save();
  closeModal('modalTopic');
  renderSubjectDetail(S.currentSubjectId);
  renderSidebarSubjects();
  toast('✅ Topic added!', 'ok');
}

function toggleTopic(subjectId, topicId) {
  const sub   = S.subjects.find(s => s.id === subjectId);
  const topic = sub.topics.find(t => t.id === topicId);
  topic.completed = !topic.completed;

  if (topic.completed) bumpStreak();

  save();
  renderSubjectDetail(subjectId);
  renderSidebarSubjects();
  if (S.currentView === 'dashboard') renderDashboard();

  toast(topic.completed ? '🎉 Topic completed!' : 'Marked incomplete', topic.completed ? 'ok' : 'tip');
}

function deleteTopic(subjectId, topicId) {
  if (S.activeTopicId === topicId) stopTimer(true);

  const sub = S.subjects.find(s => s.id === subjectId);
  sub.topics = sub.topics.filter(t => t.id !== topicId);

  save();
  renderSubjectDetail(subjectId);
  renderSidebarSubjects();
  toast('Topic deleted', 'tip');
}

/* ============================================================
   TIMER
   ============================================================ */
function startTimer(subjectId, topicId) {
  if (S.activeTopicId) stopTimer(false);

  const sub   = S.subjects.find(s => s.id === subjectId);
  const topic = sub.topics.find(t => t.id === topicId);

  S.activeTopicId    = topicId;
  S.activeSubjectId  = subjectId;
  S.timerStart       = Date.now();

  // Re-render to flip button state
  renderSubjectDetail(subjectId);

  // Update banner and displays every second
  S.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - S.timerStart) / 1000);
    const total   = (topic.timeSpent || 0) + elapsed;
    const fmt     = fmtSecs(total);

    // Topic row display
    const td = $id(`td-${topicId}`);
    if (td) td.textContent = fmt;

    // Banner
    updateBanner(sub.name, topic.name, sub.icon, total);
  }, 1000);

  showBanner(sub.name, topic.name, sub.icon, topic.timeSpent || 0);
  toast('▶ Timer started!', 'ok');
}

function stopTimer(silent = false) {
  if (!S.activeTopicId) return;

  const elapsed = Math.floor((Date.now() - S.timerStart) / 1000);
  clearInterval(S.timerInterval);
  S.timerInterval = null;

  // Persist elapsed time
  const sub   = S.subjects.find(s => s.id === S.activeSubjectId);
  if (sub) {
    const topic = sub.topics.find(t => t.id === S.activeTopicId);
    if (topic) {
      topic.timeSpent = (topic.timeSpent || 0) + elapsed;
      if (elapsed > 0) bumpStreak();
    }
  }

  const prevSub = S.activeSubjectId;
  S.activeTopicId   = null;
  S.activeSubjectId = null;
  S.timerStart      = null;

  removeBanner();
  save();

  if (S.currentSubjectId === prevSub) renderSubjectDetail(prevSub);
  renderSidebarSubjects();
  if (S.currentView === 'dashboard') renderDashboard();
  if (S.currentView === 'progress') renderProgress();

  if (!silent) toast('⏹ Timer saved!', 'tip');
}

/* ---- Banner ---- */
function showBanner(subjName, topicName, icon, initSecs) {
  removeBanner();
  const b = document.createElement('div');
  b.className = 'timer-banner';
  b.id = 'timerBanner';
  b.innerHTML = bannerHTML(subjName, topicName, icon, initSecs);
  document.body.appendChild(b);
}

function updateBanner(subjName, topicName, icon, totalSecs) {
  const b = $id('timerBanner');
  if (b) b.innerHTML = bannerHTML(subjName, topicName, icon, totalSecs);
}

function bannerHTML(subjName, topicName, icon, secs) {
  return `
    <div class="banner-left">
      <div class="banner-live-dot"></div>
      <div>
        <div class="banner-topic">${esc(topicName)}</div>
        <div class="banner-subj">${icon} ${esc(subjName)}</div>
      </div>
    </div>
    <span class="banner-t">${fmtSecs(secs)}</span>
    <button class="banner-stop-btn" onclick="stopTimer()">Stop</button>`;
}

function removeBanner() {
  const b = $id('timerBanner');
  if (b) b.remove();
}

/* ============================================================
   PROGRESS VIEW
   ============================================================ */
function renderProgress() {
  const el = $id('progressContent');

  if (!S.subjects.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📊</div>
      <h3>Nothing here yet</h3>
      <p>Add subjects and start studying to track your progress.</p>
    </div>`;
    return;
  }

  const allT   = S.subjects.flatMap(s => s.topics);
  const totT   = allT.length;
  const doneT  = allT.filter(t => t.completed).length;
  const totS   = allT.reduce((a,t) => a + (t.timeSpent||0), 0);
  const pct    = totT > 0 ? Math.round(doneT / totT * 100) : 0;

  // Donut
  const r = 52; const circ = 2 * Math.PI * r;
  const dash = circ * pct / 100;

  el.innerHTML = `
    <div class="prog-overview">
      <div class="prog-donut">
        <svg width="130" height="130" viewBox="0 0 130 130">
          <defs>
            <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7C5CFC"/>
              <stop offset="100%" stop-color="#2DD4BF"/>
            </linearGradient>
          </defs>
          <circle cx="65" cy="65" r="${r}" fill="none" stroke="#16162A" stroke-width="12"/>
          <circle cx="65" cy="65" r="${r}" fill="none" stroke="url(#pg)" stroke-width="12"
                  stroke-dasharray="${dash} ${circ}"
                  stroke-linecap="round"
                  transform="rotate(-90 65 65)"
                  style="transition:stroke-dasharray .6s ease"/>
          <text x="65" y="62" text-anchor="middle" font-family="Outfit" font-size="20" font-weight="800" fill="#EDEDF5">${pct}%</text>
          <text x="65" y="78" text-anchor="middle" font-family="Outfit" font-size="11" fill="#7272A0">done</text>
        </svg>
      </div>
      <div class="prog-overview-stats">
        <h3>Overall Progress</h3>
        <p>${doneT} of ${totT} topics completed across ${S.subjects.length} subjects</p>
        <div class="prog-mini-stats">
          <div class="prog-mini-stat"><strong>${S.subjects.length}</strong>Subjects</div>
          <div class="prog-mini-stat"><strong>${totT}</strong>Topics</div>
          <div class="prog-mini-stat"><strong>${doneT}</strong>Completed</div>
          <div class="prog-mini-stat"><strong>${fmtDuration(totS)}</strong>Total time</div>
          <div class="prog-mini-stat"><strong>${S.streak}</strong>Day streak</div>
        </div>
      </div>
    </div>

    ${S.subjects.map(sub => {
      const tot  = sub.topics.length;
      const done = sub.topics.filter(t => t.completed).length;
      const pct  = tot > 0 ? Math.round(done / tot * 100) : 0;
      const secs = sub.topics.reduce((a,t) => a + (t.timeSpent||0), 0);

      return `
        <div class="prog-row">
          <div class="prog-row-hd">
            <div class="prog-row-name">
              <span>${sub.icon}</span>
              <span>${esc(sub.name)}</span>
              <span style="color:${sub.color};font-weight:700">${pct}%</span>
            </div>
            <div class="prog-row-right">
              <span>📝 ${done}/${tot}</span>
              <span>⏱ ${fmtDuration(secs)}</span>
            </div>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%;background:${sub.color}"></div>
          </div>
          ${tot > 0 ? `
          <div class="prog-topic-chips">
            ${sub.topics.map(t => `
              <span class="prog-chip"
                    style="background:${t.completed ? hexDim(sub.color,.13) : 'transparent'};
                           color:${t.completed ? sub.color : '#7272A0'};
                           border-color:${t.completed ? hexDim(sub.color,.35) : 'rgba(255,255,255,.08)'};
                           text-decoration:${t.completed ? 'line-through' : 'none'}">
                ${esc(t.name)} ${t.timeSpent ? `· ${fmtDuration(t.timeSpent)}` : ''}
              </span>`).join('')}
          </div>` : ''}
        </div>`;
    }).join('')}`;
}

/* ============================================================
   DRAG & DROP — Subject Reorder
   ============================================================ */
function dStart(e, idx) {
  S.dragSrcIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
}
function dOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
  e.dataTransfer.dropEffect = 'move';
}
function dLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function dDrop(e, targetIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (S.dragSrcIdx === null || S.dragSrcIdx === targetIdx) return;
  const [moved] = S.subjects.splice(S.dragSrcIdx, 1);
  S.subjects.splice(targetIdx, 0, moved);
  S.dragSrcIdx = null;
  save();
  renderSidebarSubjects();
  if (S.currentView === 'dashboard') renderDashboard();
  toast('Subjects reordered ✓', 'tip');
}

/* ============================================================
   MODAL HELPERS
   ============================================================ */
function closeModal(id) { $id(id).classList.remove('open'); }

// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
  // Enter to save in modals (not in textarea)
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
    if ($id('modalSubject').classList.contains('open')) saveSubject();
    if ($id('modalTopic').classList.contains('open')) saveTopic();
  }
});

/* ============================================================
   COLOR / EMOJI PICKERS
   ============================================================ */
function pickColor(color, el) {
  S.chosenColor = color;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
}

function pickEmoji(e) { $id('inputSubjectIcon').value = e; }

/* ============================================================
   MOBILE SIDEBAR
   ============================================================ */
function toggleSidebar() { $id('sidebar').classList.toggle('open'); }

$id('main').addEventListener('click', () => {
  if (window.innerWidth <= 800) $id('sidebar').classList.remove('open');
});

/* ============================================================
   SAVE ON UNLOAD (catch running timer)
   ============================================================ */
window.addEventListener('beforeunload', () => {
  if (S.activeTopicId) stopTimer(true);
});

/* ============================================================
   ESCAPE UTIL
   ============================================================ */
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

/* ============================================================
   DATE DISPLAY
   ============================================================ */
function setDateChip() {
  const now = new Date();
  $id('todayDate').textContent = now.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  load();
  setDateChip();
  checkStreak();
  renderSidebarSubjects();
  switchView('dashboard');
  startSessionTimer();
}

init();
