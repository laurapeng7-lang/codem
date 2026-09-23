import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Clock3, Ellipsis, Pencil, Play, Trash2, Webhook, Zap, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import assets from './assets.json';
import { AutomationDetailDrawer } from './AutomationDetailDrawer';
import type { Conversation } from './conversation-history';
import { SettingsSwitch } from './SettingsSwitch';
import { ScheduledTaskDialog, type ScheduledTaskCreation } from './ScheduledTaskDialog';
import {
  automationGroups,
  automationTemplateGroups,
  currentAutomationCreator,
  loadAutomationStates,
  loadAutomationTaskOverrides,
  loadCreatedAutomations,
  loadDeletedAutomationTaskIds,
  saveAutomationStates,
  saveAutomationTaskOverrides,
  saveCreatedAutomations,
  saveDeletedAutomationTaskIds,
  type AutomationCreator,
  type AutomationStates,
  type CreatedAutomationTask,
} from './codem-automations';
import './codem-page.css';
import './codem-automations.css';

const assetRoot = '/assets/figma/codem-automations/';
const templateAssetRoot = '/assets/figma/codem-automation-templates/';
const tabs = [{ id: 'saved', label: 'Saved' }, { id: 'templates', label: 'Templates' }] as const;
const createOptions: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: 'scheduled', label: '定时任务', Icon: Clock3 },
  { id: 'event', label: '事件触发', Icon: Zap },
  { id: 'webhook', label: 'webhook', Icon: Webhook },
];
type AutomationTab = typeof tabs[number]['id'];
type CreatorFilter = 'all' | 'mine';
type DisplayAutomationTask = { id: string; name: string; schedule: string; time: string; creator: AutomationCreator; kind?: ScheduledTaskCreation['kind'] };
type DisplayAutomationGroup = {
  id: string;
  icon: 'cloud' | 'folder';
  name: string;
  tasks: DisplayAutomationTask[];
};

