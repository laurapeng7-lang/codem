import figmaHeatmap from './agent-detail-heatmap.json';

type AgentTask = { title: string; project: string };
type ActivityPattern = { start: number; density: number; peaks: number[]; quietFrom?: number };
type AgentActivity = { pattern: ActivityPattern; active: AgentTask[]; pending: AgentTask[]; completed: number };
const task = (title: string, project: string): AgentTask => ({ title, project });

// Demo activity is tied to agent identity, so editing the profile does not replace its history.
const activityByAgent: Record<string, AgentActivity> = {
  planner: {
    pattern: { start: 18, density: .6, peaks: [21, 22] }, completed: 24,
    active: [
      task('拆解商家工作台 Q4 需求与交付范围', '商家工作台'),
      task('对齐移动端 3.8 版本里程碑', '移动端体验升级'),
      task('梳理统一登录项目的跨团队依赖', '统一身份平台'),
      task('规划 Sprint 18 容量与优先级', '研发效能平台'),
      task('跟进数据看板需求评审结论', '经营分析看板'),
    ],
    pending: [task('准备下一轮需求澄清清单', '客户服务中心'), task('评估订单改版的排期影响', '订单履约平台')],
  },
  architect: {
    pattern: { start: 12, density: .46, peaks: [15, 20, 25] }, completed: 18,
    active: [
      task('评审事件总线的服务解耦方案', '订单履约平台'),
      task('设计多租户权限隔离边界', '统一身份平台'),
      task('评估搜索索引扩容与迁移风险', '企业知识库'),
    ],
    pending: [task('补充跨地域容灾架构图', '基础设施升级'), task('确认 API 网关限流策略', '开放平台'), task('组织缓存一致性方案评审', '商品中心')],
  },
  reviewer: {
    pattern: { start: 10, density: .74, peaks: [19, 23, 26] }, completed: 36,
    active: [
      task('审查登录态刷新与权限校验变更', '统一身份平台'),
      task('复核支付回调的幂等处理逻辑', '交易服务'),
      task('检查看板查询的性能与边界条件', '经营分析看板'),
      task('评审附件上传的异常恢复实现', '协作工作台'),
    ],
    pending: [task('复审搜索分页接口的测试覆盖', '企业知识库')],
  },
  tester: {
    pattern: { start: 8, density: .8, peaks: [17, 18, 24, 25] }, completed: 42,
    active: [
      task('执行 Android 3.8 核心链路回归', '移动端体验升级'),
      task('补齐优惠券叠加规则的边界用例', '营销中台'),
      task('验证订单取消后的库存回补', '订单履约平台'),
      task('回归批量导入的失败重试流程', '客户服务中心'),
      task('检查 Safari 下的表单兼容性', '商家工作台'),
      task('验证搜索高并发压测结果', '企业知识库'),
    ],
    pending: [task('整理灰度环境验收清单', '交易服务'), task('补充弱网与离线场景用例', '移动端体验升级')],
  },
  sheriff: {
    pattern: { start: 14, density: .4, peaks: [16, 17, 22, 27] }, completed: 28,
    active: [
      task('排查订单同步延迟告警', '订单履约平台'),
      task('跟进 iOS 启动崩溃的修复进展', '移动端体验升级'),
      task('定位上传服务间歇性超时', '协作工作台'),
    ],
    pending: [task('确认支付告警的责任人与时限', '交易服务'), task('复盘缓存击穿事件', '商品中心'), task('清理 Sprint 18 阻塞项', '研发效能平台'), task('补充线上异常排查手册', '基础设施升级')],
  },
  release: {
    pattern: { start: 16, density: .5, peaks: [20, 21, 26, 27] }, completed: 16,
    active: [
      task('核对 3.8.0 版本发布准入条件', '移动端体验升级'),
      task('跟进灰度流量与核心指标', '交易服务'),
      task('确认数据库变更的回滚预案', '订单履约平台'),
      task('汇总本轮发布遗留风险', '商家工作台'),
    ],
    pending: [task('准备周四发布窗口的变更清单', '开放平台'), task('同步发布公告与值班安排', '协作工作台')],
  },
  radar: {
    pattern: { start: 5, density: .3, peaks: [11, 17], quietFrom: 24 }, completed: 9,
    active: [task('识别 Q4 项目组合的交付偏差', '项目组合管理'), task('梳理跨项目资源冲突', '产研资源规划')],
    pending: [task('汇总高风险依赖的处置进展', '项目组合管理'), task('复核重点项目的里程碑健康度', '研发效能平台'), task('更新团队负载与容量预测', '产研资源规划')],
  },
};

const customActivity: AgentActivity = {
  pattern: { start: 20, density: .42, peaks: [25, 27] }, completed: 6,
  active: [
    task('整理本周待办与交付清单', '团队协作'),
    task('跟进工作项进展与阻塞原因', '项目交付'),
    task('核对需求变更的影响范围', '需求管理'),
    task('汇总跨团队协作事项', '团队协作'),
    task('更新本轮迭代的执行计划', '项目交付'),
  ],
  pending: [task('补充项目操作规范', '团队协作'), task('准备下一次进展同步', '项目交付')],
};

function seedFor(id: string) {
  let seed = 2166136261;
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

function activityCells(id: string, pattern: ActivityPattern) {
  let seed = seedFor(id);
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  // Preserve the Figma palette; its darkest shade is index 3, not index 4.
  const intensity = [1, 2, 4, 3];
  return Array.from({ length: 196 }, (_, index) => {
    const row = Math.floor(index / 28);
    const column = index % 28;
    if (column < pattern.start || column >= (pattern.quietFrom ?? 28)) return 0;
    const peak = pattern.peaks.includes(column);
    const density = (pattern.density + (peak ? .24 : 0)) * (row > 4 ? .55 : 1);
    if (random() > density) return 0;
    const level = Math.min(3, Math.floor(random() * (peak ? 4 : 3)));
    return intensity[level];
  });
}

export const agentActivityColors = figmaHeatmap.colors;

export function getAgentDetailData(agentId: string) {
  const activity = activityByAgent[agentId] ?? customActivity;
  // Stable variations also distinguish newly created agents without rerender-time randomness.
  const customOffset = seedFor(agentId) % customActivity.active.length;
  const active = activity === customActivity
    ? [...activity.active.slice(customOffset), ...activity.active.slice(0, customOffset)]
    : activity.active;
  return {
    heatmap: agentId === 'planner' ? figmaHeatmap.rows.flat() : activityCells(agentId, activity.pattern),
    taskGroups: [
      { id: 'in-progress', label: '进行中', count: active.length, expanded: true, tasks: active },
      { id: 'not-started', label: '未开始', count: activity.pending.length, expanded: false, tasks: activity.pending },
      { id: 'completed', label: '已完成', count: activity.completed, expanded: false, tasks: [] as AgentTask[] },
    ],
  };
}
