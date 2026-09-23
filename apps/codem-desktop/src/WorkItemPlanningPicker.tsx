import { CodeMLogo } from './CodeMLogo';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { defaultFinishDate, defaultReviewTeam, reviewTeam, reviewTeams, suggestedFinishDates, suggestedReviewTeam, type WorkItemReviewContext, type WorkItemReviewTeam } from './work-item-review-data';
import { useWorkItemTableMenu } from './useWorkItemTableMenu';
import { renderWorkItemAILoading } from './work-item-ai-loading';
import './work-item-planning.css';

export type WorkItemSchedule = { start: string; end: string };
type PlanningProps = {
  drawerRef: RefObject<HTMLElement | null>;
  onContinueInChat: () => void;
  reviewContext?: WorkItemReviewContext;
  table?: { id: string; anchorRef: RefObject<HTMLElement | null>; onClose: () => void; itemTitle: string };
} & ({ field: 'pd'; value?: string; onChange: (value: string) => void } | {
  field: 'schedule'; value?: WorkItemSchedule; onChange: (value: WorkItemSchedule) => void;
} | {
  field: 'review-team'; value?: WorkItemReviewTeam; onChange: (value: WorkItemReviewTeam) => void;
} | {
  field: 'finish-date'; value?: string; onChange: (value: string) => void;
});
const assetRoot = '/assets/figma/work-item-planning/';
const aiAssetRoot = '/assets/figma/work-item-owner-ai/';
const primarySchedule = { start: '2026-03-04', end: '2026-03-08' };
const reasons = [
  'Currently handling MCP list_issues bug updated today; strong recent context',
  'Previously implemented list_issues enhancements (projectld filtering)',
];
const loadingTitles = {
  pd: ['AI 智能建议', '分析项目上下文', '评估工作量', '生成工时建议'],
  schedule: ['AI 智能建议', '分析项目上下文', '检查排期与依赖', '生成排期建议'],
  'review-team': ['AI 智能建议', '分析评审上下文', '匹配团队职责', '生成评审团队建议'],
  'finish-date': ['AI 智能建议', '分析工时与排期', '预留评审时间', '生成完成日期建议'],
};
const suggestionLabels = {
  pd: 'AI 智能估算工时',
  schedule: 'AI 智能规划排期',
  'review-team': 'AI 智能推荐评审团队',
  'finish-date': 'AI 智能预估完成时间',
};
const dateLabel = (value: string) => value.slice(5);
const scheduleLabel = (value: WorkItemSchedule) => `${dateLabel(value.start)} ~ ${dateLabel(value.end)}`;
export const formatWorkItemSchedule = (value: WorkItemSchedule) => `${value.start} ~ ${value.end}`;
const dateKey = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function ScheduleCalendar({ month, onMonthChange, start, end, onSelect, monthCount = 2, referenceGrid = true }: {
  month: number; onMonthChange: (month: number) => void; start?: string; end?: string; onSelect: (date: string) => void;
  monthCount?: 1 | 2; referenceGrid?: boolean;
}) {
  return <div className={`work-schedule-calendars${monthCount === 1 ? ' is-single' : ''}`}>
    {Array.from({ length: monthCount }, (_, offset) => {
      const date = new Date(2026, month + offset, 1);
      const year = date.getFullYear();
      const monthIndex = date.getMonth();
      // Preserve the two authored demo grids in Figma; other months use their calendar dates.
      const firstDay = referenceGrid && year === 2026 && monthIndex === 2 ? 5 : referenceGrid && year === 2026 && monthIndex === 3 ? 1 : date.getDay();
      const dayCount = new Date(year, monthIndex + 1, 0).getDate();
      return <section className="work-schedule-month" key={offset} aria-label={`${year}年${monthIndex + 1}月`}>
        <header className="work-schedule-month-header">
          <button type="button" aria-label={`${offset ? '右侧' : '左侧'}日历上一年`} onClick={() => onMonthChange(month - 12)}><img src={`${assetRoot}previous-year.svg`} width="20" height="20" alt="" /></button>
          <button type="button" aria-label={`${offset ? '右侧' : '左侧'}日历上个月`} onClick={() => onMonthChange(month - 1)}><img src={`${assetRoot}previous-month.svg`} width="20" height="20" alt="" /></button>
          <span>{year}年{monthIndex + 1}月</span>
          <button type="button" aria-label={`${offset ? '右侧' : '左侧'}日历下个月`} onClick={() => onMonthChange(month + 1)}><img src={`${assetRoot}next-month.svg`} width="20" height="20" alt="" /></button>
          <button type="button" aria-label={`${offset ? '右侧' : '左侧'}日历下一年`} onClick={() => onMonthChange(month + 12)}><img src={`${assetRoot}next-year.svg`} width="20" height="20" alt="" /></button>
        </header>
        <div className="work-schedule-month-body">
          <div className="work-schedule-weekdays" aria-hidden="true">{['日', '一', '二', '三', '四', '五', '六'].map(day => <span key={day}>{day}</span>)}</div>
          <div className="work-schedule-days" role="group" aria-label={monthCount === 1 ? '选择完成日期' : start && !end ? '选择结束日期' : '选择开始日期'}>
            {Array.from({ length: 42 }, (_, cell) => {
              const day = cell - firstDay + 1;
              if (day < 1 || day > dayCount) return <span key={cell} />;
              const key = dateKey(year, monthIndex, day);
              const selected = key === start || key === end;
              const inRange = start && end && key > start && key < end;
              return <button key={cell} type="button" aria-label={key} aria-pressed={selected}
                className={`${referenceGrid && key === '2026-03-06' ? 'is-reference-day ' : ''}${inRange ? 'is-in-range' : ''}`} onClick={() => onSelect(key)}><span>{day}</span></button>;
            })}
          </div>
        </div>
      </section>;
    })}
  </div>;
}

