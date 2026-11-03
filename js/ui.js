// Page rendering, toasts, modals. Keeps DOM out of app.js.
import { fmtT, valueLabel, step as qStep, elapsed } from './quests.js';
import { drawRadar, drawLine, drawHeatmap } from './charts.js';
import { drawTree } from './tree.js';
import { rankFor, RANKS, xpProgress, xpForLevel, statTotal } from './stats.js';
import { todayStr, exportState, importState, eraseAllProfiles } from './storage.js';
import { sfx } from './audio.js';
import { DAYS } from './routines.js';

const STAT_LINKS = { STRENGTH: 'recap', WEALTH: 'stat-wealth', SKILLS: 'stat-skills', KNOWLEDGE: 'stat-knowledge', AGILITY: 'streak' };

export function avatarHTML(small = false) {
  return `<button class="avatar${small ? ' sm' : ''}" id="avatar-${small ? 'status' : 'setup'}" aria-label="Profile picture">
    <img alt=""><svg class="avatar-ph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
  </button>`;
}

export function renderPages(app) {
  const host = document.getElementById('pages');
  const s = app.state;
  const xp = xpProgress(s.xp);
  host.innerHTML = `
    <section id="page-setup" class="card">
      <h1 class="title">Create Status</h1>
      ${avatarHTML()}
      <div class="field"><label>Name</label><input id="in-name" type="text" value="${esc(s.character.name)}"></div>
      <div class="field"><label>Age</label><input id="in-age" type="number" min="0" value="${esc(s.character.age)}"></div>
      <div class="field"><label>Class / Job</label><input id="in-class" type="text" value="${esc(s.character.cls)}"></div>
      <div class="field"><label>Title</label><input id="in-title" type="text" value="${esc(s.character.title)}"></div>
      <p class="heading">All stats start at <b>0</b> — the only way up is doing quests.</p>
      <button class="btn" id="btn-generate" style="width:100%">Generate Status →</button>
    </section>

    <section id="page-status" class="card">
      ${avatarHTML(true)}
      <h1 class="title">Status</h1>
      <div class="dash-grid">
        <div class="dash-left">
          <div class="row"><div class="label-box">NAME</div><div class="value" id="st-name">${esc(s.character.name.toUpperCase())}</div></div>
          <div class="row"><div class="label-box">AGE</div><div class="value" id="st-age">${esc(s.character.age)}</div></div>
          <div class="row"><div class="label-box">CLASS</div><div class="value" id="st-class">${esc(s.character.cls.toUpperCase())}</div></div>
          <div class="row"><div class="label-box">TITLE</div><div class="value" id="st-title">${esc(s.character.title.toUpperCase())}</div></div>
          <div class="row"><div class="label-box">LEVEL</div><div class="value">${xp.level} <small style="color:var(--muted)">(${xp.into}/${xp.need} XP)</small></div></div>
          <div class="row"><div class="label-box">RANK</div><div class="value">${RANKS[s.rank]}${s.rank >= 6 ? ' <span style="color:var(--danger)">■</span>' : ''}</div></div>
          <div class="points-row">
            <p class="points-line" style="margin:0">Available Points: <span id="pt-pool">${s.points}</span></p>
            <button class="rank-badge${s.rank >= 6 ? ' crimson' : ''}" id="rank-badge" aria-label="Rank">${RANKS[s.rank]}</button>
          </div>
          <div class="stat-rows" id="stat-rows">
            ${s.stats.map((st, i) => `
              <div class="stat-row">
                <span class="stat-name">${st.axis}</span>
                <span class="stat-val" id="sv-${i}">${st.value}</span>
                <button class="pt-btn" data-add="${i}">+</button>
              </div>`).join('')}
          </div>
        </div>
        <div class="dash-right">
          <div class="radar-wrap"><svg id="radar" viewBox="0 0 320 320"></svg></div>
        </div>
      </div>
    </section>

    <section id="page-quest" class="card">
      <div class="quest-header">
        <button class="icon-circle" data-page="status" aria-label="Back">←</button>
        <div class="quest-title-box">QUEST INFO</div>
      </div>
      <p class="quest-quote">[Daily Quest has arrived.]</p>
      <h2 class="goal-title">GOAL</h2>
      <div class="quest-list" id="quest-list"></div>
      <p class="sys-clock">TIME LEFT &nbsp;<b id="sys-timer">--:--:--</b></p>
      <p class="warning-box"><b>WARNING</b>: Failure to complete the daily quest will result in an appropriate penalty.</p>
    </section>

    <section id="page-quest-create" class="card">
      <div class="quest-header">
        <button class="icon-circle" data-page="quest" aria-label="Back">←</button>
        <div class="quest-title-box">CREATE QUEST</div>
      </div>
      <div class="field"><label>Quest Name</label><input id="nq-name" type="text" placeholder="e.g. Read 20 pages"></div>
      <div class="stat-grid">
        <div class="field"><label>Target</label><input id="nq-target" type="number" min="1" value="1"></div>
        <div class="field"><label>Unit (optional)</label><input id="nq-unit" type="text" placeholder="km, pages..."></div>
      </div>
      <div class="field"><label>Category (stat name feeds it directly)</label>
        <input id="nq-cat" type="text" placeholder="STRENGTH, WEALTH, SKILLS, KNOWLEDGE, AGILITY, or General"></div>
      <div class="field"><label>Type</label><select id="nq-mode">
        <option value="check">Checkbox</option>
        <option value="count">Counter (+ / −)</option>
        <option value="timer">Timer (minutes)</option>
      </select></div>
      <button class="boss-toggle" id="nq-boss">⚔ Mark as Boss Quest (3× XP)</button>
      <button class="btn" id="btn-add-quest" style="width:100%;margin-top:14px">Add Quest</button>
      <h3 class="heading">Manage Quests</h3>
      <div class="manage-list" id="quest-manage-list"></div>
    </section>

    <section id="page-routine" class="card">
      <div class="quest-header">
        <button class="icon-circle" data-page="status" aria-label="Back">←</button>
        <div class="quest-title-box">ROUTINE</div>
      </div>
      <div class="day-tabs" id="day-tabs">
        ${DAYS.map(d => `<button class="day-tab" data-day="${d}">${d[0]}</button>`).join('')}
      </div>
      <div class="manage-list" id="routine-list"></div>
      <h3 class="heading">Add a Task</h3>
      <div class="field"><label>Task Name</label><input id="rt-name" type="text" placeholder="e.g. Leg day"></div>
      <div class="stat-grid">
        <div class="field"><label>Target</label><input id="rt-target" type="number" min="1" value="1"></div>
        <div class="field"><label>Unit</label><input id="rt-unit" type="text" placeholder="reps / km / pages"></div>
      </div>
      <div class="field"><label>Category</label><input id="rt-cat" type="text" placeholder="STRENGTH, AGILITY, ... or General"></div>
      <button class="boss-toggle" id="rt-boss">⚔ Mark as Boss Task</button>
      <button class="btn" id="btn-add-routine" style="width:100%;margin-top:12px">Add Task</button>
    </section>

    ${['wealth', 'skills', 'knowledge'].map(k => `
      <section id="page-stat-${k}" class="card">
        <div class="quest-header">
          <button class="icon-circle" data-page="status" aria-label="Back">←</button>
          <div class="quest-title-box">${k.toUpperCase()}</div>
        </div>
        <div class="list-add">
          <input id="add-${k}" type="text" placeholder="Add an item..." data-enter="${k}">
          <button class="pt-btn" data-addlog="${k}">+</button>
        </div>
        <div class="manage-list" id="list-${k}"></div>
      </section>`).join('')}

    <section id="page-streak" class="card">
      <div class="quest-header">
        <button class="icon-circle" data-page="status" aria-label="Back">←</button>
        <div class="quest-title-box">STREAK &amp; HISTORY</div>
      </div>
      <p class="streak-count"><span id="streak-num">${s.streak}</span> day streak · best ${s.longestStreak}</p>
      <h3 class="heading">Running <span>— last 14 days</span></h3>
      <svg id="run-chart" viewBox="0 0 440 170"></svg>
      <div class="year-nav-row">
        <button class="year-nav-btn" id="year-prev" aria-label="Previous year">‹</button>
        <span class="year-label" id="year-label"></span>
        <button class="year-nav-btn" id="year-next" aria-label="Next year">›</button>
      </div>
      <div class="heatmap" id="heatmap"></div>
      <div class="io-row" style="margin-top:14px">
        <button class="btn" id="btn-export">Export</button>
        <button class="btn" id="btn-import">Import</button>
        <input type="file" id="import-file" accept="application/json" hidden>
      </div>
    </section>

    <section id="page-recap" class="card">
      <div class="quest-header">
        <button class="icon-circle" data-page="status" aria-label="Back">←</button>
        <div class="quest-title-box">MONTHLY RECAP</div>
      </div>
      <h3 class="heading">Total Stats <span>— last 14 days</span></h3>
      <svg id="growth-chart" viewBox="0 0 440 170"></svg>
      <div class="year-nav-row">
        <button class="year-nav-btn" id="month-prev" aria-label="Previous month">‹</button>
        <span class="year-label" id="month-label"></span>
        <button class="year-nav-btn" id="month-next" aria-label="Next month">›</button>
      </div>
      <div class="recap-list" id="recap-list"></div>
    </section>

    <section id="page-tree" class="card">
      <div class="quest-header">
        <button class="icon-circle" data-page="status" aria-label="Back">←</button>
        <div class="quest-title-box">GROWTH TREE</div>
      </div>
      <div id="tree-viewport"><div id="tree-stage"><svg id="tree-svg" viewBox="0 0 400 225"></svg></div></div>
      <p class="hint" style="margin-top:10px">The tree grows with your stats, leaves with your streak, and bears fruit with your rank.</p>
    </section>

    <section id="page-notif" class="card">
      <div class="quest-header">
        <button class="icon-circle" data-page="status" aria-label="Back">←</button>
        <div class="quest-title-box">NOTIFICATIONS</div>
      </div>
      <button class="help-link" data-page="help">Instructions ›</button>
      <div class="notif-list" id="notif-list"></div>
    </section>

    <section id="page-help" class="card">
      <div class="quest-header">
        <button class="icon-circle" data-page="notif" aria-label="Back">←</button>
        <div class="quest-title-box">INSTRUCTIONS</div>
      </div>
      <div class="notif-list">
        ${helpItems().map(h => `<div class="notif-item"><b>${h[0]}</b><p>${h[1]}</p></div>`).join('')}
      </div>
    </section>

    <section id="page-settings" class="card">
      <div class="quest-header">
        <button class="icon-circle" data-page="status" aria-label="Back">←</button>
        <div class="quest-title-box">SETTINGS</div>
      </div>
      <div class="settings-row">
        <div><span>Appearance</span><small>Darkness or Divine</small></div>
        <button class="toggle-switch" id="set-theme"></button>
      </div>
      <div class="settings-row">
        <div><span>Sound effects</span><small>Short tones on actions</small></div>
        <button class="toggle-switch" id="set-sfx"></button>
      </div>
      <div class="settings-row">
        <div><span>Ambient music</span><small>Binaural loop (headphones recommended)</small></div>
        <button class="toggle-switch" id="set-music"></button>
      </div>
      <div class="settings-row">
        <div><span>System verbosity</span><small>Warnings and arrival ritual</small></div>
        <button class="toggle-switch" id="set-verbose"></button>
      </div>
      <div class="settings-row" style="border-bottom:none">
        <div><span>Erase all data</span><small>All profiles, cannot be undone</small></div>
        <button class="btn danger" id="btn-wipe">Erase</button>
      </div>
      <div class="io-row" style="margin-top:18px">
        <button class="btn" id="btn-export-2">Export</button>
        <button class="btn" id="btn-import-2">Import</button>
      </div>
    </section>

    <section id="page-penalty" class="card">
      <h1 class="title">⚠ PENALTY ⚠</h1>
      <p class="penalty-warning">[WARNING: DAILY QUEST INCOMPLETION<br>PENALTY INITIATED]</p>
      <div class="countdown" id="countdown">04:00:00</div>
      <button class="btn danger" id="btn-return" style="width:100%">RETURN TO STATUS</button>
    </section>
  `;
}

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function helpItems() {
  return [
    ['Status', 'Your character sheet — name, class, level, rank, and 5 stats plotted on the pentagon.'],
    ['Available Points', 'Every stat and your point pool start at 0 on a new profile. Tap + next to a stat to spend points. Earn points by completing quests (+1 normal, +2 boss bonus), keeping your streak alive (+2 daily), or adding a log entry (+1).'],
    ['XP & Level', 'Every completed quest gives XP (10 normal, 30 boss). XP drives your level, shown on the Status page.'],
    ['Rank', 'Get all 5 stats to 100 to rank up (E → SSS). Each rank-up clears the pentagon back to 0 and gives 10 fresh points. SS and above glow crimson.'],
    ['Titles & Skills', 'Milestones (level, streak, quest count, rank, stat thresholds) unlock Titles and Skills — shown on Status and announced by the System.'],
    ['Wealth / Skills / Knowledge', 'Tap those names on the pentagon to open a log where you can add or delete entries. Adding one earns a point.'],
    ['Daily Quest', 'Your checklist for the day. Completing quests feeds stats, XP, and points.'],
    ['Boss Quests', 'Crimson-marked quests worth 3× XP and a +2 point bonus. Fail one and it costs a rank toward your stat drain.'],
    ['Routine', 'Per-day task lists. Tasks reset each time that day comes around. Categories work the same as quests.'],
    ['+ (new quest)', 'Create custom quests. Set a category matching a pentagon stat (STRENGTH, WEALTH, SKILLS, KNOWLEDGE, AGILITY) to feed that stat directly; otherwise you earn general points.'],
    ['Running & Agility', 'Any quest with "run" or "jog" in its name feeds Agility and the running chart automatically. Multiple running quests on the same day add up.'],
    ['Growth Tree', 'A procedural tree that grows with your stats, leaves with your streak, and bears fruit with your rank.'],
    ['Streak & History', 'Your running chart plus a full-year calendar — green for days you ran, red for days you missed. Use ‹ › to browse other years.'],
    ['Fail Daily Quest', 'Simulates missing your quests and triggers the penalty countdown. The penalty drains a stat point and logs it publicly.'],
    ['Export / Import', 'Save your data as a JSON file, or load it back in later. Imports are versioned and validated.'],
    ['Monthly Recap & Total Stats', 'Tap STRENGTH on the pentagon. A line chart of your combined stat total (last 14 days), plus quests done, days completed, distance run, points earned and streaks for any month.'],
    ['Sounds', 'Short tones for taps, point spends, quest completions, boss toggles, theme switches, rank-ups, day completions, penalties, glitches, and tree taps.'],
    ['Ambient Music', 'The settings page toggles a calm A-minor pad with a ~16 Hz binaural beat. Best with stereo headphones. Off by default.'],
    ['Erase Data', 'The Erase button in Settings wipes every profile after a warning. Cannot be undone.'],
    ['Install as App', 'Hosted on https or localhost, your browser shows an Install button. Installed, it appears as "System" with a dark icon and works offline.'],
    ['Name + Age', 'These work like a login. Change either to start a fresh character, or re-enter an old pair to restore that profile.'],
    ['Appearance', 'Settings switches the whole system between the blue "Darkness" look and the golden "Divine" look.'],
  ];
}

