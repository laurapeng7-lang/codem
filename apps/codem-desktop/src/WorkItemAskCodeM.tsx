import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ConversationHistoryMenu } from './ConversationHistoryMenu';
import { cloudEnvironment, type Conversation } from './conversation-history';
import { createWorkItemConversation, createWorkViewConversation, setConversationEnvironment, workItemQueries, wbsQueries } from './work-item-chat';
import { NewChatIcon, NewChatToolbar } from './NewChatToolbar';
import { workViewQueries, type WorkViewContext } from './work-view-chat';
import assets from './assets.json';
import type { Application } from './work-item-navigation';
import type { WorkItem } from './work-items-data';
import { createSettingsConversation, settingsChatContext, settingsQueries } from './settings-chat';
import { beginSettingsExecution, settingsExecutionKey } from './settings-chat-execution';
import './work-item-ask-codem.css';

const assetRoot = '/assets/figma/ask-codem/';
function AskIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <img src={`${assetRoot}${name}.svg`} width={size} height={size} alt="" draggable="false" />;
}

export function getViewAskPosition(page: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, trigger: Pick<DOMRect, 'left' | 'bottom'>) {
  const width = Math.min(400, Math.max(0, page.width - 16));
  const left = Math.max(8, Math.min(trigger.left - page.left, page.width - width - 8));
  const top = Math.max(8, trigger.bottom - page.top + 2);
  return { left, top, width, height: Math.min(660, Math.max(0, page.height - top - 8)) };
}

type AskCodeMProps = {
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: (restoreFocus?: boolean) => void;
  onOpenConversation: (conversation: Conversation) => void;
} & ({
  application: Application;
  item: WorkItem;
  context?: 'work-item' | 'wbs';
} | { context: 'settings' } | { context: 'view'; application: Application; view: WorkViewContext });

