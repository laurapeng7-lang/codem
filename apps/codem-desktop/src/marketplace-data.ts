export const templates = [
  { title: '整车制造解决方案', category: 'Hardware Dev', color: '#186010', image: 'template-auto.png', description: '贯穿整车研发与制造流程，协同项目排期、里程碑与交付任务。' },
  { title: '通用客户关系管理', category: 'CRM', color: '#0442d2', image: 'template-crm.png', description: '集中管理客户信息、商机和跟进记录，让销售协作与客户关系管理更清晰。' },
  { title: '战略到执行管理', category: 'DSTE', color: '#2b2f36', image: 'template-dste.png', description: '连接战略目标与项目执行，跟踪重点任务、资源投入和目标达成情况。' },
  { title: 'SAFe 大型敏捷解决方案', category: 'Software Dev', color: '#9d1562', image: 'template-safe.png', description: '面向多团队敏捷协作，统筹需求、迭代计划和项目交付。' },
];
export const agentSkills = [
  { title: '项目结项复盘报告', description: '对比项目目标与交付结果，梳理关键问题、经验和后续改进项。', image: 'skill-retrospective.png', scenarios: ['项目复盘'] },
  { title: '项目进展周报', description: '汇总项目本周完成事项、里程碑进展和下周计划，生成项目周报。', image: 'skill-weekly-report.png', scenarios: ['团队周报'] },
  { title: '项目风险洞察', description: '检查项目状态、阻塞与依赖关系，识别风险信号并给出应对建议。', image: 'skill-risk-insight.png', scenarios: ['风险管理'] },
  { title: '团队人力负载分析', description: '汇总成员排期与在手任务，识别过载和空闲，提出工作分配建议。', image: 'skill-risk-insight-alt.png', scenarios: ['人力分析'] },
];
export const applications = [
  { title: 'CodeM', description: '结合需求与代码上下文，辅助编写、调试和评审代码，推进研发任务。', image: 'app-codem.svg', official: true },
  { title: '豆包工作', description: '整理任务资料与沟通信息，辅助起草文档、汇总要点和推进日常协作。', image: 'app-doubao.png', official: true },
  { title: '智能翻译', description: '翻译需求、评论与项目文档，保留业务术语，帮助跨语言团队协作。', image: 'app-translate.svg', color: '#c82dc8', size: 18.33 },
  { title: '智能打标', description: '理解需求与反馈内容，按业务规则推荐标签，减少重复的分类操作。', image: 'app-tag.svg', color: '#00b89f', size: 20 },
  { title: '智能关键词提取', description: '从长文本中提取主题、产品名称与问题关键词，便于检索和归类。', image: 'app-keyword.svg', color: '#d72d8d', size: 20 },
  { title: '智能总结', description: '提炼讨论与文档中的关键结论、待办事项和责任人，快速掌握重点。', image: 'app-summary.svg', color: '#00aff0', size: 20 },
];
// Demo catalog: descriptions and download counts illustrate integrations, not live marketplace statistics.
const pluginItems: (CatalogItem & { downloads: string })[] = [
  {
    id: 'plugin-devops', title: 'Lark DevOps', image: 'plugin-devops.png', official: true, downloads: '12.8k',
    description: '关联代码提交、构建与发布记录，在项目中追踪研发流水线和版本交付。',
    scenarios: ['代码托管', '发版管理', '安全/监控'],
  },
  {
    id: 'plugin-zendesk', title: 'Zendesk', image: 'plugin-zendesk.png', downloads: '9.6k',
    description: '将客户工单同步为项目任务，关联问题进展，让支持团队与研发协作更顺畅。',
    scenarios: ['任务管理', '质量/保障'],
  },
  {
    id: 'plugin-aiden', title: 'Aiden 智能助手', image: 'plugin-aiden.png', roundImage: true, downloads: '7.2k',
    description: '整理项目上下文与讨论要点，辅助拆解任务、生成行动项并跟进后续工作。',
    scenarios: ['文档管理', '任务管理'],
  },
  {
    id: 'plugin-slack', title: 'Slack', image: 'plugin-slack.png', downloads: '18.6k',
    description: '把任务变更与项目提醒推送到团队频道，让重要进展及时触达协作成员。',
    scenarios: ['任务管理', '发版管理'],
  },
  {
    id: 'plugin-dorado', title: 'Dorado 数据开发', image: 'plugin-dorado.png', downloads: '5.4k',
    description: '关联数据开发任务与调度状态，集中查看运行结果，定位数据链路中的异常。',
    scenarios: ['数据图表', '安全/监控'],
  },
  {
    id: 'plugin-feedback', title: 'Feedback 用户反馈', image: 'plugin-feedback.png', roundImage: true, downloads: '4.3k',
    description: '汇集用户建议与问题反馈，去重分类后转为需求，持续跟踪处理和回访结果。',
    scenarios: ['任务管理', '质量/保障'],
  },
  {
    id: 'plugin-test-cases', title: '测试用例管理', image: 'ai-test-cases.png', downloads: '8.9k',
    description: '按需求组织测试用例与执行计划，关联缺陷记录，掌握测试覆盖和验收进度。',
    scenarios: ['测试工具', '质量/保障'],
  },
  {
    id: 'plugin-mobile-preview', title: '移动端预览', image: 'ai-prototype.png', downloads: '2.7k',
    description: '在项目中查看移动端界面与交互方案，收集评审意见，减少设计交付偏差。',
    scenarios: ['设计工具', '测试工具'],
  },
  {
    id: 'plugin-image-annotation', title: '图片标注', image: 'ai-image-recognition.png', downloads: '6.1k',
    description: '为截图和设计稿添加区域标注，将视觉问题关联到任务，让修改意见更明确。',
    scenarios: ['画图工具', '设计工具'],
  },
  {
    id: 'plugin-workflow', title: '自动化流程', image: 'ai-flow-summary.png', downloads: '11.2k',
    description: '通过事件触发任务流转、字段更新与消息通知，自动完成重复的项目操作。',
    scenarios: ['任务管理', '发版管理'],
  },
  {
    id: 'plugin-budget', title: '项目预算管理', image: 'ai-budget.png', downloads: '3.5k',
    description: '汇总预算、工时与实际支出，用图表对比成本偏差，及时识别超支风险。',
    scenarios: ['数据图表'],
  },
  {
    id: 'plugin-code-review', title: '代码评审', image: 'ai-code-review.png', downloads: '10.6k',
    description: '关联合并请求与评审意见，跟踪检查结果和待修问题，守住代码交付质量。',
    scenarios: ['代码托管', '质量/保障'],
  },
  {
    id: 'plugin-release-alerts', title: '发布提醒', image: 'ai-review-summary.png', downloads: '7.8k',
    description: '订阅版本发布、构建失败与服务异常，按负责人分发提醒并追踪处理状态。',
    scenarios: ['发版管理', '安全/监控'],
  },
  {
    id: 'plugin-document-translation', title: '文档翻译', image: 'app-translate.svg', color: '#c82dc8', size: 24, downloads: '4.9k',
    description: '翻译需求说明与项目文档，保留术语和段落结构，帮助跨语言团队理解业务。',
    scenarios: ['文档管理'],
  },
  {
    id: 'plugin-tags', title: '标签管理', image: 'app-tag.svg', color: '#00b89f', size: 26, downloads: '3.2k',
    description: '统一任务与文档标签，按业务规则批量分类，让检索、筛选和统计更清晰。',
    scenarios: ['文档管理', '任务管理'],
  },
  {
    id: 'plugin-api', title: 'API 连接器', image: 'app-keyword.svg', color: '#d72d8d', size: 26, downloads: '2.4k',
    description: '配置接口授权、请求参数与字段映射，将外部系统数据接入项目协作流程。',
    scenarios: ['API 授权', '数据图表'],
  },
  {
    id: 'plugin-requirement-map', title: '需求关系图', image: 'ai-requirement-breakdown.svg', color: '#5e5ce6', size: 26, downloads: '3.9k',
    description: '将需求、任务与缺陷的关联展开为关系图，快速查看上下游依赖和受影响范围。',
    scenarios: ['画图工具', '设计工具'],
  },
  {
    id: 'plugin-milestone-calendar', title: '里程碑日历', image: 'ai-milestone.svg', color: '#ff8800', size: 26, downloads: '8.2k',
    description: '汇总评审、发布和交付日期，按项目订阅关键节点，提醒负责人提前准备。',
    scenarios: ['发版管理', '任务管理'],
  },
  {
    id: 'plugin-release-checklist', title: '发布检查清单', image: 'ai-release-notes.svg', color: '#8a43e1', size: 26, downloads: '6.8k',
    description: '按版本维护上线检查项、灰度计划和回滚预案，跟踪每项检查的确认人和完成状态。',
    scenarios: ['发版管理', '质量/保障'],
  },
  {
    id: 'plugin-acceptance-records', title: '验收记录管理', image: 'ai-acceptance-check.svg', color: '#34c724', size: 26, downloads: '5.7k',
    description: '关联验收标准、测试结果与交付证据，记录验收结论，跟进待整改问题。',
    scenarios: ['测试工具', '质量/保障'],
  },
  {
    id: 'plugin-service-alerts', title: '服务告警中心', image: 'ai-risk-detection.svg', color: '#f54a45', size: 26, downloads: '9.1k',
    description: '将服务异常关联到项目问题，按告警等级通知值班成员，持续跟踪处理与恢复进展。',
    scenarios: ['安全/监控'],
  },
  {
    id: 'plugin-member-access', title: '成员权限同步', image: 'ai-owner-recommendation.svg', color: '#3370ff', size: 26, downloads: '4.6k',
    description: '映射外部系统成员与项目角色，按授权规则同步访问范围，记录权限调整结果。',
    scenarios: ['API 授权', '任务管理'],
  },
  {
    id: 'plugin-duty-roster', title: '团队值班排期', image: 'ai-team-capacity.svg', color: '#009d86', size: 26, downloads: '2.1k',
    description: '维护轮值班次、交接事项与代班安排，将值班人员关联到告警响应和日常任务。',
    scenarios: ['任务管理', '安全/监控'],
  },
  {
    id: 'plugin-document-bundle', title: '文档汇编导出', image: 'app-summary.svg', color: '#00aff0', size: 26, downloads: '7.4k',
    description: '按项目或交付阶段汇集文档，生成目录与资料包，方便评审查阅和交付归档。',
    scenarios: ['文档管理'],
  },
];
export const plugins = pluginItems.slice(0, 6);
export const courses = [
  { title: 'AI 应用与 AI 开放', caption: '飞书项目课程之', image: 'academy-apps.png', className: 'apps', description: '了解飞书项目的 AI 应用与开放能力，将智能工具融入项目协作。' },
  { title: 'AI 度量与自动化', caption: '飞书项目实战特训营', image: 'academy-automation.png', className: 'automation', description: '通过项目度量与自动化实践，提升团队协作效率。' },
];

