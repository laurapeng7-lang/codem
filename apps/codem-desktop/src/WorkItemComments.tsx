import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import assets from './assets.json';
import { getWorkItemAgent, workItemAgents, type WorkItemAgent } from './work-item-agents';
import { type WorkItemOwner } from './WorkItemOwnerPicker';
import { commentMentionPeople, commentReplyDelay, commentReplyStagger, createWorkItemComment, getCommentMentionQuery, initialCommentTask, insertCommentMention, type CommentMentionQuery, type WorkItemComment, type WorkItemCommentTask } from './work-item-comment-mentions';
import { CommentMentionEditor, type CommentEditorHandle } from './CommentMentionEditor';
import './work-item-comments.css';

const assetRoot = '/assets/figma/work-item-comments/';

function CommentRow({ name = 'DC', time = 'Just now', avatar = assets['sidebar/img'], reply = false, agent, taskId, selected = false, onOpenAgent, children }: {
  name?: string; time?: string; avatar?: string; reply?: boolean; agent?: WorkItemAgent; taskId?: string; selected?: boolean; onOpenAgent?: () => void; children: ReactNode;
}) {
  return <div className={`work-comment-row${reply ? ' is-reply' : ''}${agent ? ' is-agent' : ''}`} data-comment-task={taskId} data-selected={agent && selected || undefined}>
    {agent && <button type="button" className="work-comment-agent-open" aria-label={`查看 ${agent.name} 回复的执行进展`} aria-haspopup="dialog" aria-expanded={selected} aria-controls={selected ? 'work-item-agent-panel' : undefined} onClick={onOpenAgent} />}
    {agent?.id === 'agent-codem' ? <span className="work-comment-agent-avatar"><img src={`${assetRoot}codem-logo.svg`} width="12.882" height="10.49" alt="" /></span>
      : <img className="work-comment-avatar" src={agent ? `/assets/figma/work-item-owner/${agent.avatar}` : avatar} width="24" height="24" alt="" draggable="false" />}
    <div className="work-comment-content">
      <div className="work-comment-author"><span className="work-comment-name" style={agent ? { color: agent.color } : undefined}>{agent?.name ?? name}</span>{agent && <span className="work-comment-agent-badge">Agent</span>}<span className="work-comment-time">{time}</span></div>
      {children}
    </div>
  </div>;
}

