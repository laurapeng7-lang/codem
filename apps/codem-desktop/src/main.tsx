import { Fragment, useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Download } from 'lucide-react';
import assets from './assets.json';
import { downloadReport, downloadReportImage, downloadReportMarkdown, reportIntro, reportMarkdown, reportSections, reportSummary, reportTitle } from './report';
import { FrameworkDocument } from './FrameworkDocument';
import { ReportActionsMenu } from './ReportActionsMenu';
import { ReportPreview } from './ReportPreview';
import { ReportThemePanel } from './ReportThemePanel';
import { getReportController, initialReportState, type ReportMode } from './report-controls';
import reportThemes from './report-themes.json';
import { artifactTabsReducer, initialArtifactTabs, type ArtifactId } from './artifact-tabs';
import { ConversationHistoryMenu } from './ConversationHistoryMenu';
import { cloudEnvironment, conversationDisplayTitle, type Conversation } from './conversation-history';
import { codemNavigationDirectories } from './codem-navigation-data';
import { appendWorkItemMessage, canContinueConversation, createHomeConversation, createWorkItemConversation, findWorkItemConversation, loadWorkItemMessages, rememberWorkItemConversation, resolveConversation, setConversationEnvironment, type WorkItemChatSource } from './work-item-chat';
import { RichPromptEditor } from './RichPromptEditor';
import { SentMessage } from './SentMessage';
import { AssistantMessage, ReplyCompletion } from './AssistantMessage';
import { SettingsReviewPreview } from './SettingsReviewPreview';
import type { SettingsReview } from './settings-review';
import { promptText, workItemPromptSegments } from './prompt-content';
import { NewConversation, type NewConversationMode } from './NewConversation';
import { NewChatIcon, NewChatToolbar } from './NewChatToolbar';
import { type ReportPrompt } from './report-prompts';
import { conversationIdFromUrl, conversationUrl, isAdminUrl, isCodeMSettingsUrl, isCodeMToolsUrl, isCodeMAutomationsUrl, isHomeUrl, isMarketplaceUrl, isSettingsUrl, navigateAdmin, navigateCodeMSettings, navigateCodeMTools, navigateCodeMAutomations, navigateConversation, navigateHome, navigateMarketplace, navigateSettings, redirectRootToHome } from './conversation-url';
import { HomePage } from './HomePage';
import { Marketplace } from './Marketplace';
import { ProfileMenu } from './ProfileMenu';
import { CodeMNavigation } from './CodeMNavigation';
import { CodeMSettings } from './CodeMSettings';
import { CodeMTools } from './CodeMTools';
import { CodeMAutomations } from './CodeMAutomations';
import type { CodeMNavigationDraft } from './CodeMSourceNavigation';
import { createDevelopmentFollowupReply, getDevelopmentChat } from './development-chat-content';
import { AdminPage } from './AdminPage';
import { WorkItemsPage } from './WorkItemsPage';
import { SettingsPage } from './SettingsPage';
import { SettingsConfirmationCard } from './SettingsConfirmationCard';
import { beginSettingsExecution, settingsExecutionKey, useSettingsExecutionControl } from './settings-chat-execution';
import { applications, personalApplications, workItemApplications, applicationFromPath, navigateApplication } from './work-item-navigation';
import './styles.css';
import './new-conversation.css';

type Asset = keyof typeof assets;
function Icon({ name, size = 18, className = '' }: { name: Asset; size?: number; className?: string }) {
  return <img className={`icon ${className}`} src={assets[name]} width={size} height={size} alt="" draggable="false" />;
}
function IconButton({ name, label, onClick, size = 18, className = '', children, ...props }: { name: Asset; label: string; onClick?: () => void; size?: number; className?: string; children?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick} {...props}><Icon name={name} size={size} />{children}</button>;
}

