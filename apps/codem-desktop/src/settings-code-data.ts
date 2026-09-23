import requirement from './settings-code-fixture.json';

export type SettingsCodeIcon = 'folder' | 'field' | 'member' | 'layout' | 'braces' | 'plugin' | 'robot';
type ConfigValue = unknown;
type ConfigNode = { name: string; icon?: SettingsCodeIcon; config?: ConfigValue; children?: ConfigNode[] };
export type SettingsCodeFile = { path: string; name: string; icon: SettingsCodeIcon; directory: boolean; code: string };

const field = (name: string, key: string, type: string, options: Record<string, unknown> = {}): ConfigNode => ({
  name, icon: 'field', config: { entity: 'Requirement', field: { key, name, type, ...options } },
});
const role = (name: string, key: string, permissions: string[]): ConfigNode => ({
  name, icon: 'member', config: { entity: 'Requirement', role: { key, name, permissions } },
});
const automation = (name: string, trigger: string, fieldKey: string): ConfigNode => ({
  name, icon: 'robot', config: { name, enabled: true, trigger: { type: trigger, field: fieldKey }, conditions: [{ field: 'status', operator: 'not_in', value: ['Done', 'Cancelled'] }], actions: [{ type: 'notify', recipients: ['owner'], channel: 'lark' }] },
});

// Keep the order and initially expanded branches from Figma 135:67644.
const configuration: ConfigNode[] = [
  { name: '空间信息', config: requirement, children: [
    { name: '基本信息', config: { name: 'Agile Development', key: 'agile-development', description: '敏捷研发项目空间', timezone: 'Asia/Shanghai', visibility: 'members' } },
  ] },
  { name: '工作项管理', children: [
    { name: '需求', config: requirement, children: [
      { name: '字段管理', config: { entity: 'Requirement', fields: requirement.fields }, children: [
        field('优先级', 'priority', 'select', { options: ['P0', 'P1', 'P2'], defaultValue: 'P1', required: true }),
        field('描述', 'description', 'rich_text', { required: false }),
        field('文档', 'wiki', 'url', { required: false }),
        field('创建者', 'created_by', 'user', { readOnly: true, defaultValue: 'current_user' }),
      ] },
      { name: '流程管理', children: [
        { name: '默认流程', config: { entity: 'Requirement', name: '默认流程', nodes: ['Round 1', 'UX Design', 'Initial Review', 'DA Tracking', 'Detail Review', 'Tech Design'], initialNode: 'Round 1' } },
      ] },
      { name: '角色管理', children: [
        role('PM', 'pm', ['read', 'write', 'assign', 'manage_schedule']),
        role('UI Design', 'ui_design', ['read', 'write_design', 'comment']),
        role('DA', 'da', ['read', 'write_analysis', 'comment']),
        role('Tech Owner', 'tech_owner', ['read', 'write', 'review', 'manage_dependencies']),
      ] },
      { name: '页面布局', icon: 'layout', config: { entity: 'Requirement', layout: { sections: [{ title: '基本信息', fields: ['name', 'priority', 'owner', 'description'] }, { title: '排期', fields: ['start_time', 'finish_time'] }, { title: '相关资料', fields: ['wiki'] }] } } },
      { name: '表格列配置', icon: 'layout', config: { entity: 'Requirement', columns: [{ field: 'name', width: 320, pinned: 'left' }, { field: 'priority', width: 120 }, { field: 'owner', width: 160 }, { field: 'finish_time', width: 160 }], sort: [{ field: 'priority', direction: 'asc' }] } },
    ] },
    ...[['缺陷', 'Bug'], ['版本', 'Version'], ['迭代', 'Sprint'], ['项目', 'Project']].map(([name, entity]) => ({
      name, config: { entity, enabled: true }, children: [
        { name: '字段管理', config: { entity, fields: [{ key: 'name', type: 'text', required: true }, { key: 'owner', type: 'user' }, { key: 'status', type: 'select', options: ['Todo', 'Processing', 'Done'] }] } },
        { name: '流程管理', config: { entity, initialStatus: 'Todo', transitions: [{ from: 'Todo', to: 'Processing' }, { from: 'Processing', to: 'Done' }] } },
      ],
    })),
    { name: '工作项高级配置', icon: 'braces', children: [{ name: '关联与依赖', config: { dependencies: { enabled: true, allowCircular: false }, relations: ['parent', 'child', 'blocked_by', 'related_to'] } }] },
  ] },
  { name: '权限管理', children: [{ name: '空间角色', config: { roles: [{ name: '管理员', permissions: ['*'] }, { name: '成员', permissions: ['read', 'create', 'edit_own', 'comment'] }, { name: '访客', permissions: ['read'] }] } }] },
  { name: '插件管理', icon: 'plugin', children: [{ name: 'GitLab', icon: 'plugin', config: { plugin: 'gitlab', enabled: true, events: ['merge_request', 'pipeline'], linkedEntities: ['Requirement', 'Bug'] } }] },
  { name: '空间关联', children: [{ name: '关联空间', config: { spaces: [{ key: 'issue-resolution', name: 'Issue Resolution' }, { key: 'product-dev', name: 'Product Dev' }] } }] },
  { name: '自动化', children: [
    { name: '动态时间任务', children: [
      automation('私有化延期提醒', 'date_overdue', 'finish_time'),
      automation('性能问题临期提醒', 'date_approaching', 'finish_time'),
      automation('测试准出到期信息填写', 'date_reached', 'qa_deadline'),
    ] },
    { name: '节点字段值修改', children: [automation('节点状态更新', 'field_changed', 'status')] },
    { name: '插件', children: [automation('流水线完成通知', 'plugin_event', 'pipeline_status')] },
    { name: '定时循环', children: [automation('每周进展提醒', 'weekly', 'updated_at')] },
  ] },
];

