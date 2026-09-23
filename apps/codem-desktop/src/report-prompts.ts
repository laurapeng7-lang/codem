import type { PromptSegment } from './prompt-content';
import deepReportContent from './deep-report-content.json';
import { initialReportState } from './report-controls';

export type ReportPrompt = { prompt: string; theme: string; segments?: PromptSegment[] };
type Template = { title: string; description: string; method?: string; theme?: string };

const reportRequirements = '报告请包含结论摘要、关键指标与图表、风险判断和可执行的改进建议，标明数据范围与分析依据。对缺失的信息明确标注，不推测未提供的数据。';
const queryDetails = [
  '请基于当前项目视图，盘点在研项目的整体进展、里程碑达成情况、资源负载与交付风险，识别需要管理层关注和协调的事项，并按优先级列出负责人、行动建议与建议完成时间。',
  '请基于当前团队最近四周的需求与迭代数据，对比吞吐量、周期时间、在制品数量及 WIP 账龄，区分处理时间与等待时间，定位瓶颈环节和长期停滞事项，并提出可验证的流程改进措施。',
  '请梳理当前项目的关键里程碑、上下游依赖与阻塞事项，结合 CPM 关键路径分析和风险概率 × 影响矩阵，评估延期传播范围，列出高优风险、应对措施、负责人和下一次检查节点。',
];

export const suggestedReportPrompts = deepReportContent.queries.map((label, index) => ({
  label,
  prompt: `${label}。${queryDetails[index]}${reportRequirements}`,
  theme: initialReportState.theme,
}));

export function createTemplatePrompt(template: Template): ReportPrompt {
  const matchingTemplate = deepReportContent.templates.find(item => item.title === template.title);
  const method = template.method ?? matchingTemplate?.method;
  const description = template.description.replace(/[。！？.!?，,；;]+$/, '');
  return {
    prompt: `请基于当前项目视图，生成一份《${template.title}》。${description}。${method ? `请采用 ${method} 的分析方法，` : '请结合项目进展与交付数据，'}梳理关键发现，区分事实、判断与待确认事项。${reportRequirements}`,
    theme: template.theme ?? matchingTemplate?.theme ?? initialReportState.theme,
  };
}
