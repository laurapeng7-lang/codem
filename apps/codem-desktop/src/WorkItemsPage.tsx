import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import assets from './assets.json';
import { getWorkItemTitleIcon, navigateWorkItem, subscribeWorkItemNavigation, workItemIdFromPath, type Application } from './work-item-navigation';
import { getWorkItemView, workItemViews } from './work-items-data';
import { WorkItemDrawer } from './WorkItemDrawer';
import { WorkItemAskCodeM } from './WorkItemAskCodeM';
import { CodeMLogo } from './CodeMLogo';
import type { WorkViewContext } from './work-view-chat';
import type { Conversation } from './conversation-history';
import type { WorkItemChatSource } from './work-item-chat';
import type { WorkItemOwner } from './WorkItemOwnerPicker';
import { getWorkItemAgent, type WorkItemAgent, type WorkItemAgentAction } from './work-item-agents';
import type { WorkItemSchedule } from './WorkItemPlanningPicker';
import type { WorkItemReviewTeam } from './work-item-review-data';
import { defaultReviewMembers, reviewRoleConfigs, type WorkItemReviewMembers } from './work-item-role-data';
import { WorkItemTableCell } from './WorkItemTableCell';
import { initialTableOwner, type WorkItemApp, type WorkItemCellSelection, type WorkItemTableField } from './work-item-table-data';
import './work-items.css';

