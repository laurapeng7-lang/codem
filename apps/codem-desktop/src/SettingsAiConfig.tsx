import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { SettingsSwitch } from './SettingsSwitch';
import { SettingsAiAuthorization } from './SettingsAiAuthorization';
import { AgentAvatar } from './AgentAvatar';
import { AgentAvatarChoices } from './AgentAvatarChoices';
import { AgentDetailDrawer } from './AgentDetailDrawer';
import { renderAgentSource } from './agent-source';
import { draftForMember } from './settings-agents';
import { spaceAgentSources, loadSettingsAiPreferences, saveSettingsAiPreferences, type SettingsAiPreferences, type SettingsSpaceAgent } from './settings-ai';
import { useWorkItemTableMenu } from './useWorkItemTableMenu';
import './create-agent-dialog.css';
import './settings-ai.css';

const options = [
  { key: 'workSuggestions', title: '启用AI工作建议', description: '开启后，空间内项目启动且未填写流程信息时，AI 助手将主动为参与人提供工作建议，例如：建议节点负责人、排期、估分、拆解子任务。' },
  { key: 'independentTasks', title: '支持智能体在本空间内独立执行任务', description: '开启后，支持在本空间内使用智能体能力，支持将工作分配给智能体。' },
] as const;
type AgentPanel = { kind: 'space' | 'avatar' | 'menu'; agentId: string; trigger: HTMLButtonElement; width: number };
const panelIds = { space: 'settings-ai-space-options', avatar: 'settings-ai-avatar-options', menu: 'settings-ai-agent-menu' };

type AgentEdit = { agent: SettingsSpaceAgent; surface: 'row' | 'drawer' };

