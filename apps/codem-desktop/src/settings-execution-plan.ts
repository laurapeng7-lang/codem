import { settingsCodeFileMap, settingsCodeFiles } from './settings-code-data';
import { settingsQueryForPrompt } from './settings-chat';
import { createSettingsExecutionResult } from './settings-execution-result';
import { executionDuration, type AgentToolCall, type ExecutionStep } from './work-item-agent-execution';

type Field = { key: string; name: string; type: string; required?: boolean; options?: string[] };
type Role = { name: string; permissions: string[] };
type AnalysisPhase = { narration: string; label: string; calls: AgentToolCall[] };

function readConfig<T>(path: string): T {
  const file = settingsCodeFileMap.get(path);
  if (!file) throw new Error(`找不到配置：${path}`);
  return JSON.parse(file.code) as T;
}

function tool(id: string, label: string, calls: AgentToolCall[]): ExecutionStep {
  return { id, kind: 'tool', durationMs: Math.max(3000, calls.length * 2400), pending: `${label} · ${calls.length} 项工具调用`, complete: `${label}完成 · ${calls.length} 项工具调用`, canceled: `${label}已停止`, calls };
}

// These operations inspect the same local configuration snapshot shown in Code
// mode. No server tools, member-directory access or space writes are implied.
export function createSettingsExecutionPlan(prompt: string, previousPrompts: readonly string[] = []) {
  const query = settingsQueryForPrompt(prompt, previousPrompts);
  const scenario = query?.id ?? 'general';
  const sourcePrompt = settingsQueryForPrompt(prompt) ? prompt : [...previousPrompts].reverse().find(value => settingsQueryForPrompt(value)) ?? prompt;
  const space = readConfig<{ name: string; timezone: string }>('空间信息/基本信息');
  const fields = readConfig<{ fields: Field[] }>('工作项管理/需求/字段管理/').fields;
  const roles = readConfig<{ roles: Role[] }>('权限管理/空间角色').roles;
  const workflow = readConfig<{ nodes: string[]; initialNode: string }>('工作项管理/需求/流程管理/默认流程');
  const layout = readConfig<{ layout: { sections: { title: string; fields: string[] }[] } }>('工作项管理/需求/页面布局').layout;
  const automations = settingsCodeFiles.filter(file => file.icon === 'robot');
  const workRoles = settingsCodeFiles.filter(file => file.icon === 'member').map(file => readConfig<{ role: Role }>(file.path).role);
  const table = readConfig<{ columns: { field: string }[]; sort: { field: string; direction: string }[] }>('工作项管理/需求/表格列配置');
  const fieldKeys = new Set(fields.map(field => field.key));
  const visibleFields = layout.sections.flatMap(section => section.fields);
  const requiredFields = fields.filter(field => field.required).map(field => field.name).join('、');
  const automationSummary = automations.map(file => {
    const config = readConfig<{ trigger: { type: string; field: string }; actions: { recipients: string[] }[] }>(file.path);
    return `${file.name}：${config.trigger.type} / ${config.trigger.field} → ${config.actions.flatMap(action => action.recipients).join('、')}`;
  }).join('；');
  const aliases: Record<string, string> = { 优先级: 'priority', 描述: 'description', 文档: 'wiki', 负责人: 'owner', 创建者: 'created_by', 截止日期: 'finish_time' };
  const mentionedKeys = Object.entries(aliases).filter(([name]) => sourcePrompt.includes(name)).map(([, key]) => key);
  const matchedFields = fields.filter(field => mentionedKeys.includes(field.key) || sourcePrompt.toLowerCase().includes(field.name.toLowerCase()) || new RegExp(`\\b${field.key}\\b`, 'i').test(sourcePrompt));
  const references = settingsCodeFiles.filter(file => matchedFields.some(field => file.code.includes(`"${field.key}"`)));
  const roleSummary = roles.map(role => `${role.name}：${role.permissions.join('、')}`).join('；');
  const fieldSummary = matchedFields.length ? matchedFields.map(field => `${field.name}（${field.key}，${field.type}）`).join('、') : `当前需求有 ${fields.length} 个字段，尚未指定要检查的具体字段`;
  const hasPlaceholders = /【[^】]+】/.test(sourcePrompt);
  let introduction = `我会先读取 ${space.name} 的配置目录，定位与你的问题相关的字段、表单和流程，再整理可核对的配置说明。`;
  let analysis = '配置目录已读取。我会对照具体配置位置核对关联关系，区分已有配置、建议调整和需要补充的信息。';
  let scope = '读取相关配置';
  let calls: AgentToolCall[] = [];
  let checks: AgentToolCall[] = [];
  let review: AnalysisPhase = {
    narration: '我会继续对照页面中实际展示的字段和表格列，确认定义与引用能对应起来，再把需要补充的配置范围整理出来。',
    label: '核对配置关联',
    calls: [{ name: '核对表单字段引用', detail: `${visibleFields.length} 处表单引用；未定义字段：${visibleFields.filter(key => !fieldKeys.has(key)).join('、') || '无'}。` }, { name: '读取表格展示字段', detail: table.columns.map(column => column.field).join('、') }, { name: '读取需求角色能力', detail: workRoles.map(role => `${role.name}：${role.permissions.join('、')}`).join('；') }],
  };
  let prepare: AnalysisPhase = {
    narration: '已有配置的位置和关联关系已梳理。我会将查询结论、建议调整和待确认项分别整理，方便你继续指定要修改的控件。',
    label: '整理配置说明',
    calls: [{ name: '整理字段定位信息', detail: fieldSummary }, { name: '整理待确认范围', detail: '需要明确工作项类型、控件名称、所在表单及预期行为。' }],
  };

  switch (scenario) {
    case 'replace-field':
      introduction = '我先定位原字段的定义，再检查页面布局、表格列、流程和自动化中的引用，确认替换会影响哪些位置。';
      scope = '检索字段与引用';
      calls = [{ name: '读取字段定义', detail: fieldSummary }, { name: '扫描配置引用', detail: matchedFields.length ? `在 ${references.length} 份配置中找到相关字段：${references.slice(0, 3).map(file => file.path).join('；')}` : `已检查 ${settingsCodeFiles.length} 份本地配置，需补充原字段名称后才能确定引用范围。` }];
      analysis = '接下来核对字段类型、选项和必填规则。直接替换字段名可能影响筛选与自动化条件，我会把需要确认的差异单独列出。';
      checks = [{ name: '检查表单与表格依赖', detail: `需求表单包含 ${layout.sections.length} 个分区；表格列配置与表单配置独立维护。` }, { name: '检查自动化规则', detail: `已读取 ${automations.length} 条规则，检查触发字段与条件字段。` }];
      review = {
        narration: '字段引用不仅出现在表单中，表格排序和提醒规则也可能使用同一个 key。我会继续检查这些间接依赖，避免替换后展示正常、筛选或提醒却失效。',
        label: '追踪字段依赖',
        calls: [{ name: '核对表格排序依赖', detail: table.sort.map(sort => `${sort.field}：${sort.direction}`).join('；') }, { name: '核对字段选项类型', detail: matchedFields.length ? matchedFields.map(field => `${field.key}：${field.type}${field.options ? `，选项 ${field.options.join(' / ')}` : ''}`).join('；') : '原字段尚未指定，暂不能判断目标类型与选项是否兼容。' }, { name: '提取自动化触发字段', detail: automationSummary }],
      };
      prepare = {
        narration: '依赖范围已经整理。替换方案会按字段定义、表单引用、表格展示和自动化依次列出，先确认目标字段与选项映射，再形成可以逐项核对的修改清单。',
        label: '整理替换方案',
        calls: [{ name: '汇总引用位置', detail: matchedFields.length ? references.map(file => file.path).join('；') : '等待原字段 key 后生成具体路径清单。' }, { name: '检查替换前置条件', detail: '待确认目标字段 key、历史值映射、默认值和必填规则；尚未写入任何字段替换。' }],
      };
      break;
    case 'member-permissions':
      introduction = '我会先读取空间角色与工作项角色，再区分成员直接授权、角色继承和字段级权限，避免把角色能力误当成成员的实际权限。';
      scope = '读取权限配置';
      calls = [{ name: '读取空间角色', detail: roleSummary }, { name: '读取需求角色', detail: settingsCodeFiles.filter(file => file.icon === 'member').map(file => file.name).join('、') }];
      analysis = '角色规则已找到。当前配置快照没有成员与角色的绑定数据，暂时不能确认某个成员的最终权限；我会先整理已有的授权规则和查询缺口。';
      checks = [{ name: '核对权限来源', detail: `已对照 ${roles.length} 类空间角色；未包含直接授权和团队成员映射。` }, { name: '检查成员绑定数据', detail: '当前本地快照不含成员目录、团队继承关系和个人授权记录。' }];
      review = {
        narration: '接下来把权限拆成空间访问、业务操作和数据范围三部分。尤其要区分 write 与 edit_own，后者只允许编辑自己的内容，不能据此推断能修改所有工作项。',
        label: '比对角色授权范围',
        calls: [{ name: '检查空间读写边界', detail: roleSummary }, { name: '比对工作项角色能力', detail: workRoles.map(role => `${role.name}：${role.permissions.join('、')}`).join('；') }, { name: '检查个人数据范围限制', detail: '成员角色含 edit_own；未包含指定成员的数据范围覆盖规则。' }],
      };
      prepare = {
        narration: '接下来整理一份权限收敛草案：成员基础角色保留查看和评论，移除创建与编辑能力；另建只读成员角色和成员组。基础角色的调整会影响使用该角色的成员，我会在确认卡片里列明范围，再由你确认是否继续。',
        label: '整理成员权限调整草案',
        calls: [{ name: '比较权限增删', detail: '成员角色移除 create、edit_own，保留 read、comment；新增只读成员角色，权限为 read。' }, { name: '整理只读组授权边界', detail: '工作项、字段和流程仅保留查看能力；成员名单与继承授权需核实。' }],
      };
      break;
    case 'create-field':
      introduction = '我会先检查已有字段和表单分区，确认是否存在同名控件，再整理新字段的类型、校验规则与表单放置位置。';
      scope = '读取字段与表单';
      calls = [{ name: '读取现有字段', detail: `${fields.length} 个需求字段：${fields.map(field => field.name).join('、')}` }, { name: '读取表单布局', detail: layout.sections.map(section => `${section.title}：${section.fields.join('、')}`).join('；') }];
      analysis = '字段定义与表单布局是两份独立配置。新增控件后还需要在目标表单中引用字段 key，并核对必填、可见条件和编辑权限。';
      checks = [{ name: '检查字段冲突', detail: matchedFields.length ? `提问涉及已有字段：${fieldSummary}，需要确认是复用还是新增。` : '未从提问中匹配到已有字段；仍需确定新字段名称与唯一 key。' }, { name: '核对表单插入位置', detail: `可用分区：${layout.sections.map(section => section.title).join('、')}；节点表单未单独包含在当前快照中。` }];
      review = {
        narration: '我会再核对现有控件类型和必填规则，并检查表单与列表是否都需要展示新字段。控件的默认值、可见条件和编辑权限也要与字段用途一致。',
        label: '检查控件配置约束',
        calls: [{ name: '读取可参考的字段类型', detail: [...new Set(fields.map(field => field.type))].join('、') }, { name: '核对现有必填字段', detail: `需求字段定义中标记必填的字段：${requiredFields}。` }, { name: '比对表单和列表展示范围', detail: `表单引用：${visibleFields.join('、')}；列表列：${table.columns.map(column => column.field).join('、')}。` }],
      };
      prepare = {
        narration: '配置草案会分成字段定义和表单引用两部分，方便分别审阅。如果还没有指定目标节点或控件用途，我会将这些位置留待确认，避免放进错误的表单。',
        label: '整理字段与表单草案',
        calls: [{ name: '整理字段定义项', detail: '名称、唯一 key、控件类型、默认值、选项和校验规则；待明确字段用途后填写具体值。' }, { name: '整理表单引用位置', detail: `现有分区：${layout.sections.map(section => section.title).join('、')}；新增节点或状态表单的位置仍需确认。` }],
      };
      break;
    case 'create-workflow':
      introduction = '我会先读取现有流程和角色配置，提取可复用的节点，再对照你提供的材料梳理负责人、流转条件和异常分支。';
      scope = '读取流程与角色';
      calls = [{ name: '读取现有流程', detail: workflow.nodes.join(' → ') }, { name: '读取节点相关角色', detail: settingsCodeFiles.filter(file => file.icon === 'member').map(file => file.name).join('、') }];
      analysis = `当前需求使用 ${workflow.nodes.length} 个节点的默认流程。新流程还需明确起点、节点输入输出以及审批和回退规则，现有节点可以作为结构参考。`;
      checks = [{ name: '检查流程起点', detail: `默认起点：${workflow.initialNode}；共 ${workflow.nodes.length} 个节点。` }, { name: '核对材料与流转条件', detail: hasPlaceholders ? '提问仍含流程材料占位符，无法确定新流程的业务分支与审批条件。' : '已保留提问中的流程要求；当前快照未提供节点完成条件和审批规则。' }];
      review = {
        narration: '我会继续检查节点交接时能使用的角色与表单字段，再确认是否有提醒规则需要随流程一起调整。现有角色只能作为候选负责人，不能直接等同于新节点的指派关系。',
        label: '核对流程配套配置',
        calls: [{ name: '提取候选负责人角色', detail: workRoles.map(role => `${role.name}：${role.permissions.join('、')}`).join('；') }, { name: '读取节点可引用的表单字段', detail: layout.sections.map(section => `${section.title}：${section.fields.join('、')}`).join('；') }, { name: '检查流程提醒依赖', detail: automationSummary }],
      };
      prepare = {
        narration: '节点、角色和配套配置已梳理。我会按起点、节点顺序、完成条件、审批分支和回退路径组织草案，把材料中尚未明确的部分列为待确认项。',
        label: '整理流程结构草案',
        calls: [{ name: '核对流程结构完整性', detail: `起点 ${workflow.initialNode} ${workflow.nodes.includes(workflow.initialNode) ? '包含在' : '未包含在'}节点列表中；${new Set(workflow.nodes).size} 个唯一节点。` }, { name: '汇总流转规则缺口', detail: '新流程的审批条件、异常回退、负责人指派和节点完成规则需要业务材料确认。' }],
      };
      break;
    case 'space-manual':
      introduction = '我会读取空间信息、字段、流程和角色规则，按实际操作顺序整理手册，并把不同角色的权限边界标清楚。';
      scope = '收集手册依据';
      calls = [{ name: '读取字段与表单配置', detail: `${fields.length} 个需求字段，${layout.sections.length} 个表单分区。` }, { name: '读取流程与自动化', detail: `${workflow.nodes.length} 个流程节点，${automations.length} 条自动化规则。` }, { name: '读取空间角色规则', detail: roleSummary }];
      analysis = '配置依据已整理。我会把手册分成创建、填写、推进和查看四个步骤；配置里未包含的页面入口或权限继承关系会保留为待确认。';
      checks = [{ name: '核对操作步骤与配置来源', detail: '已对照字段管理、页面布局、默认流程及空间角色配置。' }, { name: '整理角色差异与注意事项', detail: '管理员拥有全部权限；成员可创建、编辑自己的内容和评论；访客仅可读取。' }];
      review = {
        narration: '我会补充容易遗漏的实际操作细节：哪些字段必须填写、表格默认如何排序、提醒会发给谁。手册中的每个步骤都会对应到已有配置。',
        label: '提取操作细节',
        calls: [{ name: '提取必填项与表单分区', detail: `必填：${requiredFields}；表单分区：${layout.sections.map(section => section.title).join('、')}。` }, { name: '核对默认列表展示', detail: `列：${table.columns.map(column => column.field).join('、')}；排序：${table.sort.map(sort => `${sort.field} ${sort.direction}`).join('、')}。` }, { name: '提取提醒触发与接收人', detail: automationSummary }],
      };
      prepare = {
        narration: '操作细节已补齐。我会将手册整理为创建需求、填写表单、推进流程、查询数据和处理提醒几个部分，再单独标注不同角色的操作边界。',
        label: '编排手册章节',
        calls: [{ name: '建立步骤与配置来源对应', detail: '字段管理 → 创建需求；页面布局 → 填写表单；默认流程 → 推进；表格列配置 → 查询；自动化 → 提醒。' }, { name: '核对权限说明', detail: '空间角色规则与需求角色能力分别说明；未包含的成员继承和节点完成条件列为待确认。' }],
      };
      break;
    default:
      scope = '定位配置范围';
      calls = [{ name: '读取配置目录', detail: `${settingsCodeFiles.length} 份配置，覆盖工作项、权限、插件与自动化。` }, { name: '检索相关字段', detail: fieldSummary }];
      checks = [{ name: '核对相关配置位置', detail: matchedFields.length ? references.map(file => file.path).join('；') : '尚未定位到具体字段，需明确控件名称与所属工作项类型。' }];
  }
  const result = createSettingsExecutionResult(scenario, sourcePrompt === prompt ? prompt : `${sourcePrompt}\n${prompt}`);
  const steps: ExecutionStep[] = [
    { id: 'understand', kind: 'narration', intro: true, characterMs: 36, segments: [{ text: previousPrompts.length ? `我会结合前面的讨论继续处理。${introduction}` : introduction }] },
    tool('read', scope, [{ name: '读取空间配置', detail: `${space.name} · ${space.timezone} · ${settingsCodeFiles.length} 份本地配置` }, ...calls]),
    { id: 'analyze', kind: 'narration', characterMs: 36, segments: [{ text: analysis }] },
    tool('check', '分析配置', checks),
    { id: 'review-context', kind: 'narration', characterMs: 36, segments: [{ text: review.narration }] },
    tool('review', review.label, review.calls),
    { id: 'prepare-context', kind: 'narration', characterMs: 36, segments: [{ text: prepare.narration }] },
    tool('prepare', prepare.label, prepare.calls),
    { id: 'verify-context', kind: 'narration', characterMs: 36, segments: [{ text: '最后复核结果中的配置依据和待确认项，逐项检查字段、角色与流程之间的关联，确保结论对应到已读取的信息，再整理成便于你继续调整的结果。' }] },
    tool('verify', '复核分析结果', [{ name: '核对结果与配置依据', detail: `已对照 ${space.name} 的字段、表单、流程和角色配置，整理 ${result.bullets.length} 项结论。` }, { name: '检查待确认项', detail: hasPlaceholders ? '提问仍有占位信息，相关字段、成员或业务材料需补充后才能形成完整方案。' : '缺少的目标配置和业务规则已在结果中列出，未将未确认信息作为配置事实。' }]),
    { id: 'result', kind: 'narration', characterMs: 24, segments: [result.title, ...result.bullets, result.conclusion].map(text => ({ text })) },
  ];
  return { scenario: `settings-${scenario}`, steps, result, confirmationAtMs: executionDuration(steps.slice(0, -1)), durationMs: executionDuration(steps) };
}
