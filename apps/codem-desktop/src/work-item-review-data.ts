import type { ApplicationSlug } from './work-item-navigation';

export const reviewTeams = [
  { id: 'ipmt', name: 'IPMT 团队', background: '#fa850033', description: '跨团队决策、产品规划与资源协调', reasons: ['Coordinates product priorities and cross-team decisions.', 'Matches the IPMT Leader and engineering review roles.'] },
  { id: 'product', name: '产品评审团队', background: '#3370ff26', description: '需求范围、产品方案与验收标准', reasons: ['Owns requirement scope and acceptance criteria for this work.', 'Can resolve product questions before the technical handoff.'] },
  { id: 'engineering', name: '技术评审团队', background: '#7f3bf526', description: '技术方案、实现成本与系统依赖', reasons: ['Reviews technical feasibility, effort and system dependencies.', 'Can confirm implementation risks with the engineering lead.'] },
  { id: 'design', name: '体验设计团队', background: '#f01d9426', description: '交互流程、界面方案与体验一致性', reasons: ['Validates interaction flows and design consistency.', 'Can settle usability questions before implementation starts.'] },
  { id: 'quality', name: '质量保障团队', background: '#3dbc2f26', description: '测试覆盖、缺陷验证与发布质量', reasons: ['Checks test coverage and regression risks for this work.', 'Can validate fixes and confirm release readiness.'] },
] as const;
export type WorkItemReviewTeam = typeof reviewTeams[number]['id'];
export type WorkItemReviewContext = { application: ApplicationSlug; pd?: string; schedule?: { start: string; end: string } };
export const defaultReviewTeam: WorkItemReviewTeam = 'ipmt';
export const defaultFinishDate = '2024-06-30';
export const reviewTeam = (id: WorkItemReviewTeam) => reviewTeams.find(team => team.id === id)!;

export function suggestedReviewTeam(context?: WorkItemReviewContext): WorkItemReviewTeam {
  const byApplication: Record<ApplicationSlug, WorkItemReviewTeam> = {
    epic: 'ipmt', version: 'quality', sprint: 'engineering', story: 'product', bug: 'quality', 'story-list': 'design',
    '2025-ybr': 'ipmt', '2024-ybr': 'ipmt',
  };
  return context ? byApplication[context.application] : defaultReviewTeam;
}

function addWorkingDays(value: string, count: number) {
  const date = new Date(`${value}T00:00:00Z`);
  for (let remaining = count; remaining > 0;) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining--;
  }
  return date.toISOString().slice(0, 10);
}

export function suggestedFinishDates(context?: WorkItemReviewContext) {
  const estimate = Number.parseFloat(context?.pd ?? '5');
  const days = Number.isFinite(estimate) ? Math.min(365, Math.max(1, Math.ceil(estimate))) : 5;
  // Use the original demo baseline, so accepting a recommendation never moves the next one again.
  const date = context?.schedule?.end ?? addWorkingDays(defaultFinishDate, days);
  return {
    primary: { date, reasons: context?.schedule
      ? ['Aligns completion with the end of the current workflow schedule.', 'Provides a clear date for review sign-off and the next handoff.']
      : [`Reserves ${days} working days from the planning baseline.`, 'Includes time for implementation feedback and review sign-off.'] },
    alternative: { date: addWorkingDays(date, 2), reasons: ['Adds two working days for review feedback and follow-up fixes.', 'Provides a buffer if dependencies or approval take longer.'] },
  };
}