function flatten(nodes: ConfigNode[], parent = ''): SettingsCodeFile[] {
  return nodes.flatMap(node => {
    const directory = node.children !== undefined;
    const path = `${parent}${node.name}${directory ? '/' : ''}`;
    const config = node.config ?? { name: node.name, items: node.children?.map(child => ({ name: child.name, path: `${path}${child.name}${child.children ? '/' : ''}` })) };
    return [{ path, name: node.name, directory, icon: node.icon ?? 'folder', code: JSON.stringify(config, null, 2) }, ...flatten(node.children ?? [], path)];
  });
}

export const settingsCodeFiles = flatten(configuration);
export const settingsCodeFileMap = new Map(settingsCodeFiles.map(file => [file.path, file]));
export const initialCodePath = '空间信息/';
export const initialExpandedCodePaths = ['工作项管理/', '工作项管理/需求/', '工作项管理/需求/字段管理/', '工作项管理/需求/角色管理/', '自动化/', '自动化/动态时间任务/'];

export type SettingsCodeTabs = { paths: string[]; activePath: string | null };
export type SettingsCodeAction = { type: 'open' | 'close'; path: string } | { type: 'close-all' };
export const initialCodeTabs: SettingsCodeTabs = { paths: [initialCodePath], activePath: initialCodePath };

export function settingsCodeTabsReducer(state: SettingsCodeTabs, action: SettingsCodeAction): SettingsCodeTabs {
  if (action.type === 'close-all') return { paths: [], activePath: null };
  if (action.type === 'open') {
    if (!settingsCodeFileMap.has(action.path)) return state;
    if (state.activePath === action.path) return state;
    return { paths: state.paths.includes(action.path) ? state.paths : [...state.paths, action.path], activePath: action.path };
  }
  const index = state.paths.indexOf(action.path);
  if (index === -1) return state;
  const paths = state.paths.filter(path => path !== action.path);
  return { paths, activePath: state.activePath === action.path ? paths[Math.min(index, paths.length - 1)] ?? null : state.activePath };
}
