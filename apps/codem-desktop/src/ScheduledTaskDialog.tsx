import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDownIcon, RotateCw } from 'lucide-react';
import assets from './assets.json';
import { newChatDevices } from './NewChatToolbar';
import { RepositoryAuthorization } from './RepositoryAuthorization';
import { RepositoryEventConditions, type RepositoryEventCondition } from './RepositoryEventConditions';
import { LarkMessageFilters, type MessageFilter } from './LarkMessageFilters';

type ScheduledTaskDialogProps = {
  mode?: 'scheduled' | 'event' | 'webhook';
  initialTask?: Pick<ScheduledTaskCreation, 'name' | 'schedule' | 'time'>;
  notify: (message: string) => void;
  onClose: () => void;
  onCreate: (task: ScheduledTaskCreation) => void;
};

export type ScheduledTaskCreation = {
  groupName: string;
  kind: 'scheduled' | 'event' | 'webhook';
  name: string;
  schedule: string;
  time: string;
  messageFilters?: MessageFilter[];
  repositoryConditions?: RepositoryEventCondition[];
};

function randomSecret(size = 20) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

type SelectOption = {
  value: string;
  label: string;
  avatarColor?: string;
  avatarText?: string;
};

type SelectFieldProps = {
  id: string;
  label: string;
  defaultValue: string;
  options: SelectOption[];
};

type SelectControlProps = {
  id: string;
  ariaLabel: string;
  options: SelectOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  compact?: boolean;
};

export type ProjectSelection = {
  device: string | null;
  project: string | null;
};

type InstructionMode = 'custom' | 'best-practice' | 'my-template';
type PromptTemplate = { id: string; name: string; description: string; prompt: string };

const scheduleOptions = [
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '工作日' },
  { value: 'weekly', label: '每周' },
];
const eventTypeOptions = [
  { value: 'code-change', label: '代码改动相关' },
  { value: 'lark-message', label: '飞书消息' },
];
const weekdayOptions = [
  { value: 'monday', label: '周一' },
  { value: 'tuesday', label: '周二' },
  { value: 'wednesday', label: '周三' },
  { value: 'thursday', label: '周四' },
  { value: 'friday', label: '周五' },
  { value: 'saturday', label: '周六' },
  { value: 'sunday', label: '周日' },
];
const hourOptions = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, '0');
  return { value, label: value };
});
const minuteOptions = Array.from({ length: 60 }, (_, minute) => {
  const value = String(minute).padStart(2, '0');
  return { value, label: value };
});
const bestPracticeTemplates: PromptTemplate[] = [
  { id: 'project-closeout', name: '项目结项复盘报告', description: '梳理项目全周期信息，反思问题、总结经验', prompt: '请基于 {{project}} 的内容，按照专业项目管理规范生成一份结项复盘报告，包含项目概述、团队分工、进度回顾、问题分析、经验总结和后续建议。' },
  { id: 'project-weekly', name: '项目进展周报', description: '汇总本周的关键项目进展，形成项目周报', prompt: '请基于 {{project}} 的内容，汇总本周关键进展、已完成事项、风险问题和下周计划，生成一份项目进展周报。' },
  { id: 'project-risks', name: '项目风险洞察', description: '扫描项目各维度信息，挖掘潜在风险', prompt: '请基于 {{project}} 的内容，扫描进度、资源、协作和交付信息，识别潜在风险并给出优先级与应对建议。' },
  { id: 'personal-weekly-detailed', name: '个人周报生成-详实版', description: '聚合项目概况、进展、风险和后续计划', prompt: '请基于 {{project}} 的内容，按项目维度聚合概况、进展、风险和后续计划，为指定人员生成详实的本周工作周报。' },
  { id: 'requirement-retro', name: '需求开发经验复盘', description: '复盘从需求文档到上线的全流程', prompt: '请基于 {{project}} 的内容，围绕指定需求复盘从文档到上线的全流程，总结可复用的开发经验与流程规范。' },
  { id: 'personal-weekly-brief', name: '个人周报生成-简洁版', description: '提炼本周工作成果与下周重点', prompt: '请基于 {{project}} 的内容，提炼指定人员本周完成事项、关键成果与下周重点，生成简洁版个人周报。' },
];
const myTemplates: PromptTemplate[] = [
  { id: 'daily-digest', name: '每日项目动态摘要', description: '每天汇总项目新增动态和关键变化', prompt: '请基于 {{project}} 的内容，汇总最近一天的重要动态、阻塞事项和需要关注的变化。' },
  { id: 'risk-reminder', name: '待办风险提醒', description: '识别临期、逾期和长期未更新事项', prompt: '请基于 {{project}} 的内容，找出临期、逾期以及长期未更新的任务，并按风险程度输出提醒。' },
  { id: 'release-check', name: '版本发布检查', description: '发布前检查需求、缺陷和验收状态', prompt: '请基于 {{project}} 的内容，检查当前版本的需求完成度、缺陷状态和验收风险，输出发布前检查清单。' },
];

