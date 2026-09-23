import { useEffect, useState } from 'react';

type TextSegment = { text: string; tag?: boolean };
type NarrationStep = { id: string; kind: 'narration'; intro?: boolean; segments: TextSegment[]; characterMs: number };
export type AgentToolCall = { name: string; terminal?: boolean; detail?: string };
type ToolStep = { id: string; kind: 'tool'; terminal?: boolean; durationMs: number; pending: string; complete: string; canceled: string; calls: AgentToolCall[] };
export type ExecutionStep = NarrationStep | ToolStep;

const steps: ExecutionStep[] = [
  { id: 'context', kind: 'narration', intro: true, characterMs: 42, segments: [
    { text: '需要先获取工作项详情和相关元数据才能梳理推进情况，我来规划一下步骤。我先加载读取工作项的技能，获取这条需求的详细信息。已经加载好读取技能了，现在获取这条需求的基础信息、表单、工作流和评论。' },
  ] },
  { id: 'read-context', kind: 'tool', durationMs: 1800, pending: 'exploring 2 files', complete: 'explored 2 files', canceled: 'exploration canceled', calls: [
    { name: '读取工作项详情' }, { name: '获取表单与工作流' },
  ] },
  { id: 'workflow', kind: 'narration', characterMs: 18, segments: [
    { text: 'I’ll use the ' }, { text: 'Hatch pet', tag: true },
    { text: ' workflow for the desktop companion cartoon sprite art. I’m going to inspect the pet scripts first so the output lands in the shape Codex expects.' },
  ] },
  { id: 'inspect-scripts', kind: 'tool', durationMs: 2200, pending: 'exploring 2 files', complete: 'explored 2 files', canceled: 'exploration canceled', calls: [
    { name: '读取技能说明' }, { name: '检查执行脚本' },
  ] },
  { id: 'preparation', kind: 'narration', characterMs: 18, segments: [
    { text: 'Preparation needs Pillow, and the system ' }, { text: 'python3', tag: true },
    { text: ' in this workspace runtime now, which usually has the document/image' },
  ] },
  // Keep the last call active to represent the node's ongoing execution until stopped.
  { id: 'run-orders', kind: 'tool', terminal: true, durationMs: Infinity, pending: 'explored 2 files, running 2 orders', complete: 'explored 2 files, ran 2 orders', canceled: 'explored 2 files, orders canceled', calls: [
    { name: '读取执行配置' }, { name: '检查运行环境' },
    { name: '执行准备命令', terminal: true }, { name: '运行节点任务', terminal: true },
  ] },
];

type VisibleStep =
  | { id: string; kind: 'narration'; intro?: boolean; segments: TextSegment[] }
  | (ToolStep & { running: boolean });

export function executionDuration(steps: readonly ExecutionStep[]) {
  return steps.reduce((total, step) => total + (step.kind === 'tool' ? step.durationMs : step.segments.reduce((length, segment) => length + Array.from(segment.text).length, 0) * step.characterMs), 0);
}

export function getAgentExecutionFrame(elapsedMs: number, executionSteps: readonly ExecutionStep[] = steps) {
  const visible: VisibleStep[] = [];
  let remainingMs = Math.max(0, elapsedMs);
  let nextTickMs = 1000 - (Math.max(0, elapsedMs) % 1000);
  for (const step of executionSteps) {
    if (step.kind === 'tool') {
      const running = remainingMs < step.durationMs;
      visible.push({ ...step, running });
      if (running) {
        nextTickMs = Math.min(nextTickMs, step.durationMs - remainingMs);
        break;
      }
      remainingMs -= step.durationMs;
      continue;
    }
    const durationMs = step.segments.reduce((length, segment) => length + Array.from(segment.text).length, 0) * step.characterMs;
    let characters = Math.floor(remainingMs / step.characterMs);
    const segments = step.segments.flatMap(segment => {
      const text = Array.from(segment.text).slice(0, characters).join('');
      characters = Math.max(0, characters - Array.from(segment.text).length);
      return text ? [{ ...segment, text }] : [];
    });
    if (segments.length) visible.push({ id: step.id, kind: 'narration', intro: step.intro, segments });
    if (remainingMs < durationMs) {
      nextTickMs = Math.min(40, durationMs - remainingMs, nextTickMs);
      break;
    }
    remainingMs -= durationMs;
  }
  return { steps: visible, nextTickMs };
}

export function formatAgentWorkingTime(elapsedMs: number) {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function useWorkItemAgentExecution(executionKey: string, canceled: boolean) {
  const [run, setRun] = useState({ key: executionKey, elapsedMs: 0 });
  useEffect(() => {
    if (canceled) return;
    const startedAt = performance.now();
    setRun({ key: executionKey, elapsedMs: 0 });
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const elapsedMs = performance.now() - startedAt;
      setRun({ key: executionKey, elapsedMs });
      timer = setTimeout(tick, getAgentExecutionFrame(elapsedMs).nextTickMs);
    };
    timer = setTimeout(tick, 40);
    return () => clearTimeout(timer);
  }, [executionKey, canceled]);
  return run.key === executionKey ? run.elapsedMs : 0;
}
