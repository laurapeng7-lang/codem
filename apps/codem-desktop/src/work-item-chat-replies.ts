import { sentPromptSegments } from './prompt-content';
import { getWorkItemView, isWorkItemSlug } from './work-items-data';
import { reviewTeam, suggestedReviewTeam } from './work-item-review-data';
import { tableAppName, tableAppRecommendation } from './work-item-table-data';

type ReplySection = { title: string; items: string[] };
type ReplyScenario = 'owner' | 'review-owner' | 'ipmt-leader' | 'engineer-leader' | 'pd' | 'schedule' | 'review-team' | 'finish-date' | 'app' | 'breakdown' | 'risk' | 'general';
export type ChatReply = {
  scenario: ReplyScenario;
  durationSeconds: number;
  introduction: string;
  recommendation: string;
  sections: ReplySection[];
  conclusion: string;
  requirement?: { text: string; response: string };
};
type ChatSource = { title: string; href: string };

const fieldScenarios: Record<string, ReplyScenario> = {
  Owner: 'owner', owner: 'review-owner', 'Review owner': 'review-owner',
  'IPMT Leader': 'ipmt-leader', 'Engineer Leader': 'engineer-leader',
  PD: 'pd', Schedule: 'schedule', 'review team': 'review-team',
  'estimate finish time': 'finish-date', APP: 'app',
};

function promptContext(prompt: string) {
  const segments = sentPromptSegments(prompt);
  if (segments.length === 5) return {
    scenario: fieldScenarios[segments[3].text],
    requirement: segments[4].text.slice(' 最佳建议值，我的额外要求是：'.length).trim(),
  };
  const scenario: ReplyScenario | undefined = /IPMT\s*Leader/i.test(prompt) ? 'ipmt-leader'
    : /Engineer\s*Leader|工程负责人/i.test(prompt) ? 'engineer-leader'
    : /review\s*team|评审团队/i.test(prompt) ? 'review-team'
    : /estimate\s*finish\s*time|完成日期/i.test(prompt) ? 'finish-date'
    : /\bPD\b|人天|工时|工作量估算/i.test(prompt) ? 'pd'
    : /\bAPP\b|关联应用/i.test(prompt) ? 'app'
    : /拆分|拆解|子级|托管/.test(prompt) ? 'breakdown'
    : /延期|阻塞|风险|冲突/.test(prompt) ? 'risk'
    : /\bSchedule\b|排期|截止日期|编排/i.test(prompt) ? 'schedule'
    : /\bOwner\b|负责人/i.test(prompt) ? 'owner' : undefined;
  return { scenario, requirement: '' };
}

