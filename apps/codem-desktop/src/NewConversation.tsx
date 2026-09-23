import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import assets from './assets.json';
import deepReportContent from './deep-report-content.json';
import lightAppContent from './light-app-content.json';
import conversationTemplateContent from './conversation-template-content.json';
import { getSuggestedQueries, type SuggestionContext } from './new-chat-suggestions';
import { createTemplatePrompt, type ReportPrompt } from './report-prompts';
import { initialReportState } from './report-controls';
import { CodeMLogo } from './CodeMLogo';
import type { Conversation, ConversationEnvironment } from './conversation-history';
import { codemNavigationDirectories } from './codem-navigation-data';
import { useCodeMSourceGroups, type CodeMNavigationDraft, type SourceEntry } from './codem-source-groups';
import { createTemplateDiscoveryMotion } from './template-discovery-motion';
import { getRecentWorkspaceIds, rememberWorkspaceVisit, subscribeConversationHistory } from './work-item-chat';

const { categories: deepReportCategories, templates: deepReportTemplates } = deepReportContent;

const discoveryAssets = '/assets/figma/template-discovery/';
const suggestionAssets = '/assets/figma/new-chat-suggestions/';
const codeMSpaces = [
  { id: 'meego', name: 'Meego' },
  { id: 'lark-office', name: 'Lark Office' },
  { id: 'aily', name: 'Aily' },
];
type WorkspaceEntry = SourceEntry & { icon: string; status?: 'running' | 'alert' | 'complete' };
type RecentWorkspace = SuggestionContext & { icon: string; color?: string; entries: WorkspaceEntry[] };
const navigationWorkspaces: RecentWorkspace[] = codemNavigationDirectories.map(directory => ({
  id: directory.id, name: directory.name, kind: 'folder', icon: '/assets/figma/new-chat-recent/folder.svg',
  entries: directory.conversations.map(conversation => ({ ...conversation, conversation })),
}));
const shortcuts: { label: string; mode: Exclude<NewConversationMode, 'default'> }[] = [
  { label: '项目问答', mode: 'project-qa' },
  { label: '深度报告', mode: 'deep-report' },
  { label: '项目开发', mode: 'project-development' },
  { label: '空间配置', mode: 'space-config' },
  { label: '轻应用搭建', mode: 'light-app' },
];
const { categories, spaceCategories, spaceTemplates } = conversationTemplateContent;
const templates = [
  ...conversationTemplateContent.templates,
  ...spaceTemplates.map(template => ({ ...template, category: '空间配置' })),
];

export type NewConversationMode = 'default' | 'project-qa' | 'deep-report' | 'project-development' | 'space-config' | 'light-app';
type ContentProps = { mode: NewConversationMode; onModeChange: (mode: NewConversationMode) => void; onChoose: (selection: ReportPrompt) => void };
type ConversationTemplate = { title: string; category: string; cover: string; description: string; prompt?: string; cornerRadius?: number; method?: string; theme?: string };

