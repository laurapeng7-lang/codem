import type { WorkItem } from './work-items-data';
import { workItemPeople, type WorkItemOwner, type WorkItemOwnerSuggestion } from './WorkItemOwnerPicker';
import { reviewRoleConfigs } from './work-item-role-data';

export type WorkItemApp = WorkItem['apps'][number];
export type WorkItemTableField = 'owner' | 'app' | 'secondary-owner' | 'pd' | 'schedule';
export type WorkItemCellSelection = { rowId: number; field: WorkItemTableField; editing: boolean };
export const tablePeople: WorkItemOwner[] = [
  { id: 'jane', name: 'Jane', email: 'jane@example.com', avatar: '../work-items/jane.png' },
  { id: 'john', name: 'John Du', email: 'john.du@example.com', avatar: '../work-items/john.png' },
  ...Object.values(reviewRoleConfigs['engineer-leader'].suggestions).map(suggestion => suggestion.owner),
  ...workItemPeople,
];
export function initialTableOwner(item: WorkItem, secondary = false): WorkItemOwner {
  if (secondary) return tablePeople[0];
  return { ...tablePeople[item.owner === 'Jane' ? 0 : 1], avatar: `../work-items/${item.avatar}.png` };
}
export const tableAppOptions: { id: WorkItemApp; name: string }[] = [
  { id: 'feishu', name: '飞书' },
  { id: 'project', name: '飞书项目' },
  { id: 'codem', name: 'CodeM' },
  { id: 'open-platform', name: '开放平台' },
];
export const tableAppName = (id: WorkItemApp) => tableAppOptions.find(option => option.id === id)!.name;
// These recommendations are local examples derived from the selected row's title.
export function tableOwnerRecommendations(item: WorkItem) {
  const technical = /api|integration|sync|permission|access|performance|automation|offline/i.test(item.title);
  const values: Record<string, WorkItemOwnerSuggestion> = {
    jane: { owner: tablePeople[0], reasons: [`Can coordinate the requirements and acceptance review for “${item.title}”.`, 'Brings product and collaboration workflow context to the handoff.'] },
    john: { owner: tablePeople[1], reasons: [`Can lead implementation and dependency review for “${item.title}”.`, 'Has relevant experience with service logic, integrations and engineering delivery.'] },
    nannan: { owner: tablePeople.find(person => person.id === 'nannan')!, reasons: [`Can break “${item.title}” into actionable technical tasks.`, 'Can support API validation, edge-case review and implementation follow-ups.'] },
  };
  return { primary: technical ? 'john' : 'jane', values };
}
export function tableAppRecommendation(item: WorkItem): WorkItemApp {
  return /api|integration|external|ecosystem/i.test(item.title) ? 'open-platform'
    : /automation|performance|implementation|code/i.test(item.title) ? 'codem'
    : /collaboration|mention|comment|notification|digest/i.test(item.title) ? 'feishu' : 'project';
}
export function tableAppReasons(item: WorkItem, app: WorkItemApp) {
  const scope = {
    feishu: '团队沟通、消息通知与文档协作',
    project: '需求规划、工作项管理与交付跟踪',
    codem: '代码实现、问题排查与研发自动化',
    'open-platform': '开放 API、外部系统与跨应用连接',
  }[app];
  return [`“${item.title}”可关联到${tableAppName(app)}，集中跟踪相关实现与验证。`, `建议关注${scope}，并与已有应用范围保持一致。`];
}
