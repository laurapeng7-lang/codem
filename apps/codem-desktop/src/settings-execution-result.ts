import { settingsCodeFileMap, settingsCodeFiles } from './settings-code-data';

export type ConfigDiffLine = { kind: 'same' | 'added' | 'removed'; text: string; before?: number; after?: number };
export type ConfigChange = { path: string; title: string; before: string; after: string; lines: ConfigDiffLine[]; added: number; removed: number };
export type SettingsExecutionResult = { title: string; bullets: string[]; conclusion: string; changes: ConfigChange[]; kind: 'draft' | 'document' };

// Compare the actual before/after text. Counts and the expanded diff share one source.
export function configurationDiff(before: string, after: string): ConfigDiffLine[] {
  const a = before ? before.split('\n') : [];
  const b = after ? after.split('\n') : [];
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  }
  const lines: ConfigDiffLine[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i], before: ++i, after: ++j });
    } else if (i < a.length && (j === b.length || lengths[i + 1][j] >= lengths[i][j + 1])) {
      lines.push({ kind: 'removed', text: a[i], before: ++i });
    } else lines.push({ kind: 'added', text: b[j], after: ++j });
  }
  return lines;
}

const json = (value: unknown) => JSON.stringify(value, null, 2);
function change(title: string, path: string, after?: string): ConfigChange {
  const before = settingsCodeFileMap.get(path)?.code ?? '';
  const next = after ?? before;
  const lines = configurationDiff(before, next);
  return { title, path, before, after: next, lines, added: lines.filter(line => line.kind === 'added').length, removed: lines.filter(line => line.kind === 'removed').length };
}
function read<T>(path: string): T { return JSON.parse(settingsCodeFileMap.get(path)!.code); }
const fieldsPath = '工作项管理/需求/字段管理/';
const layoutPath = '工作项管理/需求/页面布局';
const workflowPath = '工作项管理/需求/流程管理/默认流程';
const tablePath = '工作项管理/需求/表格列配置';
type Field = { key: string; name: string; type: string; required?: boolean; options?: string[]; defaultValue?: string | boolean };
type Layout = { entity: string; layout: { sections: { title: string; fields: string[] }[] } };

function layoutImprovementDraft(field?: Field): SettingsExecutionResult {
  const layout = read<Layout>(layoutPath);
  const key = field?.key ?? 'description';
  const name = field?.name ?? '描述';
  const sectionTitle = field ? '关键字段' : '需求说明';
  layout.layout.sections = layout.layout.sections.map(section => ({ ...section, fields: section.fields.filter(value => value !== key) }));
  layout.layout.sections.push({ title: sectionTitle, fields: [key] });
  const table = read<{ columns: { field: string; width: number }[]; sort: { field: string; direction: string }[] }>(tablePath);
  table.sort = [{ field: 'finish_time', direction: 'asc' }, { field: 'priority', direction: 'asc' }];
  if (!table.columns.some(column => column.field === key)) table.columns.push({ field: key, width: 240 });
  return {
    title: field ? `已整理“${name}”展示配置优化草案：` : '已整理表单与列表优化草案：', kind: 'draft',
    bullets: [`将“${name}”集中展示在“${sectionTitle}”分区。`, '移除原分区的字段引用，避免重复展示；字段定义与历史值保持原样。', '列表优先按截止时间升序排列，再按优先级排序。', `列表中保留“${name}”的展示入口，便于和表单对照。`, '表单布局与列表规则的修改已整理为可逐项查看的差异。'],
    conclusion: '已对照当前字段和展示配置生成优化草案。下方可 review 具体增删，也可撤销本次草案。',
    changes: [change(`“${name}”表单分区调整`, layoutPath, json(layout)), change('列表展示与排序规则', tablePath, json(table))],
  };
}

function quotedAfter(prompt: string, prefix: string) {
  return new RegExp(`(?:${prefix})(?:一个|名为|名称为|为)?\\s*[「“"【]([^」”"】]+)[」”"】]`).exec(prompt)?.[1];
}
function replaceField(value: unknown, key: string, nextKey: string, name: string): unknown {
  if (value === key) return nextKey;
  if (Array.isArray(value)) return value.map(item => replaceField(item, key, nextKey, name));
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceField(v, key, nextKey, name)]));
    if ('key' in value && value.key === key && 'name' in value) result.name = name;
    return result;
  }
  return value;
}

