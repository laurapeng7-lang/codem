import { CodeMLogo } from './CodeMLogo';
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { WorkItem } from './work-items-data';
import { tableAppOptions, tableAppName, tableAppRecommendation, tableAppReasons, type WorkItemApp } from './work-item-table-data';
import { useWorkItemTableMenu } from './useWorkItemTableMenu';
import { renderWorkItemAILoading } from './work-item-ai-loading';

const loadingTitles = ['AI 智能建议', '分析工作项上下文', '匹配应用范围', '生成应用建议'];
const aiRoot = '/assets/figma/work-item-owner-ai/';
export function WorkItemAppPicker({ id, item, value, anchorRef, onChange, onClose, onContinueInChat }: {
  id: string; item: WorkItem; value: WorkItemApp[]; anchorRef: RefObject<HTMLElement | null>;
  onChange: (value: WorkItemApp[]) => void; onClose: () => void; onContinueInChat: () => void;
}) {
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<'list' | 'loading' | 'suggested'>('list');
  const [loadingStep, setLoadingStep] = useState(0);
  const candidate = tableAppRecommendation(item);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuHeight = phase === 'loading' ? 172 : phase === 'suggested' ? 375 : 227;
  const position = useWorkItemTableMenu({ open: true, anchorRef, menuRef, width: phase === 'list' ? 320 : 398, height: menuHeight, onClose });
  const matches = phase === 'list' ? tableAppOptions.filter(option => `${option.id} ${option.name}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const suggested = value.includes(candidate) ? value : [...value, candidate];
  const previewing = phase === 'suggested' && (hovered || focused);
  const clearPreview = () => { setHovered(false); setFocused(false); };
  function startSuggestion() {
    clearPreview(); setQuery(''); setActiveIndex(-1); setLoadingStep(0); setPhase('loading');
    inputRef.current?.focus({ preventScroll: true });
  }
  function toggle(app: WorkItemApp) { onChange(value.includes(app) ? value.filter(current => current !== app) : [...value, app]); }
  function finish() { onClose(); anchorRef.current?.focus({ preventScroll: true }); }
  function onKeyDown(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
    else if (event.currentTarget === inputRef.current && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (phase === 'suggested') { menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); return; }
      if (phase !== 'list') return;
      if (event.key === 'Enter') { if (matches[activeIndex]) toggle(matches[activeIndex].id); }
      else setActiveIndex(index => !matches.length ? -1 : event.key === 'ArrowDown' ? (index + 1) % matches.length : (index <= 0 ? matches.length : index) - 1);
    }
  }
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (phase !== 'loading') return;
    let cancelled = false;
    const timers = loadingTitles.slice(1).map((_, index) => setTimeout(() => { if (!cancelled) setLoadingStep(index + 1); }, (index + 1) * 1500));
    timers.push(setTimeout(() => { if (!cancelled) setPhase('suggested'); }, 6000));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [phase]);
  return <div className="work-owner-picker work-table-app-picker">
    <input ref={inputRef} id={`${id}-input`} role="combobox" aria-label="APP" aria-expanded="true" aria-controls={phase === 'list' ? `${id}-options` : `${id}-menu`} aria-autocomplete="list" aria-haspopup={phase === 'list' ? 'listbox' : 'dialog'}
      aria-activedescendant={matches[activeIndex] ? `${id}-${matches[activeIndex].id}` : undefined} autoComplete="off" placeholder="搜索应用" value={query} readOnly={previewing}
      className={previewing ? 'work-owner-input-with-tag' : undefined} onKeyDown={onKeyDown}
      onChange={event => { clearPreview(); setQuery(event.target.value); setPhase('list'); setActiveIndex(-1); }} />
    {previewing && <span className="work-app-tags work-table-app-preview" aria-hidden="true">{suggested.map(app => <span className={`work-tag work-app-${app}`} key={app}>{tableAppName(app)}</span>)}</span>}
    {createPortal(<div ref={menuRef} id={`${id}-menu`} data-work-cell-menu={id} className={`work-owner-menu work-table-menu${phase !== 'list' ? ' work-owner-ai-menu' : ' work-table-app-menu'}`} style={position} onKeyDown={onKeyDown}
      role={phase === 'list' ? undefined : 'dialog'} aria-label={phase === 'list' ? undefined : 'APP AI 智能建议'}>
      {phase === 'list' ? <div className="work-owner-panel">
        <button type="button" className="work-owner-suggestion" onClick={startSuggestion}>
          <span className="work-owner-ai-icon"><CodeMLogo size={16} /></span>
          <div><span>AI 智能推荐应用</span></div>
        </button>
        <div className="work-owner-separator" />
        <div role="listbox" id={`${id}-options`} aria-label="可选应用" aria-multiselectable="true" className="work-owner-options">
          {matches.map((option, index) => <button key={option.id} type="button" role="option" id={`${id}-${option.id}`} aria-selected={value.includes(option.id)} tabIndex={-1}
            className={`work-owner-option work-table-app-option${activeIndex === index ? ' is-highlighted' : ''}`} onPointerDown={event => event.preventDefault()} onClick={() => toggle(option.id)}>
            <span className={`work-tag work-app-${option.id}`}>{option.name}</span>
            <img src={`/assets/figma/work-item-drawer/${value.includes(option.id) ? 'check-done' : 'check-empty'}.svg`} width="16" height="16" alt="" />
          </button>)}
          {!matches.length && <p className="work-owner-no-results">未找到匹配的应用</p>}
        </div>
      </div> : phase === 'loading' ? renderWorkItemAILoading(loadingTitles, loadingStep) : <div className="work-owner-ai-result">
        <div className="work-owner-ai-heading"><CodeMLogo size={12} /><span>AI 智能建议</span></div>
        <div className="work-owner-ai-match" role="status" aria-live="polite"><img src={`${aiRoot}recommended.svg`} width="16" height="16" alt="" /><span className={`work-tag work-app-${candidate}`}>{tableAppName(candidate)}</span><span>is the best match</span></div>
        <p className="work-role-ai-note">接受后保留已选应用，添加推荐应用</p>
        <div className="work-owner-ai-actions"><button type="button" className="work-owner-ai-accept" onClick={() => { onChange(suggested); finish(); }}
          onPointerEnter={event => { if (event.pointerType !== 'touch') setHovered(true); }} onPointerLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>Accept</button>
          <button type="button" onClick={() => { clearPreview(); setPhase('list'); inputRef.current?.focus({ preventScroll: true }); }}>Ignore</button></div>
        <div className="work-owner-ai-divider" />
        <section className="work-owner-ai-reasons" aria-labelledby={`${id}-reasons`}><h3 id={`${id}-reasons`}>Why this application was suggested</h3><ul>{tableAppReasons(item, candidate).map(reason => <li key={reason}>{reason}</li>)}</ul></section>
        <div className="work-owner-ai-divider" />
        <div className="work-owner-ai-chat"><button type="button" onClick={onContinueInChat}>Continue in chat</button></div>
      </div>}
    </div>, document.body)}
  </div>;
}