/** Figma comment popover, anchored inside the work-item drawer rather than its scrolling content. */
export function WorkItemComments({ open, drawerRef, triggerRef, selectedTaskId, onOpenAgent, onClose }: {
  open: boolean;
  drawerRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  selectedTaskId?: string;
  onOpenAgent: (task: WorkItemCommentTask) => void;
  onClose: (restoreFocus?: boolean) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<CommentEditorHandle | null>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [position, setPosition] = useState({ top: 42, width: 460, height: 583 });
  const [descending, setDescending] = useState(false);
  const [draft, setDraft] = useState('');
  const [comments, setComments] = useState<WorkItemComment[]>([]);
  const [repliedTasks, setRepliedTasks] = useState<Record<string, boolean>>({});
  const replyTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [mention, setMention] = useState<CommentMentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = mention?.query.toLowerCase() ?? '';
  const matches = commentMentionPeople.filter(person => `${person.name} ${person.email} ${getWorkItemAgent(person) ? 'Agent' : ''}`.toLowerCase().includes(query));
  const agents = matches.filter(person => getWorkItemAgent(person));
  const people = matches.filter(person => !getWorkItemAgent(person));
  const activePerson = matches[activeIndex];
  const canSend = Boolean(draft.trim());

  function syncMention(value: string, caret = value.length, selectionEnd = caret) {
    setMention(getCommentMentionQuery(value, caret, selectionEnd));
    setActiveIndex(0);
  }
  function chooseMention(person: WorkItemOwner) {
    if (!mention) return;
    const next = insertCommentMention(draft, mention, person);
    if (next.value.length > 2000) return;
    pendingCaret.current = next.caret;
    setDraft(next.value);
    setMention(null);
  }
  function submitComment() {
    if (!canSend) return;
    const comment = createWorkItemComment(draft, crypto.randomUUID());
    setComments(current => [...current, comment]);
    comment.tasks.forEach((task, index) => {
      const timer = setTimeout(() => {
        replyTimers.current.delete(timer);
        setRepliedTasks(current => ({ ...current, [task.id]: true }));
      }, commentReplyDelay + index * commentReplyStagger);
      replyTimers.current.add(timer);
    });
    pendingCaret.current = 0;
    setDraft('');
    setMention(null);
  }

  useEffect(() => () => { replyTimers.current.forEach(clearTimeout); replyTimers.current.clear(); }, []);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !inputRef.current) return;
    inputRef.current.focus({ preventScroll: true });
    inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [draft]);
  useEffect(() => {
    if (open && mention) mentionRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, mention, activeIndex]);

  useLayoutEffect(() => {
    const drawer = drawerRef.current;
    const trigger = triggerRef.current;
    if (!open || !drawer || !trigger) return;
    const update = () => {
      const bounds = drawer.getBoundingClientRect();
      const top = trigger.getBoundingClientRect().bottom - bounds.top + 4;
      const next = { top, width: Math.min(460, Math.max(0, bounds.width - 32)), height: Math.min(583, Math.max(0, bounds.height - top - 12)) };
      setPosition(previous => previous.top === next.top && previous.width === next.width && previous.height === next.height ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(drawer);
    observer.observe(trigger);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [open, drawerRef, triggerRef]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      const element = event.target instanceof Element ? event.target : event.target.parentElement;
      if (selectedTaskId && element?.closest('#work-item-agent-panel')) return;
      onClose(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, onClose, triggerRef, selectedTaskId]);

  useLayoutEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = !descending && comments.length ? listRef.current.scrollHeight : 0;
  }, [open, comments.length, descending, Object.keys(repliedTasks).length]);

  if (!open) return null;
  function renderAgentReply(task: WorkItemCommentTask, time?: string) {
    const agent = workItemAgents.find(agent => agent.id === task.agentId)!;
    return <CommentRow key={task.id} agent={agent} taskId={task.id} time={time} selected={selectedTaskId === task.id} onOpenAgent={() => { setMention(null); onOpenAgent(task); }}><p>好的，我完成后会再次回复你，你可以在<span className="work-comment-progress" style={{ color: agent.color }}>这里看到进展</span>。</p></CommentRow>;
  }
  function renderCommentText(comment: WorkItemComment) {
    const content: ReactNode[] = [];
    let cursor = 0;
    for (const mention of comment.mentions) {
      content.push(comment.text.slice(cursor, mention.start));
      content.push(<span key={mention.start} className="work-comment-mention" style={{ color: getWorkItemAgent(mention.person)?.color }}>{comment.text.slice(mention.start, mention.end)}</span>);
      cursor = mention.end;
    }
    content.push(comment.text.slice(cursor));
    return content;
  }
  function renderMentionOption(person: WorkItemOwner) {
    const agent = getWorkItemAgent(person);
    const selected = activePerson?.id === person.id;
    return <button type="button" key={person.id} role="option" id={`comment-mention-${person.id}`} aria-selected={selected} tabIndex={-1}
      className={`work-owner-option${agent ? ' work-owner-agent-option' : ''}${selected ? ' is-highlighted' : ''}`} onPointerDown={event => event.preventDefault()} onClick={() => chooseMention(person)}>
      <img src={`/assets/figma/work-item-owner/${person.avatar}`} width="24" height="24" alt="" draggable="false" />
      <span className={agent ? 'work-owner-agent-label' : undefined}><span className="work-owner-name" style={agent ? { color: agent.color } : undefined}>{person.name}</span>
        {agent ? <span className="work-owner-agent-badge">Agent</span> : <span className="work-owner-email">{person.email}</span>}</span>
    </button>;
  }
  const threads = [
    <div className="work-comment-thread" key="issue">
      <CommentRow time="2024-11-05 19:20:57">
        <p>好像是线上问题，最后一个工作项有分组就会这样</p>
        <img className="work-comment-attachment" src={`${assetRoot}attachment.png`} width="60" height="60" alt="评论中的工作项分组问题截图" draggable="false" />
      </CommentRow>
      <CommentRow reply name="Wangbing" avatar={`${assetRoot}wangbing.png`}><p>好的，那我改成线上？给赵朋？</p></CommentRow>
      <CommentRow reply>
        <p>我修一下吧，看起来好修。数据显示不出是后端 bug，如果再出现了单独提 bug 给云飞</p>
        <span className="work-comment-reaction"><img src={`${assetRoot}ok.png`} width="17" height="16" alt="OK" /><img src={`${assetRoot}reaction-divider.svg`} width="1" height="14.5" alt="" /><span>LiTiantian</span></span>
      </CommentRow>
    </div>,
    <div className="work-comment-agent-thread" key="agent">
      <div className="work-comment-single">
        <CommentRow time="2026-11-05 19:20:57">
          <p><span className="work-comment-mention">@CodeM</span> 帮我找一下这个反馈关联的原声</p>
        </CommentRow>
      </div>
      {renderAgentReply(initialCommentTask, '2026-11-05 19:20:57')}
    </div>,
    ...comments.map(comment => <div className="work-comment-agent-thread" key={comment.id}>
      <div className="work-comment-single"><CommentRow><p>{renderCommentText(comment)}</p></CommentRow></div>
      {comment.tasks.filter(task => repliedTasks[task.id]).map(task => renderAgentReply(task))}
    </div>),
  ];

  return <div ref={panelRef} id="work-item-comments" className="work-comments-panel" style={position} role="dialog" aria-label="工作项评论" tabIndex={-1} onKeyDown={event => {
    if (event.key !== 'Escape' || event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229) return;
    event.preventDefault(); event.stopPropagation();
    if (mention) setMention(null);
    else onClose();
  }}>
    <span className="work-comments-accent" aria-hidden="true"><img src={`${assetRoot}thread-accent.svg`} width="6" height={Math.max(0, position.width - 1)} alt="" /></span>
    <div ref={listRef} className="work-comments-list" aria-label="评论列表">{descending ? [...threads].reverse() : threads}</div>
    <button type="button" className="work-comments-sort" aria-label={descending ? '按时间正序排列评论' : '按时间倒序排列评论'} title={descending ? '按时间正序排列' : '按时间倒序排列'} aria-pressed={descending} onClick={() => setDescending(value => !value)}><img src={`${assetRoot}sort.svg`} width="16" height="16" alt="" /></button>
    {mention && <div ref={mentionRef} className="work-owner-menu work-comment-mention-menu" id="work-comment-mentions" role="listbox" aria-label="提及人员或 Agent">
      <div className="work-owner-options">
        {agents.length > 0 && <div className="work-owner-option-group" role="group" aria-label="Agent">{agents.map(renderMentionOption)}</div>}
        {agents.length > 0 && people.length > 0 && <div className="work-owner-group-divider" role="presentation" />}
        {people.length > 0 && <div className="work-owner-option-group" role="group" aria-label="人员">{people.map(renderMentionOption)}</div>}
        {!matches.length && <p className="work-owner-no-results">未找到匹配的人员或 Agent</p>}
      </div>
    </div>}
    <div className="work-comments-composer">
      <div className="work-comments-editor">
        <CommentMentionEditor inputRef={inputRef} aria-label="输入评论" placeholder="你可以输入评论，@用户或智能体" value={draft} role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={Boolean(mention)} aria-controls={mention ? 'work-comment-mentions' : undefined} aria-activedescendant={mention && activePerson ? `comment-mention-${activePerson.id}` : undefined}
          onChange={(value, start, end) => { setDraft(value); syncMention(value, start, end); }}
          onSelectionChange={syncMention}
          onBlur={() => setMention(null)} onKeyDown={event => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            if (mention && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault();
              setActiveIndex(index => !matches.length ? 0 : (index + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (mention && activePerson) chooseMention(activePerson);
              else submitComment();
            }
          }} />
        {canSend && <button type="button" className="work-comments-send" aria-label="发送评论" onClick={submitComment}><img src={`${assetRoot}send.svg`} width="14" height="14" alt="" /></button>}
      </div>
    </div>
  </div>;
}