// ---- Quest list rendering ----
export function renderQuestList(app) {
  const wrap = document.getElementById('quest-list');
  if (!wrap) return;
  wrap.innerHTML = app.state.quests.map(q => `
    <div class="quest-item ${q.done ? 'done' : ''} ${q.boss ? 'boss' : ''}" data-qid="${q.id}">
      <span class="quest-name">${esc(q.name)}${q.boss ? ' <b>BOSS</b>' : ''}</span>
      <span class="quest-progress">
        <span class="quest-value" id="qv-${q.id}">${valueLabel(q)}</span>
        ${questControls(q)}
      </span>
    </div>`).join('');
  wrap.querySelectorAll('.checkbox').forEach(cb => {
    cb.addEventListener('click', () => app.toggleQuest(cb.dataset.qid));
    cb.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); app.toggleQuest(cb.dataset.qid); } });
  });
  wrap.querySelectorAll('.q-btn').forEach(btn => {
    btn.addEventListener('click', () => app.questAction(btn.dataset.qid, btn.dataset.a));
  });
}

function questControls(q) {
  if (q.mode === 'count') return `<span class="q-ctl">
    <button class="q-btn" data-qid="${q.id}" data-a="dec" aria-label="Decrease">−</button>
    <button class="q-btn" data-qid="${q.id}" data-a="inc" aria-label="Increase">+</button>
  </span>`;
  if (q.mode === 'timer') return `<span class="q-ctl">
    <button class="q-btn ${q.runStart ? 'run' : ''}" data-qid="${q.id}" data-a="tog" aria-label="Start or pause">${q.runStart ? '❚❚' : '▶'}</button>
    <button class="q-btn" data-qid="${q.id}" data-a="rst" aria-label="Reset">↺</button>
  </span>`;
  return `<span class="checkbox ${q.done ? 'checked' : ''}" role="checkbox" aria-checked="${q.done}" tabindex="0" data-qid="${q.id}"></span>`;
}