export function WorkItemAskCodeM(props: AskCodeMProps) {
  const { triggerRef, onClose, onOpenConversation, context = 'work-item' } = props;
  const isWBS = context === 'wbs';
  const isSettings = context === 'settings';
  const isView = context === 'view';
  const queries = props.context === 'view' ? workViewQueries(props.view) : isSettings ? settingsQueries : isWBS ? wbsQueries : workItemQueries;
  const panelId = isView ? 'work-view-ask-codem' : isSettings ? 'settings-ask-codem' : isWBS ? 'work-wbs-ask-codem' : 'work-item-ask-codem';
  const titleId = isView ? 'work-view-ask-title' : isSettings ? 'settings-ask-title' : isWBS ? 'work-wbs-ask-title' : 'work-ask-title';
  const historyId = isView ? 'work-view-history-trigger' : isSettings ? 'settings-ask-history-trigger' : isWBS ? 'work-wbs-history-trigger' : 'history-trigger';
  const historyMenuId = isView ? 'work-view-history-menu' : isSettings ? 'settings-ask-history-menu' : isWBS ? 'work-wbs-history-menu' : 'conversation-history-menu';
  const referenceTitle = props.context === 'view' ? props.view.title : props.context === 'settings' ? settingsChatContext.title : props.item.title;
  const mentionLabel = isView ? '引用视图' : isSettings ? '引用空间配置' : '引用工作项';
  const placeholder = isWBS ? '告诉我你的计划编排需求' : '告诉我你的需求';
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toolbarMenuRef = useRef<HTMLDivElement>(null);
  const environment = useRef(cloudEnvironment);
  const [prompt, setPrompt] = useState('');
  const [notice, setNotice] = useState('');
  const [menu, setMenu] = useState<'history' | 'mention' | 'skill' | null>(null);
  const closeHistory = useCallback(() => setMenu(null), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3600);
    return () => clearTimeout(timer);
  }, [notice]);

  useLayoutEffect(() => {
    if (!isView) return;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const page = panel?.offsetParent;
    if (!panel || !trigger || !(page instanceof HTMLElement)) return;
    const alignPanel = () => {
      const position = getViewAskPosition(page.getBoundingClientRect(), trigger.getBoundingClientRect());
      Object.assign(panel.style, {
        left: `${position.left}px`, top: `${position.top}px`, right: 'auto',
        width: `${position.width}px`, height: `${position.height}px`,
      });
    };
    alignPanel();
    const observer = new ResizeObserver(alignPanel);
    observer.observe(page);
    observer.observe(trigger);
    window.addEventListener('resize', alignPanel);
    window.addEventListener('scroll', alignPanel, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', alignPanel);
      window.removeEventListener('scroll', alignPanel, true);
    };
  }, [isView, triggerRef]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const resizeInput = () => {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    };
    resizeInput();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resizeInput();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [prompt]);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target) || toolbarMenuRef.current?.contains(event.target)) return;
      onClose(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onClose, triggerRef]);

  const submit = (question = prompt) => {
    if (!question.trim() || question.trim().length > 2000) return;
    let conversation: Conversation;
    if (props.context === 'view') conversation = createWorkViewConversation(props.view, question);
    else if (props.context === 'settings') {
      conversation = createSettingsConversation(question);
      beginSettingsExecution(settingsExecutionKey(conversation.id));
    } else conversation = createWorkItemConversation(props.application.slug, props.item, question, props.context);
    setConversationEnvironment(conversation.id, environment.current);
    onOpenConversation({ ...conversation, environment: environment.current });
  };
  const choosePrompt = (value: string) => {
    setPrompt(value);
    setMenu(null);
    inputRef.current?.focus({ preventScroll: true });
  };

  return <div ref={panelRef} id={panelId} className={`work-ask-panel${isView ? ' is-view-ask' : isSettings ? ' is-settings-ask' : isWBS ? ' is-wbs' : ''}`} role="dialog" aria-labelledby={titleId} tabIndex={-1} onKeyDown={event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (menu) { setMenu(null); inputRef.current?.focus({ preventScroll: true }); }
      else onClose();
    }
  }}>
    <header className="work-ask-header">
      <button id={historyId} type="button" className="work-ask-history" aria-label="对话历史" aria-haspopup="menu" aria-expanded={menu === 'history'} aria-controls={menu === 'history' ? historyMenuId : undefined} onClick={() => setMenu(menu === 'history' ? null : 'history')}><AskIcon name="history" /></button>
      {menu === 'history' && <ConversationHistoryMenu selected={null} onSelect={onOpenConversation} onClose={closeHistory} triggerId={historyId} menuId={historyMenuId} />}
    </header>
    <div className="work-ask-body">
      <h2 id={titleId}>{isView ? 'CodeM 帮你分析视图' : isSettings ? 'CodeM 帮你配置项目空间' : isWBS ? 'CodeM 帮你编排项目计划' : 'CodeM 帮你跟进项目'}</h2>
      <section className="work-ask-queries" aria-label="快捷提问">
        <p>试试这么问:</p>
        <div>{queries.map(query => <button type="button" key={query.id} onClick={() => isSettings && 'prompt' in query ? choosePrompt(query.prompt) : submit(query.title)}>{query.title}</button>)}</div>
      </section>
    </div>
    <div className="work-ask-composer-wrap">
      {notice && <p className="work-ask-notice" role="status">{notice}</p>}
      <form className="work-ask-composer" onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className="work-ask-context"><span className="work-ask-reference" title={referenceTitle}><span className="work-ask-reference-icon" style={props.context === 'view' ? { background: props.application.color } : undefined}>{props.context === 'view' ? <img src={assets[props.application.icon]} width="12" height="12" alt="" draggable="false" /> : isSettings ? <img src="/assets/settings/settings.svg" width="12" height="12" alt="" draggable="false" /> : <AskIcon name="story" size={10} />}</span><span>{isWBS ? `WBS Schedule · ${referenceTitle}` : referenceTitle}</span></span></div>
        <textarea ref={inputRef} aria-label={placeholder} placeholder={placeholder} value={prompt} maxLength={2000} rows={1} onChange={event => setPrompt(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
            event.preventDefault(); submit();
          }
        }} />
        <NewChatToolbar menuRef={toolbarMenuRef} workItemLayerId={'item' in props ? props.item.id : undefined}
          externalMenuOpen={menu !== null} mentionLabel={mentionLabel} scrollContainerSelector=".work-ask-panel"
          onEnvironmentChange={next => { environment.current = next; }}
          onAttach={() => fileRef.current?.click()} onMention={() => setMenu('mention')} onSkill={() => setMenu('skill')}
          onMenuOpen={() => setMenu(null)} notify={setNotice}>
          <button type="submit" className="send-button" data-editable={true} aria-label="发送消息" title="发送消息" disabled={!prompt.trim()}><NewChatIcon name="send" size={15.076} /></button>
        </NewChatToolbar>
        {(menu === 'mention' || menu === 'skill') && <div className="work-ask-composer-menu" role="group" aria-label={menu === 'mention' ? mentionLabel : '选择技能'}>
          {menu === 'mention' ? <button type="button" onClick={() => choosePrompt(`${prompt}${prompt ? ' ' : ''}@${referenceTitle} `)}>{referenceTitle}</button> : queries.slice(0, 3).map(query => <button type="button" key={query.id} onClick={() => choosePrompt('prompt' in query ? query.prompt : query.title)}>{query.title}</button>)}
        </div>}
        <input ref={fileRef} className="visually-hidden" type="file" multiple tabIndex={-1} aria-label="选择附件文件" onChange={event => {
          const names = Array.from(event.target.files ?? []).map(file => file.name);
          if (names.length) choosePrompt(`${prompt}${prompt ? '\n' : ''}附件：${names.join('、')}`.slice(0, 2000));
          event.target.value = '';
        }} />
      </form>
    </div>
  </div>;
}
