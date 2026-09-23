import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { CreateAgentDialog } from './CreateAgentDialog';
import { AgentAvatar } from './AgentAvatar';
import { AgentDetailDrawer } from './AgentDetailDrawer';
import { SettingsAiConfig } from './SettingsAiConfig';
import { SettingsBasicInfo } from './SettingsBasicInfo';
import { initialSettingsAgents, type AgentDraft } from './settings-agents';
import { CodeMLogo } from './CodeMLogo';
import { WorkItemAskCodeM } from './WorkItemAskCodeM';
import { SettingsCodeWorkspace } from './SettingsCodeWorkspace';
import { startSettingsProRipple, type RipplePoint } from './settings-pro-ripple';
import type { Conversation } from './conversation-history';
import './settings.css';

const settingsTabs = ['基本信息', 'AI 配置', '工作项管理', '权限管理', '插件管理', '空间关联', '自动化', '智能体'];
type SettingsTab = '基本信息' | 'AI 配置' | '智能体';
const visibleSettingsTabs: SettingsTab[] = ['基本信息', 'AI 配置'];
const settingsTabPrefix = (tab: string) => tab === '基本信息' ? 'settings-basic' : tab === '智能体' ? 'settings-agents' : 'settings-ai';

function SettingsIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <img src={`/assets/settings/${name}.svg`} width={size} height={size} alt="" draggable="false" />;
}

function ProIcon({ name }: { name: string }) {
  return <img src={`/assets/settings/pro-mode/${name}.svg`} width="16" height="16" alt="" draggable="false" />;
}

function SettingsDivider({ pro = false, className = '' }: { pro?: boolean; className?: string }) {
  return <span className={`settings-divider ${className}`} aria-hidden="true"><img src={pro ? '/assets/settings/pro-mode/divider.svg' : '/assets/settings/divider.svg'} width="1" height="12" alt="" /></span>;
}