// These are reviewable drafts derived from the local Code snapshot. Generating
// or discarding a draft never publishes or mutates the space configuration.
export function createSettingsExecutionResult(scenario: string, prompt: string): SettingsExecutionResult {
  const definition = read<{ entity: string; fields: Field[] }>(fieldsPath);
  const layout = read<Layout>(layoutPath);
  const workflow = read<{ entity: string; name: string; nodes: string[]; initialNode: string }>(workflowPath);
  const roleFiles = settingsCodeFiles.filter(file => file.icon === 'member');
  const aliases: Record<string, string> = { 优先级: 'priority', 描述: 'description', 文档: 'wiki', 负责人: 'owner', 截止日期: 'finish_time' };
  const matched = definition.fields.find(field => Object.entries(aliases).some(([name, key]) => key === field.key && prompt.includes(name)) || prompt.includes(field.name) || new RegExp(`\\b${field.key}\\b`).test(prompt));
  const requestsChange = /新建|新增|创建|添加|替换|批量|改为|修改|调整|设置|设为|更新|生成|编写|增加|插入|移除|删除/.test(prompt);
  if (!requestsChange && ['create-field', 'replace-field'].includes(scenario)) return layoutImprovementDraft(matched);

  if (scenario === 'member-permissions') {
    const spaceRoles = read<{ roles: { name: string; permissions: string[] }[] }>('权限管理/空间角色');
    const memberRole = spaceRoles.roles.find(role => role.name === '成员')!;
    memberRole.permissions = memberRole.permissions.filter(permission => !['create', 'edit_own'].includes(permission));
    spaceRoles.roles.push({ name: '只读成员', permissions: ['read'] });
    const subject = /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/.exec(prompt)?.[0] ?? /查询\s*[“「"]?([^，。\n]{1,40}?)\s*[”」"]?在/.exec(prompt)?.[1]?.trim();
    const member = subject && !/[【】]|成员姓名|具体成员/.test(subject) ? subject : undefined;
    return {
      title: '已整理成员权限收敛草案：', kind: 'draft',
      bullets: ['成员角色移除创建和编辑自己的内容权限，保留查看与评论。', '新增“只读成员”角色，仅允许查看空间内容。', member ? `为“${member}”整理只读成员组草案，成员身份与现有授权需核实。` : '新建只读成员组草案，成员名单待补充。', '只读组禁止修改工作项、编辑字段和执行流程流转。', '管理员与访客的原有权限保持不变，调整范围已列入下方差异。'],
      conclusion: '已核对空间角色与工作项权限，并生成权限调整草案。成员角色调整会影响使用该角色的成员；应用前还需核对成员名单和继承授权。',
      changes: [
        change('成员基础权限与只读角色', '权限管理/空间角色', json(spaceRoles)),
        change('只读成员组与待核实名单', '权限管理/成员组/只读成员组', json({ name: '只读成员组', role: '只读成员', members: member ? [member] : [], membershipStatus: '待核实' })),
        change('只读组的工作项、字段与流程边界', '权限管理/成员组/只读成员组授权', json({ group: '只读成员组', workItem: { allow: ['read'], deny: ['create', 'write', 'assign'] }, fields: { allow: ['read'], deny: ['edit'] }, workflow: { allow: ['read'], deny: ['transition', 'manage'] } })),
      ],
    };
  }

  if (scenario === 'replace-field') {
    const target = quotedAfter(prompt, '替换为|替换成|改为') ?? '【新字段名称】';
    const targetKey = /(?:key|标识)\s*[:：=]\s*([a-zA-Z][\w]*)/.exec(prompt)?.[1] ?? '【新字段 key】';
    const references = matched ? settingsCodeFiles.filter(file => file.code.includes(`"${matched.key}"`)) : [];
    const changes = matched ? references.map(file => change(file.path.split('/').filter(Boolean).slice(-2).join(' · '), file.path, json(replaceField(JSON.parse(file.code), matched.key, targetKey, target)))) : [change('字段替换范围与映射草案', '配置草案/字段替换.json', json({ sourceField: '【原字段 key】', targetField: targetKey, targetName: target, scope: ['节点表单', '状态表单', '表格与筛选', '自动化规则'], valueMapping: '待确认' }))];
    return { title: '已整理字段替换方案：', kind: 'draft', changes,
      bullets: [matched ? `已定位“${matched.name}”（${matched.key}）的定义与 ${references.length} 处配置引用。` : '已整理字段定义、表单、表格与自动化的替换范围。', `目标字段为“${target}”，字段标识需在应用前确认。`, '表单引用、列表展示和排序条件将随字段映射同步调整。', matched?.options ? `现有选项 ${matched.options.join('、')} 需要与新字段逐项映射。` : '字段类型、默认值与必填规则需要一并核对。', '下方已列出配置草案，可逐项展开查看修改前后的差异。'],
      conclusion: '已检查引用关系与影响范围。确认新旧字段标识及历史值映射后，再应用这份替换方案。',
    };
  }

  if (scenario === 'create-field') {
    const name = /[「“"【]([^」”"】]+)[」”"】]\s*(?:字段|控件)/.exec(prompt)?.[1] ?? quotedAfter(prompt, '新建|新增|添加') ?? /(?:新建|新增|添加)(?:一个|名为)?\s*([^，。；\n]{1,24}?)(?:字段|控件)/.exec(prompt)?.[1]?.trim() ?? '【字段名称】';
    const type = /开关|是否/.test(prompt) ? 'switch' : /日期|时间/.test(prompt) ? 'date' : /选择|下拉|选项/.test(prompt) ? 'select' : /数字|金额/.test(prompt) ? 'number' : 'text';
    const key = /(?:key|标识)\s*[:：=]\s*([a-zA-Z][\w]*)/.exec(prompt)?.[1] ?? '【字段 key】';
    const field: Field = { key, name, type, required: /必填/.test(prompt) && !/非必填|不必填|可选填/.test(prompt) };
    if (type === 'select') field.options = ['【待补充选项】'];
    definition.fields.push(field);
    layout.layout.sections[0].fields.push(key);
    return { title: `已生成“${name}”字段配置草案：`, kind: 'draft',
      bullets: [`建议使用 ${type === 'switch' ? '开关' : type === 'date' ? '日期' : type === 'select' ? '单选' : type === 'number' ? '数字' : '文本'}控件，字段定义已纳入草案。`, `已${field.required ? '加入必填校验' : '保留非必填设置'}，默认值可按实际用途补充。`, '表单引用已与字段定义关联，避免只创建字段却无法在页面中填写。', '草案暂放在“基本信息”分区，可按目标节点或状态表单调整位置。', '字段唯一标识、可见条件和编辑权限需在应用前确认。'],
      conclusion: '已核对现有字段与页面布局。下方可检查字段定义和表单引用的增量；补齐目标表单及校验要求后再应用。',
      changes: [change(`“${name}”字段定义`, fieldsPath, json(definition)), change(`“${name}”表单展示位置`, layoutPath, json(layout))],
    };
  }

  if (scenario === 'create-workflow') {
    const security = /安全审[核查]|合规审[核查]/.test(prompt);
    if (security) {
      const securityField = definition.fields.find(field => field.key === 'enable_sdlc');
      const field: Field = { ...(securityField ?? { key: 'enable_sdlc' }), name: '是否需要安全审核', type: 'switch', required: true, defaultValue: false };
      definition.fields = definition.fields.filter(item => item.key !== field.key).concat(field);
      const afterNode = workflow.nodes.includes('Tech Design') ? 'Tech Design' : workflow.nodes.at(-1)!;
      workflow.nodes.splice(workflow.nodes.indexOf(afterNode) + 1, 0, '安全审核');
      if (!layout.layout.sections[0].fields.includes(field.key)) layout.layout.sections[0].fields.push(field.key);
      const role = '合规审核员';
      return { title: '已整理研发流程的安全审核配置草案：', kind: 'draft',
        bullets: [`“${afterNode}”后新增“安全审核”环节。`, `建议将“${role}”设为安全审核的默认负责人角色。`, '前置表单新增必填开关“是否需要安全审核”。', '选择“需要”时进入审核；选择“不需要”时跳过该环节。', '节点、负责人和前置表单的关联配置已汇总为同一份草案。'],
        conclusion: '已核对节点顺序、字段引用和影响范围。下方可逐项检查配置差异；审批角色与跳过条件确认后再应用。',
        changes: [change('“是否需要安全审核”必填开关字段', fieldsPath, json(definition)), change('“合规审核员”默认负责人角色', '工作项管理/需求/角色管理/合规审核员', json({ entity: 'Requirement', role: { key: 'compliance_reviewer', name: role, permissions: ['read', 'review'] } })), change('研发流程的安全审核节点', workflowPath, json(workflow)), change('前置表单的安全审核开关', layoutPath, json(layout)), change('安全审核的进入与跳过条件', '工作项管理/需求/流程管理/安全审核条件', json({ node: '安全审核', after: afterNode, enterWhen: { field: field.key, equals: true }, skipWhen: { field: field.key, equals: false } })), change('安全审核的默认负责人规则', '工作项管理/需求/流程管理/安全审核负责人', json({ node: '安全审核', ownerRole: 'compliance_reviewer' }))],
      };
    }
    const name = quotedAfter(prompt, '新建|创建|生成') ?? '新流程';
    const draft = { ...workflow, name, reviewRequired: ['节点负责人', '完成条件', '审批分支', '异常回退'] };
    return { title: '已整理新流程的结构草案：', kind: 'draft',
      bullets: [`以现有 ${workflow.nodes.length} 个节点为结构参考，从“${workflow.initialNode}”开始。`, '节点顺序与前后依赖已整理，便于对照业务材料逐项调整。', `${roleFiles.map(file => file.name).join('、')} 可作为节点负责人的候选角色。`, '表单字段、节点输入输出与完成条件已列入配置检查范围。', '审批分支、异常回退和角色指派保留为待确认项。'],
      conclusion: '已核对现有流程与角色配置。补齐实际流程材料后，可进一步确定节点和流转条件；下方草案供确认结构使用。',
      changes: [change(`“${name}”节点结构草案`, `工作项管理/需求/流程管理/${name}`, json(draft)), change('节点负责人候选角色', '配置草案/流程负责人.json', json({ workflow: name, candidates: roleFiles.map(file => file.name), assignments: '待确认' })), change('节点输入与完成条件清单', '配置草案/节点完成条件.json', json({ workflow: name, nodes: workflow.nodes.map(node => ({ node, inputs: '待补充', completion: '待确认' })) }))],
    };
  }

  if (scenario === 'space-manual') {
    const chapters = [
      ['创建需求', '确认创建权限，填写必填的 Name 与 Owner。'], ['填写表单', '基本信息填写名称、优先级、负责人和描述；排期填写起止时间，相关资料填写文档链接。'], ['推进流程', `从 ${workflow.initialNode} 开始，依次核对 ${workflow.nodes.slice(1).join('、')} 的交付内容。`], ['查询数据', '列表展示名称、优先级、负责人和完成时间，默认按优先级升序排列。'], ['权限与提醒', '访客只读，成员可创建、评论和编辑自己的内容；核对自动化触发条件与接收人。'],
    ];
    return { title: '已整理 Agile Development 操作手册草稿：', kind: 'document',
      bullets: ['按创建需求、填写表单、推进流程和查询数据组织操作步骤。', '已标明 Name、Owner 的必填要求及三个表单分区。', `流程说明覆盖从“${workflow.initialNode}”开始的 ${workflow.nodes.length} 个节点。`, '管理员、成员和访客的操作范围已分别说明。', '自动提醒、默认排序和需要补充的节点规则已纳入手册。'],
      conclusion: '手册内容已对照当前字段、表单与权限配置。各章节可在下方展开查看，节点完成条件与具体成员授权仍需结合业务补充。',
      changes: chapters.map(([title, content]) => change(`操作手册 · ${title}`, `操作手册/${title}.md`, `# ${title}\n\n${content}`)),
    };
  }
  return layoutImprovementDraft(matched);
}
