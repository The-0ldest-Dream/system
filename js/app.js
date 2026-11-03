// Bootstrap: state, routing, wiring.
import { defaultState, loadProfile, saveProfile, getLastProfile, setLastProfile, profileKey, eraseAllProfiles, exportState, importState } from './storage.js';
import { renderPages, renderQuestList, renderManageList, renderLog, renderRoutineDay, renderNotifList, showRankUp, confirmDialog, esc } from './ui.js';
import { drawRadar, drawLine, drawHeatmap } from './charts.js';
import { drawTree } from './tree.js';
import { SystemVoice, pick } from './system.js';
import { RANKS, checkUnlocks, tryRankUp, levelFromXp } from './stats.js';
import { completeQuest, failQuest, addQuest as addQuestFn, removeQuest as removeQuestFn, updateQuest, recalcToday, valueLabel, elapsed, fmtT, step as qStep } from './quests.js';
import { DAYS, addRoutineItem, removeRoutineItem, toggleRoutineItem } from './routines.js';
import { addLog, removeLog } from './logs.js';
import { sfx, startAmbient, stopAmbient } from './audio.js';

const PAGES = ['setup','status','quest','quest-create','routine','stat-wealth','stat-skills','stat-knowledge','streak','recap','tree','notif','help','settings','penalty'];
const STAT_LINKS = { STRENGTH: 'recap', WEALTH: 'stat-wealth', SKILLS: 'stat-skills', KNOWLEDGE: 'stat-knowledge', AGILITY: 'streak' };

class App {
  constructor() {
    this.state = defaultState();
    this.profileKey = null;
    this.currentPage = 'setup';
    this.previousPage = 'status';
    this.viewedYear = new Date().getFullYear();
    this.recapY = new Date().getFullYear();
    this.recapM = new Date().getMonth();
    this.routineDay = DAYS[new Date().getDay()];
    this.countdownTimer = null;
    this.newQuestBoss = false;
    this.newRoutineBoss = false;
    this.avatarDraft = null;
    this.avatarDrag = null;
    this.voice = null;
    this.settings = this.loadSettings();
    this.bindGlobal();
    this.boot();
  }

  loadSettings() {
    try {
      return JSON.parse(localStorage.getItem('sys_settings') || '{}');
    } catch { return {}; }
  }
  saveSettings() {
    try { localStorage.setItem('sys_settings', JSON.stringify(this.settings)); } catch {}
  }
  setting(key, def) { return this.settings[key] !== undefined ? this.settings[key] : def; }

  save() {
    if (!this.profileKey) return;
    saveProfile(this.profileKey, this.state);
    setLastProfile(this.profileKey);
  }

  bindGlobal() {
    // Navigation via data-page attributes (works for dynamically added buttons)
    document.addEventListener('click', e => {
      const nav = e.target.closest('[data-page]');
      if (nav) { e.preventDefault(); this.showPage(nav.dataset.page); }
    });
    window.addEventListener('nav', e => this.showPage(e.detail));
    document.getElementById('btn-settings').addEventListener('click', () => this.showPage('settings'));
    document.getElementById('btn-notif').addEventListener('click', () => this.openNotif());

    // Modal wiring
    document.getElementById('avatar-pick').addEventListener('click', () => document.getElementById('avatar-file').click());
    document.getElementById('avatar-file').addEventListener('change', e => this.avatarFile(e));
    document.getElementById('avatar-remove').addEventListener('click', () => { this.avatarDraft = null; this.avatarRefresh(); });
    document.getElementById('avatar-cancel').addEventListener('click', () => document.getElementById('modal-avatar').classList.remove('open'));
    document.getElementById('avatar-save').addEventListener('click', () => this.avatarSave());
    document.getElementById('avatar-zoom').addEventListener('input', e => {
      if (!this.avatarDraft) return;
      this.avatarDraft.z = +e.target.value;
      this.avatarRefresh();
    });
    this.bindAvatarCrop();

    // Splash
    setTimeout(() => {
      const sp = document.getElementById('splash');
      sp.classList.add('hide');
      setTimeout(() => sp.classList.add('gone'), 1100);
    }, 1600);

    window.addEventListener('resize', () => this.buildHud());
    if (window.ResizeObserver) new ResizeObserver(() => this.buildHud()).observe(document.getElementById('scene'));
    setInterval(() => this.tick(), 1000);
    setInterval(() => this.checkReset(), 60000);

    // Register service worker
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
    // Unlock audio on first interaction
    document.addEventListener('click', () => { if (this.setting('sfx', true)) sfx.click(); }, { once: true });
  }