export function renderManageList(app) {
  const wrap = document.getElementById('quest-manage-list');
  if (!wrap) return;
  wrap.innerHTML = app.state.quests.map(q => `
    <div class="manage-row ${q.boss ? 'boss' : ''}">
      <span>${esc(q.name)} <small>(${esc(q.category)}${q.boss ? ' · BOSS' : ''})</small></span>
      <span class="manage-actions">
        <button class="pt-btn" data-rename="${q.id}">✎</button>
        <button class="pt-btn" data-remove="${q.id}">✕</button>
      </span>
    </div>`).join('');
  wrap.querySelectorAll('[data-rename]').forEach(b => b.addEventListener('click', () => app.renameQuest(b.dataset.rename)));
  wrap.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => app.removeQuest(b.dataset.remove)));
}

export function renderLog(app, key) {
  const wrap = document.getElementById('list-' + key);
  if (!wrap) return;
  const items = app.state.customLists[key];
  wrap.innerHTML = items.length
    ? items.map((item, i) => `<div class="manage-row"><span>${esc(item)}</span><button class="pt-btn" data-rmlog="${key}" data-idx="${i}">✕</button></div>`).join('')
    : '<p style="color:var(--muted);font-size:.8rem">Nothing added yet.</p>';
  wrap.querySelectorAll('[data-rmlog]').forEach(b => b.addEventListener('click', () => app.removeLog(b.dataset.rmlog, +b.dataset.idx)));
}

