import type { Conversation } from './conversation-history';

export const settingsChatContext = { title: 'Agile Development · 空间配置 · 智能体', href: '/settings' };

export const settingsQueries = [
  {
    id: 'replace-field', title: '找出某个字段的所有配置，并且批量替换成新的字段',
    prompt: '请检查 Agile Development 空间中【原字段名称】在节点表单、状态表单、视图筛选和自动化规则中的全部引用，并整理替换为【新字段名称】的批量修改方案。\n请列出配置位置、受影响的工作项类型，以及字段类型、选项和必填规则的兼容性。先展示修改前后的差异，待我确认后再应用。',
    summary: '梳理字段在表单、视图、流程和自动化中的引用，核对新旧字段类型，再整理替换范围。',
    items: ['提供原字段和新字段的名称或 ID，并指定要检查的工作项类型。', '逐项核对节点表单、状态表单、视图筛选和自动化规则中的引用。', '整理替换前后的配置差异，标出字段类型、选项和必填规则不兼容的位置。'],
  },
  {
    id: 'member-permissions', title: '查询一个具体成员的权限配置',
    prompt: '请查询【成员姓名或邮箱】在 Agile Development 空间中的完整权限配置。\n按空间角色、工作项、字段和流程操作分别列出可查看、编辑和管理的范围，说明每项权限来自直接授权、角色授权还是团队继承，并标出冲突或缺失的配置。请用表格汇总权限来源和对应配置位置，便于我核对。',
    summary: '按空间角色、工作项权限和字段权限整理成员的访问范围与权限来源。',
    items: ['提供成员姓名或邮箱，确定需要查询的空间和工作项类型。', '分别核对直接授权、角色授权和团队继承权限。', '整理可查看、编辑和管理的范围，以及字段可见性和流程操作权限。'],
  },
  {
    id: 'create-field', title: '新建一个字段，并且添加到节点表单或状态表单中',
    prompt: '请在 Agile Development 空间的【工作项类型】中新建【字段名称】字段，并添加到【节点或状态名称】的表单中。\n请根据字段用途建议控件类型、默认值、选项、必填与校验规则，并明确显示顺序、可见条件和编辑权限。缺少的信息请先向我确认，完成后给出字段与表单的配置差异，待我确认后再应用。',
    summary: '根据字段用途确定控件类型、校验规则与显示位置，生成表单配置方案。',
    items: ['补充字段名称、控件类型、默认值和是否必填；选择类字段还需要选项列表。', '指定工作项类型，以及要添加字段的节点表单或状态表单。', '明确字段顺序、可见条件、编辑权限和校验提示，整理完整的配置清单。'],
  },
  {
    id: 'create-workflow', title: '根据材料，生成一个新的流程',
    prompt: '请根据我提供的【流程说明或附件】，为 Agile Development 空间的【工作项类型】生成一个新流程。\n请提取各阶段、节点、负责人、表单字段和完成条件，补充审批、分支、回退及流转权限，并标出材料中尚未明确的信息。先输出流程结构和配置清单，待我确认后再创建。',
    summary: '从材料中提取阶段、节点和流转条件，形成可检查的流程配置草案。',
    items: ['上传流程说明或粘贴材料，并说明适用的工作项类型。', '梳理各节点的负责人、输入输出、表单字段和完成条件。', '补充审批、回退和分支条件，列出仍需明确的配置。'],
  },
  {
    id: 'space-manual', title: '按照当前的空间配置，输出一份操作手册',
    prompt: '请根据 Agile Development 当前的空间配置，为【使用角色或团队】编写一份可直接使用的操作手册。\n按创建工作项、填写字段、推进节点、查询数据的顺序说明操作步骤，列出必填规则、权限限制和常见问题，并标注对应的配置位置。请区分不同角色的操作范围，无法确认的内容标记为待补充。',
    summary: '按角色和常用操作组织空间手册，说明字段填写、流程流转与权限规则。',
    items: ['确定手册面向的角色，以及需要覆盖的工作项类型和流程。', '按创建工作项、填写表单、推进节点和查看数据的顺序组织操作说明。', '补充字段定义、权限边界、常见问题和配置维护说明。'],
  },
] as const;

export type SettingsConversation = Conversation & { settings: typeof settingsChatContext };

export function createSettingsConversation(prompt: string): SettingsConversation {
  const title = prompt.trim();
  const query = settingsQueries.find(query => query.title === title);
  return {
    id: `settings--${query?.id ?? `ask--${title}`}`, group: '今天', title,
    summary: queryForPrompt(title)?.summary ?? '结合当前空间的字段、表单、权限和流程，梳理需要查询或调整的配置。',
    settings: settingsChatContext,
  };
}

export function resolveSettingsConversation(id: string | null) {
  if (!id?.startsWith('settings--')) return;
  const key = id.slice('settings--'.length);
  const prompt = key.startsWith('ask--') ? key.slice('ask--'.length).trim() : settingsQueries.find(query => query.id === key)?.title;
  if (!prompt || prompt.length > 2000) return;
  const conversation = createSettingsConversation(prompt);
  return conversation.id === id ? conversation : undefined;
}

function queryForPrompt(prompt: string) {
  const exact = settingsQueries.find(query => query.title === prompt.trim() || query.prompt === prompt.trim());
  if (exact) return exact;
  if (/替换|批量/.test(prompt)) return settingsQueries[0];
  if (/手册|操作说明/.test(prompt)) return settingsQueries[4];
  if (/(新建|创建|新增).{0,30}(字段|控件)/.test(prompt)) return settingsQueries[2];
  if (/(生成|新建|创建).{0,12}流程/.test(prompt)) return settingsQueries[3];
  if (/(流程|节点).{0,30}(新增|增加|插入|添加)|(新增|增加|插入|添加).{0,30}(流程|节点)/.test(prompt)) return settingsQueries[3];
  if (/权限|授权|成员|角色/.test(prompt)) return settingsQueries[1];
  if (/引用/.test(prompt)) return settingsQueries[0];
  if (/流程|分支|流转/.test(prompt)) return settingsQueries[3];
  if (/字段|控件|表单/.test(prompt)) return settingsQueries[2];
}

export function settingsQueryForPrompt(prompt: string, previousPrompts: readonly string[] = []) {
  return queryForPrompt(prompt) ?? [...previousPrompts].reverse().map(queryForPrompt).find(Boolean);
}

// Local configuration guidance, matching the existing chat demo without changing space data.
export function createSettingsChatReply(prompt: string, previousPrompts: readonly string[] = []) {
  const query = settingsQueryForPrompt(prompt, previousPrompts);
  return {
    scenario: `settings-${query?.id ?? 'general'}`, durationSeconds: 12,
    introduction: '我会围绕 Agile Development 的空间配置，帮你整理查询范围和调整方案。',
    recommendation: query?.summary ?? '请说明需要查询或修改的控件、所在表单和预期效果，我会据此梳理具体配置。',
    sections: [{ title: '配置梳理', items: query?.items ?? ['明确控件名称、工作项类型和所在节点或状态。', '说明希望调整的默认值、选项、校验规则或可见条件。', '结合相关表单、流程和权限，整理配置差异与影响范围。'] }],
    conclusion: '你可以继续补充字段名称、成员信息或配置材料。',
  };
}
