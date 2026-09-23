import type { WorkItemOwner } from './WorkItemOwnerPicker';

export type WorkItemReviewRole = 'review-owner' | 'ipmt-leader' | 'engineer-leader';
export type WorkItemReviewMembers = Record<WorkItemReviewRole, WorkItemOwner[]>;
// Illustrative email addresses for the local demo directory.
const person = (id: string, name: string): WorkItemOwner => ({ id, name, email: `${id}@example.com`, avatar: `../work-item-drawer/${id}.png` });
const maikou = person('maikou', 'Maikou');
const nannan = person('nannan', 'Nannan');
const lei = person('lei', 'Lei');

export const defaultReviewMembers: WorkItemReviewMembers = {
  'review-owner': [maikou],
  'ipmt-leader': [nannan, lei],
  'engineer-leader': [nannan],
};

// Local demo recommendations: each role uses its own responsibilities and review context.
export const reviewRoleConfigs = {
  'review-owner': {
    label: 'Review owner', suggestionLabel: 'AI 智能建议评审负责人', primary: 'maikou', multiple: false,
    loadingTitles: ['AI 智能建议', '分析评审上下文', '匹配协调经验', '生成评审负责人建议'],
    suggestions: {
      maikou: { owner: maikou, reasons: ['Coordinates the review team and keeps decisions, owners and follow-up actions aligned.', 'Has experience resolving cross-team dependencies before Detail Review is completed.'] },
      nannan: { owner: nannan, reasons: ['Has recent context on MCP changes and can clarify technical questions during the review.', 'Can coordinate implementation follow-ups with the engineering team.'] },
      lei: { owner: lei, reasons: ['Can consolidate review feedback and verify that acceptance criteria are covered.', 'Brings experience tracking quality issues through review and regression testing.'] },
    },
  },
  'ipmt-leader': {
    label: 'IPMT Leader', suggestionLabel: 'AI 智能建议 IPMT 负责人', primary: 'nannan', multiple: true,
    loadingTitles: ['AI 智能建议', '分析评审目标', '匹配决策经验', '生成 IPMT 负责人建议'],
    suggestions: {
      nannan: { owner: nannan, reasons: ['Can assess technical feasibility and delivery risks for the proposed product changes.', 'Works with the review team to balance implementation scope and milestone commitments.'] },
      maikou: { owner: maikou, reasons: ['Can align product priorities, resource commitments and cross-team dependencies.', 'Adds coordination experience to the existing IPMT review team.'] },
      lei: { owner: lei, reasons: ['Can evaluate quality readiness and acceptance coverage before the review decision.', 'Complements the team with regression and release-risk assessment experience.'] },
    },
  },
  'engineer-leader': {
    label: 'Engineer Leader', suggestionLabel: 'AI 智能建议工程负责人', primary: 'nannan', multiple: false,
    loadingTitles: ['AI 智能建议', '分析技术范围', '匹配工程经验', '生成工程负责人建议'],
    suggestions: {
      nannan: { owner: nannan, reasons: ['Has recent implementation context for MCP list_issues and its filtering behavior.', 'Can lead the technical design review and coordinate engineering follow-up tasks.'] },
      maikou: { owner: maikou, reasons: ['Can coordinate engineering dependencies and break delivery work into actionable tasks.', 'Has experience leading issue triage across the implementation team.'] },
      lei: { owner: lei, reasons: ['Understands API edge cases and can review the proposed validation strategy.', 'Can lead quality-focused engineering follow-ups and regression planning.'] },
    },
  },
} as const;