export function renderRoutineDay(app, day) {
  const wrap = document.getElementById('routine-list');
  if (!wrap) return;
  const list = app.state.routines[day] || [];
  wrap.innerHTML = list.length ? list.map(item => `
    <div class="quest-item ${item.done ? 'done' : ''} ${item.boss ? 'boss' : ''}">
      <span class="quest-name">${esc(item.name)}${item.boss ? ' <b>BOSS</b>' : ''}</span>
      <span class="quest-progress">
        <span class="quest-value">[${item.done ? item.target : 0}/${item.target}${item.unit}]</span>
        <span class="checkbox ${item.done ? 'checked' : ''}" role="checkbox" aria-checked="${item.done}" tabindex="0" data-ritem="${item.id}"></span>
        <button class="pt-btn" data-rmitem="${item.id}">×</button>
      </span>
    </div>`).join('') : '<p style="color:var(--muted);font-size:.85rem">No tasks for this day yet.</p>';
  wrap.querySelectorAll('.checkbox').forEach(cb => {
    cb.addEventListener('click', () => app.toggleRoutineItem(day, cb.dataset.ritem));
    cb.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); app.toggleRoutineItem(day, cb.dataset.ritem); } });
  });
  wrap.querySelectorAll('[data-rmitem]').forEach(b => b.addEventListener('click', () => app.removeRoutineItem(day, b.dataset.rmitem)));
}