export function SettingsPage({ notify, onOpenConversation }: { notify: (message: string) => void; onOpenConversation: (conversation: Conversation) => void }) {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('基本信息');
  const [agents, setAgents] = useState(initialSettingsAgents);
  const [enabled, setEnabled] = useState(() => new Set(agents.filter(agent => agent.id !== 'radar').map(agent => agent.id)));
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [professional, setProfessional] = useState(false);
  const [professionalView, setProfessionalView] = useState('Code');
  const [codeLoaded, setCodeLoaded] = useState(false);
  const codeView = professional && professionalView === 'Code';
  const [askOpen, setAskOpen] = useState(false);
  const askTrigger = useRef<HTMLButtonElement>(null);
  const closeAsk = useCallback((restoreFocus = true) => {
    setAskOpen(false);
    if (restoreFocus) askTrigger.current?.focus({ preventScroll: true });
  }, []);
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; agentId: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const page = useRef<HTMLElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const proTrigger = useRef<HTMLLabelElement>(null);
  const rippleLayer = useRef<HTMLSpanElement>(null);
  const rippleCircle = useRef<HTMLSpanElement>(null);
  const pendingRipplePoint = useRef<RipplePoint | null>(null);
  const ripplePoint = useRef<RipplePoint | null>(null);
  const changeProfessionalMode = (checked: boolean) => {
    ripplePoint.current = checked ? pendingRipplePoint.current : null;
    pendingRipplePoint.current = null;
    if (checked) {
      setProfessionalView('Code');
      setCodeLoaded(true);
    }
    setProfessional(checked);
  };
  useLayoutEffect(() => {
    if (!professional || !toolbar.current || !proTrigger.current || !rippleLayer.current || !rippleCircle.current) return;
    return startSettingsProRipple({ header: toolbar.current, layer: rippleLayer.current, circle: rippleCircle.current, trigger: proTrigger.current, point: ripplePoint.current });
  }, [professional]);
  useLayoutEffect(() => {
    const element = toolbar.current;
    if (!element) return;
    const updateHeight = () => page.current?.style.setProperty('--settings-toolbar-height', `${element.getBoundingClientRect().height + 1}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const nextAgentId = useRef(1);
  const visibleAgents = enabledOnly ? agents.filter(agent => enabled.has(agent.id)) : agents;
  const selectedAgent = agents.find(agent => agent.id === selectedId);
  const creating = editor?.mode === 'create';
  const editingAgent = editor?.mode === 'edit' ? agents.find(agent => agent.id === editor.agentId) : undefined;
  const closeDetail = useCallback((restoreFocus = true) => {
    setSelectedId(null);
    if (restoreFocus) (detailTrigger.current?.isConnected ? detailTrigger.current : page.current)?.focus({ preventScroll: true });
  }, []);
  const toggleAgent = (id: string) => setEnabled(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const changeSettingsTab = (tab: SettingsTab) => {
    closeAsk(false); closeDetail(false);
    setSettingsTab(tab);
  };
  const createAgent = () => { closeAsk(false); closeDetail(false); setEditor({ mode: 'create' }); };
  const configureAgent = (agentId: string) => { closeAsk(false); setEditor({ mode: 'edit', agentId }); };
  const addAgent = (draft: AgentDraft) => {
    const id = `custom-agent-${nextAgentId.current++}`;
    setAgents(current => [...current, { ...draft, id }]);
    setEnabled(current => new Set([...current, id]));
    setEditor(null);
    setSettingsTab('智能体');
    notify('智能体已添加');
  };
  const saveAgent = (draft: AgentDraft) => {
    if (editor?.mode !== 'edit') return;
    setAgents(current => current.map(agent => agent.id === editor.agentId ? { ...agent, ...draft, id: agent.id } : agent));
    setEditor(null);
    notify('智能体配置已保存');
  };

  return <main className={`settings-page${professional ? ' is-pro-mode' : ''}`} aria-label="Settings" ref={page} tabIndex={-1}>
    <header className="settings-header">
      <div className="settings-header-main" ref={toolbar}>
        <span className="settings-pro-ripple" ref={rippleLayer} hidden aria-hidden="true"><span ref={rippleCircle} /></span>
        <div className="settings-title"><span className="settings-title-icon"><SettingsIcon name="settings" size={12} /></span><h1>Settings</h1></div>
        <div className="settings-header-actions">
          {professional && <>
            <div className="settings-pro-tools" role="group" aria-label="Pro Mode 工具栏">
              <div className="settings-code-views" role="group" aria-label="配置视图">
                {['Code', 'GUI', 'Split'].map(view => <button key={view} type="button" aria-pressed={professionalView === view} onClick={() => { setProfessionalView(view); if (view === 'Code') setCodeLoaded(true); }}>{view}</button>)}
              </div>
              <SettingsDivider pro className="settings-view-divider" />
              <div className="settings-pro-actions">
                <button type="button" className="settings-action settings-pro-icon" aria-label="下载配置" title="下载配置" onClick={() => notify('配置下载暂未接入')}><ProIcon name="download" /></button>
                <SettingsDivider pro />
                <button type="button" className="settings-action settings-pro-icon" aria-label="运行配置" title="运行配置" onClick={() => notify('配置运行暂未接入')}><ProIcon name="run" /></button>
                <SettingsDivider pro />
                <button type="button" className="settings-action settings-publish" onClick={() => notify('配置发布暂未接入')}><ProIcon name="publish" /><span>Publish</span></button>
              </div>
            </div>
            <SettingsDivider pro className="settings-pro-group-divider" />
          </>}
          <div className="settings-primary-actions">
            <label className="settings-professional" ref={proTrigger}
              onPointerDown={event => { if (event.isPrimary && event.button === 0) pendingRipplePoint.current = { x: event.clientX, y: event.clientY }; }}
              onPointerCancel={() => { pendingRipplePoint.current = null; }}
              onKeyDown={() => { pendingRipplePoint.current = null; }}
            ><input type="checkbox" checked={professional} onChange={event => changeProfessionalMode(event.target.checked)} /><span>Pro Mode</span></label>
            <div className="settings-action-group">
              <button ref={askTrigger} type="button" className="settings-action settings-ask" aria-label="Ask CodeM" title="Ask CodeM" aria-haspopup="dialog" aria-expanded={askOpen} aria-controls={askOpen ? 'settings-ask-codem' : undefined} onClick={() => setAskOpen(open => !open)}><CodeMLogo size={16} /><span>Ask CodeM</span></button>
              <SettingsDivider />
              <button type="button" className="settings-action settings-version" aria-label="Version" title="Version" onClick={() => notify('暂无操作记录')}><SettingsIcon name="history" /><span>Version</span></button>
            </div>
            <img className="settings-action-divider" src="/assets/settings/action-divider.svg" width={8} height={12} alt="" />
            <button type="button" className="settings-action settings-new" aria-label="New" aria-haspopup="dialog" aria-expanded={creating} aria-controls={creating ? 'create-agent-dialog' : undefined} onClick={createAgent}><SettingsIcon name="create" /><span>New</span></button>
          </div>
        </div>
      </div>
      {!codeView && <div className="settings-tabs" role="tablist" aria-label="空间配置分类">
        {settingsTabs.map(tab => {
          const available = tab === '智能体' || tab === 'AI 配置' || tab === '基本信息';
          const prefix = settingsTabPrefix(tab);
          return <button key={tab} hidden={tab === '智能体'} type="button" role="tab" id={available ? `${prefix}-tab` : undefined} aria-selected={tab === settingsTab} aria-controls={available ? `${prefix}-panel` : undefined}
            disabled={!available} tabIndex={tab === settingsTab ? 0 : -1} onClick={available ? () => changeSettingsTab(tab) : undefined}
            onKeyDown={available ? event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const current = Math.max(0, visibleSettingsTabs.indexOf(settingsTab));
              const index = event.key === 'Home' ? 0 : event.key === 'End' ? visibleSettingsTabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + visibleSettingsTabs.length) % visibleSettingsTabs.length;
              const next = visibleSettingsTabs[index];
              changeSettingsTab(next);
              document.getElementById(`${settingsTabPrefix(next)}-tab`)?.focus();
            } : undefined}>{tab}</button>;
        })}
      </div>}
    </header>
    {askOpen && <WorkItemAskCodeM context="settings" triggerRef={askTrigger} onClose={closeAsk} onOpenConversation={onOpenConversation} />}
    {codeLoaded && <SettingsCodeWorkspace active={codeView} notify={notify} />}
    <SettingsBasicInfo active={!codeView && settingsTab === '基本信息'} notify={notify} />
    {!codeView && settingsTab === 'AI 配置' && <SettingsAiConfig notify={notify} />}
    {!codeView && settingsTab === '智能体' && <section id="settings-agents-panel" className="settings-agents" role="tabpanel" aria-labelledby="settings-agents-tab">
      <div className="settings-toolbar">
        <div className="settings-filter" role="group" aria-label="智能体筛选">
          <button type="button" aria-pressed={!enabledOnly} onClick={() => setEnabledOnly(false)}>全部</button>
          <button type="button" aria-pressed={enabledOnly} onClick={() => setEnabledOnly(true)}>已启用</button>
        </div>
        <button type="button" className="settings-action settings-create-agent" aria-haspopup="dialog" aria-expanded={creating} aria-controls={creating ? 'create-agent-dialog' : undefined} onClick={createAgent}><SettingsIcon name="create-agent" /><span>创建智能体</span></button>
      </div>
      <div className="settings-agent-grid">
        {visibleAgents.map(agent => {
          const isEnabled = enabled.has(agent.id);
          return <article className="settings-agent-card" key={agent.id} data-settings-agent-card={agent.id} aria-labelledby={`settings-agent-${agent.id}`}>
            <button type="button" className="settings-agent-open" aria-labelledby={`settings-agent-${agent.id}`} aria-describedby={`settings-agent-description-${agent.id}`} aria-haspopup="dialog" aria-expanded={selectedId === agent.id} aria-controls={selectedId === agent.id ? 'agent-detail-drawer' : undefined} onClick={event => { closeAsk(false); detailTrigger.current = event.currentTarget; setSelectedId(agent.id); }} />
            {!isEnabled && <span className="settings-agent-badge">未启用</span>}
            <AgentAvatar className="settings-agent-avatar" src={isEnabled ? agent.avatar : '/assets/settings/radar.png'} background={isEnabled ? agent.avatarBackground : undefined} />
            <div className={`settings-agent-description${['planner', 'architect'].includes(agent.memberId) ? '' : ' settings-agent-description-offset'}`}>
              <h2 id={`settings-agent-${agent.id}`}>{agent.name}</h2><p id={`settings-agent-description-${agent.id}`}>{agent.description}</p>
            </div>
            <div className="settings-agent-actions">
              <button type="button" className={!isEnabled ? 'agent-enable-button' : undefined} aria-label={`${isEnabled ? '停用' : '启用'} ${agent.name}`} onClick={() => toggleAgent(agent.id)}>{isEnabled ? '停用' : '启用'}</button>
              <button type="button" aria-label={`配置 ${agent.name}`} aria-haspopup="dialog" aria-expanded={editingAgent?.id === agent.id} aria-controls={editingAgent?.id === agent.id ? 'create-agent-dialog' : undefined} onClick={() => configureAgent(agent.id)}>配置</button>
            </div>
          </article>;
        })}
      </div>
      {visibleAgents.length === 0 && <p className="settings-empty" role="status">暂无已启用的智能体</p>}
    </section>}
    {creating && <CreateAgentDialog key="create" onClose={() => setEditor(null)} onCreate={addAgent} />}
    {editingAgent && <CreateAgentDialog key={`edit-${editingAgent.id}`} initialValues={editingAgent} onClose={() => setEditor(null)} onSave={saveAgent} />}
    {selectedAgent && <AgentDetailDrawer key={`detail-${selectedAgent.id}`} agent={selectedAgent} enabled={enabled.has(selectedAgent.id)} suspended={editor !== null} onToggle={() => toggleAgent(selectedAgent.id)} onConfigure={() => configureAgent(selectedAgent.id)} onClose={closeDetail} />}
  </main>;
}
