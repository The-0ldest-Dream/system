// Versioned persistence with migration + import/export.
const SCHEMA_VERSION = 2;
const KEY_PROFILE = 'sys_profile_';
const KEY_LAST = 'sys_last_profile';
const KEY_META = 'sys_meta';

export function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
export function lsRemove(k) { try { localStorage.removeItem(k); } catch {} }

export function profileKey(name, age) {
  return (name || 'unknown').trim().toLowerCase() + '_' + String(age ?? '0').trim().toLowerCase();
}

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    character: { name: 'Shadow', age: '25', cls: 'Assassin', title: 'Lost In Dark', avatar: null },
    stats: [
      { axis: 'STRENGTH',  value: 0 },
      { axis: 'WEALTH',    value: 0 },
      { axis: 'SKILLS',    value: 0 },
      { axis: 'KNOWLEDGE', value: 0 },
      { axis: 'AGILITY',   value: 0 },
    ],
    xp: 0,
    level: 1,
    points: 10,
    rank: 0,
    rankMaxed: false,
    titles: ['Lost In Dark'],
    skills: [],
    quests: [
      { id: uid(), name: 'Push-ups', target: 100, unit: '', category: 'STRENGTH', boss: false, mode: 'check', progress: 0, done: false, counted: false },
      { id: uid(), name: 'Sit-ups',  target: 100, unit: '', category: 'STRENGTH', boss: false, mode: 'check', progress: 0, done: false, counted: false },
      { id: uid(), name: 'Squats',   target: 100, unit: '', category: 'STRENGTH', boss: false, mode: 'check', progress: 0, done: false, counted: false },
      { id: uid(), name: 'Running',  target: 10,  unit: 'km', category: 'AGILITY', boss: false, mode: 'count', step: 1, progress: 0, done: false, counted: false, isRunLog: true },
    ],
    routines: { Sun: [], Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [] },
    customLists: { wealth: [], skills: [], knowledge: [] },
    history: {},        // date -> true if day fully completed
    runHistory: {},     // date -> km
    pointsHistory: {},  // date -> points earned
    questsDoneHistory: {},
    statSumHistory: {},
    penaltyLog: [],     // {date, reason, stat, amount}
    streak: 0,
    longestStreak: 0,
    lastResetDate: todayStr(),
    sysLog: [],         // system messages history
    sysWarned: {},      // dedupe for time warnings
  };
}

export function loadProfile(key) {
  const raw = lsGet(KEY_PROFILE + key);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return migrate(s);
  } catch { return null; }
}

export function saveProfile(key, state) {
  state.version = SCHEMA_VERSION;
  return lsSet(KEY_PROFILE + key, JSON.stringify(state));
}

export function getLastProfile() { return lsGet(KEY_LAST); }
export function setLastProfile(key) { lsSet(KEY_LAST, key); }

export function listProfiles() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(KEY_PROFILE)) out.push(k.slice(KEY_PROFILE.length));
  }
  return out;
}

export function eraseAllProfiles() {
  listProfiles().forEach(k => lsRemove(KEY_PROFILE + k));
  lsRemove(KEY_LAST);
}

function migrate(s) {
  // v1 -> v2: ensure new fields exist
  if (!s.version || s.version < 2) {
    s.version = 2;
    s.titles = s.titles || ['Lost In Dark'];
    s.skills = s.skills || [];
    s.xp = s.xp ?? 0;
    s.level = s.level ?? 1;
    s.penaltyLog = s.penaltyLog || [];
    s.sysLog = s.sysLog || [];
    s.sysWarned = s.sysWarned || {};
    if (!s.routines) s.routines = { Sun: [], Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [] };
    if (!s.customLists) s.customLists = { wealth: [], skills: [], knowledge: [] };
    if (!s.character) s.character = { name: 'Shadow', age: '25', cls: 'Assassin', title: 'Lost In Dark', avatar: null };
    // give quests stable ids
    (s.quests || []).forEach(q => { if (!q.id) q.id = uid(); });
    Object.values(s.routines).forEach(arr => arr.forEach(q => { if (!q.id) q.id = uid(); }));
  }
  return s;
}

export function exportState(state) {
  return JSON.stringify({ schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importState(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object') throw new Error('Not a backup file');
  const s = migrate(data.state || data);
  if (!s.character || !Array.isArray(s.stats)) throw new Error('Backup missing required fields');
  return s;
}

export function uid() {
  return 'q_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function todayStr(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}