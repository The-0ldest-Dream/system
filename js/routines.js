// Weekly routines: per-day task lists, reset each week.
import { uid } from './storage.js';
import { isRunning, categoryToStat, completeQuest, recalcToday } from './quests.js';
import { checkUnlocks, tryRankUp } from './stats.js';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function addRoutineItem(state, day, { name, target, unit, category, boss }) {
  const item = {
    id: uid(), name, target, unit, category: category || 'General', boss: !!boss,
    done: false, counted: false, isRunLog: isRunning(name),
  };
  state.routines[day].push(item);
  return item;
}

export function removeRoutineItem(state, day, id) {
  state.routines[day] = state.routines[day].filter(x => x.id !== id);
}

export function toggleRoutineItem(state, day, id) {
  const item = state.routines[day].find(x => x.id === id);
  if (!item) return {};
  if (!item.done) {
    item.done = true;
    // Reuse quest completion logic
    const q = { ...item, boss: item.boss };
    const result = completeQuest(state, q);
    item.counted = true;
    recalcToday(state);
    return result;
  } else {
    item.done = false;
    item.counted = false;
    recalcToday(state);
    return {};
  }
}