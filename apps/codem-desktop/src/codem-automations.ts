export type AutomationCreator = {
  id: string;
  name: string;
  avatar: string;
};

export const currentAutomationCreator: AutomationCreator = {
  id: 'current-user',
  name: '大畅',
  avatar: '/assets/figma/sidebar-avatar-10-7030.png',
};

const automationCreators = {
  current: currentAutomationCreator,
  nannan: { id: 'nannan', name: '楠楠', avatar: '/assets/figma/work-item-drawer/nannan.png' },
  maikou: { id: 'maikou', name: '麦扣', avatar: '/assets/figma/work-item-drawer/maikou.png' },
} satisfies Record<string, AutomationCreator>;

export const automationGroups = [
  { id: 'codem-workflow', name: 'codem workflow', tasks: [
    { id: 'workflow-brief', name: '项目简报', schedule: '每周 · 周一', time: '09:00', enabled: true, creator: automationCreators.current },
    { id: 'workflow-changes', name: '改动总结', time: '09:00', enabled: true, creator: automationCreators.nannan },
  ] },
  { id: 'semi-design', name: 'semi design', tasks: [
    { id: 'semi-brief', name: '项目简报', time: '09:00', enabled: false, creator: automationCreators.current },
    { id: 'semi-changes', name: '改动总结', time: '09:00', enabled: true, creator: automationCreators.maikou },
  ] },
] as const;

const projectAnalysisTemplate = {
  name: '项目分析',
  description: '快速查询项目相关数据，支持检索任务、需求、缺陷及历史记录，获取结构化信息用于分析与决策。',
};

export const automationTemplateGroups = [
  { id: 'status-reports', name: 'Status reports', templates: [
    { ...projectAnalysisTemplate, id: 'status-analysis', icon: 'project-analysis.png' },
    { ...projectAnalysisTemplate, id: 'status-note', icon: 'report-note.png' },
    { ...projectAnalysisTemplate, id: 'status-insight', icon: 'data-insight.png' },
    { ...projectAnalysisTemplate, id: 'status-summary', icon: 'project-analysis.png' },
  ] },
  { id: 'incidents-triage', name: 'Incidents & triage', templates: [
    { ...projectAnalysisTemplate, id: 'incident-note', icon: 'report-note.png' },
    { ...projectAnalysisTemplate, id: 'incident-analysis', icon: 'project-analysis.png' },
    { ...projectAnalysisTemplate, id: 'incident-insight', icon: 'data-insight.png' },
    { ...projectAnalysisTemplate, id: 'incident-summary', icon: 'project-analysis.png' },
  ] },
] as const;

export type CreatedAutomationTask = {
  id: string;
  groupName: string;
  kind: 'scheduled' | 'event' | 'webhook';
  name: string;
  schedule: string;
  time: string;
  creator?: AutomationCreator;
};

export type AutomationStates = Record<string, boolean>;
export type AutomationTaskOverride = Pick<CreatedAutomationTask, 'name' | 'schedule' | 'time'>;
export const automationStatesStorageKey = 'meego:codem:automations:v1';
export const createdAutomationsStorageKey = 'meego:codem:created-automations:v1';
export const automationTaskOverridesStorageKey = 'meego:codem:automation-task-overrides:v1';
export const deletedAutomationTaskIdsStorageKey = 'meego:codem:deleted-automation-task-ids:v1';

// These are local UI preferences; a scheduler is not connected to this page yet.
export function loadAutomationStates(): AutomationStates {
  let saved: unknown;
  try { saved = JSON.parse(window.localStorage.getItem(automationStatesStorageKey) ?? 'null'); } catch { /* Keep the design defaults when storage is unavailable. */ }
  const stored = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as Record<string, unknown> : {};
  const savedStates = Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')) as AutomationStates;
  const defaultStates = Object.fromEntries(automationGroups.flatMap(group => group.tasks.map(task => [task.id, typeof stored[task.id] === 'boolean' ? stored[task.id] : task.enabled]))) as AutomationStates;
  return { ...savedStates, ...defaultStates };
}

export function saveAutomationStates(states: AutomationStates): boolean {
  try { window.localStorage.setItem(automationStatesStorageKey, JSON.stringify(states)); return true; }
  catch { return false; }
}

export function loadCreatedAutomations(): CreatedAutomationTask[] {
  let saved: unknown;
  try { saved = JSON.parse(window.localStorage.getItem(createdAutomationsStorageKey) ?? 'null'); } catch { return []; }
  if (!Array.isArray(saved)) return [];
  return saved.filter((task): task is CreatedAutomationTask => {
    if (!task || typeof task !== 'object') return false;
    const value = task as Record<string, unknown>;
    const hasRequiredFields = ['id', 'groupName', 'name', 'schedule', 'time'].every(key => typeof value[key] === 'string');
    if (!hasRequiredFields) return false;
    if (value.kind !== undefined && value.kind !== 'scheduled' && value.kind !== 'event' && value.kind !== 'webhook') return false;
    if (value.kind === undefined) value.kind = 'scheduled';
    return true;
  });
}

export function saveCreatedAutomations(tasks: CreatedAutomationTask[]): boolean {
  try { window.localStorage.setItem(createdAutomationsStorageKey, JSON.stringify(tasks)); return true; }
  catch { return false; }
}

export function loadAutomationTaskOverrides(): Record<string, AutomationTaskOverride> {
  let saved: unknown;
  try { saved = JSON.parse(window.localStorage.getItem(automationTaskOverridesStorageKey) ?? 'null'); } catch { return {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  return Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, AutomationTaskOverride] => {
    const value = entry[1];
    return Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && typeof (value as Record<string, unknown>).name === 'string'
      && typeof (value as Record<string, unknown>).schedule === 'string'
      && typeof (value as Record<string, unknown>).time === 'string');
  }));
}

export function saveAutomationTaskOverrides(overrides: Record<string, AutomationTaskOverride>): boolean {
  try { window.localStorage.setItem(automationTaskOverridesStorageKey, JSON.stringify(overrides)); return true; }
  catch { return false; }
}

export function loadDeletedAutomationTaskIds(): string[] {
  let saved: unknown;
  try { saved = JSON.parse(window.localStorage.getItem(deletedAutomationTaskIdsStorageKey) ?? 'null'); } catch { return []; }
  return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
}

export function saveDeletedAutomationTaskIds(ids: string[]): boolean {
  try { window.localStorage.setItem(deletedAutomationTaskIdsStorageKey, JSON.stringify(ids)); return true; }
  catch { return false; }
}