export function NewConversation({ composer, composerEmpty, environment, scrollRef, mode, onModeChange, onChoose, onOpenConversation, notify, draft }: ContentProps & { composer: ReactNode; composerEmpty: boolean; environment?: ConversationEnvironment; scrollRef?: RefObject<HTMLDivElement | null>; onOpenConversation: (conversation: Conversation) => void; notify: (message: string) => void; draft?: CodeMNavigationDraft }) {
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [workspaceId, setWorkspaceId] = useState(() => new URLSearchParams(window.location.search).get('workspace'));
  const [showAllChats, setShowAllChats] = useState(false);
  const [recentWorkspaceIds, setRecentWorkspaceIds] = useState(getRecentWorkspaceIds);
  const sourceGroups = useCodeMSourceGroups(null, draft);
  const workspaces = useMemo<RecentWorkspace[]>(() => [...navigationWorkspaces, ...sourceGroups.map(({ source, entries }) => ({
    id: `source:${source.href}`, name: source.title, kind: 'source' as const, icon: source.icon, color: source.color,
    entries: entries.map(entry => ({ ...entry, icon: 'codem-cyan.png' })),
  }))], [sourceGroups]);
  const recentWorkspaces = useMemo(() => {
    const rank = new Map(recentWorkspaceIds.map((id, index) => [id, index]));
    const priority = (item: RecentWorkspace) => item.entries.some(entry => !entry.conversation) ? -1 : rank.get(item.id) ?? Infinity;
    return [...workspaces].sort((left, right) => priority(left) - priority(right)).slice(0, 6);
  }, [workspaces, recentWorkspaceIds]);
  const workspace = workspaces.find(item => item.id === workspaceId);
  const queryContext: SuggestionContext | undefined = environment?.device && environment.project
    ? { id: `device:${JSON.stringify([environment.device, environment.project])}`, name: environment.project, kind: 'folder', device: environment.device }
    : workspace;
  const suggestedQueries = getSuggestedQueries(queryContext);
  const suggestionContext = queryContext?.id ?? 'default';
  const showSuggestions = !suggestionsDismissed || composerEmpty;
  const workspaceChats = workspace?.entries ?? [];
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const workspaceBack = useRef<HTMLButtonElement>(null);
  const returnWorkspaceId = useRef<string | null>(null);
  const returnWorkspaceCard = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const templatesButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const templateSurface = useRef<HTMLDivElement>(null);
  const templateBody = useRef<HTMLDivElement>(null);
  const landing = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const suggestionsActivated = useRef(false);
  const templateMotion = useRef<ReturnType<typeof createTemplateDiscoveryMotion> | null>(null);
  const closingTemplates = useRef(false);
  const afterTemplatesClose = useRef<(() => void) | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const previousMode = useRef(mode);
  const activateComposer = () => {
    if (suggestionsActivated.current) return;
    suggestionsActivated.current = true;
    if (templatesOpen) return;
    dock.current?.querySelector<HTMLElement>('.composer textarea:not([readonly]), .composer [contenteditable="true"]')?.focus({ preventScroll: true });
  };
  const closeTemplates = (afterClose = () => templatesButton.current?.focus({ preventScroll: true })) => {
    if (closingTemplates.current) return;
    closingTemplates.current = true;
    afterTemplatesClose.current = afterClose;
    if (templateMotion.current) templateMotion.current.exit();
    else {
      dialog.current?.close();
      setTemplatesOpen(false);
      closingTemplates.current = false;
      afterTemplatesClose.current = null;
      afterClose();
    }
  };
  const choosePrompt = (selection: ReportPrompt) => {
    setSuggestionsDismissed(true);
    onChoose(selection);
  };

  const openWorkspace = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('workspace', id);
    else {
      url.searchParams.delete('workspace');
      returnWorkspaceId.current = workspaceId;
    }
    if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
    setWorkspaceId(id);
    setShowAllChats(false);
    const scroll = (scrollRef ?? landing).current;
    if (scroll) scroll.scrollTop = 0;
  };

  useEffect(() => {
    const update = () => setRecentWorkspaceIds(getRecentWorkspaceIds());
    const unsubscribe = subscribeConversationHistory(update);
    update();
    return unsubscribe;
  }, []);

  useLayoutEffect(() => {
    if (workspace) {
      rememberWorkspaceVisit(workspace.id);
      setRecentWorkspaceIds(getRecentWorkspaceIds());
      workspaceHeading.current?.focus({ preventScroll: true });
    }
    else if (returnWorkspaceId.current) {
      returnWorkspaceCard.current?.focus({ preventScroll: true });
      returnWorkspaceCard.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [workspace?.id]);

  useLayoutEffect(() => {
    suggestionsActivated.current = false;
    // Reduced motion skips the entrance animation, so activate when the page appears.
    if (showSuggestions && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) activateComposer();
  }, [suggestionContext, showSuggestions]);

  useLayoutEffect(() => {
    if (composerEmpty) setSuggestionsDismissed(false);
  }, [composerEmpty]);

  useLayoutEffect(() => {
    if (!templatesOpen || !dialog.current) return;
    const panel = dialog.current;
    // show() keeps the dialog inside the chat panel and leaves sidebar navigation usable.
    if (!panel.open) panel.show();
    const background = [(scrollRef ?? landing).current, dock.current, workspaceBack.current, panel.closest('.chat-panel')?.querySelector<HTMLElement>('.chat-header')]
      .filter((element): element is HTMLElement => Boolean(element))
      .map(element => ({ element, inert: element.inert }));
    background.forEach(({ element }) => { element.inert = true; });
    const releaseBackground = () => background.forEach(({ element, inert }) => { element.inert = inert; });
    closeButton.current?.focus({ preventScroll: true });
    const motion = createTemplateDiscoveryMotion(templateSurface.current, templateBody.current, () => {
      releaseBackground();
      panel.close();
      setTemplatesOpen(false);
      closingTemplates.current = false;
      const afterClose = afterTemplatesClose.current;
      afterTemplatesClose.current = null;
      afterClose?.();
    });
    templateMotion.current = motion;
    return () => {
      motion.dispose();
      templateMotion.current = null;
      closingTemplates.current = false;
      afterTemplatesClose.current = null;
      releaseBackground();
      panel.close();
    };
  }, [templatesOpen]);

  useLayoutEffect(() => {
    const changed = previousMode.current !== mode;
    previousMode.current = mode;
    if (!changed || !templatesOpen) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const library = content.current?.querySelector<HTMLElement>('.template-library');
    if (preference.matches || !library?.animate) return;
    const animation = library.animate([
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 200, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' });
    const reduceMotion = () => { if (preference.matches) animation.cancel(); };
    preference.addEventListener('change', reduceMotion);
    return () => { animation.cancel(); preference.removeEventListener('change', reduceMotion); };
  }, [mode, templatesOpen]);

  return <div className={`new-conversation${mode === 'default' ? '' : ` is-${mode}`}${workspace ? ' is-workspace' : ''}`}>
    {workspace && <button ref={workspaceBack} type="button" className="workspace-list-back" aria-label="返回工作目录" onClick={() => openWorkspace(null)}>
      <img src="/assets/figma/codem-navigation/back.svg" width="12" height="12" alt="" draggable="false" /><span>返回</span>
    </button>}
    <div className="new-conversation-scroll" ref={scrollRef ?? landing}>
      <div className="new-conversation-main">
        <div className="new-conversation-heading">
          {workspace ? <h2 ref={workspaceHeading} tabIndex={-1}>你想在 {workspace.name} 中构建什么？</h2>
            : <h2><CodeMLogo size={36} /><span>今天想构建什么，DC</span></h2>}
        </div>
        {workspace ? <section className="workspace-recent-chats" aria-labelledby="workspace-recent-chats-heading">
          <h3 id="workspace-recent-chats-heading">Recent chat</h3>
          {workspaceChats.length ? <>
            <ul className="workspace-chat-list" id="workspace-chat-list">
              {workspaceChats.slice(0, showAllChats ? undefined : 5).map(chat => <li key={chat.id}>
                <button type="button" className="workspace-chat-row" title={chat.title} data-conversation-id={chat.id} onClick={() => { if (chat.conversation) onOpenConversation(chat.conversation); }}>
                  <img src={`/assets/figma/codem-navigation/${chat.icon}`} width="16" height="16" alt="" draggable="false" />
                  <span className="workspace-chat-title">{chat.title}</span>
                  {!chat.conversation && <span className="workspace-chat-draft">草稿</span>}
                  {chat.status && <img className="workspace-chat-status" src={`/assets/figma/codem-navigation/${chat.status}.svg`} width={chat.status === 'running' ? 18 : 16} height={chat.status === 'running' ? 18 : 16} alt={{ running: '进行中', alert: '需要关注', complete: '已完成' }[chat.status]} />}
                </button>
              </li>)}
            </ul>
            {workspaceChats.length > 5 && <button type="button" className="workspace-chat-more" aria-expanded={showAllChats} aria-controls="workspace-chat-list" onClick={() => setShowAllChats(value => !value)}>{showAllChats ? '收起' : '展开更多'}</button>}
          </> : <p className="workspace-chat-empty">暂无会话</p>}
        </section> : <>
        <section className="new-conversation-spaces" aria-labelledby="new-conversation-spaces-heading" hidden>
          <div className="new-conversation-spaces-header">
            <h3 id="new-conversation-spaces-heading">CodeM 空间</h3>
            <button type="button" className="new-conversation-spaces-all" aria-label="查看全部 CodeM 空间" onClick={() => notify('暂未接入')}>查看全部</button>
          </div>
          <ul className="new-conversation-recent-grid">
            {codeMSpaces.map(({ id, name }) => <li key={id}>
              <button type="button" className="new-conversation-recent-card new-conversation-space-card" aria-label={`打开 ${name} 空间`} onClick={() => notify('暂未接入')}>
                <img src={`/assets/figma/new-chat-spaces/${id}.svg`} width="28" height="28" alt="" draggable="false" />
                <span className="new-conversation-recent-name" title={name}>{name}</span>
              </button>
            </li>)}
          </ul>
        </section>
        <section className="new-conversation-recent" aria-labelledby="new-conversation-recent-heading">
          <h3 id="new-conversation-recent-heading">Recent</h3>
          <ul className="new-conversation-recent-grid">
            {recentWorkspaces.map(({ id, name, icon, color, entries }) => <li key={id}>
              <button ref={id === returnWorkspaceId.current ? returnWorkspaceCard : undefined} type="button" className="new-conversation-recent-card" data-workspace-id={id} title={name} onClick={() => openWorkspace(id)}>
                {color ? <span className="new-conversation-recent-source-icon" style={{ background: color }}>
                  <img src={icon} width="14" height="14" alt="" draggable="false" />
                </span> : <img src={icon} width="24" height="24" alt="" draggable="false" />}
                <span className="new-conversation-recent-name" title={name}>{name}</span>
                <span className="new-conversation-recent-meta"><span>{entries.filter(entry => entry.conversation).length} 个会话</span>{entries.some(entry => !entry.conversation) && <span>· 1 个草稿</span>}</span>
              </button>
            </li>)}
          </ul>
        </section>
        </>}
      </div>
    </div>
    <div className="new-conversation-dock" ref={dock}>
      <div className="new-conversation-input">
        {showSuggestions && <section key={suggestionContext} className="new-conversation-suggestions" aria-label="建议" onAnimationStart={event => {
          if (event.target === event.currentTarget && event.animationName === 'new-conversation-suggestions-in') activateComposer();
        }}>
          <h3 className="new-conversation-suggestions-title">Try ask</h3>
          {suggestedQueries.map(suggestion => <button type="button" key={suggestion.id} className="new-conversation-suggestion" title={suggestion.query}
            onClick={() => choosePrompt({ prompt: suggestion.prompt, theme: initialReportState.theme })}>
            <img src={suggestion.icon} width="16" height="16" alt="" draggable="false" />
            <span>{suggestion.query}</span>
          </button>)}
          <button ref={templatesButton} type="button" className="new-conversation-more-templates" aria-label="查看模板" aria-haspopup="dialog" aria-expanded={templatesOpen} aria-controls="new-conversation-templates" onClick={() => setTemplatesOpen(true)}>
            <img src={`${suggestionAssets}templates.svg`} width="16" height="16" alt="" draggable="false" />
            <span>more templates</span>
            <img src={`${suggestionAssets}chevron-right.svg`} width="16" height="16" alt="" draggable="false" />
          </button>
        </section>}
        {composer}
      </div>
    </div>
    <dialog ref={dialog} id="new-conversation-templates" className={`template-discovery is-${mode}`} aria-modal="false" aria-labelledby="template-discovery-title"
      onCancel={event => { event.preventDefault(); closeTemplates(); }}
      onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); closeTemplates(); } }}>
      <div className="template-discovery-surface" ref={templateSurface} aria-hidden="true" />
      <div className="template-discovery-body" ref={templateBody}>
        <button ref={closeButton} type="button" className="template-discovery-close" aria-label="关闭模板" onClick={() => closeTemplates()} autoFocus><img src={`${discoveryAssets}close.svg`} width="24" height="24" alt="" /></button>
        <div className="template-discovery-scroll">
          <div className="template-discovery-main">
            <header className="template-discovery-heading"><img src={`${discoveryAssets}logo.png`} width={32.485} height="32" alt="" /><h2 id="template-discovery-title">Discover CodeM Templates</h2></header>
            <div className="new-conversation-content" ref={content}>
              <NewConversationContent mode={mode} onModeChange={onModeChange} onChoose={selection => closeTemplates(() => choosePrompt(selection))} />
            </div>
          </div>
        </div>
      </div>
    </dialog>
  </div>;
}