export function renderNotifList(app) {
  const wrap = document.getElementById('notif-list');
  if (!wrap) return;
  const items = [];
  const incomplete = app.state.quests.filter(q => !q.done).length;
  if (incomplete) items.push(`<div class="notif-item boss-alert"><b>⚠ Quests Incomplete</b><p>${incomplete} quest(s) still pending today.</p></div>`);
  // System log, newest first
  [...app.state.sysLog].reverse().forEach(e => {
    items.push(`<div class="notif-item${e.warn ? ' boss-alert' : ''}"><b>[SYSTEM] ${esc(e.title)}</b><p>${esc(e.line)}</p></div>`);
  });
  wrap.innerHTML = items.join('') || '<p style="color:var(--muted)">No notifications.</p>';
  app.state.sysLog.length = 0;
  app.state.sysLog.push(...app.state.sysLog); // no-op, keep for save trigger
}

export function showRankUp(letter, name) {
  const toast = document.getElementById('rankup');
  document.getElementById('rankup-letter').textContent = letter;
  document.getElementById('rankup-sub').textContent = 'Congratulations, ' + (name || 'Hunter') + '.';
  toast.classList.remove('hide');
  toast.classList.add('show');
  clearTimeout(showRankUp._t);
  showRankUp._t = setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.classList.remove('show', 'hide'), 400);
  }, 2600);
}

export function confirmDialog(title, body) {
  return new Promise(resolve => {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('modal-confirm-title').textContent = title;
    document.getElementById('modal-confirm-body').textContent = body;
    modal.classList.add('open');
    const ok = document.getElementById('modal-confirm-ok');
    const cancel = document.getElementById('modal-confirm-cancel');
    const done = v => { modal.classList.remove('open'); ok.removeEventListener('click', okFn); cancel.removeEventListener('click', cancelFn); resolve(v); };
    const okFn = () => done(true);
    const cancelFn = () => done(false);
    ok.addEventListener('click', okFn);
    cancel.addEventListener('click', cancelFn);
  });
}