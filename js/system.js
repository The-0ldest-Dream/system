// The System voice: message queue, alerts, warnings, arrival, penalties.
import { todayStr } from './storage.js';
import { fmtT } from './quests.js';

const PRAISE = [
  'Efficiency detected. Continue.',
  'Your discipline pleases the System.',
  'Progress logged. Do not falter now.',
  'The gap between you and the weak widens.',
  'You are becoming what others refuse to be.',
];
const WARN = [
  'Time is finite. So is my patience.',
  'The weak find excuses. You are not weak.',
  'Your quests remain incomplete.',
  'The penalty has already begun counting.',
];
const FAIL = [
  'You have failed. The System does not forgive.',
  'Incompletion recorded. Consequence applied.',
  'Another day lost. Another hunter outpaces you.',
];

export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export class SystemVoice {
  constructor(state, save, ui) {
    this.state = state;
    this.save = save;
    this.ui = ui;
    this.el = document.getElementById('sys-alert');
    this.titleEl = document.getElementById('sys-alert-title');
    this.linesEl = document.getElementById('sys-alert-lines');
    this.kindEl = document.getElementById('sys-alert-kind');
    this.okBtn = document.getElementById('sys-alert-ok');
    this.queue = [];
    this.showing = false;
    this.okBtn.addEventListener('click', () => this.dismiss());
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.dismiss(); });
  }

  // kind: 'info' | 'warn' | 'ok' | 'boss'
  alert(title, lines, kind = 'info', opts = {}) {
    this.queue.push({ title, lines, kind, opts });
    this.log(title, lines.join(' · '), kind === 'warn');
    if (!this.showing) this.next();
  }

  dismiss() {
    this.el.classList.remove('show');
    this.showing = false;
    this.okBtn.textContent = 'ACKNOWLEDGE';
    setTimeout(() => this.next(), 200);
  }

  next() {
    if (this.showing || !this.queue.length) return;
    const msg = this.queue.shift();
    this.showing = true;
    this.el.className = 'sys-alert show ' + msg.kind;
    this.kindEl.textContent = msg.kind === 'warn' ? 'WARNING' : msg.kind === 'boss' ? 'BOSS' : msg.kind === 'ok' ? 'CLEAR' : 'INFO';
    this.titleEl.textContent = msg.title;
    this.linesEl.innerHTML = msg.lines.map((l, i) =>
      `<p style="animation-delay:${0.25 + i * 0.35}s">${l}</p>`
    ).join('');
    if (msg.opts.okLabel) this.okBtn.textContent = msg.opts.okLabel;
    if (msg.opts.onOk) {
      const handler = () => { msg.opts.onOk(); this.okBtn.removeEventListener('click', handler); };
      this.okBtn.addEventListener('click', handler, { once: true });
    }
  }

  log(title, line, warn) {
    this.state.sysLog.push({ t: new Date().toISOString(), title, line, warn });
    this.state.sysLog = this.state.sysLog.slice(-30);
    this.save();
  }

  // Called once per day when the app opens (or the day flips).
  arrival() {
    const today = todayStr();
    if (this.state.lastArrival === today) return false;
    this.state.lastArrival = today;
    this.save();
    if (!this.state.quests.length) return false;
    const lines = this.state.quests.map(q =>
      `${q.name}: ${q.target}${q.mode === 'timer' ? ' min' : q.unit ? ' ' + q.unit : ''}${q.boss ? ' [BOSS]' : ''}`
    );
    lines.push('Failure to complete will result in a penalty.');
    this.alert('DAILY QUEST HAS ARRIVED', lines, 'info', { okLabel: 'ACCEPT' });
    return true;
  }

  // Every tick: warn about time remaining on incomplete quests.
  tick() {
    if (!this.state.quests.some(q => !q.done)) return;
    const now = new Date();
    const left = Math.max(0, Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) / 1000));
    const thresholds = [3600, 10800, 21600];
    const s = thresholds.find(x => left <= x && left > 0);
    if (!s) return;
    const k = todayStr() + '_' + s;
    if (this.state.sysWarned[k]) return;
    this.state.sysWarned[k] = true;
    this.save();
    const incomplete = this.state.quests.filter(q => !q.done).length;
    this.alert('WARNING', [
      pick(WARN),
      `Time remaining: ${fmtT(left, true)}`,
      `Incomplete quests: ${incomplete}`,
    ], 'warn');
  }
}