export function CodeMAutomations({ notify, onOpenConversation, onToggleNavigation }: { notify: (message: string) => void; onOpenConversation: (conversation: Conversation) => void; onToggleNavigation: () => void }) {
  const [tab, setTab] = useState<AutomationTab>('saved');
  const [creatorFilter, setCreatorFilter] = useState<CreatorFilter>('all');
  const [enabled, setEnabled] = useState(loadAutomationStates);
  const [createdTasks, setCreatedTasks] = useState(loadCreatedAutomations);
  const [createOpen, setCreateOpen] = useState(false);
  const [scheduledTaskOpen, setScheduledTaskOpen] = useState(false);
  const [eventTriggerOpen, setEventTriggerOpen] = useState(false);
  const [webhookTriggerOpen, setWebhookTriggerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<{ task: DisplayAutomationTask; groupName: string } | null>(null);
  const [taskOverrides, setTaskOverrides] = useState(loadAutomationTaskOverrides);
  const [deletedTaskIds, setDeletedTaskIds] = useState(loadDeletedAutomationTaskIds);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const createMenu = useRef<HTMLDivElement>(null);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const focusLastCreateOption = useRef(false);
  useEffect(() => {
    if (!createOpen) return;
    const items = createMenu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[focusLastCreateOption.current ? items.length - 1 : 0]?.focus({ preventScroll: true });
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !createMenu.current?.parentElement?.contains(event.target)) setCreateOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setCreateOpen(false);
      createTrigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [createOpen]);
  const toggleTask = (id: keyof AutomationStates) => {
    const next = { ...enabled, [id]: !enabled[id] };
    setEnabled(next);
    if (!saveAutomationStates(next)) notify('当前浏览器无法保存开关状态');
  };
  const createScheduledTask = (task: ScheduledTaskCreation) => {
    const created: CreatedAutomationTask = {
      ...task,
      id: `created-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now()}`,
      creator: currentAutomationCreator,
    };
    setCreatedTasks(current => {
      const next = [...current, created];
      if (!saveCreatedAutomations(next)) notify(`当前浏览器无法保存${task.kind === 'webhook' ? 'Webhook 触发' : task.kind === 'event' ? '事件触发' : '定时任务'}`);
      return next;
    });
    setEnabled(current => {
      const next = { ...current, [created.id]: true };
      if (!saveAutomationStates(next)) notify('当前浏览器无法保存开关状态');
      return next;
    });
  };
  const updateScheduledTask = (task: ScheduledTaskCreation) => {
    if (!editingTask) return;
    const updated = { name: task.name, schedule: task.schedule, time: task.time };
    const isCreatedTask = createdTasks.some(item => item.id === editingTask.task.id);
    if (isCreatedTask) {
      setCreatedTasks(current => {
        const next = current.map(item => item.id === editingTask.task.id ? { ...item, ...task, groupName: editingTask.groupName } : item);
        if (!saveCreatedAutomations(next)) notify('当前浏览器无法保存任务修改');
        return next;
      });
    } else setTaskOverrides(current => {
      const next = { ...current, [editingTask.task.id]: updated };
      if (!saveAutomationTaskOverrides(next)) notify('当前浏览器无法保存任务修改');
      return next;
    });
    setEditingTask(null);
  };
  const deleteTask = (task: DisplayAutomationTask) => {
    if (createdTasks.some(item => item.id === task.id)) {
      setCreatedTasks(current => {
        const next = current.filter(item => item.id !== task.id);
        if (!saveCreatedAutomations(next)) notify('当前浏览器无法保存删除结果');
        return next;
      });
    } else setDeletedTaskIds(current => {
      const next = [...current, task.id];
      if (!saveDeletedAutomationTaskIds(next)) notify('当前浏览器无法保存删除结果');
      return next;
    });
    if (selectedTaskId === task.id) setSelectedTaskId(null);
    notify(`已删除任务：${task.name}`);
  };
  const renameTask = (task: DisplayAutomationTask, name: string) => {
    if (createdTasks.some(item => item.id === task.id)) {
      setCreatedTasks(current => {
        const next = current.map(item => item.id === task.id ? { ...item, name } : item);
        if (!saveCreatedAutomations(next)) notify('当前浏览器无法保存任务名称');
        return next;
      });
    } else setTaskOverrides(current => {
      const next = { ...current, [task.id]: { name, schedule: task.schedule, time: task.time } };
      if (!saveAutomationTaskOverrides(next)) notify('当前浏览器无法保存任务名称');
      return next;
    });
  };
  const closeDetail = (restoreFocus = true) => {
    setSelectedTaskId(null);
    if (restoreFocus) detailTrigger.current?.focus({ preventScroll: true });
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[next].id);
    setSelectedTaskId(null);
    document.getElementById(`codem-automations-tab-${tabs[next].id}`)?.focus();
  };
  const displayedGroups: DisplayAutomationGroup[] = automationGroups.map(group => ({
    id: group.id,
    icon: 'folder',
    name: group.name,
    tasks: group.tasks.map(task => ({
      ...task,
      name: taskOverrides[task.id]?.name ?? task.name,
      schedule: taskOverrides[task.id]?.schedule ?? ('schedule' in task ? task.schedule : '每天'),
      time: taskOverrides[task.id]?.time ?? task.time,
    })),
  }));
  createdTasks.forEach(task => {
    const displayTask = { ...task, creator: task.creator ?? currentAutomationCreator };
    const group = displayedGroups.find(item => item.name === task.groupName);
    if (group) group.tasks.push(displayTask);
    else {
      const createdGroup: DisplayAutomationGroup = {
        id: `created-group-${task.id}`,
        icon: task.groupName === 'Cloud' ? 'cloud' : 'folder',
        name: task.groupName,
        tasks: [displayTask],
      };
      if (task.groupName === 'Cloud') displayedGroups.unshift(createdGroup);
      else displayedGroups.push(createdGroup);
    }
  });
  displayedGroups.forEach(group => { group.tasks = group.tasks.filter(task => !deletedTaskIds.includes(task.id)); });
  const visibleGroups = displayedGroups.map(group => ({
    ...group,
    tasks: creatorFilter === 'mine' ? group.tasks.filter(task => task.creator.id === currentAutomationCreator.id) : group.tasks,
  })).filter(group => group.tasks.length > 0);
  const selectedGroup = visibleGroups.find(group => group.tasks.some(task => task.id === selectedTaskId));
  const selectedTask = selectedGroup?.tasks.find(task => task.id === selectedTaskId);

  return <main className={`codem-automations-workspace${selectedTask ? ' has-detail' : ''}`}>
    <section className="codem-automations-panel" aria-labelledby="codem-automations-title">
      <button type="button" className="icon-button desktop-nav-toggle codem-automations-nav-toggle" aria-label="打开导航" onClick={onToggleNavigation}><img src={assets['sidebar/img24X24']} width="16" height="16" alt="" /></button>
      <div className="codem-automations-scroll">
        <div className="codem-automations-content">
          <h1 id="codem-automations-title">Automations</h1>
          <div className="codem-automations-tabs" role="tablist" aria-label="自动化内容">
            {tabs.map((item, index) => <button key={item.id} type="button" role="tab" id={`codem-automations-tab-${item.id}`} aria-selected={tab === item.id}
              aria-controls="codem-automations-results" tabIndex={tab === item.id ? 0 : -1} onClick={() => { setTab(item.id); setSelectedTaskId(null); }} onKeyDown={event => onTabKeyDown(event, index)}>{item.label}</button>)}
          </div>
          <div id="codem-automations-results" className="codem-automations-results" role="tabpanel" aria-labelledby={`codem-automations-tab-${tab}`} tabIndex={0}>
            {tab === 'saved' ? <div className="codem-automations-body">
              <div className="codem-automations-toolbar">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="codem-automations-creator-filter" aria-label={`创建人筛选：${creatorFilter === 'all' ? '全部' : '我创建的'}`}>
                      <span>{creatorFilter === 'all' ? '全部' : '我创建的'}</span><ChevronDown size={16} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-36" align="start">
                    {([['all', '全部'], ['mine', '我创建的']] as const).map(([value, label]) => <DropdownMenuItem key={value} className="h-9 justify-between px-3" onSelect={() => {
                      setCreatorFilter(value);
                      setSelectedTaskId(null);
                    }}><span>{label}</span>{creatorFilter === value && <Check size={16} aria-hidden="true" />}</DropdownMenuItem>)}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="codem-automations-create-wrap" onBlur={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setCreateOpen(false);
                }}>
                <button ref={createTrigger} type="button" className="codem-automations-create" aria-haspopup="menu" aria-expanded={createOpen} aria-controls={createOpen ? 'codem-automations-create-menu' : undefined}
                  onClick={() => { focusLastCreateOption.current = false; setCreateOpen(value => !value); }} onKeyDown={event => {
                    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
                    event.preventDefault();
                    focusLastCreateOption.current = event.key === 'ArrowUp';
                    if (createOpen) {
                      const items = createMenu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
                      items?.[focusLastCreateOption.current ? items.length - 1 : 0]?.focus({ preventScroll: true });
                    } else setCreateOpen(true);
                  }}>Create<img src={`${assetRoot}chevron-down.svg`} width="16" height="16" alt="" /></button>
                {createOpen && <div ref={createMenu} id="codem-automations-create-menu" className="codem-automations-create-menu" role="menu" aria-label="创建自动化" onKeyDown={event => {
                  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const items = Array.from(createMenu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
                  const current = items.indexOf(document.activeElement as HTMLButtonElement);
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                  items[next]?.focus({ preventScroll: true });
                }}>
                  {createOptions.map(({ id, label, Icon }) => <button key={id} type="button" role="menuitem" onClick={() => {
                    setCreateOpen(false);
                    if (id === 'scheduled') setScheduledTaskOpen(true);
                    else if (id === 'event') setEventTriggerOpen(true);
                    else setWebhookTriggerOpen(true);
                  }}><Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></button>)}
                </div>}
                </div>
              </div>
              {visibleGroups.map(group => <section key={group.id} className="codem-automation-group" aria-labelledby={`automation-group-${group.id}`}>
                <h2 id={`automation-group-${group.id}`}><span><img src={group.icon === 'cloud' ? '/assets/figma/new-chat-menus/cloud.svg' : `${assetRoot}folder.svg`} width="16" height="16" alt="" /></span>{group.name}</h2>
                <ul className="codem-automation-tasks">{group.tasks.map(task => <li key={task.id} className="codem-automation-task" data-automation={task.id} data-selected={selectedTaskId === task.id || undefined}>
                  <button type="button" className="codem-automation-task-info" aria-haspopup="dialog" aria-expanded={selectedTaskId === task.id} aria-controls={selectedTaskId === task.id ? 'automation-detail-drawer' : undefined} onClick={event => {
                    detailTrigger.current = event.currentTarget;
                    setSelectedTaskId(task.id);
                  }}>
                    <span className="codem-automation-task-icon">{task.kind === 'event' ? <Zap size={16} strokeWidth={1.8} aria-hidden="true" /> : task.kind === 'webhook' ? <Webhook size={16} strokeWidth={1.8} aria-hidden="true" /> : <img src={`${assetRoot}clock.svg`} width="16" height="16" alt="" />}</span>
                    <div className="codem-automation-task-copy"><h3>{task.name}</h3><p id={`automation-schedule-${task.id}`}>
                      <span>{task.schedule}{task.time && <> <time>{task.time}</time></>}</span>
                    </p></div>
                  </button>
                  <div className="codem-automation-task-actions">
                    <SettingsSwitch label={`${group.name} · ${task.name}`} descriptionId={`automation-schedule-${task.id}`} checked={enabled[task.id]} onChange={() => toggleTask(task.id)} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="codem-automation-more" aria-label={`${task.name}的更多操作`} title="更多操作"><Ellipsis size={18} aria-hidden="true" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-40" align="end">
                        <DropdownMenuItem className="h-9 gap-2 px-3" onSelect={() => notify(`已开始运行任务：${task.name}`)}><Play aria-hidden="true" />立即运行</DropdownMenuItem>
                        <DropdownMenuItem className="h-9 gap-2 px-3" onSelect={() => setEditingTask({ task, groupName: group.name })}><Pencil aria-hidden="true" />编辑</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" className="h-9 gap-2 px-3" onSelect={() => deleteTask(task)}><Trash2 aria-hidden="true" />删除</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>)}</ul>
              </section>)}
              {!visibleGroups.length && <div className="codem-automations-empty" role="status">暂无我创建的任务</div>}
            </div> : <div className="codem-automation-templates">
              {automationTemplateGroups.map(group => <section key={group.id} className="codem-automation-template-group" aria-labelledby={`automation-templates-${group.id}`}>
                <h2 id={`automation-templates-${group.id}`}>{group.name}</h2>
                <ul className="codem-automation-template-grid">{group.templates.map(template => <li key={template.id} className="codem-automation-template-card" data-automation-template={template.id}>
                  <div className="codem-automation-template-heading">
                    <img src={`${templateAssetRoot}${template.icon}`} width="40" height="40" alt="" draggable="false" />
                    <h3 id={`automation-template-${template.id}`}>{template.name}</h3>
                  </div>
                  <p>{template.description}</p>
                  <button type="button" className="codem-automation-template-use" aria-describedby={`automation-template-${template.id}`} onClick={() => notify('自动化模板使用暂未接入')}>Use template</button>
                </li>)}</ul>
              </section>)}
            </div>}
          </div>
        </div>
      </div>
    </section>
    {scheduledTaskOpen && <ScheduledTaskDialog notify={notify} onCreate={createScheduledTask} onClose={() => setScheduledTaskOpen(false)} />}
    {eventTriggerOpen && <ScheduledTaskDialog mode="event" notify={notify} onCreate={createScheduledTask} onClose={() => setEventTriggerOpen(false)} />}
    {webhookTriggerOpen && <ScheduledTaskDialog mode="webhook" notify={notify} onCreate={createScheduledTask} onClose={() => setWebhookTriggerOpen(false)} />}
    {editingTask && <ScheduledTaskDialog mode={editingTask.task.kind ?? 'scheduled'} initialTask={editingTask.task} notify={notify} onCreate={updateScheduledTask} onClose={() => setEditingTask(null)} />}
    {selectedTask && selectedGroup && <AutomationDetailDrawer key={selectedTask.id} task={{ ...selectedTask, kind: selectedTask.kind ?? 'scheduled' }} groupName={selectedGroup.name} enabled={enabled[selectedTask.id] ?? false} suspended={Boolean(editingTask)} notify={notify}
      onClose={closeDetail} onToggle={() => toggleTask(selectedTask.id)} onRunNow={() => notify(`已开始运行任务：${selectedTask.name}`)} onRename={name => renameTask(selectedTask, name)}
      onDelete={() => deleteTask(selectedTask)} onOpenConversation={onOpenConversation} />}
  </main>;
}
