import { CodeMLogo } from './CodeMLogo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import assets from './assets.json';
import { getWorkItemTitleIcon, type Application } from './work-item-navigation';
import type { WorkItem } from './work-items-data';
import { WorkItemOwnerPicker, type WorkItemOwner } from './WorkItemOwnerPicker';
import { WorkItemPlanningPicker, type WorkItemSchedule } from './WorkItemPlanningPicker';
import { defaultFinishDate, defaultReviewTeam, type WorkItemReviewTeam } from './work-item-review-data';
import { defaultReviewMembers, reviewRoleConfigs, type WorkItemReviewMembers, type WorkItemReviewRole } from './work-item-role-data';
import { getWorkItemAgent, workItemAgents, type WorkItemAgent, type WorkItemAgentAction } from './work-item-agents';
import { renderWorkItemOwnerAvatar } from './work-item-owner-avatar';
import { WorkItemAgentPanel } from './WorkItemAgentPanel';
import { WorkItemComments } from './WorkItemComments';
import type { WorkItemCommentTask } from './work-item-comment-mentions';
import { WorkItemWorkflow, type WorkItemWorkflowNode } from './WorkItemWorkflow';
import { WorkItemDATracking } from './WorkItemDATracking';
import { WorkItemInitialReviewSummary } from './WorkItemInitialReviewSummary';
import { WorkItemAskCodeM } from './WorkItemAskCodeM';
import { WorkItemWBS } from './WorkItemWBS';
import type { Conversation } from './conversation-history';
import './work-item-drawer.css';

const assetRoot = '/assets/figma/work-item-drawer/';
const agentAssetRoot = '/assets/figma/work-item-agent-summary/';
const roles = [
  { name: 'PM', color: '#0a5875' },
  { name: 'UE', color: '#9d1562' },
  { name: 'Review Committee', color: '#186010' },
  { name: 'UX Writer', color: '#7f4401' },
  { name: 'Research', color: '#2b2f36' },
];
const checks = [
  { name: 'TNS Review', done: true },
  { name: 'FE Gray', done: false },
  { name: 'Server Gray', done: false },
  { name: 'Update Manual', done: true },
  { name: 'Multi-lang', done: false },
  { name: 'DA Needed', done: false },
];

function DetailIcon({ name, size = 18 }: { name: string; size?: number }) {
  return <img src={`${assetRoot}${name}.svg`} width={size} height={size} alt="" draggable="false" />;
}

