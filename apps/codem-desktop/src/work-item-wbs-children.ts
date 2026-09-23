import initialRows from './work-item-wbs-data.json';

export type WBSRow = (typeof initialRows)[number];
export type WBSChild = Pick<WBSRow, 'name' | 'schedule' | 'owner' | 'icon'>;

export const wbsChildKinds = [
  { id: 'task', label: '任务', defaultName: '新任务', color: '#00a6d6', asset: 'work-items/story.svg' },
  { id: 'requirement', label: '需求管理', defaultName: '新需求', color: '#6f5ff4', asset: 'work-items/story.svg' },
  { id: 'project', label: '项目管理', defaultName: '新项目', color: '#8fbd16', asset: 'sidebar-img-outlined-issue.svg' },
  { id: 'product', label: '产品管理', defaultName: '新产品', color: '#20b80a', asset: 'sidebar-img-outlined-issue.svg' },
  { id: 'bug', label: '缺陷管理', defaultName: '新缺陷', color: '#f67e7a', asset: 'sidebar-img-outlined-issue.svg' },
  { id: 'sprint', label: '迭代管理', defaultName: '新迭代', color: '#3dbc2f', asset: 'sidebar-img-outlined-mind-mapping.svg' },
  { id: 'version', label: '版本管理', defaultName: '新版本', color: '#e27ee2', asset: 'sidebar-img-outlined-version.svg' },
  { id: 'test', label: '测试管理', defaultName: '新测试', color: '#ff8800', asset: 'work-items/story.svg' },
] as const;
export type WBSChildKind = (typeof wbsChildKinds)[number]['id'];

export function manualWBSChild(parent: WBSRow, kind: WBSChildKind): WBSChild {
  return { name: wbsChildKinds.find(option => option.id === kind)!.defaultName, schedule: parent.schedule, owner: parent.owner || '待填', icon: `child-${kind}` };
}

// Use the selected parent's scope and date window for the local recommendation flow.
export function suggestWBSChildren(parent: WBSRow, rows: WBSRow[]): WBSChild[] {
  const ancestors: WBSRow[] = [];
  let current: WBSRow | undefined = parent;
  while (current) { ancestors.push(current); current = rows.find(row => row.id === current?.parent); }
  const scope = ancestors.find(row => !/^(子任务|子工作项\d+|节点\d+)$/.test(row.name))?.name || parent.name;
  const stages = /复盘|总结/.test(scope)
    ? ['收集阶段交付与进度数据', '分析偏差和风险原因', '明确改进措施与责任人', '评审并确认复盘结论']
    : /测试|质量|QA|验证/i.test(scope)
      ? ['确定验证范围与验收标准', '准备测试用例和验证环境', '执行验证并跟踪问题修复', '汇总结果并完成质量验收']
      : /立项|Charter/.test(scope)
        ? ['梳理立项目标与范围', '评估资源投入和关键风险', '编写立项方案与里程碑计划', '组织立项评审并确认结论']
        : ['明确交付范围与验收标准', '拆分执行步骤并确认资源', '推进执行并跟踪依赖', '完成交付检查与验收'];
  const window = ancestors.find(row => /^\d{4}-\d{2}-\d{2}(?: ~ \d{4}-\d{2}-\d{2})?$/.test(row.schedule))?.schedule;
  const dates = window?.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const start = Date.parse(`${dates[0]}T00:00:00Z`);
  const end = Date.parse(`${dates[1] ?? dates[0]}T00:00:00Z`);
  const days = Math.floor((end - start) / 86400000) + 1;
  const format = (offset: number) => new Date(start + offset * 86400000).toISOString().slice(0, 10);
  return stages.map((name, index) => ({
    name: `${scope} · ${name}`,
    schedule: Number.isFinite(days) && days > 0
      ? `${format(Math.floor(index * days / stages.length))} ~ ${format(Math.max(Math.floor(index * days / stages.length), Math.floor((index + 1) * days / stages.length) - 1))}`
      : '待填',
    owner: parent.owner || '待填', icon: 'status-empty',
  }));
}

export function getWBSChildNumbers(rows: WBSRow[], parent: WBSRow, count: number): string[] {
  const prefix = parent.kind === 'task' && parent.number ? `${parent.number}.` : '';
  const numbers = rows.filter(row => row.kind === 'task' && (prefix ? row.parent === parent.id : !row.number.includes('.')))
    .map(row => Number(prefix ? row.number.slice(prefix.length) : row.number)).filter(Number.isFinite);
  const first = Math.max(0, ...numbers) + 1;
  return Array.from({ length: count }, (_, offset) => `${prefix}${first + offset}`);
}

export function insertWBSChildren(rows: WBSRow[], anchorId: string, children: WBSChild[], linked = false): WBSRow[] {
  const index = rows.findIndex(row => row.id === anchorId && row.kind === 'add');
  const anchor = rows[index];
  const parent = rows.find(row => row.id === anchor?.parent);
  if (index < 0 || !parent || !children.length) return rows;
  const numbers = getWBSChildNumbers(rows, parent, children.length);
  const additions = children.map((child, offset): WBSRow => ({
    ...anchor, ...child, id: `wbs-${crypto.randomUUID()}`, parent: parent.id, number: numbers[offset],
    kind: 'task', indent: parent.kind === 'phase' ? parent.indent : parent.indent + 1,
    dependency: linked && offset > 0 ? `${numbers[offset - 1]}FS` : '待填',
    predecessor: linked && offset > 0 ? `${children[offset - 1].name} FS` : '待填',
  }));
  return [...rows.slice(0, index), ...additions, ...rows.slice(index)];
}
