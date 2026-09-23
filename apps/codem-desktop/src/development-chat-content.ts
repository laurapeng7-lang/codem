import type { AgentToolCall } from './work-item-agent-execution';
import workspaceDevelopmentContent from './workspace-development-content.json';

export type DevelopmentReply = {
  scenario: string; durationSeconds: number; introduction: string; recommendation: string;
  sections: { title: string; items: string[] }[]; conclusion: string;
  process: { narration: string; calls: AgentToolCall[] }[];
};
type DevelopmentChat = { prompt: string; reply: DevelopmentReply };

// Authored development conversation examples, independent of live repository execution.
const developmentChats: Record<string, DevelopmentChat> = {
  'codem-feishu-card': {
    prompt: '帮我整理 CodeM 飞书卡片的交互。卡片里要能看见任务进度、最近一条回复和待确认事项，点击后能回到对应会话。重复点击确认按钮时不要重复执行。',
    reply: {
      scenario: 'development-feishu-card', durationSeconds: 138,
      introduction: '卡片交互已按「进行中、等待确认、已完成、执行失败」四种状态整理。消息内容和会话使用同一个任务标识，卡片更新不会新建一条无关消息。',
      recommendation: '先呈现用户需要做的下一步，再展示任务详情。',
      sections: [
        { title: '卡片内容', items: ['顶部显示任务名称与当前状态；正文保留最近一条有效进展，长内容在会话中查看。', '等待确认时突出待确认的变更摘要，提供「查看变更」和「确认继续」；其余状态只展示对应操作。', '「打开会话」携带原会话地址，返回后仍定位到这项任务。'] },
        { title: '交互边界', items: ['确认请求按任务与确认轮次去重。首次提交后按钮进入处理中，重复点击返回同一处理结果。', '卡片内容过期时先更新状态，不再执行旧卡片上的确认动作。', '失败时保留已经完成的步骤，并提供查看原因和重试入口。'] },
      ],
      conclusion: '下一步可以用进行中、待确认和失败三张卡片验收文案与按钮状态，再接入实际事件回调。',
      process: [{ narration: '先梳理任务状态与用户操作的对应关系，再检查回调重复投递和卡片内容过期的情况。', calls: [{ name: '梳理状态', detail: '任务进度、确认轮次、会话跳转' }, { name: '检查事件边界', detail: '重复点击、过期卡片、失败重试' }] }],
    },
  },
  'codem-sandbox-routing': {
    prompt: '解释一下沙箱共享设备的派发逻辑：请求进来后怎么选设备？两个任务同时命中同一台设备时如何处理？设备断开以后，任务会自动重新派发吗？',
    reply: {
      scenario: 'development-sandbox-routing', durationSeconds: 164,
      introduction: '派发可以沿「筛选候选设备 → 原子占用 → 建立执行会话 → 续租与回收」这条链路理解。设备可用列表只用于筛选，最终能否执行取决于占用操作是否成功。',
      recommendation: '同一设备必须只有一个有效租约；失联后的重新派发还需要判断任务是否已经产生副作用。',
      sections: [
        { title: '一次请求如何分配', items: ['先按运行环境、设备能力和在线状态筛选候选设备，再按当前负载选择目标。没有可用设备时进入等待队列。', '通过带租约的原子操作占用设备。两个请求选中同一设备时，只有一个成功；另一个重新选取候选设备。', '占用成功后创建执行会话，并关联任务 ID、设备 ID 和租约版本。任务心跳续租，结束后按对应版本释放。'] },
        { title: '断连和重试边界', items: ['短暂断连先等待恢复，不立刻把同一任务交给另一台设备。租约过期后才能回收占用。', '只读或可幂等重试的步骤可以重新入队；已经提交写操作的任务先核对结果，再决定续跑或人工确认。', '旧连接恢复后必须校验租约版本，避免继续操作已被重新分配的设备。'] },
      ],
      conclusion: '排查一次异常派发时，建议把任务 ID、设备 ID、租约版本和重试次数串起来，重点看「占用失败」与「会话建立超时」发生在哪一步。',
      process: [
        { narration: '先从请求入口追踪设备筛选、占用和会话建立的顺序，区分调度决策与实际资源锁定。', calls: [{ name: '梳理派发路径', detail: '候选设备筛选 → 租约占用 → 会话建立' }, { name: '对照并发场景', detail: '两个任务竞争同一设备时的重选路径' }] },
        { narration: '继续核对断连恢复和租约回收，单独标出带有外部写操作的任务，避免把自动重试等同于安全重放。', calls: [{ name: '检查恢复边界', detail: '心跳超时、租约版本、迟到回调' }, { name: '整理日志字段', detail: 'taskId、deviceId、leaseVersion、attempt' }] },
      ],
    },
  },
  'codem-development-notes': {
    prompt: '总结这轮 CodeM 导航与会话联动的开发经验，重点说说来源分组、返回原页面和状态同步踩过的坑，整理成后面可以照着检查的清单。',
    reply: {
      scenario: 'development-notes', durationSeconds: 126,
      introduction: '这轮最容易出问题的地方，是把「当前选中了什么」和「列表如何组织」放进同一套状态。会话能打开，并不代表返回、刷新和切换后的体验也一致。',
      recommendation: '把页面位置、会话身份和列表顺序分别管理，能明显减少联动时的意外跳变。',
      sections: [
        { title: '这次沉淀的规则', items: ['进入 CodeM 前保存完整来源地址，包含工作项 ID；返回时同时恢复页面内容与导航选中项。', '来源分组使用工作项地址作为标识。不同应用下同名、同编号的工作项不能合并。', '会话排序独立于最后访问时间。点击只改变选中项，新增会话才更新列表内容。', 'Continue in chat 先填入可编辑草稿，明确发送后再保存会话；切换字段时沿用同一来源关联。'] },
        { title: '下一轮验收清单', items: ['从 Settings、表格字段和工作项详情分别进入，检查分组名称、图标和消息上下文。', '覆盖返回、刷新、浏览器前进后退，以及多次快速切换会话。', '核对长标题截断、分组折叠、展开更多和窄屏导航，避免只看默认桌面状态。'] },
      ],
      conclusion: '后续加入口时，可以复用来源关联和会话跳转回调，减少每个入口各自维护一份历史的情况。',
      process: [{ narration: '按入口、路由、历史记录和导航显示四层复盘，再把问题转成能够复现的操作步骤。', calls: [{ name: '归纳状态边界', detail: '来源地址、会话 ID、稳定顺序' }, { name: '整理回归场景', detail: '进入、返回、刷新、跨入口续聊' }] }],
    },
  },
  'codem-white-screen': {
    prompt: 'CodeM 页面偶尔打开是白屏，刷新后有时恢复。请按资源加载、路由和页面初始化的顺序排查，给我明确的定位方法和修复建议。',
    reply: {
      scenario: 'development-white-screen', durationSeconds: 208,
      introduction: '先把白屏分成两类：入口脚本没有成功执行，或者脚本执行后页面渲染失败。前者优先看资源响应，后者看控制台首个异常；不要从后续连锁报错开始排查。',
      recommendation: '优先保存一次失败现场的首个异常、资源状态码和当前路由，再按下面的分支定位。',
      sections: [
        { title: '定位顺序', items: ['检查入口 JS 与动态模块是否返回 200，且响应类型是 JavaScript。若返回了 HTML，检查静态资源路径和站点重写规则。', '若出现 Failed to fetch dynamically imported module，对比 HTML 引用的资源版本与当前部署版本，排查旧页面缓存引用已下线文件。', '资源正常时检查路由解析结果与初始化数据。空值、无效会话 ID 和损坏的本地缓存都应落到可见的恢复界面。'] },
        { title: '修复与验证', items: ['为页面增加渲染错误兜底，保留当前会话地址并提供重试入口，避免整个内容区空白。', '模块加载失败只触发一次受控刷新；继续失败时展示提示，防止无限刷新。', '验证直接打开会话链接、旧标签页跨版本刷新、缓存为空和缓存损坏四种路径。'] },
      ],
      conclusion: '请保留白屏时最早出现的错误信息和失败请求地址。有了这两项，就能进一步判断是部署缓存问题还是页面状态异常。',
      process: [
        { narration: '先区分网络层与渲染层问题，避免在入口资源尚未加载时就修改页面组件。', calls: [{ name: '核对加载路径', detail: '入口 HTML、JS 资源和动态模块' }, { name: '检查路由边界', detail: '直接链接、无效会话 ID、初始化回退' }] },
        { narration: '根据偶发且刷新可恢复的特点，补充旧资源引用与缓存异常的验证分支。', calls: [{ name: '整理缓存场景', detail: '旧标签页跨版本、静态资源失效' }, { name: '设计恢复策略', detail: '错误边界、单次重载、保留原地址' }] },
      ],
    },
  },
  'codem-file-changes': {
    prompt: '工作区里突然多出一批文件改动，我不确定哪些是自己写的。帮我整理排查步骤，区分业务代码、格式化和生成文件，先不要撤销任何改动。',
    reply: {
      scenario: 'development-file-changes', durationSeconds: 152,
      introduction: '先保留当前工作区，再分别查看已暂存、未暂存和未跟踪文件。判断改动来源时，需要同时看文件类型、差异内容和触发时间。',
      recommendation: '先分类并建立可恢复的备份，再逐项决定保留、提交或还原。',
      sections: [
        { title: '排查清单', items: ['用 git status --short 确认文件范围，再分别查看 git diff 和 git diff --cached，避免遗漏已暂存的改动。', '纯缩进、换行或引号变更先核对格式化工具配置；锁文件变化则检查包管理器版本和最近的安装操作。', '对产物目录、类型声明和快照文件，检查是否由构建、代码生成或测试更新触发。', '业务逻辑改动逐段对照最近提交，标注改动目的与调用方，无法确认来源的部分先保留。'] },
        { title: '处理顺序', items: ['导出已跟踪文件的差异，同时单独备份未跟踪文件；只保存 diff 不会包含新文件。', '把业务变更与机械格式调整分开审阅，确认后再按目的拆分提交。', '涉及多人协作或自动生成内容时，先确认原始输入和生成版本，再考虑重新生成。'] },
      ],
      conclusion: '这一步的输出应是一份带来源判断的文件清单。来源不明确的文件继续保留，避免整批还原造成丢失。',
      process: [{ narration: '先建立改动范围，再分别核对业务逻辑、格式化和生成产物的特征。', calls: [{ name: '整理差异入口', detail: 'git status --short、git diff、git diff --cached', terminal: true }, { name: '检查生成链路', detail: '构建脚本、锁文件、快照与类型生成' }] }],
    },
  },
  'codem-local-server': {
    prompt: '我想把 codem web 在本地跑起来。帮我整理启动流程，遇到端口被占用或环境变量缺失时该怎么处理，启动后还要验证页面真的能访问。',
    reply: {
      scenario: 'development-local-server', durationSeconds: 97,
      introduction: '启动流程应从项目声明的运行环境和脚本开始，随后检查进程是否持续运行，最后确认实际页面可访问。只看到启动命令退出成功，还不能证明服务可用。',
      recommendation: '按「依赖就绪 → 启动服务 → 确认地址 → 验证页面」逐步检查。',
      sections: [
        { title: '启动步骤', items: ['读取 package.json、锁文件和环境示例，使用项目约定的包管理器安装依赖。只补充所需变量，不把密钥写进代码或终端输出。', '运行项目已有的 dev 脚本，并以日志实际输出的地址和端口为准。', '端口冲突时先确认占用进程。可以给当前服务换一个空闲端口，避免直接终止不相关的进程。'] },
        { title: '可用性检查', items: ['打开首页与一条会话深链，检查资源请求、控制台首个异常和页面内容。', '确认修改源码后页面能正常更新；停止服务后再次启动，验证配置没有依赖临时状态。', '若页面能打开但接口失败，分别核对 API 地址、代理配置和登录态。'] },
      ],
      conclusion: '最终记录实际访问地址、启动命令和必要环境变量名称，后续就能按同一套流程复现启动。',
      process: [{ narration: '先核对项目运行入口，再把常见启动故障分成依赖、端口和配置三类。', calls: [{ name: '读取运行约定', detail: 'package.json、锁文件、环境示例' }, { name: '整理服务检查', detail: '监听端口、首页请求、会话深链', terminal: true }] }],
    },
  },
  'codem-login-state': {
    prompt: '梳理一下登录过期后的会话恢复：用户正在编辑消息时被要求重新登录，回来后应该保留原会话和草稿。',
    reply: {
      scenario: 'development-login-state', durationSeconds: 118,
      introduction: '登录失效时应暂停需要身份的操作，并保留原会话地址与未发送草稿。重新登录成功后回到原位置，由用户确认后继续发送。',
      recommendation: '会话恢复与消息提交分开处理，避免登录回调重复发送。',
      sections: [{ title: '恢复流程', items: ['跳转登录前保存当前会话 ID 和草稿，并校验回跳地址只指向本站。', '登录成功后重新读取会话权限；仍有权限则恢复内容，没有权限则明确提示。', '补充多标签页退出登录、重复回调和网络失败的用例，确保草稿不会被空状态覆盖。'] }],
      conclusion: '验收时重点看原位置是否恢复、草稿是否完整，以及是否出现重复提交。',
      process: [{ narration: '沿登录失效、重新认证和回跳恢复三个阶段核对状态边界。', calls: [{ name: '梳理恢复状态', detail: '会话地址、编辑草稿、权限重新校验' }] }],
    },
  },
  'codem-list-performance': {
    prompt: '会话列表很长时滚动有点卡，切换一条会话也会导致整列闪动。请整理性能优化方向和验收指标。',
    reply: {
      scenario: 'development-list-performance', durationSeconds: 145,
      introduction: '先区分滚动时的渲染开销与切换会话触发的列表重建。选中变化只需要更新相关行，不应该重新排序或重建所有节点。',
      recommendation: '先稳定列表身份与顺序，再根据实际数据量决定是否加入虚拟滚动。',
      sections: [{ title: '优化顺序', items: ['使用稳定会话 ID 作为 key，避免把数组索引或访问时间当成节点身份。', '保留列表数据引用，减少选中变化引发的无关行渲染；图片使用固定尺寸，降低布局抖动。', '对数千条记录评估虚拟列表，同时验证键盘定位、分组折叠和选中行自动滚动。', '对比优化前后的滚动长任务、切换耗时和渲染行数，避免只凭主观流畅度判断。'] }],
      conclusion: '优先用实际长列表复现，再逐项验证收益，避免为了少量数据引入额外复杂度。',
      process: [{ narration: '把列表身份、数据变化与滚动渲染拆开分析，先处理会导致整列重建的因素。', calls: [{ name: '检查渲染触发', detail: '选中状态、key、数据引用' }, { name: '整理性能指标', detail: '长任务、切换耗时、可见行数' }] }],
    },
  },
  'codem-api-errors': {
    prompt: '检查会话接口失败时的处理方式，区分网络异常、未登录、无权限和服务错误，不要所有情况都提示重试。',
    reply: {
      scenario: 'development-api-errors', durationSeconds: 106,
      introduction: '错误处理已按用户能够采取的操作划分。是否允许重试，还需要结合请求是否已经产生写入判断。',
      recommendation: '错误提示要说明当前状态和下一步操作，并保留用户尚未提交的内容。',
      sections: [{ title: '处理规则', items: ['网络中断与临时服务不可用：保留当前内容，提供重试；后台重试设置次数上限。', '未登录：进入登录恢复流程。无权限：提示访问受限，不循环请求。', '发送消息超时：先按请求标识核对是否已经保存，再决定重发，避免重复消息。', '记录错误码、请求标识和失败环节，日志中排除令牌及用户敏感输入。'] }],
      conclusion: '补齐各类错误的独立用例后，再统一检查提示是否清楚、恢复动作是否有效。',
      process: [{ narration: '先按错误类型匹配用户动作，再核对写请求的重试边界。', calls: [{ name: '整理错误矩阵', detail: '网络异常、身份过期、权限不足、服务错误' }] }],
    },
  },
  'codem-navigation-tests': {
    prompt: '给 CodeM 主导航补一份回归清单，覆盖来源工作项会话、返回原页面、分组折叠和点击后顺序稳定。',
    reply: {
      scenario: 'development-navigation-tests', durationSeconds: 132,
      introduction: '回归清单按「进入、浏览、返回、恢复」组织，每一步都同时核对页面内容、地址和侧导航选中项。',
      recommendation: '把一次完整往返作为主线，再补充重复操作和异常数据。',
      sections: [{ title: '关键场景', items: ['分别从 Settings、表格字段建议和工作项详情进入，确认分组标题、类型图标和消息上下文。', '切换同组及跨组会话，确认只更新选中态；重复点击当前会话不能清空输入草稿。', '展开更多后打开较早会话，再折叠、展开分组，检查位置与列表内容。', '返回进入前的工作项详情，刷新会话深链，并验证浏览器前进后退。', '覆盖空历史、无效会话 ID、同名工作项和存储不可用。'] }],
      conclusion: '自动化检查负责状态与路由，最终再人工检查过渡动画、截断和窄屏显示。',
      process: [{ narration: '将入口与状态恢复组合成操作路径，避免只测试单个按钮。', calls: [{ name: '整理入口矩阵', detail: 'Settings、表格、详情页、直接链接' }, { name: '核对状态不变量', detail: '来源身份、草稿、选中项、列表顺序' }] }],
    },
  },
  'codem-release-checklist': {
    prompt: '整理 codem web 发布前的检查项，尤其是静态资源、会话深链和旧页面跨版本访问。',
    reply: {
      scenario: 'development-release-checklist', durationSeconds: 121,
      introduction: '发布前检查分为构建产物、路由与缓存、核心交互和恢复准备。每项都需要留下可复核的结果。',
      recommendation: '部署成功后继续验证真实访问路径，再确认版本可以交付。',
      sections: [{ title: '发布检查', items: ['完成类型检查与生产构建，确认本地静态图标、字体和报告资源包含在产物中。', '直接打开首页、Settings 和会话深链，确认站点重写不会把资源请求错误地返回为 HTML。', '用旧标签页跨版本刷新，检查动态模块加载失败时的恢复提示。', '验证新建、来源会话重开和返回原页面，同时检查控制台异常与失败请求。', '记录部署版本和回退目标，确保发现问题时可以恢复到上一个可用版本。'] }],
      conclusion: '检查结果可以附在发布记录中，失败项明确负责人和影响范围，再决定是否继续发布。',
      process: [{ narration: '先列出产物和访问路径，再补充缓存兼容及回退准备。', calls: [{ name: '核对发布范围', detail: '构建产物、静态资源、路由规则' }, { name: '整理上线验收', detail: '核心交互、旧页面访问、回退目标' }] }],
    },
  },
};