const assetRoot = '/assets/figma/work-items/';
const currentPathname = () => window.location.pathname;
function WorkIcon({ name, size = 18 }: { name: string; size?: number }) {
  return <img className="work-icon" src={`${assetRoot}${name}.svg`} width={size} height={size} alt="" draggable="false" />;
}
function ToolButton({ icon, label, children, className = '' }: {
  icon: string; label: string; children?: ReactNode; className?: string;
}) {
  return <button type="button" className={`work-tool ${children ? '' : 'work-icon-button'} ${className}`} aria-label={label} title={label}>
    <WorkIcon name={icon} />{children}
  </button>;
}
// Editable cells open their field menus; the other cells open the work-item detail.
export function WorkItemsPage({ application, onContinueInChat, onOpenConversation }: {
  application: Application; onContinueInChat: (source: WorkItemChatSource, fieldName: string) => void;
  onOpenConversation: (conversation: Conversation) => void;
}) {
  const { title, items } = getWorkItemView(application.slug);
  const continueInChat = (item: WorkItemChatSource['item'], fieldName: string) => onContinueInChat({ slug: application.slug, item }, fieldName);
  const titleIcon = getWorkItemTitleIcon(application);
  const pathname = useSyncExternalStore(subscribeWorkItemNavigation, currentPathname);
  const selectedId = workItemIdFromPath(pathname, application.slug);
  const pageRef = useRef<HTMLElement | null>(null);
  const askTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const closeAsk = useCallback((restoreFocus = true) => {
    setAskOpen(false);
    if (restoreFocus) askTriggerRef.current?.focus({ preventScroll: true });
  }, []);
  const [cellSelection, setCellSelection] = useState<WorkItemCellSelection | null>(null);
  const [secondaryOwners, setSecondaryOwners] = useState<Record<number, WorkItemOwner>>({});
  const [appValues, setAppValues] = useState<Record<number, WorkItemApp[]>>({});
  const [owners, setOwners] = useState<Record<number, WorkItemOwner>>({});
  const [workingAgents, setWorkingAgents] = useState<Record<number, WorkItemAgent[]>>({});
  const [canceledAgents, setCanceledAgents] = useState<Record<number, string[]>>({});
  const [pdValues, setPDValues] = useState<Record<number, string>>({});
  const [schedules, setSchedules] = useState<Record<number, WorkItemSchedule>>({});
  const [reviewTeams, setReviewTeams] = useState<Record<number, WorkItemReviewTeam>>({});
  const [finishDates, setFinishDates] = useState<Record<number, string>>({});
  const [reviewMembers, setReviewMembers] = useState<Record<number, WorkItemReviewMembers>>({});
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function showUpdatedToast(field: string) {
    clearTimeout(toastTimer.current);
    setToastMessage(`Workflow ${field} updated`);
    toastTimer.current = setTimeout(() => {
      setToastMessage('');
      toastTimer.current = undefined;
    }, 2000);
  }
  function updateOwner(rowId: number, owner: WorkItemOwner) {
    setOwners(current => ({ ...current, [rowId]: owner }));
    const agent = getWorkItemAgent(owner);
    if (agent) setCanceledAgents(current => ({ ...current, [rowId]: (current[rowId] ?? []).filter(id => id !== agent.id) }));
    // Local execution preview: each distinct assignment adds a row until a person takes over.
    setWorkingAgents(current => {
      const assigned = current[rowId] ?? [];
      if (agent && assigned.some(value => value.id === agent.id)) return current;
      return { ...current, [rowId]: agent ? [...assigned, agent] : [] };
    });
    showUpdatedToast('owner');
  }
  function updateAgent(rowId: number, agentId: string, action: WorkItemAgentAction) {
    setCanceledAgents(current => {
      const remaining = (current[rowId] ?? []).filter(id => id !== agentId);
      return { ...current, [rowId]: action === 'stop' ? [...remaining, agentId] : remaining };
    });
    if (action !== 'cancel') return;
    const remaining = (workingAgents[rowId] ?? []).filter(agent => agent.id !== agentId);
    setWorkingAgents(current => ({ ...current, [rowId]: remaining }));
    setOwners(current => {
      if (current[rowId]?.id !== agentId) return current;
      const next = { ...current };
      const lastAssigned = remaining.at(-1);
      if (lastAssigned) next[rowId] = lastAssigned;
      else delete next[rowId];
      return next;
    });
    setReviewMembers(current => {
      const members = current[rowId] ?? defaultReviewMembers;
      return { ...current, [rowId]: {
        'review-owner': members['review-owner'].filter(person => person.id !== agentId),
        'ipmt-leader': members['ipmt-leader'].filter(person => person.id !== agentId),
        'engineer-leader': members['engineer-leader'].filter(person => person.id !== agentId),
      } };
    });
  }
  const hasCellSelection = Boolean(cellSelection);
  useEffect(() => {
    if (!hasCellSelection) return;
    const dismiss = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('[data-work-editable-cell], [data-work-cell-menu]')) return;
      setCellSelection(null);
    };
    document.addEventListener('pointerdown', dismiss, { capture: true });
    document.addEventListener('focusin', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss, { capture: true }); document.removeEventListener('focusin', dismiss); };
  }, [hasCellSelection]);
  useEffect(() => { if (selectedId !== null) { setCellSelection(null); setAskOpen(false); } }, [selectedId]);
  function cellProps(rowId: number, field: WorkItemTableField) {
    const selected = cellSelection?.rowId === rowId && cellSelection.field === field;
    const select = (editing: boolean) => {
      if (selectedId !== null) navigateWorkItem(application.id, null);
      setCellSelection(previous => previous?.rowId === rowId && previous.field === field
        ? { ...previous, editing: previous.editing || editing } : { rowId, field, editing });
    };
    return {
      id: `work-cell-${application.slug}-${rowId}-${field}`, pageRef, selected, editing: selected && cellSelection.editing, onContinueInChat: continueInChat,
      onSelect: () => select(false), onEdit: () => select(true), onDeselect: () => setCellSelection(null),
      onClose: () => setCellSelection(previous => previous?.rowId === rowId && previous.field === field ? { ...previous, editing: false } : previous),
    };
  }
  const selectedItem = items.find(item => item.id === selectedId);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeDetail = useCallback((restoreFocus = true) => {
    navigateWorkItem(application.id, null);
    if (restoreFocus) {
      const trigger = document.getElementById(`work-item-title-${application.slug}-${selectedId}`) ?? triggerRef.current;
      trigger?.focus({ preventScroll: true });
    }
  }, [application.id, application.slug, selectedId]);
  const viewContext: WorkViewContext = {
    slug: application.slug, title,
    rows: items.map(item => ({
      ...item, owner: (owners[item.id] ?? initialTableOwner(item)).name,
      apps: appValues[item.id] ?? item.apps, pd: pdValues[item.id] ?? '2.5PD', schedule: schedules[item.id],
    })),
  };
  return <main ref={pageRef} className="work-items-page" aria-label={`${application.label} 工作项视图`}>
    <header className="work-items-header">
      <div className="work-view-heading">
        <span className="work-view-glyph" style={{ background: titleIcon.color }}><img className="work-icon" src={assets[titleIcon.icon]} width="12" height="12" alt="" draggable="false" /></span>
        <h1>{title}</h1>
        <ToolButton icon="help" label="视图说明" />
        <span className="work-tag work-view-tag">Filter View</span>
        <button className="work-sync" type="button"><WorkIcon name="sync" />Unsynced changes</button>
        <ToolButton icon="pin" label="置顶视图" />
        <ToolButton icon="automation" label="自动化" />
      </div>
      <div className="work-header-actions">
        <button ref={askTriggerRef} type="button" className="work-tool work-view-ask" aria-label="Ask CodeM" title="Ask CodeM" aria-haspopup="dialog" aria-expanded={askOpen} aria-controls={askOpen ? 'work-view-ask-codem' : undefined} onClick={() => { setCellSelection(null); setAskOpen(open => !open); }}><CodeMLogo size={16} />Ask CodeM</button>
        <div className="work-action-group">
          <ToolButton icon="save" label="另存视图">Save as</ToolButton>
          <ToolButton icon="share" label="分享视图">Share</ToolButton>
          <ToolButton icon="more" label="更多视图操作" />
        </div>
        <ToolButton icon="new" label="新建工作项" className="work-primary">New</ToolButton>
      </div>
    </header>
    <div className="work-toolbar">
      <div className="work-toolbar-tools">
        <button type="button" className="work-filter-button" aria-label="筛选工作项">
          <span><WorkIcon name="filter" /><WorkIcon name="chevron-primary" size={10} /></span><i /><span>Filters · 3</span><i /><WorkIcon name="chevron-primary" size={10} />
        </button>
        <ToolButton icon="sort" label="排序工作项">Sort</ToolButton>
        <ToolButton icon="group" label="分组">Group</ToolButton>
        <ToolButton icon="color" label="标签颜色">Color</ToolButton>
        <ToolButton icon="levels" label="工作项层级">Levels</ToolButton>
        <ToolButton icon="search" label="搜索工作项">Search</ToolButton>
      </div>
      <div className="work-view-switch"><button type="button" className="work-tool"><WorkIcon name="table" size={20} />Table<WorkIcon name="chevron" size={10} /></button><ToolButton icon="settings" label="视图设置" /></div>
    </div>
    <div className="work-items-content">
      <div className="work-quick-views" aria-label="项目视图">
        {workItemViews.map((name, index) => <button type="button" key={name} aria-pressed={index === 0}>{name}</button>)}
        <ToolButton icon="plus" label="添加项目视图" />
      </div>
      <div className="work-table-scroll" tabIndex={0} role="region" aria-label={`${application.label} PUGC-Server 工作项表格`}>
        <table className="work-table" aria-label={title}>
          <colgroup>{[343, 207, 108, 108, 170, 96].map((width, index) => <col key={index} style={{ width }} />)}<col /></colgroup>
          <thead><tr><th scope="col" className="work-title-cell"><span className="work-checkbox" aria-hidden="true" /><span>Title</span></th><th scope="col"><span className="work-column-sort">Schedule<WorkIcon name="column-sort" size={12} /></span></th>{['Owner', 'Status', 'APP', 'PD', 'Owner'].map((name, index) => <th key={index} scope="col">{name}</th>)}</tr></thead>
          <tbody>{items.map(item => <tr key={item.id} data-work-item-row={item.id} data-selected={selectedId === item.id || undefined} onClick={event => {
            setCellSelection(null);
            triggerRef.current = event.currentTarget.querySelector<HTMLButtonElement>('.work-item-title');
            navigateWorkItem(application.id, item.id);
          }}>
            <td className="work-title-cell"><span className="work-row-number">{item.id}</span><button id={`work-item-title-${application.slug}-${item.id}`} type="button" className="work-item-title" title={item.title} aria-haspopup="dialog" aria-expanded={selectedId === item.id} aria-controls={selectedId === item.id ? 'work-item-detail' : undefined}>{item.title}</button></td>
            <WorkItemTableCell {...cellProps(item.id, 'schedule')} field="schedule" item={item} value={schedules[item.id]} onChange={schedule => {
              setSchedules(current => ({ ...current, [item.id]: schedule })); showUpdatedToast('schedule');
            }} />
            <WorkItemTableCell {...cellProps(item.id, 'owner')} field="owner" item={item} value={owners[item.id] ?? initialTableOwner(item)} onChange={owner => {
              updateOwner(item.id, owner);
            }} />
            <td><span className={`work-tag work-status-${item.status}`}>{item.status}</span></td>
            <WorkItemTableCell {...cellProps(item.id, 'app')} field="app" item={item} value={appValues[item.id] ?? item.apps} onChange={apps => {
              setAppValues(current => ({ ...current, [item.id]: apps })); showUpdatedToast('APP');
            }} />
            <WorkItemTableCell {...cellProps(item.id, 'pd')} field="pd" item={item} value={pdValues[item.id] ?? '2.5PD'} onChange={pd => {
              setPDValues(current => ({ ...current, [item.id]: pd })); showUpdatedToast('PD');
            }} />
            <WorkItemTableCell {...cellProps(item.id, 'secondary-owner')} field="secondary-owner" item={item} value={secondaryOwners[item.id] ?? initialTableOwner(item, true)} onChange={owner => {
              setSecondaryOwners(current => ({ ...current, [item.id]: owner })); showUpdatedToast('Owner');
            }} />
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    {askOpen && !selectedItem && <WorkItemAskCodeM context="view" application={application} view={viewContext} triggerRef={askTriggerRef} onClose={closeAsk} onOpenConversation={conversation => { setAskOpen(false); onOpenConversation(conversation); }} />}
    {selectedItem && <WorkItemDrawer key={selectedItem.id} application={application} item={selectedItem} onContinueInChat={continueInChat} onOpenConversation={onOpenConversation} owner={owners[selectedItem.id]} workingAgents={workingAgents[selectedItem.id]} canceledAgents={canceledAgents[selectedItem.id]} onAgentAction={(agentId, action) => updateAgent(selectedItem.id, agentId, action)} pd={pdValues[selectedItem.id]} schedule={schedules[selectedItem.id]} reviewTeam={reviewTeams[selectedItem.id]} finishDate={finishDates[selectedItem.id]} reviewMembers={reviewMembers[selectedItem.id]} onReviewMembersChange={(role, members) => {
      const previous = (reviewMembers[selectedItem.id] ?? defaultReviewMembers)[role];
      const newlyAssigned = members.filter(member => getWorkItemAgent(member) && !previous.some(person => person.id === member.id));
      if (newlyAssigned.length) setCanceledAgents(current => ({ ...current, [selectedItem.id]: (current[selectedItem.id] ?? []).filter(id => !newlyAssigned.some(agent => agent.id === id)) }));
      setReviewMembers(current => ({ ...current, [selectedItem.id]: { ...(current[selectedItem.id] ?? defaultReviewMembers), [role]: members } }));
      showUpdatedToast(reviewRoleConfigs[role].label);
    }} onOwnerChange={owner => {
      updateOwner(selectedItem.id, owner);
    }} onPDChange={value => {
      setPDValues(current => ({ ...current, [selectedItem.id]: value }));
      showUpdatedToast('PD');
    }} onScheduleChange={value => {
      setSchedules(current => ({ ...current, [selectedItem.id]: value }));
      showUpdatedToast('schedule');
    }} onReviewTeamChange={value => {
      setReviewTeams(current => ({ ...current, [selectedItem.id]: value }));
      showUpdatedToast('review team');
    }} onFinishDateChange={value => {
      setFinishDates(current => ({ ...current, [selectedItem.id]: value }));
      showUpdatedToast('finish date');
    }} onClose={closeDetail} />}
    {toastMessage && <div className="work-owner-toast" role="status" aria-atomic="true">
      <img src="/assets/figma/work-item-owner-ai/success.svg" width="20" height="20" alt="" /><span>{toastMessage}</span>
    </div>}
  </main>;
}
