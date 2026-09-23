import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Play, Trash2 } from 'lucide-react';
import { automationConversation, type Conversation } from './conversation-history';
import type { CreatedAutomationTask } from './codem-automations';
import { ProjectControl, SelectControl, TimePicker, type ProjectSelection } from './ScheduledTaskDialog';
import './automation-detail-drawer.css';

const assetRoot = '/assets/figma/codem-automation-detail/';

export type AutomationDetailTask = Pick<CreatedAutomationTask, 'id' | 'name' | 'schedule' | 'time' | 'kind'>;

type AutomationDetailDrawerProps = {
  task: AutomationDetailTask;
  groupName: string;
  enabled: boolean;
  suspended?: boolean;
  notify: (message: string) => void;
  onClose: (restoreFocus?: boolean) => void;
  onDelete: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onRename: (name: string) => void;
  onRunNow: () => void;
  onToggle: () => void;
};

const runHistory = [
  { id: 'today', time: '09:00', completed: true },
  { id: '09-21', time: '09-21 09:00', completed: true },
  { id: '09-20', time: '09-20 09:00', completed: true },
  { id: '09-19', time: '09-19 09:00', completed: false },
];

const repeatLabels = ['每天', '工作日', '每周'] as const;
const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

function normalizeRepeat(schedule: string) {
  if (schedule === 'daily' || schedule.startsWith('每天')) return '每天';
  if (schedule === 'weekdays' || schedule.startsWith('工作日')) return '工作日';
  if (schedule === 'weekly' || schedule.startsWith('每周')) return '每周';
  return repeatLabels[0];
}

function normalizeWeekday(schedule: string) {
  return weekdayLabels.find(label => schedule.includes(label)) ?? weekdayLabels[0];
}

