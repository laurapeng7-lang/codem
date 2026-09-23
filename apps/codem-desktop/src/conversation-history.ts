import type { CodeMSpaceId } from './codem-spaces';

export const conversationGroups = ['今天', '本周', '更早'] as const;
export type ConversationEnvironment = { device: string | null; project: string | null; spaceId?: CodeMSpaceId };
export const cloudEnvironment: ConversationEnvironment = { device: null, project: null };
export type Conversation = {
  id: string;
  group: typeof conversationGroups[number];
  title: string;
  summary: string;
  environment?: ConversationEnvironment;
};

const titleSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

// Keep the full prompt in conversation data; only shorten its displayed title.
export function conversationDisplayTitle(title: string) {
  const text = title.replace(/\s+/g, ' ').trim();
  const characters = Array.from(titleSegmenter.segment(text), part => part.segment);
  return characters.length > 30 ? `${characters.slice(0, 29).join('')}…` : text;
}

// Local sample history, separate from the disabled message composer.
export const automationConversation: Conversation = {
  id: 'automation-daily-brief',
  group: '今天',
  title: '每日简报',
  summary: '今日项目简报已生成：CodeM Web App 的核心功能开发按计划推进，定时任务详情与运行历史交互已经进入联调阶段；当前没有新增阻塞项。建议今天完成抽屉交互验收，并继续关注移动端布局和历史会话跳转。',
  environment: { device: 'MacBook Pro', project: 'codem web app' },
};

export const conversations: Conversation[] = [
  automationConversation,
  { id: 'project-report', group: '今天', title: '生成项目总结报告', summary: '' },
  { id: 'delivery-risks', group: '今天', title: '梳理本周项目交付风险', summary: '本周可重点关注临近交付的需求、待确认的验收结果，以及跨团队依赖。建议先对齐各项工作的负责人和下一步计划，再按影响范围安排跟进。' },
  { id: 'sprint-progress', environment: { device: 'MacBook Pro', project: null }, group: '今天', title: '查看当前 Sprint 进展', summary: '可按开发中、测试中和待发布三个阶段梳理当前迭代，重点检查未完成事项、阻塞原因和预计完成时间。' },
  { id: 'weekly-update', group: '今天', title: '整理团队周会要点', summary: '周会内容可以分为本周完成、当前风险和下周计划。每个重点事项补充负责人、截止时间及需要协助的内容，方便会后继续跟进。' },
  { id: 'weekly-report', group: '本周', title: '生成项目进展周报', summary: '周报框架已整理为整体进度、关键里程碑、交付风险和下周计划。建议使用同一统计范围比较本周与上周的变化。' },
  { id: 'milestones', environment: { device: 'Mac Mini', project: null }, group: '本周', title: '检查版本发布里程碑', summary: '发布检查可覆盖功能验收、回归测试、灰度验证与上线准备。逐项确认完成条件，有助于及时发现影响发布的依赖。' },
  { id: 'workload', environment: { device: 'MacBook Pro', project: null }, group: '本周', title: '分析团队资源与负责人负载', summary: '可以按负责人汇总进行中事项、预计投入与截止时间，优先识别同一时间段存在多项交付承诺的情况。' },
  { id: 'requirements', group: '本周', title: '汇总高优先级需求', summary: '建议按优先级、当前状态和业务目标整理需求，并补充验收标准与关联项目，便于判断哪些事项需要优先推进。' },
  { id: 'retrospective', group: '更早', title: '项目结项复盘报告', summary: '复盘可从目标达成情况、计划与实际差异、协作问题和改进行动展开。将经验转化为有负责人和截止时间的具体行动。' },
  { id: 'okr', group: '更早', title: '整理 2026 OKR 需求', summary: '可将需求关联到对应的目标与关键结果，并检查目标贡献、推进状态及衡量方式，形成便于持续跟进的清单。' },
  { id: 'dependencies', environment: { device: 'Mac Mini', project: null }, group: '更早', title: '梳理跨团队协作依赖', summary: '建议记录依赖事项、提供方、接收方和最晚交付时间。对于可能影响关键路径的依赖，提前约定沟通节奏与替代方案。' },
  { id: 'monthly-review', group: '更早', title: '汇总月度项目进展', summary: '月度回顾可以围绕已完成成果、交付趋势、主要风险和下月重点展开，并保留数据来源以便后续核对。' },
  { id: 'next-sprint', environment: { device: 'MacBook Pro', project: null }, group: '更早', title: '规划下一轮迭代', summary: '规划前先确认迭代目标、团队容量和待完成事项，再结合优先级与依赖关系选择工作范围，预留处理风险的时间。' },
];
