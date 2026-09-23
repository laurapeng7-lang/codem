import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AgentAvatar } from './AgentAvatar';
import type { SettingsAgent } from './settings-agents';
import type { SpaceAgentSourceId } from './settings-ai';
import { renderAgentSource } from './agent-source';
import { agentActivityColors, getAgentDetailData } from './agent-detail-data';
import './agent-detail-drawer.css';

const assetRoot = '/assets/settings/agent-detail/';

function DetailIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <img src={`${assetRoot}${name}`} width={size} height={size} alt="" draggable="false" />;
}

type AgentDetailDrawerProps = {
  agent: Pick<SettingsAgent, 'id' | 'name' | 'memberId' | 'avatarBackground'> & { spaceId?: SpaceAgentSourceId | null };
  enabled: boolean;
  suspended?: boolean;
  onToggle: () => void;
  onConfigure: () => void;
  configureInPlace?: boolean;
  editor?: {
    name: string;
    onNameChange: (name: string) => void;
    avatar: ReactNode;
    source: ReactNode;
    canConfirm: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  };
  onClose: (restoreFocus?: boolean) => void;
};

export function AgentDetailDrawer({ agent, enabled, suspended = false, onToggle, onConfigure, configureInPlace = false, editor, onClose }: AgentDetailDrawerProps) {
  const { heatmap, taskGroups } = getAgentDetailData(agent.id);
  const drawer = useRef<HTMLElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const configureButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const editing = !!editor;
  useEffect(() => {
    if (editing) nameInput.current?.focus();
    else if (wasEditing.current) configureButton.current?.focus({ preventScroll: true });
    wasEditing.current = editing;
  }, [editing]);
  useEffect(() => {
    drawer.current?.focus({ preventScroll: true });
  }, [agent.id]);
  useEffect(() => {
    if (suspended) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      if (editor) editor.onCancel(); else onClose();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || drawer.current?.contains(event.target)) return;
      if (editor || (event.target instanceof Element && event.target.closest('[data-agent-profile-popup]'))) return;
      // Selecting another card or table row replaces the current agent in the drawer.
      if (event.target instanceof Element && event.target.closest('[data-settings-agent-card], [data-space-agent]')) return;
      onClose(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
    };
  }, [onClose, suspended, editor]);

  return createPortal(<aside id="agent-detail-drawer" className="agent-detail-drawer" ref={drawer} role="dialog" aria-labelledby="agent-detail-name" tabIndex={-1}>
    <div className="agent-detail-scroll">
      <div className="agent-detail-cover" aria-hidden="true"><img src={`${assetRoot}cover.png`} alt="" draggable="false" /></div>
      <section className="agent-detail-profile" aria-label="智能体信息">
        {editor ? editor.avatar : <AgentAvatar size={80} src={`${assetRoot}avatar-${enabled ? agent.memberId : 'radar'}.png`} background={enabled ? agent.avatarBackground : undefined} alt={`${agent.name}头像`} />}
        <div className="agent-detail-info">
          <div className="agent-detail-heading">
            <h2 id="agent-detail-name" className={editor ? 'visually-hidden' : undefined}>{agent.name}</h2>
            {editor && <div className="create-agent-name agent-detail-name-field"><input ref={nameInput} aria-label="智能体名称" placeholder="输入智能体名称" value={editor.name} maxLength={80} onChange={event => editor.onNameChange(event.target.value.slice(0, 80))} onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (editor.canConfirm) editor.onConfirm(); }
            }} /></div>}
            <span className="agent-detail-badge">Agent</span>
          </div>
          <div className="agent-detail-source" role="group" aria-label="智能体来源">{editor ? editor.source : <div className="agent-detail-source-value">{renderAgentSource(agent.spaceId)}</div>}</div>
          {!editor && <div className="agent-detail-actions">
            <button type="button" className={!enabled ? 'agent-enable-button' : undefined} aria-label={`${enabled ? '停用' : '启用'} ${agent.name}`} onClick={onToggle}>{enabled ? '停用' : '启用'}</button>
            <button ref={configureButton} type="button" aria-label={`编辑 ${agent.name}`} aria-haspopup={configureInPlace ? undefined : 'dialog'} onClick={onConfigure}>编辑</button>
          </div>}
        </div>
      </section>
      <div className="agent-detail-heatmap" role="img" aria-label={`${agent.name} 活跃记录热力图`}>
        <div className="agent-detail-heatmap-grid" aria-hidden="true">{heatmap.map((color, index) => <span key={index} style={{ backgroundColor: agentActivityColors[color] }} />)}</div>
      </div>
      <section className="agent-detail-tasks" aria-labelledby="agent-detail-tasks-title">
        <h3 id="agent-detail-tasks-title">我指派的任务</h3>
        <div className="agent-detail-task-groups">{taskGroups.map(group => <section className="agent-detail-task-group" key={group.id} aria-label={group.label}>
          <div className="agent-detail-group-heading">
            <DetailIcon name={group.expanded ? 'chevron-down.svg' : 'chevron-right.svg'} size={12} />
            <DetailIcon name={group.id === 'not-started' ? 'not-started.png' : `${group.id}.svg`} />
            <span>{group.label}</span><span className="agent-detail-group-count">{group.count}</span>
          </div>
          {group.tasks.length > 0 && <ul className="agent-detail-task-list">{group.tasks.map(({ title, project }) => <li className="agent-detail-task" key={title}>
            <span className="agent-detail-task-icon"><DetailIcon name="story.svg" size={10} /></span>
            <div className="agent-detail-task-content"><div className="agent-detail-task-title"><span title={title}>{title}</span><span className="agent-detail-task-link"><DetailIcon name="task-link.svg" size={12} /></span></div><p>{project}</p></div>
          </li>)}</ul>}
        </section>)}</div>
      </section>
    </div>
    {editor ? <div className="agent-detail-edit-actions agent-edit-actions" aria-label="编辑智能体操作">
      <button type="button" onClick={editor.onCancel}>取消</button>
      <button type="button" className="agent-edit-confirm" disabled={!editor.canConfirm} onClick={editor.onConfirm}>确认</button>
    </div> : <button type="button" className="agent-detail-close" aria-label="关闭智能体详情" onClick={() => onClose()}><DetailIcon name="close.svg" size={18} /></button>}
  </aside>, document.body);
}
