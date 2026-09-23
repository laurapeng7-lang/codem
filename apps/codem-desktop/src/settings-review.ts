import type { ConfigChange, SettingsExecutionResult } from './settings-execution-result';

export type SettingsReview = { executionId: string; result: SettingsExecutionResult; path?: string };
export type ReviewChangeKind = 'A' | 'M';
export type ReviewProperty = { path: string; label: string; before: unknown; after: unknown; changed: boolean; tags: boolean };
export type ReviewedChange = { change: ConfigChange; properties: ReviewProperty[]; propertyCount: number; kind: ReviewChangeKind };

const labels: Record<string, string> = {
  key: '字段 ID', name: '名称', type: '字段类型', options: '选项列表', defaultValue: '默认值', required: '必填',
  roles: '角色', permissions: '权限', role: '角色', members: '成员', membershipStatus: '成员核实状态',
  entity: '工作项类型', fields: '字段', layout: '页面布局', sections: '分区', title: '标题', columns: '表格列',
  field: '字段', width: '宽度', pinned: '固定列', sort: '排序', direction: '排序方向', nodes: '节点',
  transitions: '流转规则', from: '来源节点', to: '目标节点', condition: '触发条件', assignee: '负责人',
  enabled: '启用', allow: '允许操作', deny: '禁止操作', id: 'ID', description: '描述',
};

export function reviewChangeKind(change: ConfigChange): ReviewChangeKind {
  return !change.before && !!change.after ? 'A' : 'M';
}
export function reviewChanges(changes: ConfigChange[]): ReviewedChange[] {
  return changes.filter(change => change.added || change.removed).map(change => {
    const properties = reviewProperties(change);
    return { change, properties, propertyCount: properties.filter(property => property.changed).length, kind: reviewChangeKind(change) };
  });
}
export function reviewSummary(changes: ReviewedChange[]): { count: number; kind: ReviewChangeKind } {
  return {
    count: changes.reduce((total, change) => total + change.propertyCount, 0),
    kind: changes.length > 0 && changes.every(change => change.kind === 'A') ? 'A' : 'M',
  };
}
export function reviewIcon(path: string) {
  return /角色|权限|成员/.test(path) ? 'member' : /流程|节点|自动化/.test(path) ? 'workflow' : 'field';
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function parse(text: string): unknown { if (!text) return undefined; try { return JSON.parse(text); } catch { return text; } }

// Compare properties from the same immutable snapshots as the conversation diff.
// Object arrays are paired by stable identity, so insertions do not shift every later row.
export function reviewProperties(change: ConfigChange): ReviewProperty[] {
  const rows: ReviewProperty[] = [];
  function visit(before: unknown, after: unknown, path: string, label: string, key: string) {
    if ((object(before) || before === undefined) && (object(after) || after === undefined) && (object(before) || object(after))) {
      const a = object(before) ? before : {}, b = object(after) ? after : {};
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      if (keys.length) { for (const child of keys) visit(a[child], b[child], `${path}/${child}`, [label, labels[child] ?? child].filter(Boolean).join(' · '), child); return; }
    }
    const a = Array.isArray(before) ? before : [], b = Array.isArray(after) ? after : [];
    if ((before === undefined || Array.isArray(before)) && (after === undefined || Array.isArray(after)) && [...a, ...b].length && [...a, ...b].every(object)) {
      const identity = ['id', 'key', 'name', 'field', 'title'].find(candidate => [...a, ...b].every(item => typeof item[candidate] === 'string') && [a, b].every(items => new Set(items.map(item => item[candidate])).size === items.length));
      if (identity) {
        const ids = [...new Set([...a, ...b].map(item => item[identity] as string))];
        for (const id of ids) visit(a.find(item => item[identity] === id), b.find(item => item[identity] === id), `${path}/${id}`, `${label} · ${id}`, key);
        // Preserve ordering changes even when each identified object's properties are unchanged.
        if (a.length === b.length && a.every(item => b.some(other => item[identity] === other[identity])) && a.some((item, index) => item[identity] !== b[index][identity])) {
          visit(a.map(item => item[identity]), b.map(item => item[identity]), `${path}/order`, `${label} · 顺序`, 'order');
        }
        return;
      }
    }
    rows.push({ path: path || 'content', label: label || '内容', before, after, changed: JSON.stringify(before) !== JSON.stringify(after), tags: key === 'options' && [...a, ...b].every(item => typeof item === 'string') });
  }
  visit(parse(change.before), parse(change.after), '', '', '');
  return rows;
}

export function reviewValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string') return value || '""';
  if (Array.isArray(value) && value.every(item => typeof item === 'string' || typeof item === 'number')) return value.length ? value.join('、') : '[]';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