  boot() {
    this.applyTheme(this.setting('theme', 'dark'));
    const last = getLastProfile();
    if (last) {
      const s = loadProfile(last);
      if (s) { this.state = s; this.profileKey = last; }
    }
    renderPages(this);
    this.bindPageEvents();
    this.voice = new SystemVoice(this.state, () => this.save(), this);
    this.buildHud();
    this.refreshAll();
    if (this.profileKey) {
      this.state.lastArrival = this.state.lastArrival || null;
      this.voice.arrival();
      this.showPage('status');
    } else {
      this.showPage('setup');
    }
    this.checkReset();
    if (this.setting('music', false)) startAmbient();
  }

  // ---------- Page rendering / routing ----------
  showPage(name) {
    this.previousPage = this.currentPage === 'notif' ? this.previousPage : this.currentPage;
    this.currentPage = name;
    PAGES.forEach(p => {
      const el = document.getElementById('page-' + p);
      if (el) el.classList.toggle('active', p === name);
    });
    const hud = document.querySelector('.scene');
    if (hud) hud.classList.toggle('danger', name === 'penalty');
    if (name !== 'penalty') this.stopCountdown();
    if (name === 'quest-create') renderManageList(this);
    if (name === 'routine') { this.routineDay = DAYS[new Date().getDay()]; this.renderRoutine(); }
    if (name === 'quest') this.sysTick();
    if (name === 'tree') this.drawTreePage();
    if (name === 'streak') this.drawStreakPage();
    if (name === 'recap') this.drawRecapPage();
    if (name === 'notif') renderNotifList(this);
    if (name === 'settings') this.applySettingsUI();
    window.scrollTo(0, 0);
  }

  openNotif() { this.showPage('notif'); }