function NewConversationContent({ mode, onModeChange, onChoose }: ContentProps) {
  const deepReport = mode === 'deep-report';
  const lightApp = mode === 'light-app';
  const [categorySelection, setCategorySelection] = useState({ mode, value: '最佳实践' });
  const category = categorySelection.mode === mode ? categorySelection.value : '最佳实践';
  const setCategory = (value: string) => setCategorySelection({ mode, value });
  const activeCategories = lightApp ? lightAppContent.categories : deepReport ? deepReportCategories
    : mode === 'space-config' ? spaceCategories
      : mode === 'project-development' ? ['最佳实践', '项目开发', '我的模板'] : categories;
  const availableTemplates: ConversationTemplate[] = lightApp
    ? lightAppContent.templates.map(template => ({ ...template, description: '', cover: `/assets/figma/light-app/${template.coverId ?? template.id}.png` }))
    : deepReport
      ? deepReportTemplates.map(template => ({ ...template, cover: `/assets/report-templates/${template.id}.png` }))
      : (mode === 'space-config' ? spaceTemplates : mode === 'project-development' ? templates.filter(template => template.category === '项目开发') : templates)
        .map(template => ({ ...template, cover: assets[`new-chat-templates/imgTemplate${template.thumbnail}` as keyof typeof assets] }));
  const shown = category === '最佳实践' ? availableTemplates : availableTemplates.filter(template => template.category === category);

  return <>
    <div className="new-conversation-shortcuts" role="group" aria-label="模板类型筛选">
      {shortcuts.map(shortcut => <button type="button" key={shortcut.label} aria-pressed={mode === shortcut.mode} aria-controls="template-library" onClick={() => {
        setCategorySelection({ mode: mode === shortcut.mode ? 'default' : shortcut.mode, value: '最佳实践' });
        onModeChange(mode === shortcut.mode ? 'default' : shortcut.mode);
      }}>
        <img src={`${discoveryAssets}${shortcut.mode}.svg`} width="16" height="16" alt="" />{shortcut.label}
      </button>)}
    </div>
    <section id="template-library" className="template-library" aria-label="模板库">
      <div className="template-categories" role="tablist" aria-label="模板分类">
        {activeCategories.map((label, index) => <button type="button" role="tab" key={label} id={`template-category-${index}`} aria-controls="template-grid" aria-selected={category === label} tabIndex={category === label ? 0 : -1}
          onClick={() => setCategory(label)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? activeCategories.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + activeCategories.length) % activeCategories.length;
            setCategory(activeCategories[next]);
            document.getElementById(`template-category-${next}`)?.focus();
          }}>
          {!lightApp && label === '我的模板' && <img src={assets['new-chat-categories/imgIconTemplateOutlined']} width="16" height="16" alt="" />}{label}
        </button>)}
      </div>
      <div id="template-grid" className="template-grid" role="tabpanel" aria-labelledby={`template-category-${activeCategories.indexOf(category)}`}>
        {shown.map((template, index) => <button type="button" className={`template-card${lightApp ? ' light-app-card' : ''}`} style={lightApp ? { borderRadius: template.cornerRadius } : undefined} key={`${template.title}-${index}`}
          onClick={() => onChoose(template.prompt ? { prompt: template.prompt, theme: initialReportState.theme } : createTemplatePrompt(template))}>
          <img className="template-thumbnail" src={template.cover} width={lightApp ? 283 : 216} height={lightApp ? 146 : 100} alt="" loading="lazy" />
          <div className="template-card-text"><h3>{template.title}</h3>{template.description && <p>{template.description}</p>}</div>
        </button>)}
        {!shown.length && <p className="template-empty">{category === '我的模板' ? '暂无已保存的模板' : '暂无此分类模板'}</p>}
      </div>
    </section>
  </>;
}
