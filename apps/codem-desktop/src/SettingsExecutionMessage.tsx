import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CodeMLogo } from './CodeMLogo';
import { ExecutionLog } from './ExecutionLog';
import { ReplyCompletion } from './ReplyCompletion';
import { SettingsChangeDiff } from './SettingsChangeDiff';
import type { SettingsReview } from './settings-review';
import { createSettingsExecutionPlan } from './settings-execution-plan';
import { useSettingsExecution } from './settings-chat-execution';
import { formatAgentWorkingTime, getAgentExecutionFrame } from './work-item-agent-execution';
import './settings-execution.css';

export function SettingsExecutionMessage({ prompt, previousPrompts = [], executionId, onReviewChanges }: { prompt: string; previousPrompts?: readonly string[]; executionId: string; onReviewChanges?: (review: SettingsReview) => void }) {
  const historyKey = JSON.stringify(previousPrompts);
  const plan = useMemo(() => createSettingsExecutionPlan(prompt, previousPrompts), [prompt, historyKey]);
  const execution = useSettingsExecution(executionId, plan.durationMs, plan.confirmationAtMs, plan);
  const frame = getAgentExecutionFrame(execution.elapsedMs, plan.steps);
  const running = execution.status === 'running';
  const stopped = execution.status === 'stopped';
  const complete = execution.status === 'complete';
  const waiting = execution.status === 'awaiting-confirmation';
  const resultStep = frame.steps.find(step => step.id === 'result');
  const resultSegments = resultStep?.kind === 'narration' ? resultStep.segments : [];
  const currentStep = frame.steps.at(-1);
  const progressLabel = currentStep?.id === 'result' ? '正在整理分析结果' : currentStep?.kind === 'tool' ? currentStep.pending : '正在分析空间配置';
  const root = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  useEffect(() => {
    const scroll = root.current?.closest<HTMLElement>('.chat-scroll');
    if (!scroll) return;
    const onScroll = () => { followOutput.current = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 64; };
    scroll.addEventListener('scroll', onScroll, { passive: true });
    return () => scroll.removeEventListener('scroll', onScroll);
  }, [executionId]);
  useLayoutEffect(() => {
    const scroll = root.current?.closest<HTMLElement>('.chat-scroll');
    if (scroll && followOutput.current && execution.elapsedMs > 0) scroll.scrollTop = scroll.scrollHeight;
  }, [execution.elapsedMs]);

  const transcript = <div className="settings-execution-transcript" aria-label="空间配置执行过程" aria-busy={running}>
    {frame.steps.filter(step => step.id !== 'result').map(step => step.kind === 'tool'
      ? <ExecutionLog key={step.id} running={step.running && running} canceled={step.running && stopped} calls={step.calls}>{step.running ? stopped ? step.canceled : step.pending : step.complete}</ExecutionLog>
      : <p key={step.id} className="settings-execution-narration">{step.segments.map(segment => segment.text).join('')}</p>)}
  </div>;

  return <div ref={root} className="settings-chat-execution" data-execution-state={execution.status}>
    <p className="visually-hidden" role="status">{running ? progressLabel : waiting ? '等待确认，确认后生成最终回复' : stopped ? '已停止生成' : '配置分析已完成'}</p>
    {complete ? <ReplyCompletion durationSeconds={Math.ceil(plan.durationMs / 1000)}>{transcript}</ReplyCompletion> : <div className="settings-execution-status">
      {running && <CodeMLogo size={20} />}
      <p role={running ? 'timer' : 'status'} aria-live={running ? 'off' : 'polite'}>{stopped ? '已停止' : waiting ? '等待确认' : 'Working'} {formatAgentWorkingTime(execution.elapsedMs)}</p>
      {stopped && <button type="button" className="settings-execution-retry" onClick={execution.restart}>重新执行</button>}
    </div>}
    {!complete && transcript}
    {resultSegments.length > 0 && <section className="settings-execution-result" aria-label="最终回复">
      <h3>{resultSegments[0].text}</h3>
      {resultSegments.length > 1 && <ul>{resultSegments.slice(1, plan.result.bullets.length + 1).map((segment, index) => <li key={index}>{segment.text}</li>)}</ul>}
      {resultSegments[plan.result.bullets.length + 1] && <p>{resultSegments[plan.result.bullets.length + 1].text}</p>}
    </section>}
    {complete && <SettingsChangeDiff key={`${executionId}:${execution.startedAt}`} executionId={`${executionId}:${execution.startedAt}`} result={plan.result} onReviewChanges={onReviewChanges} />}
  </div>;
}
