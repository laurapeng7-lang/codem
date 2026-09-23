import { CodeMLogo } from './CodeMLogo';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useWorkItemTableMenu } from './useWorkItemTableMenu';
import { renderWorkItemAILoading } from './work-item-ai-loading';
import { reviewRoleConfigs, type WorkItemReviewRole } from './work-item-role-data';
import { getSelectableWorkItemAgents } from './work-item-agents';
import { renderWorkItemOwnerAvatar } from './work-item-owner-avatar';
import type { SettingsSpaceAgent } from './settings-ai';

export type WorkItemOwner = { id: string; name: string; email: string; avatar: string; spaceAgent?: SettingsSpaceAgent };
const assetRoot = '/assets/figma/work-item-owner/';
const suggestionAssetRoot = '/assets/figma/work-item-owner-ai/';
const ownerLoadingTitles = ['AI 智能建议', '分析项目上下文', '匹配历史经验', '生成负责人建议'];
const loadingStepDuration = 1500;
// Demo recommendation based on the MCP task context.
const ownerSuggestions = {
  nannan: {
    owner: { id: 'nannan', name: 'Nannan', email: '', avatar: '../work-item-owner-ai/nannan.png' },
    reasons: ['Currently handling MCP list_issues bug updated today; strong recent context', 'Previously implemented list_issues enhancements (projectld filtering)'],
  },
} satisfies Record<string, { owner: WorkItemOwner; reasons: string[] }>;
const people: WorkItemOwner[] = [
  { id: 'liang-nannan', name: '梁楠楠', email: 'antinuclear@outlook.com', avatar: 'liang-nannan.png' },
  { id: 'ye-na', name: '叶娜', email: 'fluttering@gmail.com', avatar: 'ye-na.png' },
  { id: 'tan-tianmei', name: '谭恬美', email: 'undisputed@gmail.com', avatar: 'tan-tianmei.png' },
  { id: 'guo-chang', name: '郭琩', email: 'behindthescenes@hotmail.com', avatar: 'guo-chang.png' },
];

export type WorkItemOwnerSuggestion = { owner: WorkItemOwner; reasons: readonly string[] };
type OwnerPickerProps = {
  drawerRef: RefObject<HTMLElement | null>;
  onContinueInChat: () => void;
  table?: {
    id: string; anchorRef: RefObject<HTMLElement | null>; onClose: () => void;
    people: WorkItemOwner[]; recommendations: { primary: string; values: Record<string, WorkItemOwnerSuggestion> };
  };
} & (
  | { owner?: WorkItemOwner; onChange: (owner: WorkItemOwner) => void; role?: never; members?: never }
  | { role: WorkItemReviewRole; members: WorkItemOwner[]; onChange: (members: WorkItemOwner[]) => void; owner?: never }
);