export function SettingsAiConfig({ notify }: { notify: (message: string) => void }) {
  const [settings, setSettings] = useState(loadSettingsAiPreferences);
  const [edit, setEdit] = useState<AgentEdit | null>(null);
  const editingId = edit?.surface === 'row' ? edit.agent.id : null;
  const canConfirm = !!edit?.agent.name.trim() && !!edit.agent.spaceId;
  const visibleAgents = edit?.surface === 'row' && !settings.agents.some(agent => agent.id === edit.agent.id) ? [...settings.agents, edit.agent] : settings.agents;
  const [detailId, setDetailId] = useState<string | null>(null);
  const [panel, setPanel] = useState<AgentPanel | null>(null);
  const [activeSpace, setActiveSpace] = useState(0);
  const editingNameInput = useRef<HTMLInputElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const restoreRowFocus = useRef<string | null>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const anchorRef = useMemo(() => ({ current: panel?.trigger ?? null }), [panel?.trigger]);
  const selectedAgent = edit?.agent.id === panel?.agentId ? edit?.agent : settings.agents.find(agent => agent.id === panel?.agentId);
  const selectedEnabled = selectedAgent ? !settings.disabledAgents.includes(selectedAgent.id) : false;
  const detailAgent = settings.agents.find(agent => agent.id === detailId);
  const position = useWorkItemTableMenu({ open: !!selectedAgent, anchorRef, menuRef: popupRef, width: panel?.width ?? 164,
    height: panel?.kind === 'avatar' ? 180 : panel?.kind === 'space' ? spaceAgentSources.length * 38 + 8 : 104,
    scrollContainerSelector: edit?.surface === 'drawer' ? '.agent-detail-scroll' : '.settings-ai-panel', onClose: () => setPanel(null) });
  useLayoutEffect(() => {
    if (panel?.kind === 'menu') popupRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    if (panel?.kind === 'avatar') popupRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }, [panel]);
  useLayoutEffect(() => {
    if (panel?.kind === 'space') popupRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [panel, activeSpace]);
  useLayoutEffect(() => {
    if (editingId) editingNameInput.current?.focus();
    else if (restoreRowFocus.current) {
      (document.getElementById(restoreRowFocus.current) ?? addTrigger.current)?.focus({ preventScroll: true });
      restoreRowFocus.current = null;
    }
  }, [editingId]);
  const closeDetail = useCallback((restoreFocus = true) => {
    setDetailId(null);
    setEdit(current => current?.surface === 'drawer' ? null : current);
    setPanel(null);
    if (restoreFocus) (detailTrigger.current?.isConnected ? detailTrigger.current : addTrigger.current)?.focus({ preventScroll: true });
  }, []);
  const save = (next: SettingsAiPreferences) => {
    setSettings(next);
    if (!saveSettingsAiPreferences(next)) notify('设置已更新，但无法保存，刷新后可能丢失');
  };
  const closePanel = (restoreFocus = true) => { setPanel(null); if (restoreFocus) panel?.trigger.focus({ preventScroll: true }); };
  const updateAgent = (id: string, changes: Partial<Omit<SettingsSpaceAgent, 'id'>>) => {
    setEdit(current => current?.agent.id === id ? { ...current, agent: { ...current.agent, ...changes } } : current);
  };
  const toggleAgent = (id: string) => save({ ...settings, disabledAgents: settings.disabledAgents.includes(id) ? settings.disabledAgents.filter(value => value !== id) : [...settings.disabledAgents, id] });
  const beginEditing = (id: string, surface: AgentEdit['surface'] = 'row') => {
    if (edit) return;
    const agent = settings.agents.find(agent => agent.id === id);
    if (!agent) return;
    setPanel(null);
    if (surface === 'row') closeDetail(false);
    setEdit({ agent: { ...agent }, surface });
  };
  const finishEditing = (confirm: boolean) => {
    if (!edit || (confirm && !canConfirm)) return;
    if (confirm) {
      const agent = { ...edit.agent, name: edit.agent.name.trim() };
      save({ ...settings, agents: settings.agents.some(item => item.id === agent.id) ? settings.agents.map(item => item.id === agent.id ? agent : item) : [...settings.agents, agent] });
    }
    if (edit.surface === 'row') restoreRowFocus.current = `settings-ai-more-${edit.agent.id}`;
    setPanel(null);
    setEdit(null);
  };
  const openDetail = (id: string, trigger: HTMLElement) => {
    if (edit) return;
    setPanel(null);
    detailTrigger.current = trigger;
    setDetailId(id);
  };
  const openPanel = (kind: AgentPanel['kind'], agent: SettingsSpaceAgent, trigger: HTMLButtonElement) => {
    if (kind === 'menu') closeDetail(false);
    if (kind === 'space') setActiveSpace(Math.max(0, spaceAgentSources.findIndex(space => space.id === agent.spaceId)));
    setPanel({ kind, agentId: agent.id, trigger, width: kind === 'space' ? Math.max(240, trigger.getBoundingClientRect().width || 320) : kind === 'avatar' ? 336 : 164 });
  };
  const togglePanel = (kind: AgentPanel['kind'], agent: SettingsSpaceAgent, trigger: HTMLButtonElement) => {
    if (panel?.kind === kind && panel.agentId === agent.id) closePanel(); else openPanel(kind, agent, trigger);
  };
  const chooseSpace = (agentId: string, index: number) => {
    updateAgent(agentId, { spaceId: spaceAgentSources[index].id });
    closePanel();
  };
  const spaceKeyDown = (event: KeyboardEvent<HTMLButtonElement>, agent: SettingsSpaceAgent) => {
    const open = panel?.kind === 'space' && panel.agentId === agent.id;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) openPanel('space', agent, event.currentTarget);
      const current = open ? activeSpace : Math.max(0, spaceAgentSources.findIndex(space => space.id === agent.spaceId));
      setActiveSpace(event.key === 'Home' ? 0 : event.key === 'End' ? spaceAgentSources.length - 1 : open ? (current + (event.key === 'ArrowDown' ? 1 : -1) + spaceAgentSources.length) % spaceAgentSources.length : current);
    } else if (open && ['Enter', ' '].includes(event.key)) { event.preventDefault(); chooseSpace(agent.id, activeSpace); }
    else if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePanel(); }
    else if (open && event.key === 'Tab') closePanel(false);
  };
  const addAgent = () => {
    if (edit) return;
    closeDetail(false);
    setEdit({ agent: { id: `space-agent-${crypto.randomUUID()}`, name: '', spaceId: null, memberId: 'reviewer' }, surface: 'row' });
  };
  const removeAgent = () => {
    if (!selectedAgent) return;
    const index = settings.agents.findIndex(agent => agent.id === selectedAgent.id);
    const agents = settings.agents.filter(agent => agent.id !== selectedAgent.id);
    const next = agents[Math.min(index, agents.length - 1)];
    setPanel(null);
    if (detailId === selectedAgent.id) closeDetail(false);
    save({ ...settings, agents, disabledAgents: settings.disabledAgents.filter(id => id !== selectedAgent.id) });
    (next ? document.getElementById(`settings-ai-more-${next.id}`) : addTrigger.current)?.focus({ preventScroll: true });
  };

  const avatarField = (agent: SettingsSpaceAgent, size: number) => {
    const open = panel?.kind === 'avatar' && panel.agentId === agent.id;
    return <button type="button" className="settings-ai-avatar-trigger" style={{ width: size, height: size, flexBasis: size }} aria-label={`编辑 ${agent.name.trim() || '未命名智能体'} 头像`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelIds.avatar : undefined} onClick={event => togglePanel('avatar', agent, event.currentTarget)}>
      <AgentAvatar src={draftForMember(agent.memberId).avatar} background={agent.avatarBackground} size={size} />
    </button>;
  };
  const sourceField = (agent: SettingsSpaceAgent, label: string) => {
    const source = spaceAgentSources.find(space => space.id === agent.spaceId);
    const open = panel?.kind === 'space' && panel.agentId === agent.id;
    return <button type="button" className={`settings-ai-source${source ? '' : ' is-placeholder'}`} role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? panelIds.space : undefined} aria-activedescendant={open ? `settings-ai-space-option-${activeSpace}` : undefined} title={source ? `CodeM·${source.name}` : '选择 CodeM 空间'} onClick={event => togglePanel('space', agent, event.currentTarget)} onKeyDown={event => spaceKeyDown(event, agent)}>
      {renderAgentSource(agent.spaceId)}<img src="/assets/settings/create-agent/chevron-down.svg" width="16" height="16" alt="" />
    </button>;
  };

  return <section className="settings-ai-panel" id="settings-ai-panel" role="tabpanel" aria-labelledby="settings-ai-tab">
    <div className="settings-ai-content" inert={edit?.surface === 'drawer'}>
      {options.map(option => <section className="settings-ai-group" key={option.key} aria-labelledby={`settings-ai-${option.key}-title`}>
        <div className="settings-ai-option">
          <div className="settings-ai-option-copy"><h3 id={`settings-ai-${option.key}-title`}>{option.title}</h3><p id={`settings-ai-${option.key}-description`}>{option.description}</p></div>
          <SettingsSwitch label={option.title} descriptionId={`settings-ai-${option.key}-description`} checked={settings[option.key]} onChange={() => save({ ...settings, [option.key]: !settings[option.key] })} />
        </div>
        {option.key === 'independentTasks' && <section className="settings-ai-agents" aria-label="本空间可用智能体">
          <div className="settings-ai-table-frame">
            <table className={`settings-ai-table${editingId ? ' is-editing' : ''}`}>
              <caption className="visually-hidden">本空间可用智能体及其来源</caption>
              <colgroup><col className="settings-ai-name-col" /><col /><col className="settings-ai-actions-col" /></colgroup>
              <thead><tr><th scope="col">名称</th><th scope="col">来源</th><th scope="col"><span className="visually-hidden">操作</span></th></tr></thead>
              <tbody>{visibleAgents.map((savedAgent, index) => {
                const agent = savedAgent.id === editingId && edit ? edit.agent : savedAgent;
                const enabled = !settings.disabledAgents.includes(agent.id);
                const source = spaceAgentSources.find(space => space.id === agent.spaceId);
                const name = agent.name.trim() || '未命名智能体';
                const editing = editingId === agent.id;
                const avatar = <AgentAvatar src={enabled ? draftForMember(agent.memberId).avatar : '/assets/settings/radar.png'} background={enabled ? agent.avatarBackground : undefined} size={40} />;
                const sourceLabel = renderAgentSource(agent.spaceId);
                const menuOpen = panel?.kind === 'menu' && panel.agentId === agent.id;
                return <tr key={agent.id} data-space-agent={agent.id} className={editing ? 'is-editing' : undefined} onClick={event => {
                  if (event.target instanceof Element && event.target.closest('button, input')) return;
                  openDetail(agent.id, document.getElementById(`settings-ai-open-${agent.id}`) ?? event.currentTarget);
                }} onKeyDown={event => {
                  if (editing && event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); finishEditing(false); }
                }}>
                  <td><div className="settings-ai-agent-name">
                    {editing ? avatarField(agent, 40) : avatar}
                    {editing ? <div className="create-agent-name settings-ai-name-field"><input ref={editingNameInput} aria-label={`第 ${index + 1} 行智能体名称`} placeholder="输入智能体名称" value={agent.name} maxLength={80} title={agent.name} onChange={event => updateAgent(agent.id, { name: event.target.value.slice(0, 80) })} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); finishEditing(true); } }} /></div> : <button type="button" id={`settings-ai-open-${agent.id}`} disabled={!!edit} className="settings-ai-name-display" title={name} aria-label={`查看 ${name}`} aria-haspopup="dialog" aria-expanded={detailId === agent.id} aria-controls={detailId === agent.id ? 'agent-detail-drawer' : undefined} onClick={event => openDetail(agent.id, event.currentTarget)}>{name}</button>}
                    {!enabled && <span className="settings-ai-disabled">已停用</span>}
                  </div></td>
                  <td>{editing ? sourceField(agent, `第 ${index + 1} 行 CodeM 空间`) : <div className={`settings-ai-source${source ? '' : ' is-placeholder'}`} title={source ? `CodeM·${source.name}` : '选择 CodeM 空间'}>{sourceLabel}</div>}</td>
                  <td>{editing ? <div className="agent-edit-actions" aria-label="编辑智能体操作">
                    <button type="button" onClick={() => finishEditing(false)}>取消</button>
                    <button type="button" className="agent-edit-confirm" disabled={!canConfirm} onClick={() => finishEditing(true)}>确认</button>
                  </div> : <button type="button" disabled={!!edit} id={`settings-ai-more-${agent.id}`} className="settings-ai-more" aria-label={`管理 ${name}`} title={`管理 ${name}`} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? panelIds.menu : undefined}
                    onClick={event => togglePanel('menu', agent, event.currentTarget)} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); openPanel('menu', agent, event.currentTarget); } }}>
                    <img src="/assets/figma/home/more.svg" width="16" height="16" alt="" />
                  </button>}</td>
                </tr>;
              })}</tbody>
            </table>
            {!visibleAgents.length && <p className="settings-ai-empty" role="status">暂无智能体，点击「添加智能体」开始配置</p>}
            <button ref={addTrigger} disabled={!!edit} type="button" className="settings-ai-agent-add" onClick={addAgent}><img src="/assets/figma/work-items/plus.svg" width="16" height="16" alt="" /><span>添加智能体</span></button>
          </div>
        </section>}
      </section>)}
      <SettingsAiAuthorization authorizedSpaces={settings.authorizedSpaces} onAuthorize={id => {
        if (!settings.authorizedSpaces.includes(id)) save({ ...settings, authorizedSpaces: [...settings.authorizedSpaces, id] });
      }} />
    </div>
    {panel && selectedAgent && createPortal(<div ref={popupRef} data-agent-profile-popup={panel.kind !== 'menu' ? true : undefined} id={panelIds[panel.kind]} className={panel.kind === 'space' ? 'create-agent-space-options settings-ai-space-options' : panel.kind === 'avatar' ? 'create-agent-avatar-options settings-ai-avatar-options' : 'settings-ai-menu'} style={{ ...position, height: panel.kind === 'avatar' ? undefined : position.height }}
      role={panel.kind === 'space' ? 'listbox' : panel.kind === 'avatar' ? 'dialog' : 'menu'} aria-label={panel.kind === 'space' ? '选择 CodeM 空间' : panel.kind === 'avatar' ? '编辑智能体头像' : `${selectedAgent.name.trim() || '未命名智能体'}的操作`}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePanel(); }
        else if (panel.kind === 'menu' && event.key === 'Tab') closePanel();
        else if (panel.kind === 'menu' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}>
      {panel.kind === 'space' ? spaceAgentSources.map((space, index) => <button key={space.id} id={`settings-ai-space-option-${index}`} type="button" role="option" className={activeSpace === index ? 'is-active' : undefined} aria-selected={selectedAgent.spaceId === space.id} tabIndex={-1} onPointerEnter={() => setActiveSpace(index)} onPointerDown={event => event.preventDefault()} onClick={() => chooseSpace(selectedAgent.id, index)}>
        {renderAgentSource(space.id)}<img src="/assets/settings/create-agent/chevron-right.svg" width="16" height="16" alt="" />
      </button>) : panel.kind === 'avatar' ? <AgentAvatarChoices memberId={selectedAgent.memberId} background={selectedAgent.avatarBackground} onMemberChange={memberId => updateAgent(selectedAgent.id, { memberId })} onBackgroundChange={avatarBackground => updateAgent(selectedAgent.id, { avatarBackground })} onClose={() => closePanel()} /> : <>
        <button type="button" role="menuitem" onClick={() => beginEditing(selectedAgent.id)}>编辑智能体</button>
        <button type="button" role="menuitem" onClick={() => {
          toggleAgent(selectedAgent.id);
          closePanel();
        }}>{selectedEnabled ? '停用' : '启用'}智能体</button>
        <button type="button" role="menuitem" className="settings-ai-remove" onClick={removeAgent}>移除智能体</button>
      </>}
    </div>, document.body)}
    {detailAgent && <AgentDetailDrawer key={detailAgent.id} agent={{ ...detailAgent, name: detailAgent.name.trim() || '未命名智能体' }} enabled={!settings.disabledAgents.includes(detailAgent.id)} onToggle={() => toggleAgent(detailAgent.id)} configureInPlace onConfigure={() => beginEditing(detailAgent.id, 'drawer')} onClose={closeDetail}
      editor={edit?.surface === 'drawer' && edit.agent.id === detailAgent.id ? {
        name: edit.agent.name, onNameChange: name => updateAgent(detailAgent.id, { name }),
        avatar: avatarField(edit.agent, 80), source: sourceField(edit.agent, '智能体来源'),
        canConfirm, onCancel: () => finishEditing(false), onConfirm: () => finishEditing(true),
      } : undefined} />}
  </section>;
}