export type CatalogCategory = 'AI Apps' | 'Agent Skills' | 'Plugins' | 'Templates';
type CatalogItem = {
  id: string;
  title: string;
  description: string;
  image: string;
  scenarios: string[];
  category?: string;
  color?: string;
  size?: number;
  downloads?: string;
  official?: boolean;
  roundImage?: boolean;
};
type Catalog = {
  kind: 'app' | 'skill' | 'plugin' | 'template';
  filters: readonly string[];
  items: CatalogItem[];
};

const scenarioFilters = ['最佳实践', '轻应用搭建', '项目开发', '流程配置', '项目复盘', '项目质量', '团队周报', '人力分析', '风险管理'] as const;
const pluginFilters = ['最佳实践', '画图工具', '文档管理', '设计工具', '测试工具', '质量/保障', '代码托管', '发版管理', '安全/监控', '数据图表', 'API 授权', '任务管理'] as const;
const templateFilters = ['最佳实践', '软件研发', '整车与汽车产业链', 'IPD 集成产品开发', '游戏行业', '内容制作', 'LTC 流程链路', '消费与医疗', '反馈管理', '项目交付', '芯片与机器人', '消费电子'] as const;
const aiItems = [
  { title: '测试用例生成', description: '从需求说明提炼测试场景，补充边界条件、操作步骤与预期结果。', image: 'ai-test-cases.png', scenarios: ['AI 节点', 'AI 操作'] },
  { title: '方案原型生成', description: '将产品方案转为页面结构与交互草图，辅助设计评审和实现范围确认。', image: 'ai-prototype.png', scenarios: ['AI 节点', 'AI 操作'] },
  { title: '图片识别', description: '提取截图、表格和图片中的文字与关键信息，整理为可录入的项目字段。', image: 'ai-image-recognition.png', scenarios: ['AI 节点', 'AI 字段'] },
  { title: '流程信息总结', description: '梳理流程节点、审批记录和处理进展，汇总当前状态、阻塞与下一步行动。', image: 'ai-flow-summary.png', scenarios: ['AI 节点', 'AI 操作', 'AI 字段'] },
  { title: '项目预算展示', description: '汇总预算、工时与实际支出，生成成本对比视图，直观呈现预算执行情况。', image: 'ai-budget.png', scenarios: ['AI 节点', 'AI 字段'] },
  { title: 'Deepseek R1', description: '结合项目上下文分析复杂问题，梳理关键约束，给出解决思路与执行建议。', image: 'ai-deepseek.png', scenarios: ['AI 节点', 'AI 操作', 'AI 字段'] },
  { title: 'code review', description: '检查代码变更中的潜在缺陷与规范问题，输出评审意见和改进建议。', image: 'ai-code-review.png', scenarios: ['AI 节点', 'AI 操作'] },
  { title: '评审结论总结', description: '汇集评审意见，提炼通过结论、待修改项与责任人，形成可追踪的评审记录。', image: 'ai-review-summary.png', scenarios: ['AI 节点', 'AI 操作', 'AI 字段'] },
  { title: 'Kimi 阅读助手', description: '阅读长篇需求与项目资料，提炼关键内容，并围绕文档问题整理答案。', image: 'ai-kimi.png', scenarios: ['AI 节点', 'AI 操作'] },
  { title: '智能翻译', description: '翻译需求说明、项目评论与交付文档，保留业务术语，帮助跨语言团队协作。', image: 'app-translate.svg', color: '#c82dc8', size: 20, scenarios: ['AI 节点', 'AI 操作', 'AI 字段'] },
  { title: '智能打标', description: '理解需求和反馈的业务含义，按团队标签规则推荐分类，并说明匹配依据。', image: 'app-tag.svg', color: '#00b89f', size: 20, scenarios: ['AI 节点', 'AI 字段'] },
  { title: '关键词提取', description: '从长文本中识别产品名称、核心问题与业务关键词，便于项目资料检索和归类。', image: 'app-keyword.svg', color: '#d72d8d', size: 20, scenarios: ['AI 节点', 'AI 字段'] },
  { title: '会议纪要整理', description: '将会议记录整理为讨论要点、决策结论和行动清单，明确责任人与跟进事项。', image: 'app-summary.svg', color: '#00aff0', size: 20, scenarios: ['AI 节点', 'AI 操作'] },
  { title: '需求拆解助手', description: '将需求目标拆分为工作包与可执行任务，梳理父子层级、依赖关系和验收边界。', image: 'ai-requirement-breakdown.svg', color: '#5e5ce6', size: 20, scenarios: ['AI 节点', 'AI 操作'] },
  { title: '里程碑识别', description: '从项目计划中提取关键交付节点，整理目标日期、前置条件和需要确认的信息。', image: 'ai-milestone.svg', color: '#ff8800', size: 20, scenarios: ['AI 节点', 'AI 操作', 'AI 字段'] },
  { title: '版本说明生成', description: '汇总版本内的新增能力、体验优化与缺陷修复，生成适合对外发布的版本说明。', image: 'ai-release-notes.svg', color: '#8a43e1', size: 20, scenarios: ['AI 节点', 'AI 操作'] },
  { title: '验收标准检查', description: '对照验收条款检查交付记录，标记缺失证据、未达标事项和需要补充的验证。', image: 'ai-acceptance-check.svg', color: '#34c724', size: 20, scenarios: ['AI 节点', 'AI 操作', 'AI 字段'] },
  { title: '风险信号识别', description: '结合延期、阻塞与频繁变更记录，识别项目风险信号，给出原因说明与跟进建议。', image: 'ai-risk-detection.svg', color: '#f54a45', size: 20, scenarios: ['AI 节点', 'AI 字段'] },
  { title: '负责人推荐', description: '结合任务领域、成员职责与当前负载，推荐适合的负责人，并列出需要人工确认的条件。', image: 'ai-owner-recommendation.svg', color: '#3370ff', size: 20, scenarios: ['AI 节点', 'AI 操作', 'AI 字段'] },
  { title: '团队容量分析', description: '对比团队可用工时与计划任务，识别资源缺口和投入冲突，辅助调整后续排期。', image: 'ai-team-capacity.svg', color: '#009d86', size: 20, scenarios: ['AI 节点', 'AI 操作'] },
].map(item => ({ ...item, id: item.image }));