export function WorkItemDrawer({ application, item, owner, workingAgents = [], canceledAgents = [], onAgentAction, pd, schedule, reviewTeam = defaultReviewTeam, finishDate = defaultFinishDate, reviewMembers = defaultReviewMembers, onReviewMembersChange, onOwnerChange, onPDChange, onScheduleChange, onReviewTeamChange, onFinishDateChange, onClose, onContinueInChat, onOpenConversation }: {
  application: Application; item: WorkItem; onClose: (restoreFocus?: boolean) => void;
  onContinueInChat: (item: WorkItem, fieldName: string) => void;
  onOpenConversation: (conversation: Conversation) => void;
  owner?: WorkItemOwner; onOwnerChange: (owner: WorkItemOwner) => void;
  workingAgents?: readonly WorkItemAgent[];
  canceledAgents?: readonly string[];
  onAgentAction: (agentId: string, action: WorkItemAgentAction) => void;
  pd?: string; onPDChange: (value: string) => void;
  schedule?: WorkItemSchedule; onScheduleChange: (value: WorkItemSchedule) => void;
  reviewTeam?: WorkItemReviewTeam; onReviewTeamChange: (value: WorkItemReviewTeam) => void;
  finishDate?: string; onFinishDateChange: (value: string) => void;
  reviewMembers?: WorkItemReviewMembers; onReviewMembersChange: (role: WorkItemReviewRole, members: WorkItemOwner[]) => void;
}) {
  const titleIcon = getWorkItemTitleIcon(application);
  const drawerRef = useRef<HTMLElement | null>(null);
  const askTriggerRef = useRef<HTMLButtonElement | null>(null);
  const commentTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [askItemId, setAskItemId] = useState<number | null>(null);
  const [commentsItemId, setCommentsItemId] = useState<number | null>(null);
  const [agentSelection, setAgentSelection] = useState<{ itemId: number; agentId: string; source?: 'comment'; commentTask?: WorkItemCommentTask } | null>(null);
  const [agentChats, setAgentChats] = useState<Record<string, { draft: string; messages: string[] }>>({});
  const [canceledCommentTasks, setCanceledCommentTasks] = useState<Record<string, boolean>>({});
  const [workflowSelection, setWorkflowSelection] = useState<{ itemKey: string; node: WorkItemWorkflowNode } | null>(null);
  const itemKey = `${application.slug}:${item.id}`;
  const selectedWorkflowNode = workflowSelection?.itemKey === itemKey ? workflowSelection.node : 'Detail Review';
  const askOpen = askItemId === item.id;
  const commentsOpen = commentsItemId === item.id;
  const activeAgents = [...new Map([...workingAgents, owner, ...Object.values(reviewMembers).flat()].flatMap(person => {
    const agent = getWorkItemAgent(person);
    return agent ? [[agent.id, agent] as const] : [];
  })).values()];
  const assignedAgents = activeAgents.filter(agent => !agent.spaceAgent);
  // A comment can open its agent execution without assigning that agent to the workflow node.
  const selectedAgent = agentSelection?.itemId === item.id ? (agentSelection.source === 'comment' ? workItemAgents : activeAgents).find(agent => agent.id === agentSelection.agentId) : undefined;
  const selectedCommentTask = agentSelection?.source === 'comment' && selectedAgent ? agentSelection.commentTask : undefined;
  const panelAgents = selectedAgent && !activeAgents.some(agent => agent.id === selectedAgent.id) ? [...activeAgents, selectedAgent] : activeAgents;
  const agentChatKey = `${item.id}:${selectedAgent?.id ?? ''}${selectedCommentTask ? `:${selectedCommentTask.id}` : ''}`;
  const panelCanceledAgents = selectedCommentTask ? [...canceledAgents.filter(id => id !== selectedAgent?.id), ...(canceledCommentTasks[agentChatKey] ? [selectedCommentTask.agentId] : [])] : canceledAgents;
  const agentChat = agentChats[agentChatKey] ?? { draft: '', messages: [] };
  const closeAgentPanel = useCallback(() => {
    setAgentSelection(null);
    if (selectedCommentTask) {
      const trigger = commentsOpen ? drawerRef.current?.querySelector<HTMLButtonElement>(`[data-comment-task="${selectedCommentTask.id}"] .work-comment-agent-open`) : commentTriggerRef.current;
      trigger?.focus({ preventScroll: true });
      return;
    }
    if (selectedAgent) drawerRef.current?.querySelector<HTMLButtonElement>(`[data-agent-id="${selectedAgent.id}"] .work-detail-agent-open`)?.focus({ preventScroll: true });
  }, [selectedAgent, selectedCommentTask, commentsOpen]);
  useEffect(() => {
    if (agentSelection && !selectedAgent) setAgentSelection(null);
  }, [agentSelection, selectedAgent]);
  const handleAgentAction = (agentId: string, action: WorkItemAgentAction) => {
    if (action === 'cancel' && selectedAgent?.id === agentId) setAgentSelection(null);
    onAgentAction(agentId, action);
  };
  const handlePanelAgentAction = (agentId: string, action: WorkItemAgentAction) => {
    if (selectedCommentTask?.agentId === agentId) {
      setCanceledCommentTasks(current => ({ ...current, [agentChatKey]: action === 'stop' }));
      if (action === 'cancel') closeAgentPanel();
    } else handleAgentAction(agentId, action);
  };
  const closeAsk = useCallback((restoreFocus = true) => {
    setAskItemId(null);
    if (restoreFocus) askTriggerRef.current?.focus({ preventScroll: true });
  }, []);
  const closeComments = useCallback((restoreFocus = true) => {
    setCommentsItemId(null);
    if (restoreFocus) commentTriggerRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    drawerRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (commentsOpen) { closeComments(); return; }
      if (askOpen) { closeAsk(); return; }
      if (selectedAgent) { closeAgentPanel(); return; }
      onClose();
    };
    const onOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || drawerRef.current?.contains(target)) return;
      const element = target instanceof Element ? target : target.parentElement;
      if (element?.closest('[data-work-item-layer]')?.getAttribute('data-work-item-layer') === String(item.id)) return;
      // Let table rows replace the selected item without closing and reopening the drawer.
      if (element?.closest('[data-work-item-row]')) return;
      onClose(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onOutsidePointerDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onOutsidePointerDown, { capture: true });
    };
  }, [onClose, askOpen, closeAsk, commentsOpen, closeComments, item.id, selectedAgent, closeAgentPanel]);

  // Non-modal: the visible table stays available for selecting another work item.
  return <aside ref={drawerRef} id="work-item-detail" className={`work-detail${selectedAgent ? ' has-agent-panel' : ''}`} role="dialog" aria-labelledby="work-detail-title" tabIndex={-1}>
    {commentsOpen && <div className="work-detail-comments-fade" aria-hidden="true" />}
    {selectedAgent && createPortal(<WorkItemAgentPanel key={selectedCommentTask?.id ?? 'workflow'} item={item} agent={selectedAgent} agents={panelAgents} canceledAgents={panelCanceledAgents} draft={agentChat.draft} messages={agentChat.messages} onDraftChange={draft => {
      setAgentChats(current => ({ ...current, [agentChatKey]: { ...(current[agentChatKey] ?? { messages: [] }), draft } }));
    }} onSubmit={() => {
      if (!agentChat.draft.trim()) return;
      setAgentChats(current => ({ ...current, [agentChatKey]: { draft: '', messages: [...(current[agentChatKey]?.messages ?? []), agentChat.draft.trim()] } }));
      handlePanelAgentAction(selectedAgent.id, 'rerun');
    }} onSelect={agent => setAgentSelection(selectedCommentTask?.agentId === agent.id ? agentSelection : { itemId: item.id, agentId: agent.id })} onAgentAction={handlePanelAgentAction} onClose={closeAgentPanel} />, document.body)}
    <header className="work-detail-header">
      <div className="work-detail-heading">
        <span className="work-view-glyph" style={{ background: titleIcon.color }}>
          <img src={assets[titleIcon.icon]} width="12" height="12" alt="" draggable="false" />
        </span>
        <h2 id="work-detail-title" title={item.title}>{item.title}</h2>
        <span className="work-detail-processing">Processing</span>
        <button type="button" className="work-detail-pin" aria-label="置顶工作项" title="置顶工作项"><img src="/assets/figma/work-items/pin.svg" width="18" height="18" alt="" /></button>
      </div>
      <div className="work-detail-actions">
        <div className="work-detail-action-group">
          <button ref={askTriggerRef} type="button" className="work-detail-ask" aria-haspopup="dialog" aria-expanded={askOpen} aria-controls={askOpen ? 'work-item-ask-codem' : undefined} onClick={() => { setCommentsItemId(null); setAskItemId(askOpen ? null : item.id); }}><CodeMLogo size={16} />Ask CodeM</button>
          <button ref={commentTriggerRef} type="button" className="work-detail-comment" aria-label="工作项评论" title="评论" aria-haspopup="dialog" aria-expanded={commentsOpen} aria-controls={commentsOpen ? 'work-item-comments' : undefined} onClick={() => { setAskItemId(null); setCommentsItemId(commentsOpen ? null : item.id); }}><DetailIcon name="comment" size={16} /></button>
          <button type="button" aria-label="工作项讨论" title="讨论"><DetailIcon name="chat" size={16} /></button>
          <button type="button" aria-label="收藏工作项" title="收藏"><DetailIcon name="bookmark" /></button>
          <button type="button" aria-label="工作项链接" title="链接"><DetailIcon name="link" /></button>
          <button type="button" aria-label="更多工作项操作" title="更多"><img src="/assets/figma/work-items/more.svg" width="18" height="18" alt="" /></button>
        </div>
        <button type="button" className="work-detail-close" aria-label="关闭工作项详情" title="关闭 (Esc)" onClick={() => onClose()}><DetailIcon name="close" /></button>
      </div>
    </header>
    {askOpen && <WorkItemAskCodeM key={`ask-${item.id}`} application={application} item={item} triggerRef={askTriggerRef} onClose={closeAsk} onOpenConversation={onOpenConversation} />}
    <WorkItemComments key={`comments-${item.id}`} open={commentsOpen} drawerRef={drawerRef} triggerRef={commentTriggerRef} selectedTaskId={selectedCommentTask?.id} onOpenAgent={task => {
      setAskItemId(null);
      setAgentSelection({ itemId: item.id, agentId: task.agentId, source: 'comment', commentTask: task });
    }} onClose={closeComments} />
    <div className="work-detail-scroll" key={item.id}>
      <div className="work-detail-roles" aria-label="工作项角色">
        {roles.map(role => <span key={role.name} className="work-detail-role" style={{ color: role.color }}>{role.name}</span>)}
        <button type="button" className="work-detail-role-add" aria-label="添加工作项角色"><DetailIcon name="role-add" size={24} /></button>
      </div>
      <div className="work-detail-checks">
        <div className="work-detail-check-list" aria-label="流程检查项">
          {checks.map(check => <span key={check.name} className={`work-detail-check${check.done ? ' is-done' : ''}`}>
            <DetailIcon name={check.done ? 'check-done' : 'check-empty'} size={16} />{check.name}
          </span>)}
        </div>
        <button type="button" className="work-detail-check-settings" aria-label="检查项设置"><DetailIcon name="checklist" /></button>
      </div>
      <WorkItemWorkflow selectedNode={selectedWorkflowNode} onSelectNode={node => {
        if (node === selectedWorkflowNode) return;
        setWorkflowSelection({ itemKey, node });
        setAskItemId(null);
        setCommentsItemId(null);
        setAgentSelection(null);
      }} />
      {selectedWorkflowNode === 'DA Tracking' ? <WorkItemDATracking key={itemKey} /> : <section id="work-detail-node-card" className="work-detail-review" aria-labelledby="work-detail-review-title">
        <header className="work-detail-review-header">
          <DetailIcon name="collapse" size={16} />
          {selectedWorkflowNode === 'Initial Review' ? <img src="/assets/figma/work-item-workflow/completed.svg" width="16" height="16" alt="" draggable="false" /> : <DetailIcon name="review-status" size={16} />}
          <h3 id="work-detail-review-title">{selectedWorkflowNode}</h3>
          <button type="button" aria-label="更多评审操作"><DetailIcon name="review-more" size={16} /></button>
        </header>
        <div className="work-detail-summary-wrap">
          {selectedWorkflowNode === 'Initial Review' ? <WorkItemInitialReviewSummary key={itemKey} /> : <div className={`work-detail-summary${activeAgents.length ? ' work-detail-summary-agents' : ''}`}>
            {activeAgents.length ? <div className="work-detail-summary-label work-detail-summary-owner">Owner</div>
              : <label htmlFor="work-item-owner" className="work-detail-summary-label work-detail-summary-owner">Owner</label>}
            {activeAgents.length ? <div className="work-detail-agent-body">
              {assignedAgents.length > 0 && <div className="work-detail-agent-assigner">
                <span className="work-detail-assigned-by"><span className="work-detail-assigner-person"><img src={`${agentAssetRoot}mei.png`} width="20" height="20" alt="" draggable="false" />Mei</span><span>已分配给智能体</span></span>
              </div>}
              <ul className="work-detail-agent-list" aria-label="节点 Agent 执行状态" aria-live="polite" aria-relevant="all">
                {activeAgents.map(agent => {
                  const canceled = canceledAgents.includes(agent.id);
                  return <li key={agent.id} className="work-detail-agent-row" data-agent-id={agent.id} data-space-agent={Boolean(agent.spaceAgent) || undefined} data-branch-end={assignedAgents.at(-1)?.id === agent.id || undefined} data-status={canceled ? 'canceled' : 'working'} data-selected={selectedAgent?.id === agent.id || undefined}>
                  <button type="button" className="work-detail-agent-open" aria-label={`打开 ${agent.name} 执行侧栏`} aria-haspopup="dialog" aria-expanded={selectedAgent?.id === agent.id} aria-controls={selectedAgent?.id === agent.id ? 'work-item-agent-panel' : undefined} onClick={() => { setCommentsItemId(null); setAskItemId(null); setAgentSelection({ itemId: item.id, agentId: agent.id }); }} />
                  {!agent.spaceAgent && <span className="work-detail-agent-branch" aria-hidden="true"><img src={`${agentAssetRoot}branch.svg`} width="11.0693" height="52.5112" alt="" draggable="false" /></span>}
                  {agent.id === 'agent-codem' ? <span className="work-detail-agent-codem"><img src={`${agentAssetRoot}codem-logo.svg`} width="9.66175" height="7.86759" alt="" draggable="false" /></span>
                    : renderWorkItemOwnerAvatar(agent, 18, 'work-detail-agent-avatar')}
                  <span className="work-detail-agent-progress"><span className="work-detail-agent-name" style={{ color: agent.color }}>{agent.name}</span><span className={canceled ? 'work-detail-agent-canceled' : 'work-detail-agent-working'}>{canceled ? 'task canceled' : 'is working...'}</span></span>
                  <div className="work-detail-agent-actions">
                    <button type="button" className={canceled ? 'work-detail-agent-rerun' : 'work-detail-agent-stop'} aria-label={`${canceled ? '重新运行' : '停止'} ${agent.name}`} title={`${canceled ? '重新运行' : '停止'} ${agent.name}`} onClick={() => handleAgentAction(agent.id, canceled ? 'rerun' : 'stop')}>
                      {canceled ? 'rerun' : <img src={`${agentAssetRoot}stop.svg`} width="16" height="16" alt="" draggable="false" />}
                    </button>
                    {canceled && <button type="button" className="work-detail-agent-cancel" aria-label={`移除 ${agent.name} 任务`} onClick={() => handleAgentAction(agent.id, 'cancel')}>remove</button>}
                  </div>
                </li>;
                })}
              </ul>
            </div> : <>
            <label htmlFor="work-item-pd" className="work-detail-summary-label">PD</label>
            <label htmlFor="work-item-schedule" className="work-detail-summary-label work-detail-schedule-label">Schedule</label>
            <div className="work-detail-summary-value work-detail-summary-owner"><WorkItemOwnerPicker key={item.id} owner={owner} onChange={onOwnerChange} drawerRef={drawerRef} onContinueInChat={() => onContinueInChat(item, 'Owner')} /></div>
            <div className="work-detail-summary-value work-detail-summary-planning"><WorkItemPlanningPicker key={`pd-${item.id}`} field="pd" onContinueInChat={() => onContinueInChat(item, 'PD')} value={pd} onChange={onPDChange} drawerRef={drawerRef} /></div>
            <div className="work-detail-summary-value work-detail-summary-planning"><WorkItemPlanningPicker key={`schedule-${item.id}`} field="schedule" onContinueInChat={() => onContinueInChat(item, 'Schedule')} value={schedule} onChange={onScheduleChange} drawerRef={drawerRef} /></div>
            <div className="work-detail-complete-wrap"><button type="button" className="work-detail-complete">Complete</button></div>
            </>}
          </div>}
        </div>
        <div className="work-detail-form">
          <div className="work-detail-form-label"><DetailIcon name="collapse" size={16} /><span>Form</span></div>
          <section className="work-detail-context" aria-labelledby="work-detail-context-title">
            <h3 id="work-detail-context-title" className="work-detail-section-title">Confirm Review Context</h3>
            <div className="work-detail-field"><label htmlFor="work-item-review-team">review team <em>*</em></label><div className="work-detail-editable-value">
              <WorkItemPlanningPicker key={`review-team-${item.id}`} field="review-team" onContinueInChat={() => onContinueInChat(item, 'review team')} value={reviewTeam} onChange={onReviewTeamChange} drawerRef={drawerRef} reviewContext={{ application: application.slug, pd, schedule }} />
            </div></div>
            <div className="work-detail-field"><label htmlFor="work-item-finish-date">estimate finish time <em>*</em></label><div className="work-detail-editable-value">
              <WorkItemPlanningPicker key={`finish-date-${item.id}`} field="finish-date" onContinueInChat={() => onContinueInChat(item, 'estimate finish time')} value={finishDate} onChange={onFinishDateChange} drawerRef={drawerRef} reviewContext={{ application: application.slug, pd, schedule }} />
            </div></div>
          </section>
          <div className="work-detail-form-divider" />
          <section className="work-detail-team" aria-labelledby="work-detail-team-title">
            <h3 id="work-detail-team-title" className="work-detail-section-title">Confirm Review Team</h3>
            <div className="work-detail-members-field">
              <span className="work-detail-members-label">Roles and members</span>
              <div className="work-detail-members">
                {(['review-owner', 'ipmt-leader', 'engineer-leader'] as const).map(role => <div className="work-detail-member" key={role}>
                  <label htmlFor={`work-item-${role}`}>{role === 'review-owner' ? 'owner' : reviewRoleConfigs[role].label}</label>
                  <div className="work-detail-member-editor"><WorkItemOwnerPicker key={`${role}-${item.id}`} role={role} onContinueInChat={() => onContinueInChat(item, role === 'review-owner' ? 'owner' : reviewRoleConfigs[role].label)} members={reviewMembers[role]} onChange={members => onReviewMembersChange(role, members)} drawerRef={drawerRef} /></div>
                </div>)}
                <button type="button" className="work-detail-add-role">Add role</button>
              </div>
            </div>
          </section>
        </div>
      </section>}
      <WorkItemWBS application={application} item={item} onOpenConversation={onOpenConversation} />
    </div>
  </aside>;
}