const workspaceDevelopmentChats: Record<string, DevelopmentChat> = Object.fromEntries(
  workspaceDevelopmentContent.flatMap(directory => directory.conversations.map(({ id, prompt, reply }) => [id, { prompt, reply }])),
);

export function getDevelopmentChat(id: string | null) {
  return id ? developmentChats[id] ?? workspaceDevelopmentChats[id] : undefined;
}

// Local prototype replies are rebuilt from saved prompts; they do not execute repository tools.
export function createDevelopmentFollowupReply(chat: DevelopmentChat, title: string, prompt: string, previousPrompts: readonly string[] = []): DevelopmentReply {
  const intent = (text: string) => /测试|回归|验收|验证|test/i.test(text) ? 'checks'
    : /简短|简洁|总结|概括|summary/i.test(text) ? 'summary'
    : /实现|方案|步骤|计划|怎么做|implement|plan/i.test(text) ? 'plan' : undefined;
  const mode = intent(prompt) ?? [...previousPrompts].reverse().map(intent).find(Boolean) ?? 'plan';
  const context = chat.reply.sections.map(section => `${section.title}：${section.items[0]}`);
  const sections = mode === 'checks' ? [
    { title: '验证重点', items: context },
    { title: '回归方式', items: ['为上述每项分别准备正常、异常和重复操作场景，记录前置条件、操作步骤与预期结果。', '将失败场景保留为可复现步骤，修复后重跑；涉及保存或恢复的行为，再检查刷新和切换后的结果。'] },
  ] : mode === 'summary' ? [
    { title: '要点', items: context },
  ] : [
    { title: '继续细化', items: context },
    { title: '下一步', items: [`把「${prompt.trim()}」补充到本轮范围，先确定对应的输入、输出及验收条件。`, '按前面的关键环节拆成可独立验证的改动，先完成一个最小可运行路径，再补充异常处理。'] },
  ];
  return {
    scenario: `${chat.reply.scenario}-followup-${mode}`, durationSeconds: 0,
    introduction: `针对你补充的「${prompt.trim()}」，继续围绕「${title}」${mode === 'checks' ? '整理验证清单' : mode === 'summary' ? '收敛讨论要点' : '细化后续步骤'}。`,
    recommendation: chat.reply.recommendation,
    sections,
    conclusion: mode === 'checks' ? '可以先选一个具体场景，补充输入数据与预期结果，再逐项确认。'
      : mode === 'summary' ? chat.reply.conclusion : '可以继续指定其中一个环节，并补充相关代码、日志或约束，进一步展开。',
    process: [],
  };
}
