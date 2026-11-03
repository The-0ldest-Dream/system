// Stats, XP, levels, ranks, titles.
export const MAX_STAT = 100;
export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
export const STAT_KEYS = ['STRENGTH', 'WEALTH', 'SKILLS', 'KNOWLEDGE', 'AGILITY'];

// XP needed to reach level n (cumulative). Gentle curve, gets steeper.
export function xpForLevel(n) { return Math.floor(50 * Math.pow(n, 1.6)); }

export function levelFromXp(xp) {
  let lvl = 1;
  while (lvl < 999 && xp >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}

export function xpProgress(xp) {
  const lvl = levelFromXp(xp);
  const floor = xpForLevel(lvl);
  const ceil = xpForLevel(lvl + 1);
  const into = xp - floor;
  const need = ceil - floor;
  return { level: lvl, into, need, pct: Math.min(100, Math.round(into / need * 100)) };
}

// Titles unlocked by milestones
export const TITLE_UNLOCKS = [
  { id: 'Lost In Dark',  req: () => true,                                    desc: 'Your beginning.' },
  { id: 'Awakened',      req: s => s.level >= 5,                             desc: 'Reach level 5.' },
  { id: 'Daily Hunter',  req: s => s.streak >= 7,                            desc: 'Hold a 7-day streak.' },
  { id: 'Iron Will',     req: s => s.streak >= 30,                           desc: 'Hold a 30-day streak.' },
  { id: 'Unbroken',      req: s => s.longestStreak >= 100,                   desc: 'Best streak of 100 days.' },
  { id: 'The Obsessed',  req: s => s.quests.filter(q => q.counted).length >= 500, desc: 'Complete 500 quests.' },
  { id: 'Ascendant',     req: s => s.rank >= 4,                              desc: 'Reach rank A.' },
  { id: 'Sovereign',     req: s => s.rank >= 6,                              desc: 'Reach rank SS.' },
  { id: 'Monarch',       req: s => s.rank >= 7,                              desc: 'Reach rank SSS.' },
];

// Skills unlocked by milestones
export const SKILL_UNLOCKS = [
  { id: 'Endurance',    req: s => s.stats.find(x => x.axis === 'AGILITY')?.value >= 25,  desc: 'Agility reaches 25.' },
  { id: 'Might',        req: s => s.stats.find(x => x.axis === 'STRENGTH')?.value >= 25, desc: 'Strength reaches 25.' },
  { id: 'Insight',      req: s => s.stats.find(x => x.axis === 'KNOWLEDGE')?.value >= 25, desc: 'Knowledge reaches 25.' },
  { id: 'Fortune',      req: s => s.stats.find(x => x.axis === 'WEALTH')?.value >= 25,  desc: 'Wealth reaches 25.' },
  { id: 'Precision',    req: s => s.stats.find(x => x.axis === 'SKILLS')?.value >= 25,  desc: 'Skills reach 25.' },
  { id: 'Second Wind',  req: s => s.rank >= 2,                                           desc: 'Reach rank C.' },
  { id: 'Shadow Step',  req: s => s.rank >= 4,                                           desc: 'Reach rank A.' },
  { id: 'Ruler',        req: s => s.rank >= 6,                                           desc: 'Reach rank SS.' },
];

export function statTotal(stats) { return stats.reduce((a, b) => a + b.value, 0); }

export function rankFor(v) {
  if (v >= 75) return 'LEGENDARY';
  if (v >= 50) return 'HEROIC';
  if (v >= 25) return 'RARE';
  return 'NORMAL';
}

// Returns array of newly unlocked title/skill ids (for showing alerts)
export function checkUnlocks(state) {
  const newly = { titles: [], skills: [] };
  for (const t of TITLE_UNLOCKS) {
    if (!state.titles.includes(t.id) && t.req(state)) { state.titles.push(t.id); newly.titles.push(t); }
  }
  for (const sk of SKILL_UNLOCKS) {
    if (!state.skills.includes(sk.id) && sk.req(state)) { state.skills.push(sk.id); newly.skills.push(sk); }
  }
  return newly;
}

// Rank progression: rank up when stat sum reaches 100*5 = 500 (all 5 at 100).
// Each rank up clears stats to 0 and gives 10 fresh points, except SSS which caps.
export function tryRankUp(state) {
  const allMax = state.stats.every(s => s.value >= MAX_STAT);
  if (!allMax || state.rankMaxed) {
    if (!allMax) state.rankMaxed = false;
    return null;
  }
  const prev = state.rank;
  state.rank = Math.min(state.rank + 1, RANKS.length - 1);
  state.rankMaxed = true;
  if (state.rank !== prev) {
    if (state.rank < RANKS.length - 1) {
      state.stats.forEach(s => { s.value = 0; });
      state.points = 10;
      state.rankMaxed = false;
    }
    return RANKS[state.rank];
  }
  return null;
}