export function WorkItemPlanningPicker(props: PlanningProps) {
  const { field, drawerRef, table } = props;
  const menuId = table ? `${table.id}-menu` : `work-${field}-menu`;
  const reasonsId = table ? `${table.id}-reasons` : `work-${field}-ai-reasons-title`;
  const formatSchedule = table ? formatWorkItemSchedule : scheduleLabel;
  const initialRange = props.field === 'schedule' ? props.value : undefined;
  const initialDate = initialRange?.start;
  const label = { pd: 'PD', schedule: 'Schedule', 'review-team': 'review team', 'finish-date': 'estimate finish time' }[field];
  const isReviewField = field === 'review-team' || field === 'finish-date';
  const [open, setOpen] = useState(Boolean(table));
  const [phase, setPhase] = useState<'picker' | 'loading' | 'suggested'>('picker');
  const [draft, setDraft] = useState(table && props.field === 'pd' ? (props.value ?? '').replace(/PD$/, '') : '');
  const [loadingStep, setLoadingStep] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [acceptHovered, setAcceptHovered] = useState(false);
  const [acceptFocused, setAcceptFocused] = useState(false);
  const [month, setMonth] = useState(initialDate ? (Number(initialDate.slice(0, 4)) - 2026) * 12 + Number(initialDate.slice(5, 7)) - 1 : 2);
  const [rangeStart, setRangeStart] = useState<string | undefined>(initialRange?.start);
  const [rangeEnd, setRangeEnd] = useState<string | undefined>(initialRange?.end);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 320, maxHeight: 56 });
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const returningFocus = useRef(false);
  const titles = loadingTitles[field];
  const menuHeight = phase === 'loading' ? 172 : phase === 'suggested' ? field === 'review-team' ? 341 : 337 : field === 'pd' ? 56 : field === 'review-team' ? 277 : 365;
  const menuWidth = phase === 'picker' ? field === 'schedule' ? 520 : field === 'finish-date' ? 284 : 320 : 398;
  const tablePosition = useWorkItemTableMenu({ open: Boolean(table) && open, anchorRef: table?.anchorRef, menuRef, width: menuWidth, height: menuHeight, onClose: () => closeMenu() });
  const suggestedSchedule = primarySchedule;
  const suggestedTeamId = suggestedReviewTeam(props.reviewContext);
  const selectedTeam = reviewTeam(suggestedTeamId);
  const selectedFinishDate = suggestedFinishDates(props.reviewContext).primary;
  const suggestion = field === 'pd' ? '5PD' : field === 'review-team' ? selectedTeam.name : field === 'finish-date' ? selectedFinishDate.date : formatSchedule(suggestedSchedule);
  const savedValue = props.field === 'schedule' ? props.value ? formatSchedule(props.value) : ''
    : props.field === 'review-team' ? reviewTeam(props.value ?? defaultReviewTeam).name
    : props.field === 'finish-date' ? props.value ?? defaultFinishDate : props.value ?? '';
  const matches = field === 'review-team' && phase === 'picker' ? reviewTeams.filter(team => `${team.name} ${team.description}`.toLowerCase().includes(draft.trim().toLowerCase())) : [];
  const resultReasons = table ? field === 'pd'
    ? [`为“${table.itemTitle}”预留 3 人日实现与 2 人日验证、评审。`, '按当前工作项范围给出初步估算，可结合实际拆分结果调整。']
    : [`为“${table.itemTitle}”安排连续的实施与验收窗口。`, '预留实现、联调和评审时间，便于同步团队排期。']
    : field === 'review-team' ? selectedTeam.reasons : field === 'finish-date' ? selectedFinishDate.reasons : reasons;
  const previewing = open && phase === 'suggested' && (acceptHovered || acceptFocused);

  function clearPreview() { setAcceptHovered(false); setAcceptFocused(false); }
  function openMenu() {
    if (open || returningFocus.current) return;
    clearPreview();
    setDraft(props.field === 'pd' ? (props.value ?? '').replace(/PD$/, '') : '');
    const range = props.field === 'schedule' ? props.value : undefined;
    const date = props.field === 'finish-date' ? props.value ?? defaultFinishDate : range?.start;
    setRangeStart(date); setRangeEnd(range?.end);
    setMonth(date ? (Number(date.slice(0, 4)) - 2026) * 12 + Number(date.slice(5, 7)) - 1 : 2);
    setActiveIndex(-1);
    setPhase('picker'); setOpen(true);
  }
  function closeMenu(restoreFocus = false) {
    clearPreview(); setOpen(false); setDraft(''); setActiveIndex(-1);
    table?.onClose();
    if (restoreFocus) {
      returningFocus.current = true;
      (table?.anchorRef.current ?? inputRef.current)?.focus({ preventScroll: true });
      returningFocus.current = false;
    }
  }
  function finishSelection() { closeMenu(); (table?.anchorRef.current ?? drawerRef.current)?.focus({ preventScroll: true }); }
  function acceptSuggestion() {
    if (props.field === 'pd') props.onChange('5PD');
    else if (props.field === 'schedule') props.onChange(suggestedSchedule);
    else if (props.field === 'review-team') props.onChange(suggestedTeamId);
    else props.onChange(selectedFinishDate.date);
    finishSelection();
  }
  function selectTeam(id: WorkItemReviewTeam) {
    if (props.field !== 'review-team') return;
    props.onChange(id); finishSelection();
  }
  function selectDate(date: string) {
    if (props.field === 'finish-date') { props.onChange(date); finishSelection(); return; }
    if (props.field !== 'schedule') return;
    if (!rangeStart || rangeEnd) { setRangeStart(date); setRangeEnd(undefined); return; }
    props.onChange(date < rangeStart ? { start: date, end: rangeStart } : { start: rangeStart, end: date });
    finishSelection();
  }
  function showSuggestions() {
    clearPreview(); setActiveIndex(-1); setLoadingStep(0); setPhase('loading');
    if (field === 'review-team') setDraft('');
    inputRef.current?.focus({ preventScroll: true });
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); closeMenu(true);
    } else if (event.currentTarget === inputRef.current && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (!open) { openMenu(); return; }
      if (field === 'review-team' && phase === 'picker') {
        if (event.key === 'Enter' && matches[activeIndex]) selectTeam(matches[activeIndex].id);
        else if (event.key === 'Enter') menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        else setActiveIndex(index => !matches.length ? -1 : event.key === 'ArrowDown' ? (index + 1) % matches.length : (index <= 0 ? matches.length : index) - 1);
        return;
      }
      if (field === 'pd' && props.field === 'pd' && phase === 'picker' && event.key === 'Enter' && draft.trim()) {
        if (/^\d+(?:\.\d+)?$/.test(draft.trim()) && Number(draft) > 0) {
          props.onChange(`${Number(draft)}PD`); finishSelection();
        }
      } else menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }
  }

  useEffect(() => { if (table) inputRef.current?.focus({ preventScroll: true }); }, [Boolean(table)]);

  useEffect(() => {
    if (!open || phase !== 'loading') return;
    let cancelled = false;
    const timers = titles.slice(1).map((_, index) => setTimeout(() => { if (!cancelled) setLoadingStep(index + 1); }, (index + 1) * 1500));
    timers.push(setTimeout(() => { if (!cancelled) setPhase('suggested'); }, 6000));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [open, phase, titles]);

  useEffect(() => {
    if (!open || table) return;
    const dismissOutside = (event: Event) => {
      if (!(event.target instanceof Node) || fieldRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false); setDraft(''); setAcceptHovered(false); setAcceptFocused(false);
    };
    document.addEventListener('pointerdown', dismissOutside, { capture: true });
    document.addEventListener('focusin', dismissOutside);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, { capture: true });
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [open, Boolean(table)]);

  useLayoutEffect(() => {
    const fieldNode = fieldRef.current;
    const drawer = drawerRef.current;
    if (!open || table || !fieldNode || !drawer) return;
    const updatePosition = () => {
      const anchor = fieldNode.getBoundingClientRect();
      const bounds = drawer.getBoundingClientRect();
      const scrollBounds = fieldNode.closest('.work-detail-scroll')?.getBoundingClientRect() ?? bounds;
      if (anchor.bottom <= scrollBounds.top || anchor.top >= scrollBounds.bottom) { setOpen(false); return; }
      const maxWidth = Math.min(menuWidth, Math.max(0, bounds.width - 24));
      const anchoredWidth = bounds.width - Math.max(12, anchor.left - bounds.left) - 12;
      // Keep Schedule aligned to its input when there is room for at least one month.
      const width = field === 'schedule' && anchoredWidth >= Math.min(284, maxWidth)
        ? Math.min(maxWidth, anchoredWidth) : maxWidth;
      const below = Math.max(0, bounds.bottom - anchor.bottom - 12);
      const above = Math.max(0, anchor.top - scrollBounds.top - 12);
      const flip = below < menuHeight && above > below;
      const maxHeight = Math.min(menuHeight, flip ? above : below);
      const next = {
        left: Math.max(12, Math.min(anchor.left - bounds.left, bounds.width - width - 12)),
        top: flip ? anchor.top - bounds.top - maxHeight - 4 : anchor.bottom - bounds.top + 4,
        width, maxHeight,
      };
      setPosition(previous => previous.left === next.left && previous.top === next.top && previous.width === next.width && previous.maxHeight === next.maxHeight ? previous : next);
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(drawer); observer.observe(fieldNode);
    drawer.addEventListener('scroll', updatePosition, { capture: true, passive: true });
    window.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      drawer.removeEventListener('scroll', updatePosition, { capture: true });
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, drawerRef, field, menuWidth, menuHeight, Boolean(table)]);

  const value = previewing ? suggestion : open && (field === 'pd' || field === 'review-team') ? draft : savedValue;
  const taggedTeam = props.field === 'review-team' ? previewing ? selectedTeam : !open ? reviewTeam(props.value ?? defaultReviewTeam) : undefined : undefined;
  return <div ref={fieldRef} className={`work-owner-picker work-planning-picker${table ? ' work-table-planning-picker' : ''}${isReviewField ? ' work-review-field' : ''}${open ? ' is-open' : ''}`}>
    <input ref={inputRef} id={table ? `${table.id}-input` : `work-item-${field}`} type="text" role="combobox" aria-label={label} aria-haspopup={field === 'review-team' && phase === 'picker' ? 'listbox' : 'dialog'}
      aria-required={isReviewField || undefined} aria-autocomplete={field === 'review-team' ? 'list' : undefined}
      aria-activedescendant={open && matches[activeIndex] ? `work-review-team-${matches[activeIndex].id}` : undefined}
      aria-expanded={open} aria-controls={open ? field === 'review-team' && phase === 'picker' ? 'work-review-team-options' : menuId : undefined} autoComplete="off" inputMode={field === 'pd' ? 'decimal' : undefined}
      placeholder={field === 'review-team' && open ? '搜索团队' : undefined}
      readOnly={!open || field === 'schedule' || field === 'finish-date' || previewing} value={value} className={taggedTeam ? 'work-owner-input-with-tag' : previewing ? 'work-planning-preview' : undefined}
      onFocus={openMenu} onClick={openMenu} onKeyDown={onKeyDown}
      onChange={event => { clearPreview(); setDraft(event.target.value); setActiveIndex(-1); setPhase('picker'); setOpen(true); }} />
    {taggedTeam && <span className={`work-detail-team-tag work-review-value-tag${previewing ? ' is-preview' : ''}`} style={{ background: taggedTeam.background }} aria-hidden="true">{taggedTeam.name}</span>}
    {!value && !(field === 'review-team' && open) && <span className="work-detail-empty work-owner-placeholder" aria-hidden="true">empty</span>}
    {open && (table || drawerRef.current) && createPortal(<div ref={menuRef} id={menuId} data-work-cell-menu={table?.id} role="dialog" aria-label={phase === 'picker' ? `${label} 选择` : `${label} AI 智能建议`}
      className={`work-owner-menu work-planning-menu${table ? ' work-table-menu' : ''}${isReviewField ? ' work-review-menu' : ''}${phase !== 'picker' ? ' work-owner-ai-menu' : field === 'schedule' || field === 'finish-date' ? ' work-schedule-menu' : field === 'review-team' ? ' work-review-team-menu' : ' work-pd-menu'}`}
      style={table ? tablePosition : { ...position, height: menuHeight }} onKeyDown={onKeyDown}>
      {phase === 'picker' ? <>
        <div className="work-planning-suggestion-row"><button type="button" className="work-owner-suggestion" onClick={showSuggestions}>
          <span className="work-owner-ai-icon"><CodeMLogo size={16} /></span>
          <div><span>{suggestionLabels[field]}</span></div>
        </button></div>
        {field === 'schedule' && <ScheduleCalendar month={month} onMonthChange={setMonth} start={rangeStart} end={rangeEnd} onSelect={selectDate} referenceGrid={!table} />}
        {field === 'finish-date' && <ScheduleCalendar month={month} onMonthChange={setMonth} start={rangeStart} onSelect={selectDate} monthCount={1} referenceGrid={false} />}
        {field === 'review-team' && <>
          <div className="work-owner-separator" />
          <div className="work-review-options" id="work-review-team-options" role="listbox" aria-label="评审团队">
            {matches.map((team, index) => <button key={team.id} id={`work-review-team-${team.id}`} type="button" role="option"
              aria-selected={props.field === 'review-team' && (props.value ?? defaultReviewTeam) === team.id} tabIndex={-1}
              className={`work-review-option${activeIndex === index ? ' is-highlighted' : ''}`} onPointerDown={event => event.preventDefault()} onClick={() => selectTeam(team.id)}>
              <span className="work-detail-team-tag" style={{ background: team.background }}>{team.name}</span>
              {props.field === 'review-team' && (props.value ?? defaultReviewTeam) === team.id && <img src="/assets/figma/work-item-drawer/check-done.svg" width="16" height="16" alt="" />}
            </button>)}
            {!matches.length && <p className="work-owner-no-results">未找到匹配的团队</p>}
          </div>
        </>}
      </> : phase === 'loading' ? renderWorkItemAILoading(titles, loadingStep) : <div key="suggested" className="work-owner-ai-result">
        <div className="work-owner-ai-heading"><CodeMLogo size={12} /><span>AI 智能建议</span></div>
        <div className="work-owner-ai-match work-planning-ai-match" role="status" aria-live="polite">
          <img src={`${aiAssetRoot}recommended.svg`} width="16" height="16" alt="" />
          <span className={field === 'review-team' ? 'work-detail-team-tag' : undefined} style={field === 'review-team' ? { background: selectedTeam.background } : undefined}>{suggestion}</span>
          <span>{field === 'pd' ? 'is the most exact estimate' : field === 'review-team' ? 'is the best fit' : field === 'finish-date' ? 'is a suitable finish date' : 'seems a perfect schedule'}</span>
        </div>
        <div className="work-owner-ai-actions">
          <button type="button" className="work-owner-ai-accept" onClick={acceptSuggestion}
            onPointerEnter={event => { if (event.pointerType !== 'touch') setAcceptHovered(true); }} onPointerLeave={() => setAcceptHovered(false)}
            onFocus={() => setAcceptFocused(true)} onBlur={() => setAcceptFocused(false)}>Accept</button>
          <button type="button" onClick={() => { clearPreview(); setPhase('picker'); inputRef.current?.focus({ preventScroll: true }); }}>Ignore</button>
        </div>
        <div className="work-owner-ai-divider" />
        <section className="work-owner-ai-reasons" aria-labelledby={reasonsId}>
          <h3 id={reasonsId}>{field === 'pd' ? 'Why 5PD' : field === 'review-team' ? 'Why this team was suggested' : field === 'finish-date' ? 'Why this finish date was suggested' : 'Why arrange like this'}</h3>
          <ul>{resultReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        </section>
        <div className="work-owner-ai-divider" />
        <div className="work-owner-ai-chat"><button type="button" onClick={props.onContinueInChat}>Continue in chat</button></div>
      </div>}
    </div>, table ? document.body : drawerRef.current!)}
  </div>;
}
