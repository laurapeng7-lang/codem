import type { Conversation } from './conversation-history';
import type { ApplicationSlug } from './work-item-navigation';
import { getWorkItemView, type WorkItem } from './work-items-data';

export type WorkViewRow = Omit<WorkItem, 'owner' | 'avatar'> & {
  owner: string;
  pd: string;
  schedule?: { start: string; end: string };
};
export type WorkViewContext = { slug: ApplicationSlug; title: string; rows: WorkViewRow[] };
export type WorkViewConversation = Conversation & { view: { title: string; href: string } };

export function defaultWorkViewContext(slug: ApplicationSlug): WorkViewContext {
  const view = getWorkItemView(slug);
  return { slug, title: view.title, rows: view.items.map(({ avatar: _avatar, ...item }) => ({ ...item, pd: '2.5PD' })) };
}

// Restore the captured, locally edited table while rejecting malformed stored fields.
export function restoreWorkViewContext(slug: ApplicationSlug, saved: unknown): WorkViewContext {
  const context = defaultWorkViewContext(slug);
  if (!saved || typeof saved !== 'object' || !('rows' in saved) || !Array.isArray(saved.rows)) return context;
  const rows = saved.rows;
  const appIds = ['feishu', 'project', 'codem', 'open-platform'];
  context.rows = context.rows.map(row => {
    const entry = rows.find(value => value && typeof value === 'object' && value.id === row.id);
    if (!entry) return row;
    const schedule = entry.schedule;
    return {
      ...row,
      owner: typeof entry.owner === 'string' && entry.owner.trim() ? entry.owner.trim() : row.owner,
      pd: typeof entry.pd === 'string' ? entry.pd : row.pd,
      apps: Array.isArray(entry.apps) && entry.apps.every((app: unknown) => typeof app === 'string' && appIds.includes(app)) ? [...new Set<WorkItem['apps'][number]>(entry.apps)] : row.apps,
      schedule: schedule && typeof schedule.start === 'string' && typeof schedule.end === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(schedule.start) && /^\d{4}-\d{2}-\d{2}$/.test(schedule.end)
        ? { start: schedule.start, end: schedule.end } : undefined,
    };
  });
  return context;
}

export function workViewQueries(context: WorkViewContext) {
  const { slug, rows } = context;
  const pending = rows.filter(row => row.status !== 'done');
  const missingSchedule = pending.filter(row => !row.schedule?.start || !row.schedule.end);
  const owners = new Map<string, number>();
  pending.forEach(row => owners.set(row.owner, (owners.get(row.owner) ?? 0) + 1));
  const busiest = [...owners].sort((left, right) => right[1] - left[1])[0];
  const ownerQuestion = busiest
    ? `${busiest[0]} 负责的 ${busiest[1]} 项未完成工作，如何安排跟进优先级？`
    : '按负责人整理当前视图的交付成果与后续跟进事项';
  const scheduleQuestion = missingSchedule.length
    ? `还有 ${missingSchedule.length} 项未完成工作没有排期，优先补齐哪些？`
    : '检查未完成工作的排期，找出时间重叠和需要协调的安排';
  const named = (index: number) => `「${rows[index]?.title ?? context.title}」`;
  const questions: Record<ApplicationSlug, string[]> = {
    epic: [
      `汇总 ${rows.length} 个 Epic 的推进情况，找出需要优先跟进的方向`,
      `${named(0)}与${named(1)}，有哪些跨团队依赖需要确认？`,
      '企业权限控制与开放集成两条产品线，分别还缺哪些交付信息？',
      ownerQuestion, scheduleQuestion,
    ],
    version: [
      `整理这 ${rows.length} 个版本的发布准备情况，区分已完成和待推进项`,
      `${named(2)}尚未完成，发布前需要补齐哪些验证？`,
      `${named(7)}仍在 design 阶段，发布计划应先确认什么？`,
      ownerQuestion, scheduleQuestion,
    ],
    sprint: [
      `对比 Sprint 21–28 的状态，汇总尚未完成的 ${pending.length} 个迭代`,
      'Workflow Builder 和 Report Templates 两个迭代，如何对齐交付检查项？',
      `${named(7)}还在 design 阶段，发布准备需要哪些前置输入？`,
      ownerQuestion, scheduleQuestion,
    ],
    story: [
      `从 ${pending.length} 条未完成需求中，整理下一轮迭代的候选范围`,
      `${named(0)}与${named(6)}，分别需要补充哪些验收场景？`,
      `${named(7)}仍在设计阶段，需要明确哪些日期比较规则？`,
      ownerQuestion, scheduleQuestion,
    ],
    bug: [
      `将 ${pending.length} 个未完成缺陷按数据、权限和协作影响分类`,
      `${named(7)}涉及只读权限，应该优先验证哪些越权场景？`,
      '重复通知与离线评论保存失败，如何设计复现步骤和回归清单？',
      ownerQuestion, `整理 ${rows.filter(row => row.status === 'done').length} 个 done 缺陷的回归检查项，避免遗漏关联场景`,
    ],
    'story-list': [
      `从 ${rows.length} 项体验改进中，整理已交付成果和下一步候选项`,
      '置顶常用视图与记住表格列偏好，如何统一个人配置体验？',
      '草稿恢复和键盘导航需要覆盖哪些中断、焦点与快捷键场景？',
      ownerQuestion, scheduleQuestion,
    ],
    '2025-ybr': [
      '汇总 2025 年经营复盘的完成情况，列出还缺少的材料',
      '客户增长与留存、团队产能与效率，应分别补充哪些指标？',
      '结合产品交付亮点和风险经验，整理 2026 年业务行动项',
      ownerQuestion, scheduleQuestion,
    ],
    '2024-ybr': [
      '整理 2024 年度复盘进展，区分已完成和待补充的主题',
      '经营结果、OKR 达成与成本投入，如何统一复盘口径？',
      '结合市场拓展与客户体验改进，梳理 2025 年增长机会',
      ownerQuestion, scheduleQuestion,
    ],
  };
  return questions[slug].map((title, index) => ({ id: `${slug}-${index + 1}`, title }));
}

export function buildWorkViewConversation(context: WorkViewContext, prompt: string): WorkViewConversation {
  const title = prompt.trim();
  const pending = context.rows.filter(row => row.status !== 'done');
  const missingSchedule = pending.filter(row => !row.schedule?.start || !row.schedule.end);
  return {
    id: `work-view--${context.slug}--ask--${title}`, group: '今天', title,
    summary: `当前分析范围为「${context.title}」的 ${context.rows.length} 条记录，其中 ${context.rows.length - pending.length} 条状态为 done，${pending.length} 条尚未完成。${missingSchedule.length ? `未完成事项中有 ${missingSchedule.length} 条尚未设置排期，需先补齐目标日期，再判断延期风险。` : '未完成事项已填写排期，可以进一步核对负责人可用时间与交付准备情况。'}可结合各项工作的负责人、关联应用和 PD，整理需要跟进的问题与下一步行动。`,
    view: { title: context.title, href: `/apps/${context.slug}` },
  };
}