export function SelectControl({ id, ariaLabel, options, defaultValue, value, onValueChange, compact = false }: SelectControlProps) {
  return (
    <Select defaultValue={defaultValue} value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className={compact ? 'automation-detail-dropdown-trigger' : 'w-full pr-2 pl-4 hover:bg-muted data-[size=default]:h-9'} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align={compact ? 'end' : 'start'}>
        <SelectGroup>
          {options.map(option => <SelectItem key={option.value} value={option.value} textValue={option.label} className={option.avatarColor ? 'h-9 rounded-lg' : 'h-9'}>
            <span className="flex min-w-0 items-center gap-2">
              {option.avatarColor && <span
                className={`scheduled-select-avatar grid size-5 shrink-0 place-items-center rounded-full text-[11px] leading-none font-medium${option.avatarText && /[\u3400-\u9fff]/.test(option.avatarText) ? ' scheduled-select-avatar-cjk' : ''}`}
                style={{ backgroundColor: option.avatarColor, color: '#fff' }}
                aria-hidden="true"
              >{option.avatarText ?? Array.from(option.label.trim())[0]}</span>}
              <span className="truncate">{option.label}</span>
            </span>
          </SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function SelectField({ id, label, defaultValue, options }: SelectFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-[6px]">
      <Label htmlFor={id} className="h-5 shrink-0 leading-5">{label}</Label>
      <SelectControl id={id} ariaLabel={label} defaultValue={defaultValue} options={options} />
    </div>
  );
}

export function TimePicker({ hour, minute, onHourChange, onMinuteChange, compact = false }: {
  hour: string;
  minute: string;
  onHourChange: (value: string) => void;
  onMinuteChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={compact ? 'ghost' : 'outline'} className={compact ? 'automation-detail-dropdown-trigger' : 'h-9 w-full justify-between pr-2 pl-4 font-normal hover:bg-muted'} aria-label="选择执行时间">
          <span>{hour}:{minute}</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] p-1" align="end">
        <div className="grid grid-cols-2 gap-1" aria-label="执行时间">
          <div className="max-h-54 overflow-y-auto" aria-label="小时">
            {hourOptions.map(option => <DropdownMenuItem key={option.value} className={`h-9 justify-center${hour === option.value ? ' bg-muted' : ''}`} onSelect={event => {
              event.preventDefault();
              onHourChange(option.value);
            }}>{option.label}</DropdownMenuItem>)}
          </div>
          <div className="max-h-54 overflow-y-auto" aria-label="分钟">
            {minuteOptions.map(option => <DropdownMenuItem key={option.value} className={`h-9 justify-center${minute === option.value ? ' bg-muted' : ''}`} onSelect={event => {
              event.preventDefault();
              onMinuteChange(option.value);
            }}>{option.label}</DropdownMenuItem>)}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TemplatePicker({ placeholder, value, options, onValueChange }: {
  placeholder: string;
  value: string;
  options: PromptTemplate[];
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full pr-2 pl-4 hover:bg-muted data-[size=default]:h-9" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectGroup>
          {options.map(option => <SelectItem key={option.id} value={option.id} textValue={option.name} className="min-h-14 items-start py-2">
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="font-medium">{option.name}</span>
              <span className="line-clamp-2 text-xs font-normal text-muted-foreground">{option.description}</span>
            </span>
          </SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function TemplatePrompt({ template }: { template: PromptTemplate }) {
  const [before, after = ''] = template.prompt.split('{{project}}');
  return (
    <div className="min-h-24 px-2.5 py-2 text-sm leading-6 text-foreground">
      {before}
      <span className="mx-1 inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-blue-600">
        <span className="grid size-3.5 place-items-center rounded-full border border-blue-500 text-[9px] leading-none">✓</span>
        指定项目
      </span>
      {after}
    </div>
  );
}

function ProjectIcon({ name, size = 20 }: { name: 'cloud' | 'device' | 'folder' | 'chat' | 'add-project'; size?: number }) {
  const source = name === 'chat' ? '/assets/figma/work-item-drawer/chat.svg' : `/assets/figma/new-chat-menus/${name}.svg`;
  return <img src={source} width={size} height={size} alt="" draggable="false" />;
}

export function ProjectControl({ value, onChange, notify, localOnly = false, compact = false, id = 'scheduled-task-project' }: {
  value: ProjectSelection;
  onChange: (value: ProjectSelection) => void;
  notify: (message: string) => void;
  localOnly?: boolean;
  compact?: boolean;
  id?: string;
}) {
  const displayValue = value.device ? `${value.device} · ${value.project ?? '请选择项目'}` : localOnly ? '无可用本地项目' : 'Cloud';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button id={id} type="button" variant={compact ? 'ghost' : 'outline'} className={compact ? 'automation-detail-dropdown-trigger' : 'h-9 w-full justify-between pr-2 pl-4 font-normal'}>
          <span className="flex min-w-0 items-center gap-2 truncate">
            <ProjectIcon name={value.device ? value.project ? 'folder' : 'chat' : 'cloud'} size={16} />
            <span className="truncate">{compact && value.project ? value.project : displayValue}</span>
          </span>
          <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align={compact ? 'end' : 'start'}>
        {!localOnly && <>
          <DropdownMenuItem className={`h-9 gap-2 px-3${value.device ? '' : ' bg-muted'}`} onSelect={() => onChange({ device: null, project: null })}>
            <ProjectIcon name="cloud" />Cloud
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>}
        {newChatDevices.map(device => device.online ? <DropdownMenuSub key={device.name}>
          <DropdownMenuSubTrigger className="h-9 gap-2 px-3">
            <ProjectIcon name="device" />
            <span className="truncate">{device.name}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            {device.projects.map(project => <DropdownMenuItem key={project} className={`h-9 gap-2 px-3${value.device === device.name && value.project === project ? ' bg-muted' : ''}`} onSelect={() => onChange({ device: device.name, project })}>
              <ProjectIcon name="folder" />
              <span className="truncate">{project}</span>
            </DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="h-9 gap-2 px-3" onSelect={() => notify('新建项目暂未接入')}>
              <ProjectIcon name="add-project" />New project
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub> : <DropdownMenuItem key={device.name} disabled className="h-9 gap-2 px-3">
          <ProjectIcon name="device" />
          <span className="truncate">{device.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">离线</span>
          <img src="/assets/figma/settings-diff/chevron-right.svg" width="12" height="12" alt="" />
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectPicker({ value, onChange, notify, localOnly = false }: {
  value: ProjectSelection;
  onChange: (value: ProjectSelection) => void;
  notify: (message: string) => void;
  localOnly?: boolean;
}) {
  return <div className="flex min-w-0 flex-col gap-[6px]">
    <Label htmlFor="scheduled-task-project" className="h-5 shrink-0 leading-5">运行项目</Label>
    <ProjectControl value={value} onChange={onChange} notify={notify} localOnly={localOnly} />
  </div>;
}

export function ScheduledTaskDialog({ mode = 'scheduled', initialTask, notify, onClose, onCreate }: ScheduledTaskDialogProps) {
  const isEvent = mode === 'event';
  const isWebhook = mode === 'webhook';
  const isEditing = Boolean(initialTask);
  const defaultLocalDevice = newChatDevices.find(device => device.online && device.projects.length > 0);
  const nameInput = useRef<HTMLInputElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialTask?.name ?? '');
  const [prompt, setPrompt] = useState('');
  const [nameError, setNameError] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [pushToLark, setPushToLark] = useState(true);
  const [eventType, setEventType] = useState('code-change');
  const [messageFilters, setMessageFilters] = useState<MessageFilter[]>([{ id: 'initial-message-filter', type: 'group', values: ['CodeM 研发群'], keywords: '' }]);
  const [repositoryConditions, setRepositoryConditions] = useState<RepositoryEventCondition[]>([]);
  const [schedule, setSchedule] = useState(() => initialTask?.schedule.startsWith('每周') ? 'weekly' : initialTask?.schedule === '工作日' ? 'weekdays' : 'daily');
  const [weekday, setWeekday] = useState(() => weekdayOptions.find(option => initialTask?.schedule.includes(option.label))?.value ?? 'monday');
  const [hour, setHour] = useState(() => initialTask?.time.split(':')[0] || '09');
  const [minute, setMinute] = useState(() => initialTask?.time.split(':')[1] || '00');
  const [webhookToken, setWebhookToken] = useState(() => `whsec_${randomSecret()}`);
  const [webhookId] = useState(() => `au_${randomSecret(4)}`);
  const [showWebhookGuide, setShowWebhookGuide] = useState(false);
  const [project, setProject] = useState<ProjectSelection>(() => isEvent && defaultLocalDevice
    ? { device: defaultLocalDevice.name, project: defaultLocalDevice.projects[0] }
    : { device: null, project: null });
  const [instructionMode, setInstructionMode] = useState<InstructionMode>('custom');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const templateOptions = instructionMode === 'best-practice' ? bestPracticeTemplates : myTemplates;
  const selectedTemplate = instructionMode === 'custom' ? undefined : templateOptions.find(template => template.id === selectedTemplateId);
  const webhookUrl = `https://codem-automation.internal/api/v1/hook/${webhookId}`;
  const webhookExample = `curl -X POST "${webhookUrl}" \\\n+  -H "Authorization: Bearer ${webhookToken}" \\\n+  -H "Content-Type: application/json" \\\n+  -d '{"branch":"main","job_name":"weekly-report"}'`;

  const displayWebhookExample = webhookExample.replaceAll('\n+', '\n');

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label}已复制`);
    } catch {
      notify(`${label}复制失败，请手动复制`);
    }
  };

  const changeInstructionMode = (value: string) => {
    setInstructionMode(value as InstructionMode);
    setSelectedTemplateId('');
    setPrompt('');
  };

  const changeProject = (value: ProjectSelection) => {
    setProject(value);
  };

  const selectTemplate = (value: string) => {
    const template = templateOptions.find(option => option.id === value);
    setSelectedTemplateId(value);
    setPrompt(template?.prompt.replace('{{project}}', '指定项目') ?? '');
  };

  const insertPrompt = (value: string) => {
    const node = promptInput.current;
    const start = node?.selectionStart ?? prompt.length;
    const end = node?.selectionEnd ?? prompt.length;
    const next = `${prompt.slice(0, start)}${value}${prompt.slice(end)}`;
    if (selectedTemplate) {
      setInstructionMode('custom');
      setSelectedTemplateId('');
    }
    setPrompt(next);
    requestAnimationFrame(() => {
      promptInput.current?.focus({ preventScroll: true });
      promptInput.current?.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      nameInput.current?.focus({ preventScroll: true });
      return;
    }
    const scheduleLabel = isWebhook
      ? 'Webhook 触发'
      : isEvent
      ? eventTypeOptions.find(option => option.value === eventType)?.label ?? '代码改动相关'
      : scheduleOptions.find(option => option.value === schedule)?.label ?? '每天';
    const weekdayLabel = weekdayOptions.find(option => option.value === weekday)?.label ?? '周一';
    onCreate({
      ...(isEvent && eventType === 'lark-message' ? { messageFilters } : {}),
      ...(isEvent && eventType === 'code-change' ? { repositoryConditions } : {}),
      groupName: project.project ?? project.device ?? 'Cloud',
      kind: mode,
      name: name.trim(),
      schedule: !isEvent && schedule === 'weekly' ? `${scheduleLabel} · ${weekdayLabel}` : scheduleLabel,
      time: isEvent || isWebhook ? '' : `${hour}:${minute}`,
    });
    notify(`已${isEditing ? '更新' : '创建'}${isWebhook ? 'Webhook 触发' : isEvent ? '事件触发' : '定时任务'}：${name.trim()}`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden rounded-[16px] p-0 sm:max-w-[560px]">
        <form className="flex min-h-0 min-w-0 max-h-[calc(100dvh-2rem)] flex-col" onSubmit={submit} noValidate>
          <DialogHeader className="px-6 pt-6 pb-5">
            <DialogTitle>{isEditing ? `编辑${isWebhook ? ' Webhook 触发' : isEvent ? '事件触发' : '定时任务'}` : isWebhook ? '创建 Webhook 触发' : isEvent ? '创建事件触发' : '创建定时任务'}</DialogTitle>
            <DialogDescription className="sr-only">配置任务名称、指令、{isWebhook ? 'Webhook 调用信息' : isEvent ? '事件类型' : '执行计划'}和推送方式</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 min-w-0 flex-col gap-6 overflow-x-hidden overflow-y-auto px-6 pb-3">
            <div className="flex flex-col gap-[6px]">
              <Label htmlFor="scheduled-task-name" className="h-5 shrink-0 leading-5">任务名称</Label>
              <Input
                ref={nameInput}
                id="scheduled-task-name"
                className="h-9 hover:bg-muted"
                value={name}
                maxLength={80}
                placeholder={isWebhook ? '例如：生成项目周报' : '请输入任务名称'}
                aria-invalid={nameError || undefined}
                aria-describedby={nameError ? 'scheduled-task-name-error' : undefined}
                onChange={event => {
                  setName(event.target.value);
                  setNameError(false);
                }}
              />
              {nameError && <p id="scheduled-task-name-error" className="text-xs text-destructive" role="alert">请输入任务名称</p>}
            </div>

            <div className="flex flex-col gap-[6px]">
              <Label htmlFor="scheduled-task-prompt" className="h-5 shrink-0 leading-5">自定义指令</Label>
              <RadioGroup value={instructionMode} onValueChange={changeInstructionMode} className="flex h-8 flex-wrap items-center gap-x-6 gap-y-0">
                {[
                  { value: 'custom', label: '自定义指令' },
                  { value: 'best-practice', label: '官方指令' },
                  { value: 'my-template', label: '我的指令' },
                ].map(option => <div key={option.value} className="flex h-8 items-center gap-2">
                  <RadioGroupItem id={`instruction-${option.value}`} value={option.value} />
                  <Label htmlFor={`instruction-${option.value}`} className="font-normal">{option.label}</Label>
                </div>)}
              </RadioGroup>
              {instructionMode !== 'custom' && <TemplatePicker
                placeholder={instructionMode === 'best-practice' ? '请选择官方指令' : '请选择我的指令'}
                value={selectedTemplateId}
                options={templateOptions}
                onValueChange={selectTemplate}
              />}
              <div className="rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                {selectedTemplate ? <TemplatePrompt template={selectedTemplate} /> : <Textarea
                  ref={promptInput}
                  id="scheduled-task-prompt"
                  value={prompt}
                  maxLength={2000}
                  placeholder={isWebhook ? '描述收到 Webhook 请求后需要 CodeM 执行的任务' : isEvent ? '描述事件发生后需要 CodeM 执行的任务' : '描述需要 CodeM 定时执行的任务'}
                  className="min-h-12 resize-none border-0 shadow-none focus-visible:ring-0"
                  onChange={event => setPrompt(event.target.value)}
                />}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-2.5 pb-2" aria-label="已添加附件">
                    {attachments.map(file => (
                      <span key={file} className="max-w-48 truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{file}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-end justify-between px-2 pb-2 pl-2.5 text-xs text-muted-foreground">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="icon-lg" className="rounded-full" aria-label="添加内容" title="添加内容">
                        <img src="/assets/figma/new-chat-composer/add.svg" width="17.23" height="17.23" alt="" draggable="false" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-44" align="start">
                      <DropdownMenuItem className="h-9" onSelect={() => attachmentInput.current?.click()}>
                        <img src={assets['composer/imgIconAttachmentOutlined']} width="16" height="16" alt="" draggable="false" />添加附件
                      </DropdownMenuItem>
                      <DropdownMenuItem className="h-9" onSelect={() => insertPrompt('@项目 ')}>
                        <img src={assets['new-chat/imgIconAtOutlined']} width="16" height="16" alt="" draggable="false" />引用项目
                      </DropdownMenuItem>
                      <DropdownMenuItem className="h-9" onSelect={() => insertPrompt('/技能 ')}>
                        <img src={assets['new-chat/imgSkill']} width="16" height="16" alt="" draggable="false" />选择技能
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span>{prompt.length}/2000</span>
                  <input
                    ref={attachmentInput}
                    type="file"
                    hidden
                    multiple
                    onChange={event => {
                      const names = Array.from(event.currentTarget.files ?? []).map(file => file.name);
                      setAttachments(current => [...new Set([...current, ...names])]);
                      event.currentTarget.value = '';
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <ProjectPicker value={project} onChange={changeProject} notify={notify} localOnly={isEvent} />
              {project.project && <div className="grid grid-cols-2 gap-2">
                <SelectField id="scheduled-task-space" label="所属空间" defaultValue="pilot" options={[
                  { value: 'pilot', label: '飞书项目空间Pilot', avatarColor: '#5E36EF' },
                  { value: 'meego-ai', label: 'Meego AI', avatarColor: '#00A870' },
                  { value: 'codem', label: 'CodeM Space', avatarColor: '#F54A45' },
                ]} />
                <SelectField id="scheduled-task-reasoning" label="推理强度" defaultValue="high" options={[
                  { value: 'low', label: '低' },
                  { value: 'medium', label: '中' },
                  { value: 'high', label: '高' },
                  { value: 'xhigh', label: '极高' },
                ]} />
              </div>}
            </div>

            {isWebhook ? <section className="flex min-w-0 flex-col gap-6">
              <div className="flex flex-col gap-[6px]">
                <div className="flex h-5 shrink-0 items-center justify-between gap-3">
                  <Label htmlFor="webhook-url" className="leading-5">Webhook URL</Label>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-blue-600 hover:text-blue-700"
                    aria-expanded={showWebhookGuide}
                    aria-controls="webhook-integration-guide"
                    onClick={() => setShowWebhookGuide(value => !value)}
                  >{showWebhookGuide ? '收起接入说明' : '查看接入说明'}</button>
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_36px] gap-2">
                  <Input id="webhook-url" readOnly value={webhookUrl} className="h-9 min-w-0 font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon-lg" aria-label="复制 Webhook URL" title="复制 Webhook URL" onClick={() => void copyText(webhookUrl, 'Webhook URL')}>
                    <img src={assets['chat/imgIconCopyOutlined']} width="16" height="16" alt="" draggable="false" />
                  </Button>
                </div>
                {showWebhookGuide && <div id="webhook-integration-guide" className="flex min-w-0 flex-col gap-[6px] pt-[6px]">
                  <p className="text-xs leading-5 text-muted-foreground">外部系统向该地址发送 POST 请求，即可触发此任务。</p>
                  <div className="flex h-5 shrink-0 items-center justify-between gap-3">
                    <h4 className="h-5 text-sm leading-5 font-medium">curl 调用示例</h4>
                    <button type="button" className="shrink-0 text-xs text-muted-foreground hover:text-foreground" onClick={() => void copyText(displayWebhookExample, '调用示例')}>复制代码</button>
                  </div>
                  <pre className="max-w-full min-w-0 overflow-x-auto whitespace-pre rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-zinc-100"><code>{displayWebhookExample}</code></pre>
                </div>}
              </div>
              <div className="flex flex-col gap-[6px]">
                <Label htmlFor="webhook-token" className="h-5 shrink-0 leading-5">访问 Token</Label>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_36px_36px] gap-2">
                  <Input id="webhook-token" type="password" readOnly value={webhookToken} className="h-9 min-w-0 font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon-lg" aria-label="复制访问 Token" title="复制访问 Token" onClick={() => void copyText(webhookToken, 'Token')}>
                    <img src={assets['chat/imgIconCopyOutlined']} width="16" height="16" alt="" draggable="false" />
                  </Button>
                  <Button type="button" variant="outline" size="icon-lg" aria-label="重新生成访问 Token" title="重新生成访问 Token" onClick={() => {
                    setWebhookToken(`whsec_${randomSecret()}`);
                    notify('已重新生成 Token，旧 Token 将失效');
                  }}>
                    <RotateCw className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </section> : isEvent ? <section className="flex flex-col gap-[6px]" aria-labelledby="event-trigger-type-title">
              <h3 id="event-trigger-type-title" className="h-5 shrink-0 text-sm leading-5 font-medium">事件类型</h3>
              <RadioGroup value={eventType} onValueChange={setEventType} className="grid grid-cols-2 gap-2">
                {eventTypeOptions.map(option => <Label key={option.value} htmlFor={`event-trigger-${option.value}`} className="flex h-10 cursor-pointer items-center gap-2 rounded-[8px] border border-input px-3 font-normal hover:bg-muted has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:bg-muted">
                  <RadioGroupItem id={`event-trigger-${option.value}`} value={option.value} />
                  <span>{option.label}</span>
                </Label>)}
              </RadioGroup>
              <div hidden={eventType !== 'code-change'}>
                <RepositoryAuthorization visible />
                <RepositoryEventConditions conditions={repositoryConditions} onChange={setRepositoryConditions} />
              </div>
              <div hidden={eventType !== 'lark-message'}>
                <LarkMessageFilters filters={messageFilters} onChange={setMessageFilters} />
              </div>
            </section> : <section className="flex flex-col gap-[6px]" aria-labelledby="scheduled-task-schedule-title">
              <h3 id="scheduled-task-schedule-title" className="h-5 shrink-0 text-sm leading-5 font-medium">执行计划</h3>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <SelectControl id="scheduled-task-frequency" ariaLabel="执行频率" value={schedule} onValueChange={setSchedule} options={scheduleOptions} />
                </div>
                {schedule === 'weekly' && <div className="min-w-0 flex-1">
                  <SelectControl id="scheduled-task-weekday" ariaLabel="选择周几" value={weekday} onValueChange={setWeekday} options={weekdayOptions} />
                </div>}
                <div className="min-w-0 flex-1">
                  <TimePicker hour={hour} minute={minute} onHourChange={setHour} onMinuteChange={setMinute} />
                </div>
              </div>
            </section>}

            <section className="flex flex-col gap-6">
              <div className="flex flex-col gap-6">
                <SelectField id="scheduled-task-type" label="任务类型" defaultValue="new-plan" options={[
                  { value: 'new-plan', label: '按任务执行新计划' },
                  { value: 'continue', label: '继续当前对话' },
                ]} />
                <div className="flex min-w-0 flex-col gap-[6px]">
                  <Label className="h-5 shrink-0 leading-5">推送对象</Label>
                  <div className="flex h-8 items-center gap-2">
                    <Checkbox id="scheduled-task-lark" checked={pushToLark} onCheckedChange={checked => setPushToLark(checked === true)} />
                    <Label htmlFor="scheduled-task-lark" className="font-normal">推送至飞书</Label>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-0 bg-transparent px-6 pt-3 pb-6">
            <Button type="button" variant="outline" className="h-9 px-4" onClick={onClose}>取消</Button>
            <Button type="submit" className="h-9 px-4">{isEditing ? '保存' : '创建'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