  bindPageEvents() {
    // Setup
    document.getElementById('btn-generate').addEventListener('click', () => this.generateStatus());

    // Stat points
    document.getElementById('stat-rows').addEventListener('click', e => {
      const b = e.target.closest('[data-add]');
      if (b) this.addPoint(+b.dataset.add);
    });
    document.getElementById('rank-badge').addEventListener('click', () => {
      const el = document.getElementById('rank-badge');
      el.classList.add('tap');
      setTimeout(() => el.classList.remove('tap'), 400);
    });

    // Quest create
    document.getElementById('btn-add-quest').addEventListener('click', () => this.addQuestFromForm());
    document.getElementById('nq-boss').addEventListener('click', () => {
      this.newQuestBoss = !this.newQuestBoss;
      document.getElementById('nq-boss').classList.toggle('active', this.newQuestBoss);
      this.newQuestBoss ? sfx.bossOn() : sfx.click();
    });

    // Routine
    document.getElementById('day-tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-day]');
      if (!b) return;
      this.routineDay = b.dataset.day;
      this.renderRoutine();
    });
    document.getElementById('btn-add-routine').addEventListener('click', () => this.addRoutineFromForm());
    document.getElementById('rt-boss').addEventListener('click', () => {
      this.newRoutineBoss = !this.newRoutineBoss;
      document.getElementById('rt-boss').classList.toggle('active', this.newRoutineBoss);
      this.newRoutineBoss ? sfx.bossOn() : sfx.click();
    });

    // Logs
    ['wealth', 'skills', 'knowledge'].forEach(k => {
      document.querySelector(`[data-addlog="${k}"]`).addEventListener('click', () => this.addLogFromForm(k));
      document.getElementById('add-' + k).addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); this.addLogFromForm(k); }
      });
    });

    // Streak / export / import
    document.getElementById('year-prev').addEventListener('click', () => this.yearNav(-1));
    document.getElementById('year-next').addEventListener('click', () => this.yearNav(1));
    document.getElementById('btn-export').addEventListener('click', () => this.exportData());
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', e => this.importData(e));

    // Recap month nav
    document.getElementById('month-prev').addEventListener('click', () => this.monthNav(-1));
    document.getElementById('month-next').addEventListener('click', () => this.monthNav(1));

    // Settings
    document.getElementById('set-theme').addEventListener('click', () => this.toggleSetting('theme'));
    document.getElementById('set-sfx').addEventListener('click', () => this.toggleSetting('sfx'));
    document.getElementById('set-music').addEventListener('click', () => this.toggleSetting('music'));
    document.getElementById('set-verbose').addEventListener('click', () => this.toggleSetting('verbose'));
    document.getElementById('btn-wipe').addEventListener('click', () => this.wipeData());
    document.getElementById('btn-export-2').addEventListener('click', () => this.exportData());
    document.getElementById('btn-import-2').addEventListener('click', () => document.getElementById('import-file').click());

    // Penalty
    document.getElementById('btn-return').addEventListener('click', () => {
      this.stopCountdown();
      this.showPage('status');
    });

    // Avatar (setup + status)
    document.getElementById('pages').addEventListener('click', e => {
      const av = e.target.closest('.avatar');
      if (av) { e.preventDefault(); this.openAvatarEditor(); }
    });

    // Persist on unload
    window.addEventListener('beforeunload', () => this.save());
  }

  // ---------- Core actions ----------
  generateStatus() {
    const name = (document.getElementById('in-name').value.trim() || 'UNKNOWN');
    const age = (document.getElementById('in-age').value.trim() || '-');
    const cls = (document.getElementById('in-class').value.trim() || 'NONE');
    const title = (document.getElementById('in-title').value.trim() || 'NONE');
    const key = profileKey(name, age);
    if (key !== this.profileKey) {
      const keptAvatar = this.state.character.avatar;
      const existing = loadProfile(key);
      if (existing) {
        this.state = existing;
        if (!this.state.character.avatar) this.state.character.avatar = keptAvatar;
      } else {
        this.state = defaultState();
        this.state.character = { name, age, cls, title, avatar: keptAvatar };
      }
      this.profileKey = key;
      this.voice = new SystemVoice(this.state, () => this.save(), this);
      this.voice.arrival();
    }
    this.state.character.name = name.toUpperCase();
    this.state.character.age = age;
    this.state.character.cls = cls.toUpperCase();
    this.state.character.title = title.toUpperCase();
    this.refreshAll();
    this.showPage('status');
    this.save();
  }

  addPoint(i) {
    if (this.state.points <= 0) return;
    const st = this.state.stats[i];
    if (st.value >= 100) return;
    st.value++;
    this.state.points--;
    if (this.setting('sfx', true)) sfx.point();
    this.refreshStatus();
    this.checkRank();
    this.save();
  }

  checkRank() {
    const newRank = tryRankUp(this.state);
    if (newRank) {
      if (this.setting('sfx', true)) sfx.rankUp();
      showRankUp(newRank, this.state.character.name);
      this.voice.alert('RANK UP', [`You have attained rank ${newRank}.`, 'Your stats have been reset to zero.', 'Ten new points granted.'], 'ok');
    }
    this.refreshStatus();
    this.save();
  }

  checkUnlocksAndAnnounce() {
    const u = checkUnlocks(this.state);
    if (u.titles.length) {
      if (this.setting('sfx', true)) sfx.unlock();
      this.voice.alert('TITLE UNLOCKED', u.titles.map(t => `${t.id} — ${t.desc}`), 'ok');
    }
    if (u.skills.length) {
      if (this.setting('sfx', true)) sfx.unlock();
      this.voice.alert('SKILL UNLOCKED', u.skills.map(sk => `${sk.id} — ${sk.desc}`), 'ok');
    }
  }

  toggleQuest(id) {
    const q = this.state.quests.find(x => x.id === id);
    if (!q) return;
    if (!q.done) {
      const r = completeQuest(this.state, q);
      if (this.setting('sfx', true)) sfx.complete();
      this.checkUnlocksAndAnnounce();
      if (r.rankUp) { this.checkRank(); }
    } else {
      q.done = false;
      q.counted = false;
      recalcToday(this.state);
      if (this.setting('sfx', true)) sfx.click();
    }
    renderQuestList(this);
    if (this.currentPage === 'quest-create') renderManageList(this);
    this.save();
  }

  questAction(id, action) {
    const q = this.state.quests.find(x => x.id === id);
    if (!q) return;
    if (q.mode === 'count') {
      const inc = action === 'inc' ? 1 : -1;
      q.progress = Math.max(0, Math.min(q.target, (q.progress || 0) + inc * qStep(q)));
      if (q.progress >= q.target && !q.done) { this.toggleQuest(id); return; }
      if (q.progress < q.target && q.done) { q.done = false; q.counted = false; recalcToday(this.state); }
    } else if (q.mode === 'timer') {
      if (action === 'tog') {
        if (q.runStart) { q.progress = elapsed(q); q.runStart = null; }
        else if (!q.done) { q.runStart = Date.now(); }
      }
      if (action === 'rst') {
        q.progress = 0; q.runStart = null;
        if (q.done) { q.done = false; q.counted = false; recalcToday(this.state); }
      }
    }
    renderQuestList(this);
    this.save();
  }

  addQuestFromForm() {
    const name = document.getElementById('nq-name').value.trim();
    if (!name) return;
    const target = parseFloat(document.getElementById('nq-target').value) || 1;
    const unit = document.getElementById('nq-unit').value.trim();
    const category = document.getElementById('nq-cat').value.trim() || 'General';
    const mode = document.getElementById('nq-mode').value;
    addQuestFn(this.state, { name, target, unit, category, mode, boss: this.newQuestBoss });
    document.getElementById('nq-name').value = '';
    document.getElementById('nq-target').value = '1';
    document.getElementById('nq-unit').value = '';
    document.getElementById('nq-cat').value = '';
    this.newQuestBoss = false;
    document.getElementById('nq-boss').classList.remove('active');
    renderQuestList(this);
    renderManageList(this);
    this.save();
  }

  removeQuest(id) {
    const q = this.state.quests.find(x => x.id === id);
    if (!q) return;
    confirmDialog('Remove quest?', `"${q.name}" will be permanently removed.`).then(ok => {
      if (!ok) return;
      removeQuestFn(this.state, id);
      recalcToday(this.state);
      renderQuestList(this);
      renderManageList(this);
      this.save();
    });
  }

  renameQuest(id) {
    const q = this.state.quests.find(x => x.id === id);
    if (!q) return;
    const n = prompt('Rename quest:', q.name);
    if (n && n.trim()) {
      updateQuest(this.state, id, { name: n.trim() });
      recalcToday(this.state);
      renderQuestList(this);
      renderManageList(this);
      this.save();
    }
  }

  // ---------- Routine ----------
  renderRoutine() {
    document.querySelectorAll('.day-tab').forEach(t => t.classList.toggle('active', t.dataset.day === this.routineDay));
    renderRoutineDay(this, this.routineDay);
  }
  addRoutineFromForm() {
    const name = document.getElementById('rt-name').value.trim();
    if (!name) return;
    const target = parseFloat(document.getElementById('rt-target').value) || 1;
    const unit = document.getElementById('rt-unit').value.trim();
    const category = document.getElementById('rt-cat').value.trim() || 'General';
    addRoutineItem(this.state, this.routineDay, { name, target, unit, category, boss: this.newRoutineBoss });
    document.getElementById('rt-name').value = '';
    document.getElementById('rt-target').value = '1';
    document.getElementById('rt-unit').value = '';
    document.getElementById('rt-cat').value = '';
    this.newRoutineBoss = false;
    document.getElementById('rt-boss').classList.remove('active');
    this.renderRoutine();
    this.save();
  }
  toggleRoutineItem(day, id) {
    const r = toggleRoutineItem(this.state, day, id);
    if (this.setting('sfx', true)) r.gained ? sfx.complete() : sfx.click();
    this.checkUnlocksAndAnnounce();
    if (r.rankUp) this.checkRank();
    this.renderRoutine();
    this.save();
  }
  removeRoutineItem(day, id) {
    removeRoutineItem(this.state, day, id);
    this.renderRoutine();
    this.save();
  }

  // ---------- Logs ----------
  addLogFromForm(key) {
    const input = document.getElementById('add-' + key);
    const ok = addLog(this.state, key, input.value);
    if (ok === null) return;
    input.value = '';
    renderLog(this, key);
    this.refreshStatus();
    if (this.setting('sfx', true)) sfx.point();
    this.save();
  }
  removeLog(key, idx) {
    removeLog(this.state, key, idx);
    renderLog(this, key);
    this.save();
  }

  // ---------- Charts / tree ----------
  drawTreePage() {
    drawTree(document.getElementById('tree-svg'), this.state);
  }
  drawStreakPage() {
    document.getElementById('year-label').textContent = this.viewedYear;
    drawHeatmap(document.getElementById('heatmap'), this.viewedYear, this.state.runHistory);
    const realYear = new Date().getFullYear();
    document.getElementById('year-prev').classList.toggle('enabled', this.hasYearData(this.viewedYear - 1));
    document.getElementById('year-next').classList.toggle('enabled', this.viewedYear < realYear);
    // running chart
    const pts = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      pts.push({ v: this.state.runHistory[k] || 0, label: (d.getMonth() + 1) + '/' + d.getDate() });
    }
    drawLine(document.getElementById('run-chart'), pts, 'km', 1);
  }
  hasYearData(year) {
    const prefix = year + '-';
    return Object.keys(this.state.runHistory).some(k => k.startsWith(prefix))
        || Object.keys(this.state.history).some(k => k.startsWith(prefix));
  }
  yearNav(delta) {
    const target = this.viewedYear + delta;
    if (delta < 0 && !this.hasYearData(target)) return;
    if (delta > 0 && target > new Date().getFullYear()) return;
    this.viewedYear = target;
    this.drawStreakPage();
  }
  drawRecapPage() {
    const prefix = this.recapY + '-' + String(this.recapM + 1).padStart(2, '0');
    const cur = new Date();
    const isCurrent = this.recapY === cur.getFullYear() && this.recapM === cur.getMonth();
    const daysInMonth = new Date(this.recapY, this.recapM + 1, 0).getDate();
    const elapsed = isCurrent ? Math.min(daysInMonth, cur.getDate()) : daysInMonth;
    let fullDays = Object.keys(this.state.history).filter(k => k.startsWith(prefix) && this.state.history[k] === true).length;
    const todayKey = new Date().toISOString().slice(0, 10);
    if (isCurrent && this.state.history[todayKey] === undefined && this.state.quests.every(q => q.done)) fullDays++;
    const km = Math.round(Object.keys(this.state.runHistory).filter(k => k.startsWith(prefix)).reduce((s, k) => s + (this.state.runHistory[k] || 0), 0) * 10) / 10;
    const questsDone = Object.keys(this.state.questsDoneHistory).filter(k => k.startsWith(prefix)).reduce((s, k) => s + (this.state.questsDoneHistory[k] || 0), 0);
    const pts = Object.keys(this.state.pointsHistory).filter(k => k.startsWith(prefix)).reduce((s, k) => s + (this.state.pointsHistory[k] || 0), 0);
    const rows = [
      ['Quests completed', Math.round(questsDone)],
      ['Days fully completed', fullDays + ' / ' + elapsed],
      ['Distance run', km + ' km'],
      ['Points earned', Math.round(pts)],
      ['Current streak', this.state.streak + ' day' + (this.state.streak === 1 ? '' : 's')],
      ['Best streak', this.state.longestStreak + ' day' + (this.state.longestStreak === 1 ? '' : 's')],
    ];
    document.getElementById('recap-list').innerHTML = rows.map(r => `<div class="recap-row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('month-label').textContent = months[this.recapM] + ' ' + this.recapY;
    const earliest = this.earliestData();
    document.getElementById('month-prev').classList.toggle('enabled', !!earliest && prefix > earliest);
    document.getElementById('month-next').classList.toggle('enabled', !isCurrent);
    // growth chart
    const pts = [];
    const startD = new Date();
    startD.setDate(startD.getDate() - 13);
    const startKey = startD.getFullYear() + '-' + String(startD.getMonth() + 1).padStart(2, '0') + '-' + String(startD.getDate()).padStart(2, '0');
    let last = 0;
    Object.keys(this.state.statSumHistory).sort().forEach(k => { if (k < startKey) last = this.state.statSumHistory[k]; });
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (this.state.statSumHistory[k] !== undefined) last = this.state.statSumHistory[k];
      pts.push({ v: last, label: (d.getMonth() + 1) + '/' + d.getDate() });
    }
    drawLine(document.getElementById('growth-chart'), pts, '', 0);
  }
  earliestData() {
    const keys = [].concat(
      Object.keys(this.state.pointsHistory),
      Object.keys(this.state.questsDoneHistory),
      Object.keys(this.state.runHistory),
      Object.keys(this.state.history),
      Object.keys(this.state.statSumHistory)
    ).sort();
    return keys.length ? keys[0].slice(0, 7) : null;
  }
  monthNav(delta) {
    let y = this.recapY, m = this.recapM + delta;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    const cur = new Date();
    if (delta > 0 && (y > cur.getFullYear() || (y === cur.getFullYear() && m > cur.getMonth()))) return;
    const earliest = this.earliestData();
    if (delta < 0 && (!earliest || (y + '-' + String(m + 1).padStart(2, '0')) < earliest)) return;
    this.recapY = y; this.recapM = m;
    this.drawRecapPage();
  }

  // ---------- Data ----------
  exportData() {
    this.save();
    const blob = new Blob([exportState(this.state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'system-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  importData(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = importState(reader.result);
        this.state = s;
        this.profileKey = profileKey(s.character.name, s.character.age);
        this.voice = new SystemVoice(this.state, () => this.save(), this);
        this.refreshAll();
        this.showPage('status');
        this.save();
        this.voice.alert('IMPORT COMPLETE', ['Your data has been restored.'], 'ok');
      } catch (err) {
        this.voice.alert('IMPORT FAILED', [String(err.message || err)], 'warn');
      }
    };
    reader.readAsText(file);
  }
  async wipeData() {
    const ok = await confirmDialog('Erase all data?', 'Every profile, stat, quest, streak and log will be destroyed. This cannot be undone.');
    if (!ok) return;
    eraseAllProfiles();
    this.state = defaultState();
    this.profileKey = null;
    this.voice = new SystemVoice(this.state, () => this.save(), this);
    this.refreshAll();
    this.showPage('setup');
    if (this.setting('sfx', true)) sfx.glitch();
  }

  // ---------- Settings ----------
  toggleSetting(key) {
    if (key === 'theme') {
      const cur = this.setting('theme', 'dark');
      this.settings.theme = cur === 'dark' ? 'light' : 'dark';
      this.applyTheme(this.settings.theme);
      if (this.setting('sfx', true)) sfx.theme();
    } else if (key === 'sfx') {
      this.settings.sfx = !this.setting('sfx', true);
    } else if (key === 'music') {
      this.settings.music = !this.setting('music', false);
      if (this.settings.music) startAmbient(); else stopAmbient();
    } else if (key === 'verbose') {
      this.settings.verbose = !this.setting('verbose', true);
    }
    this.saveSettings();
    this.applySettingsUI();
  }
  applyTheme(theme) {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', theme === 'light' ? '#4a3417' : '#000000');
  }
  applySettingsUI() {
    const on = (el, v) => el.classList.toggle('on', v);
    on(document.getElementById('set-theme'), this.setting('theme', 'dark') === 'light');
    on(document.getElementById('set-sfx'), this.setting('sfx', true));
    on(document.getElementById('set-music'), this.setting('music', false));
    on(document.getElementById('set-verbose'), this.setting('verbose', true));
  }

  // ---------- Refresh helpers ----------
  refreshAll() {
    this.refreshStatus();
    renderQuestList(this);
    renderManageList(this);
    renderLog(this, 'wealth'); renderLog(this, 'skills'); renderLog(this, 'knowledge');
    this.renderAvatars();
    this.state.lastResetDate = this.state.lastResetDate || new Date().toISOString().slice(0, 10);
  }
  refreshStatus() {
    const s = this.state;
    const xp = xpProgress(s.xp);
    const fields = { 'st-name': s.character.name.toUpperCase(), 'st-age': s.character.age, 'st-class': s.character.cls.toUpperCase(), 'st-title': s.character.title.toUpperCase() };
    for (const [id, v] of Object.entries(fields)) {
      const el = document.getElementById(id); if (el) el.textContent = v;
    }
    const pool = document.getElementById('pt-pool'); if (pool) pool.textContent = s.points;
    const badge = document.getElementById('rank-badge');
    if (badge) { badge.textContent = RANKS[s.rank]; badge.classList.toggle('crimson', s.rank >= 6); }
    s.stats.forEach((st, i) => { const el = document.getElementById('sv-' + i); if (el) el.textContent = st.value; });
    const radar = document.getElementById('radar');
    if (radar) drawRadar(radar, s.stats, STAT_LINKS);
    // Level display
    const lvlRow = document.querySelector('#page-status .row:nth-child(5) .value');
    if (lvlRow) lvlRow.innerHTML = `${xp.level} <small style="color:var(--muted)">(${xp.into}/${xp.need} XP)</small>`;
    const rankRow = document.querySelector('#page-status .row:nth-child(6) .value');
    if (rankRow) rankRow.textContent = RANKS[s.rank];
  }

  // ---------- Avatar ----------
  renderAvatars() {
    ['avatar-setup', 'avatar-status'].forEach(id => {
      const b = document.getElementById(id);
      if (!b) return;
      const img = b.querySelector('img');
      const av = this.state.character.avatar;
      if (av && av.src) {
        img.src = av.src;
        img.style.transform = `translate(${av.tx * 100}%,${av.ty * 100}%) scale(${av.z})`;
        b.classList.add('has');
      } else { img.removeAttribute('src'); b.classList.remove('has'); }
    });
  }
  openAvatarEditor() {
    this.avatarDraft = this.state.character.avatar ? { ...this.state.character.avatar } : null;
    document.getElementById('modal-avatar').classList.add('open');
    this.avatarRefresh();
    if (!this.avatarDraft) document.getElementById('avatar-file').click();
  }
  avatarRefresh() {
    const img = document.getElementById('avatar-img');
    const crop = document.getElementById('avatar-crop');
    const zoom = document.getElementById('avatar-zoom');
    const has = !!(this.avatarDraft && this.avatarDraft.src);
    crop.classList.toggle('has', has);
    zoom.disabled = !has;
    if (has) {
      this.avatarClamp();
      img.style.transform = `translate(${this.avatarDraft.tx * 100}%,${this.avatarDraft.ty * 100}%) scale(${this.avatarDraft.z})`;
      zoom.value = this.avatarDraft.z;
    }
  }
  avatarClamp() {
    const d = this.avatarDraft;
    if (!d) return;
    const m = (d.z - 1) / 2;
    d.tx = Math.max(-m, Math.min(m, d.tx));
    d.ty = Math.max(-m, Math.min(m, d.ty));
  }
  avatarFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 512 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        const x = c.getContext('2d');
        x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(im, 0, 0, c.width, c.height);
        this.avatarDraft = { src: c.toDataURL('image/jpeg', 0.85), z: 1, tx: 0, ty: 0 };
        this.avatarRefresh();
      };
      im.onerror = () => alert('Could not read that image.');
      im.src = r.result;
    };
    r.readAsDataURL(f);
  }
  avatarSave() {
    this.state.character.avatar = this.avatarDraft;
    this.renderAvatars();
    document.getElementById('modal-avatar').classList.remove('open');
    this.save();
  }
  bindAvatarCrop() {
    const crop = document.getElementById('avatar-crop');
    crop.addEventListener('pointerdown', e => {
      if (!this.avatarDraft) return;
      crop.setPointerCapture(e.pointerId);
      this.avatarDrag = { x: e.clientX, y: e.clientY, tx: this.avatarDraft.tx, ty: this.avatarDraft.ty };
      crop.style.cursor = 'grabbing';
    });
    crop.addEventListener('pointermove', e => {
      if (!this.avatarDrag || !this.avatarDraft) return;
      const sz = crop.clientWidth;
      this.avatarDraft.tx = this.avatarDrag.tx + (e.clientX - this.avatarDrag.x) / sz;
      this.avatarDraft.ty = this.avatarDrag.ty + (e.clientY - this.avatarDrag.y) / sz;
      this.avatarRefresh();
    });
    const end = () => { this.avatarDrag = null; crop.style.cursor = 'grab'; };
    crop.addEventListener('pointerup', end);
    crop.addEventListener('pointercancel', end);
    crop.addEventListener('wheel', e => {
      if (!this.avatarDraft) return;
      e.preventDefault();
      this.avatarDraft.z = Math.max(1, Math.min(4, this.avatarDraft.z - e.deltaY * 0.002));
      this.avatarRefresh();
    }, { passive: false });
  }

  // ---------- Daily reset / penalties ----------
  checkReset() {
    if (!this.profileKey) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (this.state.lastResetDate === today) return false;
    const allDone = this.state.quests.length > 0 && this.state.quests.every(q => q.done);
    this.state.history[this.state.lastResetDate] = allDone;
    if (allDone) {
      this.state.streak++;
      if (this.state.streak > this.state.longestStreak) this.state.longestStreak = this.state.streak;
      this.state.points += 2;
      if (this.setting('sfx', true)) sfx.dayDone();
    } else {
      // penalty: fail each incomplete quest
      const failed = [];
      this.state.quests.forEach(q => {
        if (!q.done) {
          const r = failQuest(this.state, q);
          if (r.amount > 0) failed.push(`${q.name} (−1 ${r.stat})`);
        }
      });
      this.state.streak = 0;
      if (failed.length) {
        if (this.setting('sfx', true)) sfx.fail();
        this.voice.alert('PENALTY APPLIED', [
          'You failed to complete your daily quests.',
          ...failed,
        ], 'warn');
      }
    }
    this.state.quests.forEach(q => { q.done = false; q.counted = false; q.progress = 0; q.runStart = null; });
    DAYS.forEach(d => this.state.routines[d].forEach(item => { item.done = false; item.counted = false; }));
    this.state.lastResetDate = today;
    this.state.sysWarned = {};
    recalcToday(this.state);
    this.refreshAll();
    this.save();
    if (!allDone) this.triggerPenalty();
    return true;
  }

  triggerPenalty() {
    if (this.setting('sfx', true)) sfx.penalty();
    this.showPage('penalty');
    let total = 4 * 3600;
    this.stopCountdown();
    const update = () => {
      const h = String(Math.floor(total / 3600)).padStart(2, '0');
      const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
      const s = String(total % 60).padStart(2, '0');
      document.getElementById('countdown').textContent = `${h}:${m}:${s}`;
    };
    update();
    this.countdownTimer = setInterval(() => {
      total--; if (total <= 0) { total = 0; this.stopCountdown(); }
      update();
    }, 1000);
  }
  stopCountdown() {
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
  }

  // ---------- System tick ----------
  tick() {
    const now = new Date();
    const left = Math.max(0, Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) / 1000));
    const timerEl = document.getElementById('sys-timer');
    if (timerEl) timerEl.textContent = fmtT(left, true);
    this.state.quests.forEach(q => {
      if (q.mode === 'timer' && q.runStart) {
        const v = document.getElementById('qv-' + q.id);
        if (v) v.textContent = valueLabel(q);
        if (elapsed(q) >= q.target * 60) { q.progress = q.target * 60; q.runStart = null; this.toggleQuest(q.id); }
      }
    });
    if (this.profileKey && this.setting('verbose', true)) {
      this.voice.tick();
    }
  }

  sysTick() {
    // called when entering quest page: force timer update
    this.tick();
  }

  // ---------- HUD frame ----------
  buildHud() {
    const sc = document.getElementById('scene');
    const svg = document.getElementById('hud');
    if (!sc || !svg) return;
    const w = sc.clientWidth, h = sc.clientHeight;
    if (w < 80 || h < 80) return;
    const s = Math.max(0.3, Math.min(0.62, w / 1120, h / 725));
    const mx = l => l <= 335 ? s * l : l <= 740 ? s * 335 + (l - 335) / 405 * (w / 2 - s * 567.5) : w / 2 - s * (972.5 - l);
    const my = l => l <= 335 ? s * l : l <= 535 ? s * 335 + (l - 335) / 200 * (h - 725 * s) : h - s * (925 - l);
    const f = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
    const sw = u => Math.max(1.4, u * s).toFixed(1);
    const L = a => a.map(p => [mx(p[0]), my(p[1])]);
    const Rr = a => L(a).map(p => [w - p[0], p[1]]);
    const pl = (pts, c, u, x) => `<polyline class="${c}" style="stroke-width:${sw(u)}px;${x || ''}" points="${pts.map(f).join(' ')}"/>`;
    const pair = (a, c, u, x) => pl(L(a), c, u, x) + pl(Rr(a), c, u, x);
    const ring = (a, c, u) => {
      const P = L(a), Q = Rr(a).slice(1, -1).reverse();
      return `<path class="${c}" style="stroke-width:${sw(u)}px" d="M${P.map(f).join('L')}L${Q.map(f).join('L')}Z"/>`;
    };
    const outer = [[972.5, 14], [535, 14], [525, 0], [98, 0], [90, 14], [55, 14], [0, 48], [0, 290], [14, 322], [28, 330], [28, 535], [10, 566], [10, 880], [40, 925], [298, 925], [322, 888], [972.5, 888]];
    const inner = [[972.5, 72], [78, 72], [40, 100], [40, 834], [78, 862], [972.5, 862]];
    let hat = '';
    for (let i = 0; i < 8; i++) { const x = 135 + i * 19; hat += pair([[x, 13], [x + 11, 2]], 'e2', 2.6); }
    const dash = 'stroke-dasharray:' + (9 * s).toFixed(1) + ' ' + (7 * s).toFixed(1);
    const gl = (cx, cy, rx, ry) => `<ellipse class="gl" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"/>`;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.innerHTML =
      '<defs><radialGradient id="hg"><stop offset="0" style="stop-color:var(--gold-light);stop-opacity:.55"/><stop offset=".4" style="stop-color:var(--gold);stop-opacity:.28"/><stop offset="1" style="stop-color:var(--gold);stop-opacity:0"/></radialGradient></defs>' +
      gl(mx(24), my(34), 50 * s, 50 * s) + gl(w - mx(24), my(34), 50 * s, 50 * s) +
      gl(mx(24), my(905), 50 * s, 50 * s) + gl(w - mx(24), my(905), 50 * s, 50 * s) +
      ring(inner, 'e3', 1.4) + ring(outer, 'e1', 3.5) +
      pair([[98, 5], [525, 5]], 'e2', 7) + pair([[3, 52], [3, 288]], 'e2', 6) +
      pair([[12, 590], [12, 878]], 'e2', 6) +
      pair([[62, 919], [298, 919]], 'e2', 5) + pair([[326, 883], [740, 883]], 'e2', 5) + hat +
      pair([[560, 892], [775, 892]], 'e4', 4, dash);
    const st = sc.style, dockB = h - my(862) + 8;
    st.setProperty('--padx', Math.round(40 * s + 10) + 'px');
    st.setProperty('--topb', Math.round(72 * s + 6) + 'px');
    st.setProperty('--padt', Math.round(72 * s + 48) + 'px');
    st.setProperty('--dockb', Math.round(dockB) + 'px');
    st.setProperty('--padb', Math.round(dockB) + 'px');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    new App();
  } catch (err) {
    console.error('Boot failed:', err);
    // Hide splash so the user sees the real error instead of a stuck screen
    const sp = document.getElementById('splash');
    if (sp) { sp.classList.add('hide'); setTimeout(() => sp.classList.add('gone'), 600); }
    document.body.insertAdjacentHTML('beforeend',
      `<div style="position:fixed;inset:0;z-index:9999;background:#000;color:#ff5577;
        font:14px/1.5 monospace;padding:24px;overflow:auto;white-space:pre-wrap">
        <b>Boot error:</b>\n\n${err && err.stack ? err.stack : err}</div>`);
  }
});
