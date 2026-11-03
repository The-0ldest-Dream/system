// Wealth / Skills / Knowledge lists.
import { todayStr } from './storage.js';

export function addLog(state, key, text) {
  if (!text.trim()) return null;
  state.customLists[key].push(text.trim());
  state.points += 1;
  state.pointsHistory[todayStr()] = (state.pointsHistory[todayStr()] || 0) + 1;
  return state.customLists[key].length - 1;
}

export function removeLog(state, key, idx) {
  state.customLists[key].splice(idx, 1);
}