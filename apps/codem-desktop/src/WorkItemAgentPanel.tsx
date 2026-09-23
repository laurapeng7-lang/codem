import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WorkItem } from './work-items-data';
import type { WorkItemAgent, WorkItemAgentAction } from './work-item-agents';
import { renderWorkItemOwnerAvatar } from './work-item-owner-avatar';
import { formatAgentWorkingTime, getAgentExecutionFrame, useWorkItemAgentExecution } from './work-item-agent-execution';
import { ExecutionLog } from './ExecutionLog';
import './work-item-agent-panel.css';

const assetRoot = '/assets/figma/work-item-agent-panel/';
function PanelIcon({ name, size }: { name: string; size: number }) {
  return <img src={`${assetRoot}${name}.svg`} width={size} height={size} alt="" draggable="false" />;
}

export function WorkItemAgentPanel({ item, agent, agents, canceledAgents, draft, messages, onDraftChange, onSubmit, onSelect, onAgentAction, onClose }: {
  item: WorkItem;
  agent: WorkItemAgent;
  agents: readonly WorkItemAgent[];
  canceledAgents: readonly string[];
  draft: string;
  messages: readonly string[];
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onSelect: (agent: WorkItemAgent) => void;
  onAgentAction: (agentId: string, action: WorkItemAgentAction) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followOutputRef = useRef(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const canceled = canceledAgents.includes(agent.id);
  const elapsedMs = useWorkItemAgentExecution(`${item.id}:${agent.id}`, canceled);
  const execution = getAgentExecutionFrame(elapsedMs);
  const canSend = Boolean(draft.trim());
  const placeholder = `告诉 ${agent.name} 接下来该做什么`;

  useEffect(() => { panelRef.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => { followOutputRef.current = true; }, [item.id, agent.id]);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (scroll && followOutputRef.current) scroll.scrollTop = scroll.scrollHeight;
  }, [elapsedMs, messages.length, item.id, agent.id]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const resize = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(144, Math.max(48, input.scrollHeight))}px`;
    };
    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resize();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [draft, agent.id]);

  return <aside ref={panelRef} id="work-item-agent-panel" className="work-agent-panel" data-work-item-layer={item.id} role="dialog" aria-labelledby="work-agent-panel-title" tabIndex={-1} onKeyDown={event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (menuOpen) setMenuOpen(false);
    else onClose();
  }}>
    <div className="work-agent-panel-card">
      <header className="work-agent-panel-header">
        <button type="button" className="work-agent-panel-history" aria-label="切换 Agent 执行记录" aria-expanded={menuOpen} aria-controls={menuOpen ? 'work-agent-session-menu' : undefined} onClick={() => setMenuOpen(!menuOpen)}><PanelIcon name="history" size={12} /></button>
        <div className="work-agent-panel-identity">
          {agent.id === 'agent-codem' ? <span className="work-agent-panel-avatar"><PanelIcon name="codem-logo" size={13} /></span> : renderWorkItemOwnerAvatar(agent, 24, 'work-agent-panel-avatar')}
          <h2 id="work-agent-panel-title" style={{ color: agent.color }}>{agent.name}</h2>
        </div>
        <span className="work-agent-panel-badge">Agent</span>
        <button type="button" className="work-agent-panel-close" aria-label="关闭 Agent 侧栏" onClick={onClose}><PanelIcon name="close" size={18} /></button>
        {menuOpen && <div id="work-agent-session-menu" className="work-agent-session-menu" role="group" aria-label="Agent 执行记录">
          {agents.map(value => <button type="button" key={value.id} aria-pressed={value.id === agent.id} onClick={() => { onSelect(value); setMenuOpen(false); }}><span style={{ color: value.color }}>{value.name}</span><span>{canceledAgents.includes(value.id) ? 'task canceled' : 'is working...'}</span></button>)}
        </div>}
      </header>
      <div ref={scrollRef} className="work-agent-panel-scroll" key={agent.id} onScroll={event => {
        const scroll = event.currentTarget;
        followOutputRef.current = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 48;
      }}>
        <div className="work-agent-context">
          <div className="work-agent-context-path">
            <img src={`${assetRoot}work-item.png`} width="16" height="16" alt="" draggable="false" />
            <span className="work-agent-context-title" title={item.title}>{item.title}</span>
            <PanelIcon name="breadcrumb" size={8} /><PanelIcon name="node-progress" size={16} /><span>Detail Review</span>
          </div>
          <div className="work-agent-context-assigner"><span className="work-detail-person"><img src="/assets/figma/work-item-agent-summary/mei.png" width="20" height="20" alt="" draggable="false" />Mei</span><span>于 <time dateTime="2026-07-30T16:50">2026-07-30 16:50</time> 指派</span></div>
        </div>
        <img className="work-agent-panel-divider" src={`${assetRoot}divider.svg`} height="1" alt="" draggable="false" />
        <section className="work-agent-execution" aria-label="执行记录">
          <p className="work-agent-execution-status" role={canceled ? 'status' : 'timer'} aria-live={canceled ? 'polite' : 'off'}>{canceled ? 'task canceled' : `Working ${formatAgentWorkingTime(elapsedMs)}`}</p>
          {execution.steps.map(step => step.kind === 'narration'
            ? <p key={step.id} className={step.intro ? 'work-agent-execution-intro' : 'work-agent-execution-paragraph'}>{step.segments.map((segment, index) => segment.tag ? <span key={index} className="work-agent-inline-tag">{segment.text}</span> : segment.text)}</p>
            : <ExecutionLog key={step.id} terminal={step.terminal} running={step.running && !canceled} canceled={step.running && canceled} calls={step.calls}>{step.running ? (canceled ? step.canceled : step.pending) : step.complete}</ExecutionLog>)}
          {messages.map((message, index) => <div className="work-agent-followup" key={index}><p className="work-agent-user-message">{message}</p><p>收到，我会结合「{item.title}」的 Detail Review 节点，按你的补充要求继续推进。</p></div>)}
        </section>
      </div>
      <form className="work-agent-composer" onSubmit={event => { event.preventDefault(); if (canSend) onSubmit(); }}>
        <textarea ref={inputRef} aria-label={placeholder} placeholder={placeholder} value={draft} rows={2} maxLength={2000} onChange={event => onDraftChange(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
            event.preventDefault();
            if (canSend) onSubmit();
          }
        }} />
        <div className="work-agent-composer-toolbar">
          <button type="button" className="work-agent-attachment" aria-label="添加附件" onClick={() => fileRef.current?.click()}><img src="/assets/figma/ask-codem/attachment.svg" width="16" height="16" alt="" draggable="false" /></button>
          {canSend || canceled ? <button type="submit" className="work-agent-send" aria-label="发送指令" disabled={!canSend}><img src="/assets/figma/ask-codem/send.svg" width="14" height="14" alt="" /></button>
            : <button type="button" className="work-agent-stop" aria-label={`停止 ${agent.name}`} onClick={() => onAgentAction(agent.id, 'stop')}><PanelIcon name="stop-generating" size={34} /></button>}
        </div>
        <input ref={fileRef} className="visually-hidden" type="file" multiple tabIndex={-1} aria-label="选择 Agent 附件" onChange={event => {
          const names = Array.from(event.target.files ?? []).map(file => file.name);
          if (names.length) onDraftChange(`${draft}${draft ? '\n' : ''}附件：${names.join('、')}`.slice(0, 2000));
          event.target.value = '';
        }} />
      </form>
    </div>
  </aside>;
}
