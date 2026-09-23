import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SettingsExecutionResult } from './settings-execution-result';

type ExecutionState = { status: 'running' | 'awaiting-confirmation' | 'complete' | 'stopped'; startedAt: number; elapsedMs: number; confirmedAt?: number };
const prefix = 'meego:settings-execution:v1:';
const fallback = new Map<string, ExecutionState>();
type ConfirmationContext = { scenario: string; result: SettingsExecutionResult };
type ExecutionControl = { key: string; stop: () => void; confirmation?: ConfirmationContext & { onConfirm: () => void; onCancel: () => void } };
const activeControls = new Map<string, ExecutionControl>();
const listeners = new Set<() => void>();
const conversationKey = (key: string) => key.slice(0, key.lastIndexOf(':'));
const notifyControls = () => listeners.forEach(listener => listener());
const subscribeControls = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

// Only phase transitions notify the composer; streaming ticks stay local
// to the message so the whole chat does not rerender on every character.
export function useSettingsExecutionControl(conversationId: string | null) {
  return useSyncExternalStore(subscribeControls, () => conversationId ? activeControls.get(conversationId) ?? null : null, () => null);
}

export function settingsExecutionKey(conversationId: string, messageIndex = 0) {
  return `${conversationId}:${messageIndex}`;
}

function save(key: string, state: ExecutionState) {
  try { window.localStorage.setItem(prefix + key, JSON.stringify(state)); fallback.delete(key); }
  catch { fallback.set(key, state); }
}

export function beginSettingsExecution(key: string) {
  const state: ExecutionState = { status: 'running', startedAt: Date.now(), elapsedMs: 0 };
  save(key, state);
  return state;
}

export function readSettingsExecution(key: string, durationMs: number, confirmationAtMs = durationMs): ExecutionState {
  let state: ExecutionState | undefined;
  try { state = fallback.get(key) ?? JSON.parse(window.localStorage.getItem(prefix + key) ?? 'null'); }
  catch { state = fallback.get(key); }
  if (!state || !['running', 'awaiting-confirmation', 'complete', 'stopped'].includes(state.status) || !Number.isFinite(state.startedAt) || state.startedAt < 0 || !Number.isFinite(state.elapsedMs) || state.elapsedMs < 0) {
    // Existing history and shared links render their finished transcript.
    return { status: 'complete', startedAt: 0, elapsedMs: durationMs };
  }
  if (state.status === 'complete') return { ...state, elapsedMs: durationMs };
  const confirmed = Number.isFinite(state.confirmedAt) && state.confirmedAt! >= 0;
  const limit = confirmed ? durationMs : confirmationAtMs;
  // Waiting for a person is not execution time. Only explicit confirmation
  // starts the result clock, including after navigation, reload or reduced motion.
  const clock = confirmed ? confirmationAtMs + Date.now() - state.confirmedAt! : Date.now() - state.startedAt;
  const elapsedMs = Math.min(limit, state.status === 'running' ? Math.max(state.elapsedMs, clock, 0) : state.elapsedMs);
  return { ...state, confirmedAt: confirmed ? state.confirmedAt : undefined, elapsedMs,
    status: state.status === 'running' && elapsedMs >= limit ? confirmed ? 'complete' : 'awaiting-confirmation' : state.status };
}

export function useSettingsExecution(key: string, durationMs: number, confirmationAtMs: number, context: ConfirmationContext) {
  const [version, setVersion] = useState(0);
  const [run, setRun] = useState(() => ({ key, ...readSettingsExecution(key, durationMs, confirmationAtMs) }));
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const state = run.key === key ? run : { key, ...readSettingsExecution(key, durationMs, confirmationAtMs) };
  const latest = useRef(state);
  useLayoutEffect(() => { latest.current = state; });
  const stop = useCallback(() => {
    if (latest.current.key !== key || !['running', 'awaiting-confirmation'].includes(latest.current.status)) return;
    clearTimeout(timer.current);
    const stopped = { ...latest.current, status: 'stopped' as const };
    latest.current = stopped;
    save(key, stopped); setRun(stopped); setVersion(value => value + 1);
  }, [key]);
  const confirm = useCallback(() => {
    if (latest.current.key !== key || latest.current.status !== 'awaiting-confirmation') return;
    const confirmed = { ...latest.current, status: 'running' as const, confirmedAt: Date.now(), elapsedMs: confirmationAtMs };
    latest.current = confirmed;
    save(key, confirmed); setRun(confirmed); setVersion(value => value + 1);
  }, [key, confirmationAtMs]);
  useLayoutEffect(() => {
    if (!['running', 'awaiting-confirmation'].includes(state.status)) return;
    const conversationId = conversationKey(key);
    const control: ExecutionControl = { key, stop, confirmation: state.status === 'awaiting-confirmation' ? { scenario: context.scenario, result: context.result, onConfirm: confirm, onCancel: stop } : undefined };
    const previous = activeControls.get(conversationId);
    if (previous?.key !== key) previous?.stop();
    activeControls.set(conversationId, control);
    notifyControls();
    return () => {
      if (activeControls.get(conversationId) !== control) return;
      activeControls.delete(conversationId);
      notifyControls();
    };
  }, [key, state.status, stop, confirm, context.scenario, context.result]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media?.matches ?? false);
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const initial = readSettingsExecution(key, durationMs, confirmationAtMs);
    const confirmed = initial.confirmedAt !== undefined;
    const limit = confirmed ? durationMs : confirmationAtMs;
    const finalStatus = confirmed ? 'complete' as const : 'awaiting-confirmation' as const;
    if (initial.status !== 'running' || reducedMotion) {
      const state = initial.status === 'running' ? { ...initial, status: finalStatus, elapsedMs: limit } : initial;
      latest.current = { key, ...state };
      setRun({ key, ...state });
      save(key, state);
      return;
    }
    const started = performance.now();
    let disposed = false;
    const tick = () => {
      if (disposed) return;
      const elapsedMs = Math.min(limit, initial.elapsedMs + performance.now() - started);
      const state = { ...initial, elapsedMs, status: elapsedMs >= limit ? finalStatus : 'running' as const };
      latest.current = { key, ...state };
      setRun({ key, ...state });
      if (state.status !== 'running') save(key, state);
      else timer.current = setTimeout(tick, 40);
    };
    tick();
    return () => { disposed = true; clearTimeout(timer.current); };
  }, [key, durationMs, confirmationAtMs, version, reducedMotion]);
  return {
    ...state,
    stop,
    confirm,
    restart: () => {
      clearTimeout(timer.current);
      const restarted = { key, ...beginSettingsExecution(key) };
      latest.current = restarted;
      setRun(restarted); setVersion(value => value + 1);
    },
  };
}