export function AutomationDetailDrawer({ task, groupName, enabled, suspended = false, notify, onClose, onDelete, onOpenConversation, onRename, onRunNow, onToggle }: AutomationDetailDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const timeParts = task.time.split(':');
  const [project, setProject] = useState<ProjectSelection>({ device: 'MacBook Pro', project: task.id === 'workflow-brief' || groupName === 'Cloud' ? 'codem web app' : groupName });
  const [space, setSpace] = useState('codem');
  const [reasoning, setReasoning] = useState('high');
  const [runMode, setRunMode] = useState('new-chat');
  const [repeat, setRepeat] = useState<string>(() => normalizeRepeat(task.schedule));
  const [weekday, setWeekday] = useState<string>(() => normalizeWeekday(task.schedule));
  const [hour, setHour] = useState(timeParts[0] || '09');
  const [minute, setMinute] = useState(timeParts[1] || '00');
  const [instruction, setInstruction] = useState(() => task.id === 'workflow-brief' ? '每天早上总结一篇项目简报发给我' : `定期执行「${task.name}」并将结果发送给我`);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(task.name);

  useEffect(() => { drawerRef.current?.focus({ preventScroll: true }); }, [task.id]);
  useEffect(() => { setDraftName(task.name); }, [task.name]);
  useEffect(() => {
    setRepeat(normalizeRepeat(task.schedule));
    setWeekday(normalizeWeekday(task.schedule));
    setHour(timeParts[0] || '09');
    setMinute(timeParts[1] || '00');
  }, [task.id, task.schedule, task.time]);
  useEffect(() => { if (editingName) nameInputRef.current?.select(); }, [editingName]);
  useEffect(() => {
    if (suspended) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, suspended]);
  const commitName = () => {
    const name = draftName.trim();
    if (name && name !== task.name) onRename(name);
    else setDraftName(task.name);
    setEditingName(false);
  };

  return <aside ref={drawerRef} id="automation-detail-drawer" className="automation-detail-drawer" role="dialog" aria-labelledby="automation-detail-title" tabIndex={-1}>
    <header className="automation-detail-header">
      <h2 id="automation-detail-title" title={task.name}>{editingName ? <input ref={nameInputRef} value={draftName} maxLength={80} aria-label="任务名称" onChange={event => setDraftName(event.target.value)} onBlur={commitName} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
        else if (event.key === 'Escape') { event.preventDefault(); setDraftName(task.name); setEditingName(false); }
      }} /> : <button type="button" onClick={() => setEditingName(true)} aria-label={`编辑任务名称：${task.name}`}>{task.name}</button>}</h2>
      <div className="automation-detail-header-actions">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-lg" className="automation-detail-icon-button" aria-label="更多任务操作" title="更多操作">
              <img src={`${assetRoot}ellipsis.svg`} width="16" height="16" alt="" draggable="false" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40" align="end">
            <DropdownMenuItem className="h-9 gap-2 px-3" onSelect={onRunNow}><Play aria-hidden="true" />立即运行</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="h-9 gap-2 px-3" onSelect={onDelete}><Trash2 aria-hidden="true" />删除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="ghost" size="icon-lg" className={`automation-detail-icon-button${enabled ? '' : ' is-paused'}`} aria-label={enabled ? '暂停任务' : '启用任务'} aria-pressed={!enabled} title={enabled ? '暂停任务' : '启用任务'} onClick={onToggle}>
          <img src={`${assetRoot}pause.svg`} width="16" height="16" alt="" draggable="false" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="automation-detail-close" aria-label="关闭任务详情" title="关闭 (Esc)" onClick={() => onClose()}>
          <img src={`${assetRoot}close.svg`} width="18" height="18" alt="" draggable="false" />
        </Button>
      </div>
    </header>

    <div className="automation-detail-scroll">
      <section className="automation-detail-section" aria-label="指令">
        <Textarea id="automation-detail-instruction" className="automation-detail-instruction" value={instruction} maxLength={2000} aria-label="指令" onChange={event => setInstruction(event.target.value)} />
      </section>

      <section className="automation-detail-section" aria-labelledby="automation-info-label">
        <h3 id="automation-info-label">详情</h3>
        <div className="automation-detail-card">
          <div className="automation-detail-row"><span>运行项目</span><ProjectControl id="automation-detail-project" value={project} onChange={setProject} notify={notify} compact /></div>
          <div className="automation-detail-row"><span>所属空间</span><SelectControl id="automation-detail-space" ariaLabel="所属空间" value={space} onValueChange={setSpace} compact options={[
            { value: 'codem', label: 'Codem产研', avatarColor: '#8d55ed', avatarText: '开发' },
            { value: 'pilot', label: '飞书项目空间Pilot', avatarColor: '#5e36ef', avatarText: '项目' },
            { value: 'meego-ai', label: 'Meego AI', avatarColor: '#00a870', avatarText: 'AI' },
          ]} /></div>
          <div className="automation-detail-row"><span>推理强度</span><SelectControl id="automation-detail-reasoning" ariaLabel="推理强度" value={reasoning} onValueChange={setReasoning} compact options={[
            { value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }, { value: 'xhigh', label: '极高' },
          ]} /></div>
          <div className="automation-detail-row"><span>运行方式</span><SelectControl id="automation-detail-run-mode" ariaLabel="运行方式" value={runMode} onValueChange={setRunMode} compact options={[
            { value: 'new-chat', label: '运行时新建聊天' }, { value: 'continue', label: '继续当前对话' },
          ]} /></div>
        </div>
      </section>

      <section className="automation-detail-section" aria-labelledby="automation-schedule-label">
        <h3 id="automation-schedule-label">执行计划</h3>
        <div className="automation-detail-card">
          <div className="automation-detail-row"><span>重复</span><SelectControl id="automation-detail-repeat" ariaLabel="重复" value={repeat} onValueChange={setRepeat} compact options={[
            { value: '每天', label: '每天' }, { value: '工作日', label: '工作日' }, { value: '每周', label: '每周' },
          ]} /></div>
          <div className="automation-detail-row"><span>星期</span><SelectControl id="automation-detail-weekday" ariaLabel="星期" value={weekday} onValueChange={setWeekday} compact options={['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(label => ({ value: label, label }))} /></div>
          <div className="automation-detail-row"><span>时间</span><TimePicker hour={hour} minute={minute} onHourChange={setHour} onMinuteChange={setMinute} compact /></div>
        </div>
      </section>

      <section className="automation-detail-section automation-detail-history" aria-labelledby="automation-history-label">
        <h3 id="automation-history-label">运行历史</h3>
        <div className="automation-detail-history-list">
          {runHistory.map(run => <button key={run.id} type="button" onClick={() => onOpenConversation(automationConversation)} aria-label={`打开每日简报会话，运行时间 ${run.time}`}>
            <span className="automation-detail-history-main">
              <span className="automation-detail-history-glyph"><img src="/assets/figma/work-item-drawer/chat.svg" width="16" height="16" alt="" draggable="false" /></span>
              <span className="automation-detail-history-title">每日简报{run.completed && <img src={`${assetRoot}history-status.svg`} width="16" height="16" alt="已完成" draggable="false" />}</span>
            </span>
            <time>{run.time}</time>
          </button>)}
        </div>
      </section>
    </div>
  </aside>;
}
