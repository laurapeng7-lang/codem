import type { ApplicationSlug } from './work-item-navigation';

export type WorkItem = {
  id: number;
  title: string;
  owner: 'Jane' | 'John Du';
  avatar: 'jane' | 'john' | 'john-alt';
  status: 'product' | 'done' | 'design';
  apps: ('feishu' | 'project' | 'codem' | 'open-platform')[];
};

// Preserve the Figma row styling while each entry supplies its own sample names.
const rowAppearance: Omit<WorkItem, 'title'>[] = [
  { id: 1, owner: 'Jane', avatar: 'jane', status: 'product', apps: ['project', 'codem'] },
  { id: 2, owner: 'Jane', avatar: 'jane', status: 'done', apps: ['feishu'] },
  { id: 3, owner: 'John Du', avatar: 'john', status: 'product', apps: ['project'] },
  { id: 4, owner: 'Jane', avatar: 'jane', status: 'product', apps: ['feishu', 'project'] },
  { id: 5, owner: 'Jane', avatar: 'jane', status: 'done', apps: ['project'] },
  { id: 6, owner: 'John Du', avatar: 'john-alt', status: 'done', apps: ['open-platform'] },
  { id: 7, owner: 'Jane', avatar: 'jane', status: 'product', apps: ['codem'] },
  { id: 8, owner: 'Jane', avatar: 'jane', status: 'design', apps: ['feishu'] },
];

const workItemContent: Record<ApplicationSlug, { title: string; names: [string, string, string, string, string, string, string, string] }> = {
  epic: {
    title: 'Epic Product Roadmap',
    names: [
      'Unified Project Workspace',
      'Cross-Team Collaboration',
      'Intelligent Delivery Insights',
      'Enterprise Access Control',
      'Mobile Project Experience',
      'Open Integration Ecosystem',
      'Workflow Automation Platform',
      'Global Workspace Expansion',
    ],
  },
  version: {
    title: 'Version Release Plan',
    names: [
      'V3.8 · Collaboration Update',
      'V3.9 · Workflow Automation',
      'V3.9.1 · Permission Hotfix',
      'V4.0 · Analytics Preview',
      'iOS V2.6 · Mobile Workspace',
      'Android V2.6 · Offline Sync',
      'Open API V2.0 · Public Release',
      'V4.0.1 · Performance Patch',
    ],
  },
  sprint: {
    title: 'Sprint Iteration Board',
    names: [
      'Sprint 21 · Workspace Navigation',
      'Sprint 22 · Search & Discovery',
      'Sprint 23 · Workflow Builder',
      'Sprint 24 · Report Templates',
      'Sprint 25 · Mobile Collaboration',
      'Sprint 26 · Integration Testing',
      'Sprint 27 · Performance Tuning',
      'Sprint 28 · Release Readiness',
    ],
  },
  story: {
    title: 'Story Feature Backlog',
    names: [
      'Save Filters as a Personal View',
      'Mention Teammates in Comments',
      'Bulk Assign Work Item Owners',
      'Track Dependencies on Timeline',
      'Export Project Reports to PDF',
      'Subscribe to Status Updates',
      'Create Tasks from a Template',
      'Compare Planned and Actual Dates',
    ],
  },
  bug: {
    title: 'Bug Issue Triage',
    names: [
      'Task Count Stays Stale After Deletion',
      'Exported Dates Use Wrong Time Zone',
      'Mentions Send Duplicate Notifications',
      'Timeline Labels Overlap at High Zoom',
      'Uploaded Attachments Lose Their Names',
      'Archived Projects Appear in Search',
      'Mobile Comments Fail to Save Offline',
      'Read-Only Members Can Edit Tags',
    ],
  },
  'story-list': {
    title: 'Story Experience Improvements',
    names: [
      'Pin Frequently Used Project Views',
      'Preview Attachments in the Side Panel',
      'Resume an Unfinished Comment Draft',
      'Navigate Work Items with Keyboard',
      'Customize the Weekly Digest',
      'Restore Recently Archived Items',
      'Show Local Time in Activity History',
      'Remember Table Column Preferences',
    ],
  },
  '2025-ybr': {
    title: '2025 YBR',
    names: [
      '2025 · Annual Business Performance Review',
      '2025 · Strategic Goal Completion',
      '2025 · Customer Growth and Retention',
      '2025 · Product Delivery Highlights',
      '2025 · Team Capacity and Efficiency',
      '2025 · Budget and Resource Review',
      '2025 · Key Risks and Lessons Learned',
      '2026 · Business Priorities and Action Plan',
    ],
  },
  '2024-ybr': {
    title: '2024 YBR',
    names: [
      '2024 · Annual Operating Results',
      '2024 · OKR Achievement Review',
      '2024 · Market Expansion Summary',
      '2024 · Customer Experience Improvements',
      '2024 · Major Project Retrospective',
      '2024 · Cost and Investment Analysis',
      '2024 · Organization Development Review',
      '2025 · Growth Opportunities and Roadmap',
    ],
  },
};

export function isWorkItemSlug(value: string): value is ApplicationSlug {
  return Object.hasOwn(workItemContent, value);
}

export function getWorkItemView(slug: ApplicationSlug) {
  const { title, names } = workItemContent[slug];
  return { title, items: rowAppearance.map((row, index): WorkItem => ({ ...row, title: names[index] })) };
}

export const workItemViews = ['PUGC-Server', 'PUGC-Design', 'PUGC-FE', 'PUGC-iOS', 'PUGC-Android', 'PUGC-QA'];
