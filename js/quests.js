// Daily quests: checkbox, counter, timer, boss.
import { uid, todayStr } from './storage.js';
import { checkUnlocks, tryRankUp, xpForLevel } from './stats.js';

export function fmtT(s, hours) {
  s = Math.floor(s);
  const H = Math.floor(s / 3600), M = Math.floor((s % 3600) / 60), S = s % 60;
  const p = n => String(n).padStart(2, '0');
  return (hours || H) ? `${p(H)}:${p(M)}:${p(S)}` : `${p(M)}:${p(S)}`;
}

export function elapsed(q) {
  return (q.progress || 0) + (q.runStart ? (Date.now() - q.runStart) / 1000 : 0);
}

export function step(q) { return q.step || (q.target >= 50 ? 10 : q.target >= 20 ? 5 : 1); }

export function valueLabel(q) {
  if (q.mode === 'count') return `[${q.progress || 0}/${q.target}${q.unit}]`;
  if (q.mode === 'timer') return `[${fmtT(q.done ? q.target * 60 : elapsed(q))} / ${q.target} min]`;
  return `[${q.done ? q.target : 0}/${q.target}${q.unit}]`;
}

export function isRunning(name) { return /run|jog/i.test(name); }

export function categoryToStat(category) {
  if (!category) return null;
  const c = category.trim().toUpperCase();
  return ['STRENGTH', 'WEALTH', 'SKILLS', 'KNOWLEDGE', 'AGILITY'].includes(c) ? c : null;
}

export function recalcToday(state) {
  const today = todayStr();
  state.questsDoneHistory[today] = state.quests.filter(q => q.done).length;
  state.statSumHistory[today] = state.stats.reduce((a, s) => a + s.value, 0);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
  const qTotal = state.quests.filter(q => q.isRunLog && q.done).reduce((a, q) => a + (parseFloat(q.target) || 0), 0);
  const rTotal = (state.routines[day] || []).filter(q => q.isRunLog && q.done).reduce((a, q) => a + (parseFloat(q.target) || 0), 0);
  state.runHistory[today] = qTotal + rTotal;
}

// Called when a quest is marked done. Returns { gained, newTitle, newSkill, rankUp }
export function completeQuest(state, q) {
  if (q.counted) return {};
  q.counted = true;
  q.done = true;
  const isBoss = q.boss;
  const mult = isBoss ? 3 : 1;
  let gained = 0;
  const stat = q.isRunLog ? 'AGILITY' : categoryToStat(q.category);
  if (stat) {
    const s = state.stats.find(x => x.axis === stat);
    if (s) { s.value = Math.min(100, s.value + 1); gained = 1; }
    if (['WEALTH', 'SKILLS', 'KNOWLEDGE'].includes(stat)) {
      const key = stat.toLowerCase();
      state.customLists[key].push(q.name);
    }
  } else {
    state.points += mult;
    gained = mult;
  }
  if (isBoss) state.points += 2; // boss bonus
  // XP
  const xpGain = (isBoss ? 30 : 10) * mult;
  state.xp += xpGain;
  state.pointsHistory[todayStr()] = (state.pointsHistory[todayStr()] || 0) + gained;
  recalcToday(state);
  const unlocked = checkUnlocks(state);
  const rankUp = tryRankUp(state);
  return { gained, xpGain, isBoss, unlocked, rankUp };
}

export function failQuest(state, q) {
  // Penalty: drain one point from the quest's linked stat (or random stat).
  q.done = false;
  q.counted = false;
  const stat = q.isRunLog ? 'AGILITY' : categoryToStat(q.category) || 'STRENGTH';
  const s = state.stats.find(x => x.axis === stat);
  let amount = 0;
  if (s && s.value > 0) { s.value = Math.max(0, s.value - 1); amount = 1; }
  else if (state.points > 0) { state.points -= 1; amount = 1; }
  state.penaltyLog.push({ date: todayStr(), reason: q.name, stat, amount });
  state.penaltyLog = state.penaltyLog.slice(-50);
  return { stat, amount };
}

export function addQuest(state, { name, target, unit, category, mode, boss }) {
  const q = {
    id: uid(), name, target, unit, category: category || 'General', boss: !!boss,
    mode: mode || 'check', progress: 0, done: false, counted: false,
    isRunLog: isRunning(name),
  };
  if (mode === 'count') q.step = target >= 50 ? 10 : target >= 20 ? 5 : 1;
  state.quests.push(q);
  return q;
}

export function removeQuest(state, id) {
  state.quests = state.quests.filter(q => q.id !== id);
}

export function updateQuest(state, id, patch) {
  const q = state.quests.find(x => x.id === id);
  if (q) { Object.assign(q, patch); if (patch.name) q.isRunLog = isRunning(patch.name); }
}