// Deterministic local demo responses: no network analysis or field writes are performed.
// Rebuilding from persisted prompts keeps the same reply and illustrative duration on reload.
export function createMockChatReply(prompt: string, source: ChatSource, previousPrompts: readonly string[] = []): ChatReply {
  const current = promptContext(prompt);
  let scenario = current.scenario;
  for (let index = previousPrompts.length - 1; !scenario && index >= 0; index--) scenario = promptContext(previousPrompts[index]).scenario;
  scenario ??= 'general';
  const title = `「${source.title}」`;
  const match = /^\/apps\/([a-z0-9-]+)\/([1-9]\d*)$/.exec(source.href);
  const application = match && isWorkItemSlug(match[1]) ? match[1] : undefined;
  const item = application ? getWorkItemView(application).items.find(item => item.id === Number(match![2])) : undefined;
  let reply: ChatReply;

  if (['owner', 'review-owner', 'ipmt-leader', 'engineer-leader'].includes(scenario)) {
    const review = scenario === 'review-owner';
    const committee = scenario === 'ipmt-leader';
    const engineering = scenario === 'engineer-leader';
    const role = review ? '评审负责人' : committee ? 'IPMT Leader' : engineering ? 'Engineer Leader' : 'Owner';
    const person = review ? 'Maikou' : 'Nannan';
    reply = {
      scenario, durationSeconds: committee ? 124 : 86,
      introduction: `针对${title}的${role}建议，我会同时考虑职责匹配、上下游协作和实际可投入时间。人选需要能推进交付，也需要能在关键节点收敛问题，避免任务已经分配却没有人跟进最终结果。`,
      recommendation: committee ? '建议由 Nannan 牵头，保留 Lei 共同参与 IPMT 评审。' : `建议将 ${person} 作为${role}人选。`,
      sections: [{ title: '推荐依据', items: [
        review ? '评审协调：由 Maikou 统一收集材料、整理决策项，并推动尚未达成一致的问题形成结论。' : engineering ? '技术衔接：由 Nannan 负责技术方案、接口边界和实现风险的核对，减少设计与开发交接中的信息遗漏。' : committee ? '职责互补：Nannan 负责技术可行性与交付范围，Lei 补充质量、验收标准和发布风险的判断。' : '任务衔接：Nannan 可以承担方案澄清、实现跟进和联调问题收敛，让交付过程有一个清晰的协调入口。',
        '协作成本：把对外沟通、依赖确认和进度更新集中到牵头人，执行成员继续负责各自的专业工作。',
        '投入安排：接受人选前核对同周期任务与评审日历，确认能够覆盖启动、联调和验收三个关键节点。',
      ] }, { title: '建议落地方式', items: [
        '启动时明确本次交付边界、验收口径和需要其他团队提供的输入，并给每项依赖约定最晚确认时间。',
        committee ? '多选成员保持现有分工，只补充缺失的职责；最终结论、负责人和后续动作统一记录到评审结果中。' : '为关键事项补充协作人和跟进时间；出现阻塞时，由牵头人同步影响范围并推动责任方确认解决方案。',
      ] }],
      conclusion: `建议先与 ${person} 确认可投入时间，再确定最终分工。人员可用性变化时，优先调整协作安排，避免频繁更换${role}造成上下文丢失。`,
    };
  } else if (scenario === 'pd') {
    reply = {
      scenario, durationSeconds: 138,
      introduction: `针对${title}，我建议先把工作量拆到可验收的活动，再汇总 PD。这样能说明时间花在哪里，也便于在需求范围变化后调整估算，而不是直接给出一个难以解释的总数。`,
      recommendation: '建议 PD 先按 5 PD 记录，作为这一轮计划的基线。',
      sections: [{ title: '工作量拆分', items: [
        '范围澄清与方案确认：0.5 PD。核对输入、输出、关键边界和验收标准，明确本次需要覆盖的场景。',
        '核心实现与自测：2.5 PD。完成主要逻辑、必要的异常处理和开发自测，先保证主链路可以完整运行。',
        '联调与回归验证：1.5 PD。验证上下游接口、权限与边界场景，并处理联调中暴露的问题。',
        '交付检查与材料整理：0.5 PD。确认遗留问题、补齐说明和验收记录，完成交接。',
      ] }, { title: '估算成立的前提', items: [
        '核心方案和接口约定能够在启动前确认，测试环境可用；等待外部评审的时间单独体现在 Schedule 中。',
        '当前范围不包含大规模数据迁移或额外的平台改造。若新增此类工作，单独拆成子任务并重新估算。',
      ] }],
      conclusion: '5 PD 表示投入工作量，并不直接等于 5 个日历日。下一步可以结合负责人的可用容量，把这些活动映射到排期，再确认交付日期。',
    };
  } else if (scenario === 'schedule' || scenario === 'finish-date') {
    const finish = scenario === 'finish-date';
    reply = {
      scenario, durationSeconds: 192,
      introduction: `针对${title}的${finish ? '预计完成时间' : 'Schedule'}，建议把前置输入、实施、联调和验收放在同一条时间线上。完成时间应以验收通过为准，避免只考虑开发结束，遗漏评审反馈和交付检查。`,
      recommendation: finish ? '建议 estimate finish time 暂定为 2026-03-08，与本轮示例排期的验收节点对齐。' : '建议以 2026-03-04 ～ 2026-03-08 作为初始排期窗口，再按负责人的工作日历确认。',
      sections: [{ title: '建议推进顺序', items: [
        '启动与范围确认：确认负责人、验收标准和前置依赖，冻结本次必须交付的内容。未确认的输入列为独立待办。',
        '实现与自测：先完成主链路，再补充异常与权限场景；开发期间同步准备联调数据和测试环境。',
        '联调与问题收敛：集中验证上下游衔接，优先处理影响验收的缺陷，并记录剩余问题的处理计划。',
        '评审与验收：预留反馈处理时间，确认交付物、验收记录和后续维护责任后，再将工作项标记为完成。',
      ] }, { title: '排期确认点', items: [
        '前序任务应在实施开始前提供可用输入。若依赖晚于约定时间，先判断能否并行推进，再更新受影响的节点。',
        '这个示例区间按日历日展示，3 月 7 日和 8 日为周末。若按标准工作日执行，需要顺延验收时间，不能把 5 PD 直接压进这个窗口。',
      ] }],
      conclusion: '建议先确认负责人容量与评审人的日历，再发布最终排期。若交付日期不能移动，可以优先拆出必须交付的范围，保留独立的联调与验收时间。',
    };
  } else if (scenario === 'review-team') {
    const team = reviewTeam(suggestedReviewTeam(application ? { application } : undefined));
    reply = {
      scenario, durationSeconds: 117,
      introduction: `针对${title}，评审团队的选择应对应这次需要做出的决策。建议先明确哪些结论必须在本轮收敛，再邀请具备相应职责的成员，减少只有信息同步、没有形成结论的会议。`,
      recommendation: `建议 review team 选择「${team.name}」，重点覆盖${team.description}。`,
      sections: [{ title: '建议评审范围', items: [
        '交付目标与范围：确认必须完成的内容、可以延后的内容，以及每项交付物的验收口径。',
        '方案与依赖：核对技术或业务方案的主要假设，明确外部依赖、资源投入和关键时间约束。',
        '风险与决策：把需要拍板的问题提前列出，附上影响、可选处理方式和建议结论，避免在会上临时补材料。',
      ] }, { title: '参与方式', items: [
        `由${team.name}牵头组织正式评审，相关负责人补充专业意见；需要补充其他团队时，明确其负责判断的事项。`,
        '会前同步材料与待决策清单，会后记录结论、修改项、责任人和完成时间，未通过事项安排复核。',
      ] }],
      conclusion: '团队选择确定后，建议同时补齐评审负责人和预计完成时间，让人员、决策范围与排期形成完整的闭环。',
    };
  } else if (scenario === 'app') {
    const app = item ? tableAppRecommendation(item) : 'project';
    const name = tableAppName(app);
    const existing = item?.apps.map(tableAppName).join('、');
    reply = {
      scenario, durationSeconds: 74,
      introduction: `针对${title}的 APP 关联，建议根据主要交付内容选择应用，同时保留已经承担协作或跟踪职责的关联。APP 是范围信息，多选时应让每个应用都有明确用途。`,
      recommendation: `建议关联「${name}」${existing ? `，并保留已有的${existing}` : ''}。`,
      sections: [{ title: '关联依据', items: [
        `主要工作放在${name}对应的业务范围内跟踪，便于参与者找到相关实现、交付记录和验收信息。`,
        existing ? `当前已有应用范围为${existing}，建议核对它们与本次交付的关系，仍有协作或依赖的应用继续保留。` : '其他应用只在存在明确的数据流、协作关系或交付依赖时补充，避免过度关联。',
        '同一个工作项不需要重复创建多份记录，跨应用协作可通过关联说明明确各自的责任边界。',
      ] }, { title: '补充信息', items: [
        '为关联应用补充对应的负责人、相关工作项或交付链接，让其他成员能够继续追踪。',
        '确认关联后检查筛选视图和交付清单是否覆盖该工作项；范围变化时同步更新关联说明。',
      ] }],
      conclusion: item?.apps.includes(app) ? `「${name}」已经在关联列表中，无需重复添加；可以直接补充它在本次交付中的职责说明。` : '建议确认主要应用后再补充次要关联，避免仅因名称相似就扩大工作项的应用范围。',
    };
  } else if (scenario === 'breakdown') {
    reply = {
      scenario, durationSeconds: 156,
      introduction: `针对${title}，建议按可独立验收的成果拆分子级，再安排负责人和前序依赖。这样既能看到整体进度，也能在某个环节出现阻塞时明确需要调整的任务。`,
      recommendation: '建议先拆为范围确认、方案与实施、联调验证、验收交付四个子级。',
      sections: [{ title: '建议子级', items: [
        '范围确认：整理目标、现有流程和必须交付的场景，产出确认后的范围清单与验收标准。',
        '方案与实施：确定关键方案、接口与责任边界，完成主链路并提供可验证的交付版本。',
        '联调验证：覆盖上下游衔接和异常场景，记录问题、处理负责人及预计解决时间。',
        '验收交付：根据验收标准逐项确认结果，整理操作说明、遗留事项和维护安排。',
      ] }, { title: '计划编排原则', items: [
        '核心依赖按照范围确认、实施、验证、验收的顺序衔接；测试准备与说明材料可以在实施期间并行推进。',
        '子级各自指定一名牵头人，排期落在父任务的交付窗口内；需要增加范围时同步复核父任务工作量。',
      ] }],
      conclusion: '进度汇总、材料整理和待办提醒可以交给 CodeM 协助跟进，范围取舍、正式评审结论和最终验收仍由对应负责人确认。',
    };
  } else {
    const risk = scenario === 'risk';
    reply = {
      scenario, durationSeconds: risk ? 168 : 108,
      introduction: `围绕${title}，建议把当前问题放回交付目标、任务进度和协作依赖中一起判断。先形成一份可以逐项确认的清单，再确定优先处理的事项，会更容易把讨论转化为实际行动。`,
      recommendation: risk ? '建议优先排查关键路径上的前置依赖、未完成评审和负责人负载，并分别明确处理动作。' : '建议先确认交付范围与验收标准，再对齐负责人、工作量和排期。',
      sections: [{ title: risk ? '重点排查项' : '建议梳理内容', items: [
        '范围与验收：对照必须交付的内容检查当前结果，识别尚未完成的部分，以及仍需业务方确认的验收口径。',
        '进度与依赖：检查前序输入是否齐备，当前任务是否有可验证的阶段成果，以及后续节点是否受影响。',
        '人员与资源：确认牵头人和关键协作成员的可用时间，特别关注同一阶段存在多项交付承诺的情况。',
      ] }, { title: '下一步行动', items: [
        '按影响范围整理待办，为每项问题补上责任人、最晚处理时间和预期产出，避免只有问题描述而没有推进方式。',
        risk ? '对可能延期的节点先确认剩余工作量，比较调整范围、并行推进和重新排期的可行性，再同步受影响的里程碑。' : '先推进依赖清楚、验收明确的任务，对输入不完整的事项单独安排确认，不让全部工作停在同一个问题上。',
        '在下一个检查点更新已完成事项、剩余阻塞和时间变化，并把需要决策的问题交给有对应职责的负责人。',
      ] }],
      conclusion: '如果继续补充目标日期、当前阻塞或可投入人员，可以据此进一步细化到具体任务和排期；这一轮先把建议作为计划讨论的基线。',
    };
  }

  const requirement = current.requirement || (previousPrompts.length && !current.scenario ? prompt.trim() : '');
  if (requirement) reply.requirement = {
    text: requirement,
    response: /联调|测试|回归/.test(requirement) ? '我会把联调与回归单列为交付活动，提前确认环境、数据和协作人，并在最终验收前保留问题收敛时间。工作量发生变化时，同步复核 PD 与 Schedule。'
      : /下周|资源|投入|容量|人手/.test(requirement) ? '安排时先锁定相关人员的可投入时间，再确定并行任务和交付顺序。资源不足的部分先调整范围或顺延节点，避免把等待时间隐藏在原计划中。'
      : '这项要求应加入范围与验收清单。落实前先确认它对负责人、工作量和前序依赖的影响，再同步调整计划中的对应项。',
  };
  return reply;
}
