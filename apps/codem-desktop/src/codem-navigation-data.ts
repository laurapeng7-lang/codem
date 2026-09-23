import type { Conversation } from './conversation-history';
import workspaceDevelopmentContent from './workspace-development-content.json';

// Figma navigation examples use their own IDs so existing conversation history stays intact.
type NavigationConversation = Conversation & { icon: string; status?: 'running' | 'alert' | 'complete' };
type NavigationProject = { id: string; name: string; conversations: NavigationConversation[] };
const pinnedConversation: NavigationConversation = { id: 'codem-feishu-card', group: '今天', title: 'codem 飞书卡片', icon: 'codem-cyan.png', summary: '可以从卡片内容、交互按钮和消息更新三个方面梳理飞书卡片。先明确接收人需要看到的信息，再确定每个按钮的操作和反馈。' };
const codemWebConversations: NavigationConversation[] = [
  { id: 'codem-sandbox-routing', group: '今天', title: '解释沙箱共享设备派发逻辑', icon: 'codem-cyan.png', status: 'running', summary: '排查共享设备派发逻辑时，可以依次查看设备的可用状态、任务匹配条件和占用记录。结合一次具体派发的日志，确认设备选择、锁定与释放的顺序。' },
  { id: 'codem-development-notes', group: '今天', title: '总结开发过程经验', icon: 'codem-violet.png', status: 'alert', summary: '可以按目标、关键决策、遇到的问题和后续改进整理开发经验。每个改进项补充适用场景、负责人和验证方式，便于后续开发复用。' },
  { id: 'codem-white-screen', group: '今天', title: '排查白屏问题', icon: 'terminal.png', status: 'complete', summary: '排查白屏时，先查看浏览器控制台的首个异常，再检查入口资源请求、路由匹配和页面初始化状态。结合复现步骤与错误堆栈，逐步缩小问题范围。' },
  { id: 'codem-file-changes', group: '今天', title: '排查文件异常代码变更', icon: 'codem-outline.svg', summary: '先对比异常文件与最近一次正常提交，确认变更来源和影响范围，再检查自动格式化、生成脚本与合并记录。保留当前改动后，再验证可能的修复。' },
  { id: 'codem-local-server', group: '今天', title: '启动本地服务', icon: 'codem-violet.png', summary: '启动前先确认项目的运行脚本、依赖安装状态和环境配置。启动后检查服务输出与监听地址，再通过页面或健康检查确认服务可用。' },
  { id: 'codem-login-state', group: '本周', title: '梳理登录状态与会话恢复', icon: 'codem-cyan.png', summary: '可以从首次登录、刷新页面和登录过期三个场景梳理状态恢复，确认每个场景的跳转目标和提示内容。' },
  { id: 'codem-list-performance', group: '本周', title: '优化长列表渲染性能', icon: 'terminal.png', summary: '先记录列表加载和滚动时的表现，再检查重复渲染、图片加载和数据分页，确定最影响体验的环节。' },
  { id: 'codem-api-errors', group: '本周', title: '检查接口错误处理', icon: 'codem-outline.svg', summary: '可以按网络中断、权限不足和服务异常整理接口失败场景，为每种情况补充提示、重试与恢复方式。' },
  { id: 'codem-navigation-tests', group: '本周', title: '补充导航交互回归用例', icon: 'codem-violet.png', summary: '重点覆盖导航进入与返回、浏览器前进后退，以及多次切换后页面和选中状态是否一致。' },
  { id: 'codem-release-checklist', group: '本周', title: '整理发布前检查项', icon: 'codem-cyan.png', summary: '按构建、配置、核心流程和回滚准备整理检查项，并为每一项记录验证结果和待处理问题。' },
];

const workspaceDirectories = workspaceDevelopmentContent.map(directory => ({
  id: directory.id, name: directory.name, pinned: directory.pinned,
  conversations: directory.conversations.map(chat => ({
    id: chat.id, title: chat.title, icon: chat.icon, group: '本周' as const, summary: chat.reply.introduction,
  })),
}));

export const codemPinnedProjects: NavigationProject[] = workspaceDirectories.filter(directory => directory.pinned);
export const codemNavigationProjects: NavigationProject[] = [
  ...workspaceDirectories.filter(directory => !directory.pinned),
  { id: 'codem-web', name: 'codem web', conversations: codemWebConversations },
];
export const codemNavigationDirectories = [...codemPinnedProjects, ...codemNavigationProjects];
export const codemNavigationConversations: NavigationConversation[] = [
  pinnedConversation,
  ...codemNavigationDirectories.flatMap(directory => directory.conversations),
];