const navigation: { label: string; icon: Asset; color?: string }[] = [
  { label: 'Home', icon: 'sidebar/imgIconHomeFilled', color: '#0046fe' },
  { label: 'CodeM', icon: 'sidebar/codem' },
  { label: 'My work', icon: 'sidebar/imgIconMemberFilled', color: '#fa8500' },
  { label: 'Team', icon: 'sidebar/imgIconCommunityTabFilled', color: '#02a28c' },
  { label: 'Marketplace', icon: 'sidebar/imgIconTemplateColorful' },
];
function NavGlyph({ icon, color, small = false }: { icon: Asset; color?: string; small?: boolean }) {
  return <span className="nav-glyph"><span className="nav-glyph-inner" style={{ background: color }}><Icon name={icon} size={color ? (small ? 10 : 11.25) : 18} /></span></span>;
}
function Sidebar({ collapsed, open, toggle, close, notify, active, onNavigate, onOpenAdmin, onNewConversation, onBackToMeegle, selectedConversation, workItemDraft, onOpenConversation }: { collapsed: boolean; open: boolean; toggle: () => void; close: () => void; notify: (text: string) => void; active: string; onNavigate: (label: string) => void; onOpenAdmin: () => void; onNewConversation: () => void; onBackToMeegle: () => void; selectedConversation: string | null; workItemDraft?: CodeMNavigationDraft; onOpenConversation: (conversation: Conversation) => void }) {
  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<Record<string, boolean>>({ Apps: true, 'Space pinned': true, Personal: true });
  const [profileMenu, setProfileMenu] = useState(false);
  const level = active === 'CodeM' || active === 'CodeM Settings' || active === 'CodeM Tools' || active === 'CodeM Automations' ? 'codem' : 'meegle';
  const focusAfterNavigation = useRef<'meegle' | 'codem' | null>(null);
  const codeMTrigger = useRef<HTMLButtonElement>(null);
  const backTrigger = useRef<HTMLButtonElement>(null);
  const meegleLevel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (focusAfterNavigation.current !== level) return;
    const target = level === 'codem' ? backTrigger.current
      : meegleLevel.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? codeMTrigger.current ?? meegleLevel.current;
    target?.focus({ preventScroll: true });
    focusAfterNavigation.current = null;
  }, [level]);
  useEffect(() => { setProfileMenu(false); }, [active, collapsed, open]);
  const matches = (text: string) => text.toLowerCase().includes(search.toLowerCase());
  const choose = (label: string) => {
    if (label === 'CodeM') {
      setProfileMenu(false);
      focusAfterNavigation.current = 'codem';
    }
    onNavigate(label);
    if (label !== 'CodeM') close();
  };
  function group(label: string) {
    return <button className="group-heading" aria-expanded={groups[label]} onClick={() => setGroups({ ...groups, [label]: !groups[label] })}><Icon name="sidebar/imgIconExpandRightFilled" size={8} className={groups[label] ? 'rotate-90' : ''} /><span>{label}</span></button>;
  }
  function folder(label: string, id: string) {
    return <div key={id} className="folder-row"><Icon name="sidebar/imgIconExpandRightFilled1" size={8} /><Icon name="sidebar/imgFrame" size={18} /><span>{label}</span></div>;
  }
  return <>
    {open && <button className="sidebar-scrim" aria-label="关闭导航" onClick={close} />}
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${open ? 'mobile-open' : ''} ${profileMenu ? 'has-profile-menu' : ''}`} aria-label="主导航">
      <div className="sidebar-levels" data-level={level}>
      <div ref={meegleLevel} className="sidebar-level sidebar-level-meegle" tabIndex={-1} aria-hidden={level !== 'meegle'} inert={level !== 'meegle'}>
      <div className="sidebar-header"><button className="brand" aria-label="Meego 首页" onClick={() => choose('CodeM')}><img src={assets['sidebar/imgGroup']} width="22.468" height="16" alt="Meego" /></button><IconButton name="sidebar/img24X24" label={collapsed ? '展开导航' : '收起导航'} size={18} onClick={toggle} className="collapse-control" /></div>
      <div className="sidebar-content">
        <label className="search"><Icon name="sidebar/imgIconSearchOutlined" size={16} /><input aria-label="搜索导航" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <nav className="primary-navigation">{navigation.filter(n => matches(n.label)).map(n => <button key={n.label} ref={n.label === 'CodeM' ? codeMTrigger : undefined} title={n.label} onClick={() => choose(n.label)} className={`nav-row ${active === n.label ? 'active' : ''}`} aria-current={active === n.label ? 'page' : undefined}><NavGlyph {...n} /><span>{n.label}</span></button>)}</nav>
        <div className="workspace-navigation">
          <div className="divider" /><div className="workspace-label">Work space</div>
          <div className="workspace-container"><div className="workspace-selector"><span className="workspace-avatar">A</span><span>Agile Development</span><Icon name="sidebar/imgFilledArrowChevronDown" size={10} /></div></div>
          {group('Apps')}
          {groups.Apps && applications.filter(n => matches(n.label)).map(n => <button key={n.id} className={`nav-row app-row ${active === n.id ? 'active' : ''}`} aria-current={active === n.id ? 'page' : undefined} onClick={() => choose(n.id)}><NavGlyph {...n} small /><span>{n.label}</span></button>)}
          {groups.Apps && matches('Settings') && <button type="button" className={`nav-row settings-nav-row ${active === 'Settings' ? 'active' : ''}`} aria-current={active === 'Settings' ? 'page' : undefined} onClick={() => choose('Settings')}><NavGlyph icon="sidebar/settings" color="#646a73" small /><span>Settings</span></button>}
          <div className="divider section-divider" />{group('Space pinned')}
          {groups['Space pinned'] && matches('2026 OKR 需求') && <>{folder('2026 OKR 需求', 'pinned1')}{folder('2026 OKR 需求', 'pinned2')}</>}
          <div className="divider section-divider" />{group('Personal')}
          {groups.Personal && <>{matches('W26 OKR 需求') && folder('W26 OKR 需求', 'personal')}{personalApplications.filter(item => matches(item.label)).map(item => <button key={item.id} className={`personal-row ${active === item.id ? 'active' : ''}`} aria-current={active === item.id ? 'page' : undefined} onClick={() => choose(item.id)}><span className="list-glyph"><Icon name={item.icon} size={12} /></span><span>{item.label}</span></button>)}</>}
          {search && ![...navigation, ...workItemApplications, ...['Settings', '2026 OKR 需求', 'W26 OKR 需求'].map(label => ({ label }))].some(n => matches(n.label)) && <p className="no-results">没有找到相关内容</p>}
        </div>
      </div>
      <footer className="sidebar-footer"><ProfileMenu open={profileMenu} onOpenChange={setProfileMenu} onSelect={label => {
        if (label === '企业管理平台') { onOpenAdmin(); close(); }
        else notify(`${label}页面尚未接入`);
      }} /><div className="footer-actions"><IconButton name="sidebar/img24X25" label="移动端" onClick={() => notify('可在手机浏览器中使用，导航和产物预览会自动适配')} /><IconButton name="sidebar/img24X26" label="设置" onClick={() => notify('本地交互演示 · 尚未连接 AI 服务')} /><IconButton name="sidebar/img24X27" label="通知，9 条未读" onClick={() => notify('项目报告已生成，可以从对话中的卡片查看')}><span className="notification-badge">9</span></IconButton></div></footer>
      </div>
      <div className="sidebar-level sidebar-level-codem" aria-hidden={level !== 'codem'} inert={level !== 'codem'}>
        <CodeMNavigation backRef={backTrigger} onBack={() => { focusAfterNavigation.current = 'meegle'; onBackToMeegle(); }} onExpand={toggle}
          onNew={() => { onNewConversation(); close(); }} onSettings={() => choose('CodeM Settings')} settingsActive={active === 'CodeM Settings'} onTools={() => choose('CodeM Tools')} toolsActive={active === 'CodeM Tools'} onAutomations={() => choose('CodeM Automations')} automationsActive={active === 'CodeM Automations'} selectedConversation={selectedConversation} draft={workItemDraft}
          active={active === 'CodeM'} onOpenConversation={onOpenConversation} notify={notify} />
      </div>
      </div>
    </aside>
  </>;
}

const steps: { icon: Asset; label: string; text: string }[] = [
  { icon: 'chat/imgRead', label: '解析视图链接', text: '项目明细已获取。我将汇总进度、负责人负载及风险指标，并搭建报告结构。' },
  { icon: 'chat/imgRead', label: '汇总项目进展与风险数据', text: '项目数据已汇总，接下来搜索研发项目延期预警与流程瓶颈的相关实践，为风险诊断补充参考依据。' },
  { icon: 'chat/img24X24', label: '联网搜索工具调用', text: '已找到排期偏差、节点积压与依赖阻塞的相关分析实践，接下来匹配适用的方法，明确风险判断口径与报告框架。' },
  { icon: 'chat/img24X25', label: '分析方法论检索', text: '框架构建完成,开始生成报告。报告框架基于敏捷与精益管理里方法论构建，每个模块均说明分析内容、分析逻辑与分析产出。' },
];
function ToolStep({ icon, label }: { icon: Asset; label: string }) {
  return <div className="tool-step"><Icon name={icon} size={20} /><span>{label}</span><span className="tool-duration">(1 秒)</span></div>;
}
function ReportBody() {
  return <><h2>进行中项目进展与风险诊断报告</h2><h3>一、进行中项目进展总结</h3><p>{reportIntro}</p>{reportSections.map(([title, ...paragraphs]) => <section key={title}><h3>{title}</h3>{paragraphs.map(p => <p key={p}>{p}</p>)}</section>)}</>;
}
function ReportCard({ open }: { open: () => void }) {
  return <div className="report-card">
    <div className="report-card-label"><Icon name="chat/img24X26" size={16} /><span>报告框架</span><Icon name="chat/imgIconExpandOutlined" size={16} /></div>
    <div className="report-card-body"><ReportBody /></div>
    <div className="report-fade" />
    <button type="button" className="report-card-trigger" aria-label="预览报告框架" onClick={open}>
      <span className="report-preview-button">预览</span>
    </button>
  </div>;
}
type ArtifactConversion = 'document' | 'sheet' | 'bitable';

function ArtifactActions({ label, kind, onDownload, onConvert }: {
  label: string;
  kind: 'report' | 'markdown';
  onDownload: () => void;
  onConvert: (target: ArtifactConversion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false);
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open]);
  const lucideIcon = (Glyph: typeof Download) => <Glyph className="artifact-action-icon" size={16} color="#646a73" strokeWidth={1.8} aria-hidden="true" />;
  const assetIcon = (name: Asset) => <Icon name={name} className="artifact-action-icon" size={16} />;
  const actions: { label: string; icon: ReactNode; run: () => void }[] = kind === 'report' ? [
    { label: '下载', icon: lucideIcon(Download), run: onDownload },
    { label: '转为飞书表格', icon: assetIcon('artifact-menu/fileSheet'), run: () => onConvert('sheet') },
    { label: '转为多维表格', icon: assetIcon('artifact-menu/fileBitable'), run: () => onConvert('bitable') },
  ] : [
    { label: '下载', icon: lucideIcon(Download), run: onDownload },
    { label: '转为飞书云文档', icon: assetIcon('artifact-menu/fileDoc'), run: () => onConvert('document') },
  ];
  const toggleMenu = () => {
    if (open) { setOpen(false); return; }
    const trigger = root.current?.querySelector<HTMLButtonElement>(':scope > button');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 184;
    const height = actions.length * 32 + 8;
    const top = rect.bottom + 6 + height <= window.innerHeight - 8 ? rect.bottom + 6 : Math.max(8, rect.top - height - 6);
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setPosition({ top, left });
    setOpen(true);
  };
  return <div className="artifact-actions" ref={root}>
    <IconButton name="toolbar/img24X24" label={`${label}的更多操作`} size={16} aria-haspopup="menu" aria-controls={open ? 'artifact-actions-menu' : undefined} aria-expanded={open} onClick={toggleMenu} />
    {open && createPortal(<div ref={menu} id="artifact-actions-menu" className="artifact-actions-menu" style={position} role="menu" aria-label={`${label}的操作`} onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>(':scope > button')?.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
      {actions.map(action => {
        return <button key={action.label} type="button" role="menuitem" onClick={() => { setOpen(false); action.run(); }}>
          {action.icon}
          <span>{action.label}</span>
        </button>;
      })}
    </div>, document.body)}
  </div>;
}
function ChatHistory({ openReport, openMarkdown, openFramework, onDownloadReport, onDownloadMarkdown, notify }: {
  openReport: () => void;
  openMarkdown: () => void;
  openFramework: () => void;
  onDownloadReport: () => void;
  onDownloadMarkdown: () => void;
  notify: (text: string) => void;
}) {
  const conversionLabels: Record<ArtifactConversion, string> = { document: '飞书云文档', sheet: '飞书表格', bitable: '多维表格' };
  const convert = (artifact: string, target: ArtifactConversion) => notify(`已开始将${artifact}转为${conversionLabels[target]}`);
  return <article className="history">
    <div className="history-introduction"><ReplyCompletion /><p className="intro-text">报告框架已获取，结构清晰。视图查询需要 project-key，我从 URL 中看到 leopard 可能是空间标识。让我先读取报告框架的详细内容，同时尝试用常用空间查询视图。</p><ToolStep icon="chat/imgRead" label="处理业务数据" /></div>
    <p className="narrative">配置已确认：按需求状态分组，并筛选已关联项目。接下来获取开发中、测试中、灰度中和发布中的项目明细。</p>
    {steps.map(s => <div className="step-pair" key={s.label}><ToolStep icon={s.icon} label={s.label} /><p className="narrative">{s.text}</p></div>)}
    <div className="report-generation"><ToolStep icon="chat/imgCreate" label="生成项目进展与风险诊断报告框架" /><ReportCard open={openFramework} /></div>
    <p className="report-summary">{reportSummary}</p>
    <div className="artifact-card"><button className="artifact-open" onClick={openReport}><span className="artifact-icon-frame"><Icon name="chat/artifactReportTable" size={32.4} /></span><span>{reportTitle}</span></button><ArtifactActions label={reportTitle} kind="report" onDownload={onDownloadReport} onConvert={target => convert('报告', target)} /></div>
    <div className="artifact-card"><button className="artifact-open" onClick={openMarkdown}><Icon name="chat/artifactReportMarkdown" size={36} /><span>{reportTitle}.md</span></button><ArtifactActions label={`${reportTitle}.md`} kind="markdown" onDownload={onDownloadMarkdown} onConvert={target => convert(' Markdown 报告', target)} /></div>
    <div className="message-meta"><IconButton name="chat/img24X27" label="复制回复" onClick={() => { void navigator.clipboard.writeText(reportSummary).then(() => notify('回复已复制')).catch(() => notify('无法访问剪贴板，请选择文字复制')); }} /><IconButton name="chat/img24X28" label="关于此回复" onClick={() => notify('此页面展示 Figma 中的示例对话，发送消息已禁用。')} /><time>11:01 PM</time></div>
  </article>;
}

function App() {
  const [activeNavigation, setActiveNavigation] = useState(() => applicationFromPath(window.location.pathname)?.id ?? (isCodeMAutomationsUrl(window.location.pathname) ? 'CodeM Automations' : isCodeMToolsUrl(window.location.pathname) ? 'CodeM Tools' : isCodeMSettingsUrl(window.location.pathname) ? 'CodeM Settings' : isHomeUrl(window.location.pathname) ? 'Home' : isAdminUrl(window.location.pathname) ? 'Admin' : isMarketplaceUrl(window.location.pathname) ? 'Marketplace' : isSettingsUrl(window.location.pathname) ? 'Settings' : 'CodeM'));
  const meegleReturnLocation = useRef(activeNavigation === 'CodeM' || activeNavigation === 'CodeM Settings' || activeNavigation === 'CodeM Tools' || activeNavigation === 'CodeM Automations' ? null : { page: activeNavigation, href: window.location.href });
  const home = activeNavigation === 'Home';
  const marketplace = activeNavigation === 'Marketplace';
  const admin = activeNavigation === 'Admin';
  const settings = activeNavigation === 'Settings';
  const codeMSettings = activeNavigation === 'CodeM Settings';
  const codeMTools = activeNavigation === 'CodeM Tools';
  const codeMAutomations = activeNavigation === 'CodeM Automations';
  const activeApplication = workItemApplications.find(item => item.id === activeNavigation);
  const workItems = Boolean(activeApplication);
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(() => conversationIdFromUrl(window.location.pathname, window.location.search));
  const [mobilePane, setMobilePane] = useState<'chat' | 'preview'>(() => conversationId === 'project-report' && ['#report', '#markdown', '#framework'].includes(window.location.hash) ? 'preview' : 'chat');
  const [artifactTabs, dispatchArtifactTabs] = useReducer(artifactTabsReducer, initialArtifactTabs, initial => {
    if (conversationId !== 'project-report') return { items: [], active: null };
    const requested: ArtifactId = window.location.hash === '#markdown' ? 'markdown' : window.location.hash === '#framework' ? 'framework' : 'report';
    return requested === 'report' ? initial : { items: [requested], active: requested };
  });
  const [settingsReview, setSettingsReview] = useState<SettingsReview | null>(null);
  const previewOpen = artifactTabs.items.length > 0;
  const newChat = conversationId === null;
  const [newConversationVersion, setNewConversationVersion] = useState(0);
  const [draftEnvironment, setDraftEnvironment] = useState(cloudEnvironment);
  const [conversationMode, setConversationMode] = useState<NewConversationMode>('default');
  const [reportDraft, setReportDraft] = useState<ReportPrompt>({ prompt: '', theme: initialReportState.theme });
  const [reportLaunchTheme, setReportLaunchTheme] = useState<string>();
  const conversation = resolveConversation(conversationId);
  const conversationWorkspace = conversation?.workItem?.title ?? conversation?.view?.title ?? conversation?.settings?.title.split(' · ')[0] ?? conversation?.home?.title
    ?? codemNavigationDirectories.find(project => project.conversations.some(item => item.id === conversationId))?.name ?? 'CodeM';
  const developmentChat = getDevelopmentChat(conversationId);
  const [workItemChatSource, setWorkItemChatSource] = useState<WorkItemChatSource | null>(null);
  const [workItemMessages, setWorkItemMessages] = useState(() => loadWorkItemMessages(conversationId));
  const composerEditable = newChat || canContinueConversation(conversationId);
  const settingsExecutionControl = useSettingsExecutionControl(activeNavigation === 'CodeM' && conversation?.settings ? conversation.id : null);
  const [toast, setToast] = useState('');
  const [historyMenu, setHistoryMenu] = useState(false);
  const [composerMenu, setComposerMenu] = useState<'mention' | 'skill' | null>(null);
  const [moreMenu, setMoreMenu] = useState(false);
  const [themeMenu, setThemeMenu] = useState(false);
  const [reportState, setReportState] = useState(initialReportState);
  const [reportReady, setReportReady] = useState(false);
  const [linkAccess, setLinkAccess] = useState(false);
  const [imageExporting, setImageExporting] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const richInput = useRef<HTMLDivElement>(null);
  const focusPrefilledPrompt = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const previewScroll = useRef<HTMLDivElement>(null);
  const reportFrame = useRef<HTMLIFrameElement>(null);
  const artifactScrollPositions = useRef<Partial<Record<ArtifactId, number>>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (text: string) => { clearTimeout(toastTimer.current); setToast(text); toastTimer.current = setTimeout(() => setToast(''), 3600); };
  const closeReportPopovers = useCallback(() => { setMoreMenu(false); setThemeMenu(false); }, []);
  const rememberMeegleLocation = () => {
    // Capture before changing the URL, including an open work item's detail route.
    if (activeNavigation !== 'CodeM' && activeNavigation !== 'CodeM Settings' && activeNavigation !== 'CodeM Tools' && activeNavigation !== 'CodeM Automations') meegleReturnLocation.current = { page: activeNavigation, href: window.location.href };
  };
  const backToMeegle = () => {
    const destination = meegleReturnLocation.current;
    if (destination) {
      if (destination.href !== window.location.href) window.history.pushState(null, '', destination.href);
    } else navigateHome();
    setActiveNavigation(destination?.page ?? 'Home');
    closeReportPopovers();
    setHistoryMenu(false);
    setComposerMenu(null);
    if (reportReady) setReportLaunchTheme(reportState.theme);
    setReportReady(false);
  };
  const navigateSidebar = (label: string) => {
    if (label === 'My work' || label === 'Team') {
      notify('暂未接入');
      return;
    }
    if (label === 'CodeM') {
      if (!newChat) startNewChat();
      else {
        rememberMeegleLocation();
        navigateConversation(true);
        setActiveNavigation('CodeM');
        closeReportPopovers();
        setHistoryMenu(false);
        setComposerMenu(null);
      }
      return;
    }
    if (label === 'Home' || label === 'Marketplace' || label === 'Admin' || label === 'Settings' || label === 'CodeM Settings' || label === 'CodeM Tools' || label === 'CodeM Automations' || workItemApplications.some(item => item.id === label)) {
      if (label === 'Home') navigateHome();
      else if (label === 'Admin') navigateAdmin();
      else if (label === 'Marketplace') navigateMarketplace();
      else if (label === 'Settings') navigateSettings();
      else if (label === 'CodeM Settings') navigateCodeMSettings();
      else if (label === 'CodeM Tools') navigateCodeMTools();
      else if (label === 'CodeM Automations') navigateCodeMAutomations();
      else navigateApplication(label);
      closeReportPopovers();
      setHistoryMenu(false);
      setComposerMenu(null);
      // The report iframe is unmounted on this page; preserve its selected theme.
      if (reportReady) setReportLaunchTheme(reportState.theme);
      setReportReady(false);
    } else if (home || marketplace || admin || workItems || settings || codeMSettings || codeMTools || codeMAutomations) navigateConversation(newChat, conversationId ?? undefined);
    setActiveNavigation(label);
  };
  const openArtifact = (id: ArtifactId) => { dispatchArtifactTabs({ type: 'open', id }); setMobilePane('preview'); closeReportPopovers(); };
  const openReport = () => openArtifact('report');
  const openMarkdown = () => openArtifact('markdown');
  const openFramework = () => openArtifact('framework');
  const openSettingsReview = (review: SettingsReview) => { setSettingsReview(review); openArtifact('settings-review'); };
  const closeHistoryMenu = useCallback(() => setHistoryMenu(false), []);
  const closeReportMenu = useCallback(() => setMoreMenu(false), []);
  const closeThemeMenu = useCallback(() => setThemeMenu(false), []);
  const handleReportReadyChange = useCallback((ready: boolean) => {
    setReportReady(ready);
    if (ready) setReportLaunchTheme(undefined);
  }, []);
  const themeLabel = reportThemes.find(theme => theme.id === reportState.theme)?.label ?? '飞书项目';
  const selectReportMode = (mode: ReportMode) => {
    if (!reportReady) return;
    const controller = getReportController(reportFrame.current);
    if (!controller) return;
    closeReportPopovers();
    if (controller.getState().mode !== mode) controller.setMode(mode);
  };
  const selectReportTheme = (id: string) => {
    const controller = getReportController(reportFrame.current);
    if (!controller) return;
    requestAnimationFrame(() => controller.setTheme(id));
  };
  const handleDownloadImage = async () => {
    if (imageExporting) return;
    setImageExporting(true);
    openReport();
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const doc = reportFrame.current?.contentDocument;
      if (!doc || doc.readyState !== 'complete') throw new Error('Report preview is unavailable');
      await downloadReportImage(doc);
      notify('报告已下载为 PNG 图片');
    } catch {
      notify('图片导出失败，请重试或下载为网页');
    } finally {
      setImageExporting(false);
    }
  };
  const handleDownloadWebpage = async () => {
    closeReportMenu();
    try {
      await downloadReport();
      notify('完整报告已下载为 HTML 文件');
    } catch {
      notify('报告下载失败，请重试');
    }
  };
  const handleDownloadMarkdown = () => {
    try {
      downloadReportMarkdown();
      notify('Markdown 文档已下载');
    } catch {
      notify('Markdown 文档下载失败，请重试');
    }
  };
  const copyReportLink = async () => {
    const url = conversationUrl(window.location.href, false, 'project-report');
    url.hash = 'report';
    closeReportMenu();
    try {
      await navigator.clipboard.writeText(url.href);
      notify('本地报告预览链接已复制');
    } catch {
      notify('无法访问剪贴板，请检查浏览器权限');
    }
  };
  const closeArtifact = (id: ArtifactId) => {
    dispatchArtifactTabs({ type: 'close', id });
    delete artifactScrollPositions.current[id];
    closeReportPopovers();
    if (artifactTabs.items.length === 1) setMobilePane('chat');
  };
  const showPreview = () => {
    if (!previewOpen) {
      if (settingsReview) dispatchArtifactTabs({ type: 'open', id: 'settings-review' });
      else if (conversation?.settings) { notify('生成配置草案后可 review 变更'); return; }
      else dispatchArtifactTabs({ type: 'open', id: 'report' });
    }
    setMobilePane('preview');
  };
  const toggleNav = () => { if (window.innerWidth <= 1100) setNavOpen(v => !v); else setCollapsed(v => !v); };
  const resetConversationView = useCallback((keepReport = false) => {
    dispatchArtifactTabs({ type: 'close-all' });
    setSettingsReview(null);
    artifactScrollPositions.current = {};
    closeReportPopovers();
    if (!keepReport) {
      setReportReady(false);
      setReportState(initialReportState);
    }
    setAttachments([]);
    setDraftEnvironment(cloudEnvironment);
    setReportDraft({ prompt: '', theme: initialReportState.theme });
    setWorkItemChatSource(null);
    setWorkItemMessages([]);
    setReportLaunchTheme(undefined);
    setComposerMenu(null);
    setConversationMode('default');
    setHistoryMenu(false);
    setMobilePane('chat');
  }, [closeReportPopovers]);
  const startNewChat = () => {
    rememberMeegleLocation();
    navigateConversation(true);
    setActiveNavigation('CodeM');
    resetConversationView();
    setConversationId(null);
    setNewConversationVersion(value => value + 1);
    if (scrollArea.current) scrollArea.current.scrollTop = 0;
  };
  const changeConversationMode = (mode: NewConversationMode) => {
    setConversationMode(mode);
    setComposerMenu(null);
    if (scrollArea.current) scrollArea.current.scrollTop = 0;
  };
  const selectConversation = (item: Conversation) => {
    if (activeNavigation === 'CodeM' && item.id === conversationId) {
      setNavOpen(false);
      setHistoryMenu(false);
      return;
    }
    rememberMeegleLocation();
    rememberWorkItemConversation(item);
    navigateConversation(false, item.id);
    setActiveNavigation('CodeM');
    setNavOpen(false);
    resetConversationView(item.id === 'project-report');
    setConversationId(item.id);
    setWorkItemMessages(loadWorkItemMessages(item.id));
    if (item.id === 'project-report') dispatchArtifactTabs({ type: 'open', id: 'report' });
  };
  const chooseReportPrompt = (selection: ReportPrompt) => {
    setReportDraft(selection);
    setComposerMenu(null);
    if (scrollArea.current) scrollArea.current.scrollTop = 0;
    if (reportDraft.segments) focusPrefilledPrompt.current = true;
    else textarea.current?.focus({ preventScroll: true });
  };
  const startSkillChat = (selection: ReportPrompt) => {
    startNewChat();
    setReportDraft(selection);
    focusPrefilledPrompt.current = true;
  };
  const startWorkItemChat = (source: WorkItemChatSource, fieldName: string) => {
    const existing = findWorkItemConversation(source);
    if (existing) selectConversation(existing);
    else startNewChat();
    setWorkItemChatSource(source);
    setNavOpen(false);
    const segments = workItemPromptSegments(source.item.title, fieldName);
    setReportDraft({
      prompt: promptText(segments), segments,
      theme: initialReportState.theme,
    });
    focusPrefilledPrompt.current = true;
  };
  const sendReportPrompt = () => {
    if (!composerEditable || settingsExecutionControl || !reportDraft.prompt.trim()) return;
    if (conversation) {
      if (conversation.settings) beginSettingsExecution(settingsExecutionKey(conversation.id, workItemMessages.length + 1));
      setWorkItemMessages(appendWorkItemMessage(conversation.id, reportDraft.prompt.trim()));
      setReportDraft({ prompt: '', segments: [], theme: initialReportState.theme });
      focusPrefilledPrompt.current = true;
      return;
    }
    if (workItemChatSource) {
      if (reportDraft.prompt.trim().length > 2000) { notify('消息请控制在 2000 字以内'); return; }
      const created = createWorkItemConversation(workItemChatSource.slug, workItemChatSource.item, reportDraft.prompt);
      setConversationEnvironment(created.id, draftEnvironment);
      selectConversation(created);
      return;
    }
    const theme = reportDraft.theme;
    setConversationEnvironment('project-report', draftEnvironment);
    navigateConversation(false, 'project-report');
    resetConversationView();
    setConversationId('project-report');
    setReportLaunchTheme(theme);
    setReportState({ mode: 'reading', theme });
    dispatchArtifactTabs({ type: 'open', id: 'report' });
  };
  useLayoutEffect(() => {
    const input = richInput.current ?? textarea.current;
    if (!input) return;
    input.style.height = '51.689px';
    if (composerEditable) input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    if (composerEditable && focusPrefilledPrompt.current) {
      input.focus({ preventScroll: true });
      if (input === richInput.current) {
        const range = document.createRange();
        range.selectNodeContents(input); range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges(); selection?.addRange(range);
      } else {
        const plainInput = input as HTMLTextAreaElement;
        plainInput.setSelectionRange(plainInput.value.length, plainInput.value.length);
      }
      focusPrefilledPrompt.current = false;
    }
  }, [composerEditable, reportDraft.prompt, Boolean(reportDraft.segments), conversationId, home, marketplace, admin, workItems, settings, codeMSettings, codeMTools, codeMAutomations]);
  useLayoutEffect(() => {
    if (scrollArea.current) scrollArea.current.scrollTop = newChat ? 0 : scrollArea.current.scrollHeight;
  }, [newChat, conversationId, workItemMessages, home, marketplace, admin, workItems, settings, codeMSettings, codeMTools, codeMAutomations]);
  useEffect(() => {
    const current = resolveConversation(conversationId);
    if (activeNavigation === 'CodeM' && current) rememberWorkItemConversation(current);
  }, [activeNavigation, conversationId]);
  useLayoutEffect(() => {
    if (previewScroll.current && artifactTabs.active) previewScroll.current.scrollTop = artifactScrollPositions.current[artifactTabs.active] ?? 0;
    if (artifactTabs.active) document.getElementById(`artifact-tab-${artifactTabs.active}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [artifactTabs.active, home, marketplace, admin, workItems, settings, codeMSettings, codeMTools, codeMAutomations]);
  useEffect(() => { if (newChat || home || marketplace || admin || workItems || settings || codeMSettings || codeMTools || codeMAutomations) return; const observer = new ResizeObserver(() => { if (scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight; }); if (scrollArea.current) observer.observe(scrollArea.current); return () => observer.disconnect(); }, [newChat, home, marketplace, admin, workItems, settings, codeMSettings, codeMTools, codeMAutomations]);
  useEffect(() => () => { clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    const restoreLocation = () => {
      redirectRootToHome();
      setNavOpen(false);
      if (isCodeMSettingsUrl(window.location.pathname) || isCodeMToolsUrl(window.location.pathname) || isCodeMAutomationsUrl(window.location.pathname)) {
        setActiveNavigation(isCodeMAutomationsUrl(window.location.pathname) ? 'CodeM Automations' : isCodeMToolsUrl(window.location.pathname) ? 'CodeM Tools' : 'CodeM Settings');
        if (reportReady) setReportLaunchTheme(reportState.theme);
        setReportReady(false);
        closeReportPopovers();
        setHistoryMenu(false);
        setComposerMenu(null);
        return;
      }
      const application = applicationFromPath(window.location.pathname);
      if (isHomeUrl(window.location.pathname) || isMarketplaceUrl(window.location.pathname) || isAdminUrl(window.location.pathname) || isSettingsUrl(window.location.pathname) || application) {
        const page = application?.id ?? (isHomeUrl(window.location.pathname) ? 'Home' : isAdminUrl(window.location.pathname) ? 'Admin' : isSettingsUrl(window.location.pathname) ? 'Settings' : 'Marketplace');
        meegleReturnLocation.current = { page, href: window.location.href };
        setActiveNavigation(page);
        if (reportReady) setReportLaunchTheme(reportState.theme);
        setReportReady(false);
        closeReportPopovers();
        setHistoryMenu(false);
        setComposerMenu(null);
        return;
      }
      setActiveNavigation('CodeM');
      const nextConversationId = conversationIdFromUrl(window.location.pathname, window.location.search);
      resetConversationView(nextConversationId === 'project-report');
      setConversationId(nextConversationId);
      setWorkItemMessages(loadWorkItemMessages(nextConversationId));
      if (nextConversationId === null) setNewConversationVersion(value => value + 1);
      else if (nextConversationId === 'project-report') {
        dispatchArtifactTabs({ type: 'open', id: 'report' });
        setMobilePane(window.location.hash === '#report' ? 'preview' : 'chat');
      }
    };
    const openLinkedReport = () => {
      if (isCodeMSettingsUrl(window.location.pathname) || isCodeMToolsUrl(window.location.pathname) || isCodeMAutomationsUrl(window.location.pathname) || isHomeUrl(window.location.pathname) || applicationFromPath(window.location.pathname) || isAdminUrl(window.location.pathname) || isMarketplaceUrl(window.location.pathname) || isSettingsUrl(window.location.pathname) || conversationIdFromUrl(window.location.pathname, window.location.search) !== 'project-report' || window.location.hash !== '#report') return;
      dispatchArtifactTabs({ type: 'open', id: 'report' });
      setMobilePane('preview');
    };
    window.addEventListener('popstate', restoreLocation);
    window.addEventListener('hashchange', openLinkedReport);
    return () => {
      window.removeEventListener('popstate', restoreLocation);
      window.removeEventListener('hashchange', openLinkedReport);
    };
  }, [resetConversationView, closeReportPopovers, reportReady, reportState.theme]);
  useEffect(() => { const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setNavOpen(false); setHistoryMenu(false); setComposerMenu(null); closeReportPopovers(); } }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [closeReportPopovers]);
  const confirmation = settingsExecutionControl?.confirmation;
  const confirmingConversation = useRef<string | null>(null);
  useEffect(() => {
    if (confirmation) { setComposerMenu(null); confirmingConversation.current = conversationId; }
    else {
      if (confirmingConversation.current !== null && confirmingConversation.current === conversationId) (richInput.current ?? textarea.current)?.focus({ preventScroll: true });
      confirmingConversation.current = null;
    }
  }, [Boolean(confirmation), conversationId]);
  const sendButton = settingsExecutionControl
    ? <button className="send-button stop-button" type="button" aria-label="停止生成" title="停止生成" onClick={settingsExecutionControl.stop}><img src="/assets/figma/work-item-agent-panel/stop-generating.svg" width="34" height="34" alt="" /></button>
    : <button className="send-button" data-editable={composerEditable} type="submit" aria-label={composerEditable ? '发送消息' : '发送消息（已禁用）'} title={composerEditable ? '发送消息' : '发送消息已禁用'} disabled={!composerEditable || !reportDraft.prompt.trim()}><NewChatIcon name="send" size={15.076} /></button>;
  const composer = <div className="composer-wrap">
    {!newChat && <div className="conversation-template-toolbar">
      <button type="button" className="conversation-save-template" aria-disabled="true">
        <img src="/assets/figma/new-chat-composer/templates.svg" width="16" height="16" alt="" draggable="false" />
        <span>Save as template</span>
      </button>
    </div>}
    {confirmation ? <SettingsConfirmationCard key={settingsExecutionControl.key} {...confirmation} /> : <form className="composer" onSubmit={event => { event.preventDefault(); sendReportPrompt(); }}>
          {attachments.length > 0 && <div className="attachments">{attachments.map((name, i) => <span key={`${name}-${i}`}><Icon name="composer/imgIconAttachmentOutlined" size={14} /><span>{name}</span><IconButton name="preview/imgIconCloseSmallOutlined" label={`移除附件 ${name}`} size={12} onClick={() => setAttachments(v => v.filter((_, j) => i !== j))} /></span>)}</div>}
          {composerEditable && reportDraft.segments ? <RichPromptEditor segments={reportDraft.segments} inputRef={richInput}
            placeholder="What can I help you today?"
            onChange={segments => setReportDraft(draft => ({ ...draft, prompt: promptText(segments), segments }))} onSubmit={sendReportPrompt} /> : <textarea ref={textarea} aria-label={composerEditable ? '消息输入框' : '消息输入框（仅预览）'} placeholder="What can I help you today?" value={composerEditable ? reportDraft.prompt : ''} readOnly={!composerEditable} rows={2}
            onChange={event => setReportDraft(draft => ({ ...draft, prompt: event.target.value }))}
            onKeyDown={event => {
              if (composerEditable && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }} />}
          <NewChatToolbar key={newChat ? newConversationVersion : conversationId} initialEnvironment={newChat ? draftEnvironment : conversation?.environment} onEnvironmentChange={next => {
            if (conversationId) setConversationEnvironment(conversationId, next);
            else setDraftEnvironment(next);
          }} onAttach={() => fileInput.current?.click()} onMention={() => setComposerMenu('mention')} onSkill={() => setComposerMenu('skill')} onMenuOpen={() => setComposerMenu(null)} notify={notify}>{sendButton}</NewChatToolbar>
          {composerMenu && <div className="popover composer-popover"><strong>{composerMenu === 'mention' ? '引用项目' : '选择技能'}</strong>{(composerMenu === 'mention' ? ['Agile Development', '2026 OKR 需求', 'W26 OKR 需求'] : ['项目进展总结', '交付风险分析', '本周工作计划']).map(label => <button type="button" key={label} onClick={() => { setComposerMenu(null); (richInput.current ?? textarea.current)?.focus(); }}>{label}</button>)}</div>}
          <input ref={fileInput} className="visually-hidden" type="file" multiple tabIndex={-1} aria-label="选择附件文件" onChange={e => { setAttachments(v => [...v, ...Array.from(e.target.files || []).map(f => f.name)]); e.target.value = ''; }} />
        </form>}</div>;
  const navigationDraft = newChat && workItemChatSource ? { source: workItemChatSource, title: reportDraft.prompt } : undefined;
  if (admin) return <><AdminPage onExit={() => navigateSidebar('CodeM')} notify={notify} />{toast && <div className="toast" role="status">{toast}</div>}</>;
  return <div className={`app-shell ${home ? 'is-home' : ''} ${marketplace ? 'is-marketplace' : ''} ${workItems ? 'is-work-items' : ''} ${settings ? 'is-settings' : ''} ${collapsed ? 'nav-collapsed' : ''} ${previewOpen ? '' : 'preview-closed'} mobile-${mobilePane}`}>
    <Sidebar collapsed={collapsed} open={navOpen} toggle={toggleNav} close={() => setNavOpen(false)} notify={notify} active={activeNavigation} onNavigate={navigateSidebar} onOpenAdmin={() => navigateSidebar('Admin')} onNewConversation={startNewChat} onBackToMeegle={backToMeegle} selectedConversation={codeMSettings || codeMTools || codeMAutomations ? null : conversationId}
      workItemDraft={navigationDraft} onOpenConversation={selectConversation} />
    <div className="mobile-topbar"><IconButton name="sidebar/img24X24" label="打开导航" onClick={toggleNav} />{home ? <span>Home</span> : workItems ? <span className="work-items-mobile-title">{activeApplication?.label}</span> : marketplace ? <span className="marketplace-mobile-title">Marketplace</span> : codeMAutomations ? <span>Automations</span> : codeMTools ? <span>Tools</span> : settings || codeMSettings ? <span className="settings-mobile-title">Settings</span> : null}<IconButton name="header/img24X24" label="新建对话" size={16} onClick={startNewChat} /></div>
    {home ? <HomePage onNavigate={navigateSidebar} onSend={(prompt, environment) => {
      const created = createHomeConversation(prompt, environment);
      if (created) { selectConversation(created); focusPrefilledPrompt.current = true; }
    }} onStartChat={prompt => {
      startNewChat(); setReportDraft({ prompt, theme: initialReportState.theme }); focusPrefilledPrompt.current = true;
    }} notify={notify} /> : codeMAutomations ? <CodeMAutomations notify={notify} onOpenConversation={selectConversation} onToggleNavigation={toggleNav} /> : codeMTools ? <CodeMTools notify={notify} onToggleNavigation={toggleNav} /> : codeMSettings ? <CodeMSettings notify={notify} onToggleNavigation={toggleNav} /> : settings ? <SettingsPage notify={notify} onOpenConversation={selectConversation} /> : activeApplication ? <WorkItemsPage key={activeApplication.id} application={activeApplication} onContinueInChat={startWorkItemChat} onOpenConversation={selectConversation} /> : marketplace ? <Marketplace onChooseSkill={startSkillChat} /> : <main className="workspace">
      <section className={`chat-panel ${newChat ? 'is-new-conversation' : ''}`} aria-label="CodeM 对话">
        <header className="chat-header">
          <IconButton className="desktop-nav-toggle" name="sidebar/img24X24" label="打开导航" onClick={toggleNav} size={16} />
          {!newChat && <>
            <div className="conversation-header-title">
              <button type="button" id="history-trigger" className="conversation-header-workspace" aria-label="对话历史" title={conversationWorkspace} onClick={() => setHistoryMenu(!historyMenu)} aria-haspopup="menu" aria-controls={historyMenu ? 'conversation-history-menu' : undefined} aria-expanded={historyMenu}>
                <span className="conversation-header-workspace-icon"><Icon name="conversation-header/folder" size={16} /></span><span className="conversation-header-workspace-name">{conversationWorkspace}</span>
              </button>
              <span className="conversation-header-separator" aria-hidden="true">/</span>
              <img className="conversation-header-avatar" src="/assets/figma/codem-navigation/codem-cyan.png" width="16" height="16" alt="" />
              <h1 title={conversation?.title}>{conversationDisplayTitle(conversation?.title ?? '')}</h1>
            </div>
            <div className="conversation-header-actions" role="group" aria-label="会话工具">
              <IconButton name="conversation-header/browser" label="浏览器" size={20} onClick={() => notify('暂未接入')} />
              <IconButton name="conversation-header/files" label="文件" size={20} onClick={() => notify('暂未接入')} />
              <IconButton name="conversation-header/subagent" label="子智能体" size={20} onClick={() => notify('暂未接入')} />
              <IconButton name="conversation-header/terminal" label="终端" size={20} onClick={() => notify('暂未接入')} />
              <IconButton name="conversation-header/panel" label={previewOpen ? '收起产物预览' : '打开产物预览'} size={20} aria-expanded={previewOpen} onClick={() => {
                if (previewOpen) {
                  dispatchArtifactTabs({ type: 'close-all' });
                  artifactScrollPositions.current = {};
                  closeReportPopovers();
                  setMobilePane('chat');
                } else if (conversationId === 'project-report' || conversation?.settings || settingsReview) showPreview();
                else notify('暂未接入');
              }} />
            </div>
          </>}
          {historyMenu && <ConversationHistoryMenu selected={conversationId} onSelect={selectConversation} onClose={closeHistoryMenu} />}
        </header>
        {newChat ? <NewConversation key={newConversationVersion} composer={composer} composerEmpty={!reportDraft.prompt.trim()} environment={draftEnvironment} scrollRef={scrollArea} mode={conversationMode} onModeChange={changeConversationMode} onChoose={chooseReportPrompt} onOpenConversation={selectConversation} notify={notify} draft={navigationDraft} /> : <div className={`chat-scroll${conversationId !== 'project-report' ? ' conversation-scroll' : ''}`} ref={scrollArea}>
          {conversationId === 'project-report' && <ChatHistory openReport={openReport} openMarkdown={openMarkdown} openFramework={openFramework} onDownloadReport={() => { void handleDownloadWebpage(); }} onDownloadMarkdown={handleDownloadMarkdown} notify={notify} />}
          {!newChat && conversationId !== 'project-report' && conversation && <article className="history sample-conversation">
            <SentMessage text={developmentChat?.prompt ?? conversation.title} workItem={conversation.workItem ?? conversation.view} />
            <AssistantMessage prompt={developmentChat?.prompt ?? conversation.title} developmentReply={developmentChat?.reply} workItem={conversation.workItem} settings={conversation.settings} summary={conversation.summary} executionId={conversation.settings ? settingsExecutionKey(conversation.id) : undefined} onReviewChanges={openSettingsReview} />
            {workItemMessages.map((message, index) => <Fragment key={index}>
              <SentMessage text={message} workItem={conversation.workItem ?? conversation.view} />
              <AssistantMessage prompt={message} workItem={conversation.workItem} settings={conversation.settings} summary={conversation.view ? conversation.summary : conversation.home ? '已记录你的补充要求，会保留在当前会话中。你可以继续补充目标、约束或需要调整的内容。' : undefined} developmentReply={developmentChat ? createDevelopmentFollowupReply(developmentChat, conversation.title, message, workItemMessages.slice(0, index)) : undefined} previousPrompts={[developmentChat?.prompt ?? conversation.title, ...workItemMessages.slice(0, index)]} executionId={conversation.settings ? settingsExecutionKey(conversation.id, index + 1) : undefined} onReviewChanges={openSettingsReview} />
            </Fragment>)}
          </article>}
        </div>}
        {!newChat && composer}
      </section>
      {previewOpen && <section className="preview-panel" aria-label="产物预览窗口">
        <header className="preview-header" role="tablist" aria-label="已打开的产物">
          {artifactTabs.items.map(id => {
            const selected = artifactTabs.active === id;
            const title = id === 'settings-review' ? 'review 变更' : id === 'framework' ? '报告框架' : id === 'markdown' ? `${reportTitle}.md` : reportTitle;
            return <div key={id} className={`artifact-tab ${selected ? 'active' : 'inactive'}`}>
              <button
                type="button"
                id={`artifact-tab-${id}`}
                className={`artifact-tab-select ${id === 'settings-review' ? 'settings-review-tab' : id === 'framework' ? 'framework-tab' : ''}`}
                role="tab"
                aria-selected={selected}
                aria-controls={`artifact-panel-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => { dispatchArtifactTabs({ type: 'select', id }); closeReportPopovers(); }}
                onKeyDown={e => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                  e.preventDefault();
                  const index = artifactTabs.items.indexOf(id);
                  const length = artifactTabs.items.length;
                  const next = e.key === 'Home' ? 0 : e.key === 'End' ? length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + length) % length;
                  const nextId = artifactTabs.items[next];
                  dispatchArtifactTabs({ type: 'select', id: nextId });
                  closeReportPopovers();
                  document.getElementById(`artifact-tab-${nextId}`)?.focus();
                }}
              >
                {id === 'settings-review' ? <img className="icon" src="/assets/figma/settings-review/tab-icon.svg" width="20" height="20" alt="" /> : <Icon name={id === 'framework' ? 'chat/img24X26' : id === 'markdown' ? 'chat/artifactReportMarkdown' : 'preview/imgIconFileCodeV2Colorful'} size={20} />}
                <span>{title}</span>
              </button>
              <IconButton name="preview/imgIconCloseSmallOutlined" label={`关闭${title}标签页`} size={16} onClick={() => closeArtifact(id)} />
            </div>;
          })}
        </header>
        {artifactTabs.active === 'report' && <div className={`preview-toolbar ${reportState.mode === 'slides' ? 'is-presenting' : ''}`}>
          <div className="segmented-control" role="tablist" aria-label="报告展示模式">
            {(['reading', 'slides'] as const).map(mode => <button key={mode} type="button"
              id={`report-mode-${mode}`} role="tab" aria-controls="report-content"
              aria-selected={reportState.mode === mode} tabIndex={reportState.mode === mode ? 0 : -1}
              className={reportState.mode === mode ? 'selected' : ''} disabled={!reportReady}
              onClick={() => selectReportMode(mode)}
              onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const nextMode = event.key === 'Home' ? 'reading' : event.key === 'End' ? 'slides' : mode === 'reading' ? 'slides' : 'reading';
                selectReportMode(nextMode);
                document.getElementById(`report-mode-${nextMode}`)?.focus();
              }}>{mode === 'reading' ? '报告' : '演示'}</button>)}
          </div>
          <div className="preview-toolbar-actions">
            <IconButton id="report-theme-trigger" className="report-theme-trigger" name="toolbar/imgIconAiStyleOutlined" label={`切换主题，当前：${themeLabel}`} size={16} disabled={!reportReady} aria-haspopup="dialog" aria-controls={themeMenu ? 'report-theme-panel' : undefined} aria-expanded={themeMenu} onClick={() => { setMoreMenu(false); setThemeMenu(value => !value); }} />
            <IconButton id="report-actions-trigger" className="report-actions-trigger" name="toolbar/img24X24" label="更多产物操作" size={16} aria-haspopup="menu" aria-controls={moreMenu ? 'report-actions-menu' : undefined} aria-expanded={moreMenu} onClick={() => { setThemeMenu(false); setMoreMenu(value => !value); }} />
          </div>
          {themeMenu && <ReportThemePanel selected={reportState.theme} onSelect={selectReportTheme} onClose={closeThemeMenu} />}
          {moreMenu && <ReportActionsMenu
            imageExporting={imageExporting}
            linkAccess={linkAccess}
            onDownloadImage={() => { void handleDownloadImage(); }}
            onDownloadWebpage={() => { void handleDownloadWebpage(); }}
            onCopyLink={() => { void copyReportLink(); }}
            onToggleLinkAccess={() => { setLinkAccess(value => !value); notify('开关状态已更新（本地演示，未发布报告）'); }}
            onClose={closeReportMenu}
          />}
        </div>}
        {artifactTabs.items.includes('report') && <ReportPreview active={artifactTabs.active === 'report'} mode={reportState.mode} frameRef={reportFrame} initialTheme={reportLaunchTheme} onInteract={closeReportPopovers} onStateChange={setReportState} onReadyChange={handleReportReadyChange} />}
        {artifactTabs.items.includes('settings-review') && settingsReview && <SettingsReviewPreview key={JSON.stringify([settingsReview.executionId, settingsReview.path ?? null])} review={settingsReview} active={artifactTabs.active === 'settings-review'} />}
        {artifactTabs.active === 'markdown' && <div
          ref={previewScroll}
          className="preview-content markdown-preview"
          id="artifact-panel-markdown"
          role="tabpanel"
          aria-labelledby="artifact-tab-markdown"
          onScroll={e => { artifactScrollPositions.current.markdown = e.currentTarget.scrollTop; }}
        ><pre>{reportMarkdown()}</pre></div>}
        {artifactTabs.active === 'framework' && <div
          ref={previewScroll}
          className="preview-content framework-content"
          id="artifact-panel-framework"
          role="tabpanel"
          aria-labelledby="artifact-tab-framework"
          onScroll={e => { artifactScrollPositions.current.framework = e.currentTarget.scrollTop; }}
        >
          <FrameworkDocument />
        </div>}
      </section>}
    </main>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

redirectRootToHome();
createRoot(document.getElementById('root')!).render(<App />);