export function WorkItemOwnerPicker(props: OwnerPickerProps) {
  const { drawerRef, role, table } = props;
  const config = role ? reviewRoleConfigs[role] : undefined;
  const multiple = config?.multiple ?? false;
  const label = config?.label ?? 'Owner';
  const idPrefix = table?.id ?? (role ? `work-${role}` : 'work-owner');
  const inputId = table ? `${table.id}-input` : role ? `work-item-${role}` : 'work-item-owner';
  const savedMembers = props.role ? props.members : props.owner ? [props.owner] : [];
  const suggestions: Record<string, WorkItemOwnerSuggestion> = table?.recommendations.values ?? config?.suggestions ?? ownerSuggestions;
  const primaryOwnerId = table?.recommendations.primary ?? config?.primary ?? 'nannan';
  const loadingTitles = config?.loadingTitles ?? ownerLoadingTitles;
  const availablePeople = table?.people ?? (config ? [...Object.values(config.suggestions).map(suggestion => suggestion.owner), ...people] : people);
  const [open, setOpen] = useState(Boolean(table));
  const [availableAgents, setAvailableAgents] = useState(getSelectableWorkItemAgents);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'people' | 'teams'>('people');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestionState, setSuggestionState] = useState<'list' | 'loading' | 'suggested'>('list');
  const [loadingStep, setLoadingStep] = useState(0);
  const [acceptHovered, setAcceptHovered] = useState(false);
  const [acceptFocused, setAcceptFocused] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 320, maxHeight: 283 });
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const returningFocus = useRef(false);
  const search = query.trim().toLowerCase();
  const showingPeople = suggestionState === 'list' && tab === 'people';
  const agentMatches = showingPeople ? availableAgents.filter(agent => `${agent.name} Agent${agent.spaceAgent ? ' · 空间' : ''}`.toLowerCase().includes(search)) : [];
  const codemMatches = agentMatches.filter(agent => !agent.spaceAgent);
  const spaceAgentMatches = agentMatches.filter(agent => agent.spaceAgent);
  const peopleMatches = showingPeople ? availablePeople.filter(person => `${person.name} ${person.email}`.toLowerCase().includes(search)) : [];
  const matches = [...agentMatches, ...peopleMatches];
  const menuHeight = suggestionState === 'suggested' ? (multiple ? 375 : 341) : suggestionState === 'loading' ? 172 : tab === 'people' ? 454 : 283;
  const menuWidth = suggestionState === 'list' ? 320 : 398;
  const selectedSuggestion = suggestions[primaryOwnerId];
  const suggestedMembers = multiple
    ? savedMembers.some(person => person.id === selectedSuggestion.owner.id) ? savedMembers : [...savedMembers, selectedSuggestion.owner]
    : [selectedSuggestion.owner];

  function clearAcceptPreview() {
    setAcceptHovered(false);
    setAcceptFocused(false);
  }
  function openMenu() {
    if (open || returningFocus.current) return;
    setAvailableAgents(getSelectableWorkItemAgents());
    clearAcceptPreview();
    setQuery('');
    setTab('people');
    setSuggestionState('list');
    setActiveIndex(-1);
    setOpen(true);
  }
  function closeMenu(restoreFocus = false) {
    clearAcceptPreview();
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
    table?.onClose();
    if (restoreFocus) {
      returningFocus.current = true;
      (table?.anchorRef.current ?? inputRef.current)?.focus({ preventScroll: true });
      returningFocus.current = false;
    }
  }
  function commitMembers(members: WorkItemOwner[]) {
    if (props.role) props.onChange(members);
    else if (members[0]) props.onChange(members[0]);
    closeMenu();
    (table?.anchorRef.current ?? drawerRef.current)?.focus({ preventScroll: true });
  }
  function choose(person: WorkItemOwner) {
    if (multiple && props.role) {
      // Save each toggle immediately; keep the picker open for further selections.
      props.onChange(savedMembers.some(member => member.id === person.id)
        ? savedMembers.filter(member => member.id !== person.id) : [...savedMembers, person]);
    } else commitMembers([person]);
  }
  function acceptSuggestion() {
    commitMembers(suggestedMembers);
  }
  function showSuggestions() {
    clearAcceptPreview();
    setQuery('');
    setActiveIndex(-1);
    setLoadingStep(0);
    setSuggestionState('loading');
    // Keep keyboard focus on the field when the clicked menu item is replaced.
    inputRef.current?.focus({ preventScroll: true });
  }
  function ignoreSuggestion() {
    clearAcceptPreview();
    setSuggestionState('list');
    inputRef.current?.focus({ preventScroll: true });
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    } else if (event.currentTarget === inputRef.current && open && suggestionState === 'suggested' && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      event.preventDefault();
      menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    } else if (event.currentTarget === inputRef.current && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      openMenu();
      setActiveIndex(index => !matches.length ? -1 : event.key === 'ArrowDown' ? (index + 1) % matches.length : (index <= 0 ? matches.length : index) - 1);
    } else if (event.currentTarget === inputRef.current && event.key === 'Enter') {
      event.preventDefault();
      if (open && matches[activeIndex]) choose(matches[activeIndex]);
      else openMenu();
    }
  }

  const tablePosition = useWorkItemTableMenu({ open: Boolean(table) && open, anchorRef: table?.anchorRef, menuRef, width: menuWidth, height: menuHeight, onClose: () => closeMenu() });
  useEffect(() => { if (table) inputRef.current?.focus({ preventScroll: true }); }, [Boolean(table)]);
  useEffect(() => {
    if (open && activeIndex >= 0) menuRef.current?.querySelector<HTMLElement>('[role="option"].is-highlighted')?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open || suggestionState !== 'loading') return;
    let cancelled = false;
    // This is a local demo of the AI analysis, not a network request.
    const timers = loadingTitles.slice(1).map((_, index) => setTimeout(() => {
      if (!cancelled) setLoadingStep(index + 1);
    }, (index + 1) * loadingStepDuration));
    timers.push(setTimeout(() => {
      if (!cancelled) setSuggestionState('suggested');
    }, loadingTitles.length * loadingStepDuration));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [open, suggestionState, loadingTitles]);

  useEffect(() => {
    if (!open || table) return;
    const dismissOutside = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      if (fieldRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
      setQuery('');
      setActiveIndex(-1);
    };
    document.addEventListener('pointerdown', dismissOutside, { capture: true });
    document.addEventListener('focusin', dismissOutside);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, { capture: true });
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [open]);

  // Render inside the drawer, outside its scrolling form, so the menu cannot be clipped by the card.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const drawer = drawerRef.current;
    if (!open || table || !field || !drawer) return;
    const updatePosition = () => {
      const anchor = field.getBoundingClientRect();
      const bounds = drawer.getBoundingClientRect();
      const scrollBounds = field.closest('.work-detail-scroll')?.getBoundingClientRect() ?? bounds;
      if (anchor.bottom <= scrollBounds.top || anchor.top >= scrollBounds.bottom) {
        setOpen(false);
        return;
      }
      const width = Math.min(menuWidth, Math.max(0, bounds.width - 24));
      const below = Math.max(0, bounds.bottom - anchor.bottom - 12);
      const above = Math.max(0, anchor.top - scrollBounds.top - 12);
      const flip = below < menuHeight && above > below;
      const maxHeight = Math.min(menuHeight, flip ? above : below);
      const nextPosition = {
        left: Math.max(12, Math.min(anchor.left - bounds.left, bounds.width - width - 12)),
        top: flip ? anchor.top - bounds.top - maxHeight - 4 : anchor.bottom - bounds.top + 4,
        width, maxHeight,
      };
      setPosition(previous => previous.left === nextPosition.left && previous.top === nextPosition.top && previous.width === nextPosition.width && previous.maxHeight === nextPosition.maxHeight ? previous : nextPosition);
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(drawer);
    observer.observe(field);
    drawer.addEventListener('scroll', updatePosition, { capture: true, passive: true });
    window.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      drawer.removeEventListener('scroll', updatePosition, { capture: true });
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, drawerRef, menuHeight, menuWidth]);

  const inputValue = open ? query : savedMembers.map(person => person.name).join(', ');
  const previewing = open && suggestionState === 'suggested' && (acceptHovered || acceptFocused);
  const taggedMembers = previewing ? suggestedMembers : !open ? savedMembers : [];
  const taggedOwner = taggedMembers[0];
  function renderOption(person: WorkItemOwner, index: number, agentColor?: string) {
    const selected = savedMembers.some(member => member.id === person.id);
    return <button type="button" role="option" key={person.id} id={`${idPrefix}-${person.id}`} aria-selected={selected} tabIndex={-1}
      className={`work-owner-option${agentColor ? ' work-owner-agent-option' : ''}${activeIndex === index ? ' is-highlighted' : ''}`} onPointerDown={event => event.preventDefault()} onClick={() => choose(person)}>
      {renderWorkItemOwnerAvatar(person, 24)}
      <span className={agentColor ? 'work-owner-agent-label' : undefined}>
        <span className="work-owner-name" title={person.name} style={agentColor ? { color: agentColor } : undefined}>{person.name}</span>
        {agentColor ? <span className="work-owner-agent-badge">{person.spaceAgent ? 'Agent · 空间' : 'Agent'}</span> : person.email && <span className="work-owner-email">{person.email}</span>}
      </span>
      {multiple && <img className="work-role-option-check" src={`/assets/figma/work-item-drawer/${selected ? 'check-done' : 'check-empty'}.svg`} width="16" height="16" alt="" />}
    </button>;
  }
  return <div className={`work-owner-picker${role ? ' work-role-picker' : ''}${table ? ' work-table-owner-picker' : ''}${open ? ' is-open' : ''}`} ref={fieldRef}>
    <input ref={inputRef} id={inputId} type="text" role="combobox" aria-label={label} aria-autocomplete="list" aria-haspopup={suggestionState === 'list' ? 'listbox' : 'dialog'}
      aria-expanded={open} aria-controls={open ? suggestionState === 'list' ? `${idPrefix}-options` : `${idPrefix}-ai-menu` : undefined} aria-activedescendant={open && matches[activeIndex] ? `${idPrefix}-${matches[activeIndex].id}` : undefined}
      className={taggedOwner ? 'work-owner-input-with-tag' : undefined} readOnly={!open}
      autoComplete="off" placeholder={open && (role || table) ? '搜索人员或 Agent' : undefined} value={inputValue} onFocus={openMenu} onClick={openMenu} onKeyDown={onKeyDown}
      onChange={event => { clearAcceptPreview(); setQuery(event.target.value); setSuggestionState('list'); setActiveIndex(-1); setOpen(true); }} />
    {taggedOwner && (role ? <span className={`work-role-value-tags${previewing ? ' is-preview' : ''}`} aria-hidden="true">
      {taggedMembers.map(person => <span className="work-detail-person" key={person.id}>
        {renderWorkItemOwnerAvatar(person, 20)}<span>{person.name}</span>
      </span>)}
    </span> : <span className={`work-detail-person work-owner-value-tag${previewing ? ' is-preview' : ''}`} aria-hidden="true">
      {renderWorkItemOwnerAvatar(taggedOwner, 20)}<span>{taggedOwner.name}</span>
    </span>)}
    {!inputValue && !taggedOwner && !(open && (role || table)) && <span className="work-detail-empty work-owner-placeholder" aria-hidden="true">empty</span>}
    {open && (table || drawerRef.current) && createPortal(<div ref={menuRef} data-work-cell-menu={table?.id} className={`work-owner-menu${table ? ' work-table-menu' : ''}${suggestionState !== 'list' ? ' work-owner-ai-menu' : ''}`} style={table ? tablePosition : { ...position, height: menuHeight }} onKeyDown={onKeyDown}
      id={suggestionState !== 'list' ? `${idPrefix}-ai-menu` : undefined} role={suggestionState !== 'list' ? 'dialog' : undefined} aria-label={suggestionState !== 'list' ? 'AI 智能建议' : undefined}>
      {suggestionState === 'list' ? <>
        <div className="work-owner-tabs" role="tablist" aria-label={`${label} 类型`}>
          {(['people', 'teams'] as const).map(value => <button key={value} type="button" role="tab" id={`${idPrefix}-tab-${value}`} aria-selected={tab === value} aria-controls={`${idPrefix}-panel`} onClick={() => { setTab(value); setActiveIndex(-1); }}>{value === 'people' ? '人员' : '团队'}</button>)}
        </div>
        <div className="work-owner-panel" id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${tab}`}>
          <button type="button" className="work-owner-suggestion" onClick={showSuggestions}>
            <span className="work-owner-ai-icon"><CodeMLogo size={16} /></span>
            <div><span>{config?.suggestionLabel ?? 'AI 智能建议负责人'}</span></div>
          </button>
          <div className="work-owner-separator" />
          <div className="work-owner-options" id={`${idPrefix}-options`} role="listbox" aria-multiselectable={multiple || undefined} aria-label={tab === 'people' ? '可选人员或 Agent' : '可选团队'}>
            {codemMatches.length > 0 && <div className="work-owner-option-group" role="group" aria-label="CodeM">
              {codemMatches.map((agent, index) => renderOption(agent, index, agent.color))}
            </div>}
            {codemMatches.length > 0 && spaceAgentMatches.length > 0 && <div className="work-owner-group-divider" role="presentation" />}
            {spaceAgentMatches.length > 0 && <div className="work-owner-option-group" role="group" aria-label="空间智能体">
              {spaceAgentMatches.map((agent, index) => renderOption(agent, codemMatches.length + index, agent.color))}
            </div>}
            {agentMatches.length > 0 && peopleMatches.length > 0 && <div className="work-owner-group-divider" role="presentation" />}
            {peopleMatches.length > 0 && <div className="work-owner-option-group" role="group" aria-label="人员">
              {peopleMatches.map((person, index) => renderOption(person, agentMatches.length + index))}
            </div>}
            {!matches.length && <p className="work-owner-no-results">{tab === 'teams' ? '暂无可选团队' : '未找到匹配的人员或 Agent'}</p>}
          </div>
        </div>
      </> : suggestionState === 'loading' ? renderWorkItemAILoading(loadingTitles, loadingStep) : <div key="suggested" className="work-owner-ai-result">
        <div className="work-owner-ai-heading"><CodeMLogo size={12} /><span>AI 智能建议</span></div>
        <div className="work-owner-ai-match" role="status" aria-live="polite">
          <img src={`${suggestionAssetRoot}recommended.svg`} width="16" height="16" alt="" />
          <span className="work-detail-person"><img src={`${assetRoot}${selectedSuggestion.owner.avatar}`} width="20" height="20" alt="" draggable="false" />{selectedSuggestion.owner.name}</span>
          <span>is the best match</span>
        </div>
        {multiple && <p className="work-role-ai-note">接受后保留已选成员，添加推荐人员</p>}
        <div className="work-owner-ai-actions">
          <button type="button" className="work-owner-ai-accept" onClick={acceptSuggestion}
            onPointerEnter={event => { if (event.pointerType !== 'touch') setAcceptHovered(true); }} onPointerLeave={() => setAcceptHovered(false)}
            onFocus={() => setAcceptFocused(true)} onBlur={() => setAcceptFocused(false)}>Accept</button>
          <button type="button" onClick={ignoreSuggestion}>Ignore</button>
        </div>
        <div className="work-owner-ai-divider" />
        <section className="work-owner-ai-reasons" aria-labelledby={`${idPrefix}-ai-reasons-title`}>
          <h3 id={`${idPrefix}-ai-reasons-title`}>Why this assignee was suggested</h3>
          <ul>{selectedSuggestion.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        </section>
        <div className="work-owner-ai-divider" />
        <div className="work-owner-ai-chat"><button type="button" onClick={props.onContinueInChat}>Continue in chat</button></div>
      </div>}
    </div>, table ? document.body : drawerRef.current!)}
  </div>;
}

export { people as workItemPeople };
