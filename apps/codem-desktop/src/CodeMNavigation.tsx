import { useState, type RefObject } from 'react';
import assets from './assets.json';
import type { Conversation } from './conversation-history';
import { CodeMSourceNavigation, type CodeMNavigationDraft } from './CodeMSourceNavigation';
import { CodeMConversationNavigation } from './CodeMConversationNavigation';
import { codemNavigationConversations, codemNavigationProjects, codemPinnedProjects } from './codem-navigation-data';
import './codem-navigation.css';

const assetRoot = '/assets/figma/codem-navigation/';
const initialConversationCount = 5;
const actions = [
  { label: 'New', icon: 'new', size: 17.656 },
  { label: 'Tools', icon: 'tools', size: 16.185 },
  { label: 'Automation', icon: 'automation', size: 17.656 },
  { label: 'Settings', icon: 'settings', size: 16.185 },
];

function NavigationIcon({ file, size = 16 }: { file: string; size?: number }) {
  return <img src={`${assetRoot}${file}`} width={size} height={size} alt="" draggable="false" />;
}

export function CodeMNavigation({ backRef, onBack, onExpand, onNew, onSettings, settingsActive = false, onTools, toolsActive = false, onAutomations, automationsActive = false, selectedConversation, draft, active, onOpenConversation, notify }: {
  backRef: RefObject<HTMLButtonElement | null>;
  onBack: () => void; onExpand: () => void; onNew: () => void;
  onSettings: () => void; settingsActive?: boolean;
  onTools: () => void; toolsActive?: boolean;
  onAutomations: () => void; automationsActive?: boolean;
  selectedConversation: string | null;
  draft?: CodeMNavigationDraft; active: boolean; onOpenConversation: (conversation: Conversation) => void;
  notify: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'codem-web': true });
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [sections, setSections] = useState({ pinned: true, projects: true, conversations: true });
  const sectionHeading = (section: keyof typeof sections, label: string) => <h2 id={`codem-${section}-heading`}>
    <button type="button" className="codem-nav-group-toggle" aria-expanded={sections[section]} aria-controls={`codem-${section}-contents`}
      onClick={() => setSections(current => ({ ...current, [section]: !current[section] }))}>
      <span>{label}</span><img src="/assets/figma/settings-diff/chevron-right.svg" width="12" height="12" alt="" />
    </button>
  </h2>;
  const toggleProject = (id: string) => {
    setExpanded(current => ({ ...current, [id]: !current[id] }));
  };
  const conversationRow = (item: typeof codemNavigationConversations[number], nested = false) => <button
    type="button" key={item.id} className={`codem-nav-row codem-conversation-row${nested ? ' is-nested' : ''}`}
    title={item.title} aria-current={selectedConversation === item.id ? 'page' : undefined}
    onClick={() => { if (selectedConversation !== item.id) onOpenConversation(item); }}>
    <span className="codem-nav-glyph"><NavigationIcon file={item.icon} /></span>
    <span className="codem-nav-label">{item.title}</span>
    {item.status && <span className="codem-nav-status" aria-hidden="true"><NavigationIcon file={`${item.status}.svg`} size={item.status === 'running' ? 18 : 16} /></span>}
  </button>;
  const folderRow = (project: { id: string; name: string; conversations?: typeof codemNavigationConversations }) => <div className="codem-nav-project" key={project.id}>
    <button type="button" className="codem-nav-row" title={project.name} aria-expanded={Boolean(expanded[project.id])}
      aria-controls={`codem-project-${project.id}`} onClick={() => toggleProject(project.id)}>
      <span className="codem-nav-glyph"><NavigationIcon file={expanded[project.id] ? 'folder-open.svg' : 'folder.svg'} /></span><span className="codem-nav-label">{project.name}</span>
    </button>
    <div id={`codem-project-${project.id}`} className="codem-nav-project-conversations" hidden={!expanded[project.id]}>
      {project.conversations?.slice(0, initialConversationCount).map(item => conversationRow(item, true))}
      {project.conversations && project.conversations.length > initialConversationCount && <>
        <div id={`codem-project-extra-${project.id}`} className="codem-nav-extra-conversations" hidden={!showAll[project.id]}>
          {project.conversations.slice(initialConversationCount).map(item => conversationRow(item, true))}
        </div>
        <button type="button" className="codem-nav-row codem-nav-more" aria-expanded={Boolean(showAll[project.id])}
          aria-controls={`codem-project-extra-${project.id}`} onClick={() => setShowAll(current => ({ ...current, [project.id]: !current[project.id] }))}>
          {showAll[project.id] ? '收起' : '展开更多'}
        </button>
      </>}
      {!project.conversations?.length && <p className="codem-project-empty">暂无会话</p>}
    </div>
  </div>;

  return <div className="codem-navigation">
    <div className="codem-nav-header">
      <button ref={backRef} type="button" className="codem-nav-back" title="back to Meegle" aria-label="back to Meegle" onClick={onBack}>
        <span><NavigationIcon file="back.svg" size={12} /></span><span className="codem-nav-back-label">back to Meegle</span>
      </button>
      <button type="button" className="codem-nav-expand" title="展开导航" aria-label="展开导航" onClick={onExpand}><img src={assets['sidebar/img24X24']} width="18" height="18" alt="" /></button>
    </div>
    <div className="codem-nav-scroll">
      <nav className="codem-nav-actions" aria-label="CodeM 导航">
        {actions.map(action => <button key={action.label} type="button" className="codem-nav-action" title={action.label} aria-label={action.label} aria-current={(settingsActive && action.label === 'Settings') || (toolsActive && action.label === 'Tools') || (automationsActive && action.label === 'Automation') ? 'page' : undefined}
          onClick={() => {
            if (action.label === 'New') onNew();
            else if (action.label === 'Settings') onSettings();
            else if (action.label === 'Tools') onTools();
            else if (action.label === 'Automation') onAutomations();
            else notify('暂未接入');
          }}>
          <span className="codem-action-glyph"><NavigationIcon file={`${action.icon}.svg`} size={action.size} /></span><span className="codem-nav-label">{action.label}</span>
        </button>)}
      </nav>
      <section className="codem-nav-group" aria-labelledby="codem-pinned-heading">
        {sectionHeading('pinned', '置顶')}
        <div id="codem-pinned-contents" className="codem-nav-group-content" hidden={!sections.pinned}>
          {conversationRow(codemNavigationConversations[0])}
          {codemPinnedProjects.map(folderRow)}
        </div>
      </section>
      <section className="codem-nav-group codem-nav-projects" aria-labelledby="codem-projects-heading">
        {sectionHeading('projects', '项目')}
        <div id="codem-projects-contents" className="codem-nav-group-content" hidden={!sections.projects}>
          {codemNavigationProjects.map(folderRow)}
          <CodeMSourceNavigation selected={selectedConversation} draft={draft} active={active && sections.projects} onOpenConversation={onOpenConversation} />
        </div>
      </section>
      <section className="codem-nav-group" aria-labelledby="codem-conversations-heading">
        {sectionHeading('conversations', '对话')}
        <div id="codem-conversations-contents" className="codem-nav-group-content" hidden={!sections.conversations}>
          <CodeMConversationNavigation selected={selectedConversation} active={active && sections.conversations} onOpenConversation={onOpenConversation} />
        </div>
      </section>
    </div>
  </div>;
}
