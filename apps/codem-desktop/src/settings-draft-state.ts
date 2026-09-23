import { useSyncExternalStore } from 'react';

const discardedDrafts = new Set<string>();
const listeners = new Set<() => void>();
const storageKey = (id: string) => `meego:settings-draft-discarded:v1:${id}`;
function wasDiscarded(id: string) {
  try { return discardedDrafts.has(id) || window.localStorage.getItem(storageKey(id)) === 'true'; }
  catch { return discardedDrafts.has(id); }
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useDiscardedSettingsDraft(id: string) { return useSyncExternalStore(subscribe, () => wasDiscarded(id), () => false); }
export function discardSettingsDraft(id: string) {
  discardedDrafts.add(id);
  try { window.localStorage.setItem(storageKey(id), 'true'); } catch { /* Keep withdrawal in memory when storage is unavailable. */ }
  listeners.forEach(listener => listener());
}
