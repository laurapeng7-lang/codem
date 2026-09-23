import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { CodeMLogo } from './CodeMLogo';
import { renderWorkItemAILoading } from './work-item-ai-loading';
import { useWorkItemTableMenu, type TableMenuAnchorPoint } from './useWorkItemTableMenu';
import { getWBSChildNumbers, manualWBSChild, suggestWBSChildren, wbsChildKinds, type WBSChild, type WBSRow } from './work-item-wbs-children';

const loadingTitles = ['AI 智能建议', '分析父任务与交付目标', '拆解子级并安排依赖', '生成子任务计划'];

export function WorkItemWBSAddMenu({ parent, rows, anchorRef, anchorPoint, onClose, onAdd }: {
  parent: WBSRow; rows: WBSRow[]; anchorRef: RefObject<HTMLElement | null>; anchorPoint?: TableMenuAnchorPoint;
  onClose: (restoreFocus?: boolean) => void;
  onAdd: (children: WBSChild[], linked?: boolean) => void;
}) {
  const [phase, setPhase] = useState<'menu' | 'loading' | 'suggested'>('menu');
  const [loadingStep, setLoadingStep] = useState(0);
  const [suggestions, setSuggestions] = useState<WBSChild[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(() => new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const accepted = useRef(false);
  const position = useWorkItemTableMenu({ open: true, anchorRef, menuRef, width: phase === 'menu' ? 320 : 398,
    height: phase === 'menu' ? wbsChildKinds.length * 38 + 85 : phase === 'loading' ? 172 : 490,
    onClose: () => onClose(false), scrollContainerSelector: '.work-wbs-table-scroll', anchorPoint });
  useLayoutEffect(() => {
    if (phase === 'menu') menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    else menuRef.current?.focus({ preventScroll: true });
  }, [phase]);
  useEffect(() => {
    if (phase !== 'loading') return;
    let cancelled = false;
    const timers = loadingTitles.slice(1).map((_, index) => setTimeout(() => { if (!cancelled) setLoadingStep(index + 1); }, (index + 1) * 1500));
    timers.push(setTimeout(() => { if (!cancelled) setPhase('suggested'); }, 6000));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [phase]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (phase !== 'menu' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  };
  const apply = (children: WBSChild[], linked = false) => {
    if (accepted.current || !children.length) return;
    accepted.current = true;
    onAdd(children, linked);
  };
  const selectedChildren = suggestions.filter((_, index) => selectedSuggestions.has(index));
  const suggestionNumbers = getWBSChildNumbers(rows, parent, suggestions.length);
  return <div ref={menuRef} id="work-wbs-add-menu" className={`work-owner-menu work-wbs-add-menu${phase === 'menu' ? '' : ' work-owner-ai-menu'}`}
    style={position} tabIndex={-1} role={phase === 'menu' ? 'menu' : 'dialog'} aria-label={phase === 'menu' ? '添加子级' : 'CodeM 子级拆解建议'} onKeyDown={onKeyDown}>
    {phase === 'menu' ? <>
      <button type="button" role="menuitem" className="work-wbs-decompose" aria-label="AI 智能拆解子任务"
        onClick={() => {
          const children = suggestWBSChildren(parent, rows);
          setSuggestions(children);
          setSelectedSuggestions(new Set(children.map((_, index) => index)));
          setLoadingStep(0); setPhase('loading');
        }}>
        <CodeMLogo size={18} /><span className="work-wbs-decompose-copy">AI 智能拆解子任务</span>
      </button>
      <div className="work-wbs-decompose-separator" role="separator" />
      {wbsChildKinds.map((kind, index) => <div key={kind.id} role="none">
        {index === 1 && <p className="work-wbs-add-group">按事项拆解</p>}
        <button type="button" role="menuitem" onClick={() => apply([manualWBSChild(parent, kind.id)])}>
          <span className="work-wbs-child-icon" style={{ background: kind.color }}><img src={`/assets/figma/${kind.asset}`} width="10" height="10" alt="" /></span>{kind.label}
        </button>
      </div>)}
    </> : phase === 'loading' ? renderWorkItemAILoading(loadingTitles, loadingStep) : <div className="work-owner-ai-result">
      <div className="work-owner-ai-heading"><CodeMLogo size={12} /><span>AI 智能建议</span></div>
      <div className="work-owner-ai-match work-wbs-breakdown-summary" role="status" aria-live="polite"><img src="/assets/figma/work-item-owner-ai/recommended.svg" width="16" height="16" alt="" /><span>建议为「{parent.name}」添加 {suggestions.length} 个子级</span></div>
      <ol className="work-wbs-breakdown-list">{suggestions.map((child, index) => <li key={index}>
        <label className="work-wbs-breakdown-option">
          <input type="checkbox" aria-label={`选择 ${child.name}`} checked={selectedSuggestions.has(index)} onChange={event => {
            const checked = event.currentTarget.checked;
            setSelectedSuggestions(current => {
              const next = new Set(current);
              if (checked) next.add(index); else next.delete(index);
              return next;
            });
          }} />
          <span className="work-wbs-breakdown-number" aria-hidden="true">{suggestionNumbers[index]}</span>
          <span className="work-wbs-breakdown-copy"><span>{child.name}</span><small>{child.schedule} · {child.owner}</small></span>
        </label>
      </li>)}</ol>
      <div className="work-owner-ai-actions"><button type="button" className="work-owner-ai-accept" disabled={!selectedChildren.length} onClick={() => apply(selectedChildren, true)}>Accept</button><button type="button" onClick={() => setPhase('menu')}>Ignore</button></div>
      <div className="work-owner-ai-divider" />
      <section className="work-owner-ai-reasons"><h3>拆解依据</h3><ul><li>围绕父任务的交付目标，按准备、执行和验收拆分。</li><li>沿用父任务负责人，在已有排期范围内安排子级。</li><li>子级按完成后开始的顺序衔接，保留现有任务。</li></ul></section>
    </div>}
  </div>;
}