const skillCovers = ['catalog-skill-retrospective.png', 'catalog-skill-weekly.png', 'skill-risk-insight-alt.png', 'catalog-skill-risk-alt.png'];
const skillItems: CatalogItem[] = [
  ...agentSkills.map((item, index) => ({ ...item, id: `skill-${index}`, image: skillCovers[index] })),
  {
    id: 'skill-app-builder', title: '业务轻应用生成', image: 'catalog-skill-web-cyan.png', scenarios: ['轻应用搭建'],
    description: '将业务需求拆为数据表、字段和页面结构，生成轻应用的搭建方案。',
  },
  {
    id: 'skill-dashboard-builder', title: '项目数据看板搭建', image: 'catalog-skill-web-orange.png', scenarios: ['轻应用搭建'],
    description: '选择项目指标与数据来源，规划图表和筛选器，搭建业务数据看板。',
  },
  {
    id: 'skill-requirement-planning', title: '需求拆解与排期', image: 'catalog-skill-web-purple.png', scenarios: ['项目开发'],
    description: '把需求拆成可执行任务，梳理依赖与工作量，形成开发排期建议。',
  },
  {
    id: 'skill-milestone-planning', title: '关键里程碑规划', image: 'catalog-skill-web-purple-alt.png', scenarios: ['项目开发'],
    description: '从项目目标推导关键交付节点，明确验收标准、负责人和目标日期。',
  },
  {
    id: 'skill-approval-flow', title: '审批流程配置', image: 'catalog-skill-web-cyan.png', scenarios: ['流程配置'],
    description: '根据审批规则设计节点、分支与处理角色，检查流程缺失和流转冲突。',
  },
  {
    id: 'skill-automation-rules', title: '项目自动化规则', image: 'catalog-skill-web-orange.png', scenarios: ['流程配置'],
    description: '将重复操作整理为触发条件与执行动作，配置通知、字段更新和状态流转。',
  },
  {
    id: 'skill-sprint-retrospective', title: '迭代复盘与改进', image: 'catalog-skill-web-purple.png', scenarios: ['项目复盘'],
    description: '回顾迭代承诺与实际完成情况，定位交付偏差，形成下一轮改进计划。',
  },
  {
    id: 'skill-quality-inspection', title: '项目质量巡检', image: 'catalog-skill-web-purple-alt.png', scenarios: ['项目质量'],
    description: '检查需求完整度、测试覆盖和缺陷状态，输出质量问题及修复优先级。',
  },
  {
    id: 'skill-defect-analysis', title: '缺陷根因分析', image: 'catalog-skill-web-cyan.png', scenarios: ['项目质量'],
    description: '聚合同类缺陷与发生环节，追溯共性原因，提出预防措施和验证方法。',
  },
  {
    id: 'skill-team-weekly', title: '团队周报汇总', image: 'catalog-skill-web-orange.png', scenarios: ['团队周报'],
    description: '汇总成员本周产出、待协调事项与下周安排，生成团队周会材料。',
  },
  {
    id: 'skill-capacity-planning', title: '资源容量评估', image: 'catalog-skill-web-purple.png', scenarios: ['人力分析'],
    description: '对比后续需求与团队可用工时，评估人员缺口，辅助制定资源投入计划。',
  },
  {
    id: 'skill-delay-risk', title: '延期风险评估', image: 'catalog-skill-web-purple-alt.png', scenarios: ['风险管理'],
    description: '结合关键路径、剩余工作量和阻塞时长，评估延期影响并给出缓解建议。',
  },
];
const templateScenarios = [
  ['整车与汽车产业链', 'IPD 集成产品开发', '项目交付', '芯片与机器人', '消费电子'], ['LTC 流程链路', '消费与医疗', '反馈管理'],
  ['IPD 集成产品开发', '内容制作', '项目交付'], ['软件研发', '游戏行业', '项目交付'],
];
// Figma 19:33642: preserve cover order and replace repeated placeholder copy with each cover's subject.
const templateItems: CatalogItem[] = [
  ...templates.map((item, index) => ({ ...item, id: `template-${index}`, scenarios: templateScenarios[index] })),
  {
    id: 'template-energy-ltc', title: '能源行业 LTC', category: '能源行业', color: '#9a5315', image: 'template-energy-ltc.png',
    description: '串联能源行业的线索、商机、合同与回款，跟踪销售流程和项目交付。',
    scenarios: ['LTC 流程链路', '项目交付'],
  },
  {
    id: 'template-agile', title: 'Agile 敏捷开发流程', category: '软件研发', color: '#9d1562', image: 'template-agile.png',
    description: '统一管理需求、迭代、任务与缺陷，协同敏捷团队的研发节奏和版本交付。',
    scenarios: ['软件研发', '游戏行业', '项目交付'],
  },
  {
    id: 'template-robotics', title: '机器人产品研发', category: '芯片与机器人', color: '#2b2f36', image: 'template-robotics.png',
    description: '贯穿机器人产品的需求、技术评审、研发验证与交付，统筹项目进度和资源投入。',
    scenarios: ['芯片与机器人', 'IPD 集成产品开发'],
  },
  {
    id: 'template-consumer-product', title: '消费品新品研发', category: '消费与医疗', color: '#186010', image: 'template-consumer-product.png',
    description: '从新品立项到研发、打样与上市，协同产品团队跟踪关键节点和研发任务。',
    scenarios: ['消费与医疗', 'IPD 集成产品开发'],
  },
  {
    id: 'template-crm-standard', title: '通用 CRM 系统', category: '客户关系管理', color: '#0442d2', image: 'template-crm-standard.png',
    description: '汇总客户与商机信息，记录跟进过程，分析客户转化并推动销售协作。',
    scenarios: ['LTC 流程链路', '反馈管理'],
  },
  {
    id: 'template-software-delivery', title: '软件项目交付管理', category: '软件研发', color: '#9d1562', image: 'template-software-delivery.png',
    description: '围绕软件项目的需求、计划、研发和验收，掌握交付进度、工时与项目成本。',
    scenarios: ['软件研发', '项目交付'],
  },
  {
    id: 'template-auto-compliance', title: '整车全球化推广合规管理', category: '整车与汽车产业链', color: '#9a6b06', image: 'template-auto-compliance.png',
    description: '管理整车全球化推广中的认证要求、法规校验与准入任务，跟踪各车型的合规进展。',
    scenarios: ['整车与汽车产业链', '项目交付'],
  },
  {
    id: 'template-content-production', title: '内容制作全流程', category: '内容制作', color: '#3e5e8b', image: 'template-content-production.png',
    description: '串联内容策划、制作、审核与发布，统一管理制作任务、协作人员和交付排期。',
    scenarios: ['内容制作', '项目交付'],
  },
  {
    id: 'template-consumer-rd', title: '消费品营销产研集成管理', category: '消费与医疗', color: '#186010', image: 'template-consumer-rd.png',
    description: '连接消费品营销需求、产品规划与研发流程，推动从市场洞察到新品落地的跨团队协作。',
    scenarios: ['消费与医疗', 'IPD 集成产品开发'],
  },
  {
    id: 'template-auto-supply-ltc', title: '汽车产业链智能化销售 LTC', category: '整车与汽车产业链', color: '#186010', image: 'template-auto-supply-ltc.png',
    description: '围绕汽车产业链客户管理商机、报价、合同与回款，让销售流程和项目协作衔接更清晰。',
    scenarios: ['整车与汽车产业链', 'LTC 流程链路'],
  },
  {
    id: 'template-electronics-ltc', title: '消费电子软硬开发与 LTC', category: '消费电子', color: '#0442d2', image: 'template-electronics-ltc.png',
    description: '统筹消费电子软硬件研发与销售交付，连接开发排期、任务进度和合同回款。',
    scenarios: ['消费电子', 'IPD 集成产品开发', 'LTC 流程链路'],
  },
  {
    id: 'template-retail-store', title: '商超门店筹建标准化', category: '商超零售', color: '#087b83', image: 'template-retail-store.png',
    description: '用标准流程推进门店选址、设计、施工和开业准备，跟踪筹建任务与关键节点。',
    scenarios: ['项目交付'],
  },
];

export const marketplaceCatalogs: Record<CatalogCategory, Catalog> = {
  'AI Apps': { kind: 'app', filters: ['AI 节点', 'AI 操作', 'AI 字段'], items: aiItems },
  'Agent Skills': { kind: 'skill', filters: scenarioFilters, items: skillItems },
  'Plugins': {
    kind: 'plugin', filters: pluginFilters,
    items: pluginItems,
  },
  'Templates': {
    kind: 'template', filters: templateFilters,
    items: templateItems,
  },
};
