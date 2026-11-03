// Bootstrap: state, routing, wiring.
import { defaultState, loadProfile, saveProfile, getLastProfile, setLastProfile, profileKey, eraseAllProfiles, exportState, importState } from './storage.js';
import { renderPages, renderQuestList, renderManageList, renderLog, renderRoutineDay, renderNotifList, showRankUp, confirmDialog, esc } from './ui.js';
import { drawRadar, drawLine, drawHeatmap } from './charts.js';
import { drawTree } from './tree.js';
import { SystemVoice } from './system.js';
import { RANKS, checkUnlocks, tryRankUp, xpProgress } from './stats.js';
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
    this.settings = this.loadSettings();

    // 1) Load existing profile BEFORE rendering anything
    const last = getLastProfile();
    if (last) {
      const s = loadProfile(last);
      if (s) { this.state = s; this.profileKey = last; }
    }

    // 2) Render pages (so all #page-* elements exist in the DOM)
    renderPages(this);

    // 3) Wire event listeners (all elements now exist)
    this.bindGlobal();
    this.bindPageEvents();

    // 4) Initialize the System voice
    this.voice = new SystemVoice(this.state, () => this.save(), this);

    // 5) Theme + HUD
    this.applyTheme(this.settings.theme || 'dark');
    this.buildHud();

    // 6) Initial data render
    this.refreshAll();

    // 7) Route to the right page
    if (this.profileKey) {
      this.showPage('status');
      this.checkReset();
      this.voice.arrival();
    } else {
      this.showPage('setup');
    }

    // 8) Splash dismiss
    setTimeout(() => {
      const sp = document.getElementById('splash');
      if (sp) { sp.classList.add('hide'); setTimeout(() => sp.classList.add('gone'), 1100); }
    }, 1600);

    // 9) Timers
    setInterval(() => this.tick(), 1000);
    setInterval(() => this.checkReset(), 60000);

    // 10) Music + SW
    if (this.settings.music) startAmbient();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  }

  loadSettings() {
    try { return JSON.parse(localStorage.getItem('sys_settings') || '{}'); }
    catch { return {}; }
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
    document.addEventListener('click', e => {
      const nav = e.target.closest('[data-page]');
      if (nav) { e.preventDefault(); this.showPage(nav.dataset.page); }
    });
    window.addEventListener('nav', e => this.showPage(e.detail));
    document.getElementById('btn-settings').addEventListener('click', () => this.showPage('settings'));
    document.getElementById('btn-notif').addEventListener('click', () => this.showPage('notif'));
    document.addEventListener('click', () => { if (this.setting('sfx', true)) sfx.click(); }, { once: true });
  }

  bindPageEvents() {
    document.getElementById('btn-generate').addEventListener('click', () => this.generateStatus());

    document.getElementById('stat-rows').addEventListener('click', e => {
      const b = e.target.closest('[data-add]');
      if (b) this.addPoint(+b.dataset.add);
    });

    document.getElementById('btn-add-quest').addEventListener('click', () => this.addQuestFromForm());
    document.getElementById('nq-boss').addEventListener('click', () => {
      this.newQuestBoss = !this.newQuestBoss;
      document.getElementById('nq-boss').classList.toggle('active', this.newQuestBoss);
      this.newQuestBoss ? sfx.bossOn() : sfx.click();
    });

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

    ['wealth', 'skills', 'knowledge'].forEach(k => {
      const btn = document.querySelector(`[data-addlog
