import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useDiscardedSettingsDraft } from './settings-draft-state';
import { reviewChanges, reviewSummary, reviewIcon, reviewValue, type ReviewChangeKind, type ReviewProperty, type SettingsReview } from './settings-review';
import { SettingsChangeCount } from './SettingsChangeCount';
import './settings-review.css';

const assets = '/assets/figma/settings-review/';
const statusLabels = { A: '新增', M: '修改' };
function ReviewIcon({ name, size = 14, className = '' }: { name: string; size?: number; className?: string }) {
  if (name === 'field') return <span className="settings-review-field-icon" style={{ width: size, height: size }}><img src={`${assets}field.svg`} width="12.4" height="10.6649" alt="" draggable="false" /></span>;
  return <img className={className} src={`${assets}${name}.svg`} width={size} height={size} alt="" draggable="false" />;
}
function PropertyValue({ row, side }: { row: ReviewProperty; side: 'before' | 'after' }) {
  const value = row[side];
  return <div className="settings-review-value" title={reviewValue(value)}>
    {row.tags && Array.isArray(value) && value.length ? <span className="settings-review-tags">{value.map((option: string, index: number) => <span key={`${index}:${option}`} className={`settings-review-tag tone-${/^P[012]$/.test(option) ? option.slice(1) : index % 3}`}>{option}</span>)}</span> : reviewValue(value)}
  </div>;
}

export function SettingsReviewPreview({ review, active }: { review: SettingsReview; active: boolean }) {
  const changes = useMemo(() => reviewChanges(review.result.changes), [review.result]);
  const focusedChange = changes.find(({ change }) => change.path === review.path);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ReviewChangeKind[]>(['A', 'M']);
  const [filterOpen, setFilterOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const filter = useRef<HTMLDivElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const discarded = useDiscardedSettingsDraft(review.executionId);
  const filtered = focusedChange ? [focusedChange] : changes.filter(({ change, kind }) => filters.includes(kind) && `${change.title} ${change.path}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const allExpanded = filtered.length > 0 && filtered.every(({ change }) => !collapsed.has(change.path));
  const bulkLabel = allExpanded ? '收起全部' : '展开全部';
  useEffect(() => { if (!active) setFilterOpen(false); }, [active]);
  useEffect(() => {
    if (!filterOpen) return;
    filter.current?.querySelector<HTMLInputElement>('input')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !filter.current?.contains(event.target) && !filterTrigger.current?.contains(event.target)) setFilterOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [filterOpen]);
  const toggle = (path: string) => setCollapsed(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  const toggleAll = () => setCollapsed(current => {
    const next = new Set(current);
    const collapse = filtered.every(({ change }) => !current.has(change.path));
    for (const { change } of filtered) {
      if (collapse) next.add(change.path);
      else next.delete(change.path);
    }
    return next;
  });
  return <div id="artifact-panel-settings-review" role="tabpanel" aria-labelledby="artifact-tab-settings-review" className="settings-review-panel" hidden={!active}>
    <div className="settings-review-layout" data-review-mode={focusedChange ? 'single' : 'all'}>
      {!focusedChange && <div className="settings-review-searchbar">
        <label className="settings-review-search"><ReviewIcon name="search" size={16} /><input type="search" placeholder="Search" aria-label="搜索配置变更" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <span className="settings-review-count" role="status"><SettingsChangeCount {...reviewSummary(filtered)} /></span>
        <div className="settings-review-filter-control">
          <button type="button" className={`settings-review-filter-trigger${filters.length !== 2 ? ' is-filtered' : ''}`} ref={filterTrigger} aria-label="筛选变更类型" aria-expanded={filterOpen} aria-controls="settings-review-filter" onClick={() => setFilterOpen(value => !value)}><ReviewIcon name="filter" size={18} /></button>
          {filterOpen && <div className="settings-review-filter" id="settings-review-filter" ref={filter} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setFilterOpen(false); filterTrigger.current?.focus(); }
          }}>
            {(['A', 'M'] as const).map(kind => <label key={kind}><input type="checkbox" checked={filters.includes(kind)} onChange={() => setFilters(values => values.includes(kind) ? values.filter(value => value !== kind) : [...values, kind])} /><span className={`settings-review-status is-${kind}`}>{kind}</span>{statusLabels[kind]}</label>)}
          </div>}
        </div>
        <button type="button" className="settings-review-toggle-all" aria-label={bulkLabel} title={bulkLabel} aria-controls="settings-review-cards" disabled={!filtered.length} onClick={toggleAll}><img src="/assets/figma/conversation-header/panel.svg" width="18" height="18" alt="" draggable="false" /></button>
      </div>}
      <section className="settings-review-cards" id="settings-review-cards" aria-label="配置变更列表">
        {discarded && <p className="settings-review-withdrawn" role="status">本次草案已撤销，以下保留撤销前的变更记录。</p>}
        {filtered.map(({ change, kind, properties, propertyCount }) => {
          const expanded = !collapsed.has(change.path);
          const cardId = `settings-review-${encodeURIComponent(change.path)}`;
          const breadcrumbs = ['空间', ...change.path.split('/').filter(Boolean)];
          return <article className="settings-review-card" key={change.path} data-review-path={change.path} aria-labelledby={`${cardId}-heading`}>
            <h3 className="settings-review-card-heading">
              <button type="button" id={`${cardId}-heading`} className="settings-review-card-toggle" aria-label={`${expanded ? '收起' : '展开'}${change.title}`} aria-expanded={expanded} aria-controls={`${cardId}-content`} onClick={() => toggle(change.path)}>
                <ReviewIcon name={reviewIcon(change.path)} size={18} />
                <span className="settings-review-card-label">
                  <span className="settings-review-card-title" title={change.title}>{change.title}</span>
                  <span className="settings-review-breadcrumb" aria-label="当前配置路径" title={breadcrumbs.join(' / ')}>{breadcrumbs.map((part, index) => <Fragment key={`${index}:${part}`}>
                    {index > 0 && <ReviewIcon name="chevron-down" className="points-right" size={12} />}
                    <span aria-current={index === breadcrumbs.length - 1 ? 'location' : undefined}>{part}</span>
                  </Fragment>)}</span>
                </span>
                <SettingsChangeCount count={propertyCount} kind={kind} />
                <ReviewIcon name="chevron-down" className={`settings-review-card-chevron${expanded ? '' : ' is-collapsed'}`} />
              </button>
            </h3>
            <div className="settings-review-comparison" id={`${cardId}-content`} hidden={!expanded}>
              <h4>配置属性差异表</h4>
              <div className="settings-review-table-scroll" tabIndex={0} role="region" aria-label={`${change.title}的属性差异`}>
                <div className="settings-review-table-frame"><table className="settings-review-table">
                  <caption className="visually-hidden">{change.title}的配置属性差异</caption>
                  <colgroup><col className="settings-review-property-col" /><col /><col /></colgroup>
                  <thead><tr><th scope="col">属性名称</th><th scope="col">发布前</th><th scope="col">发布后</th></tr></thead>
                  <tbody>{properties.map(row => <tr key={row.path} data-property={row.path}>
                    <th scope="row" title={row.label}><span>{row.label}</span></th>
                    <td className={row.changed ? 'is-before-change' : undefined}><PropertyValue row={row} side="before" /></td>
                    <td className={row.changed ? row.before === undefined ? 'is-after-addition' : 'is-after-change' : undefined}><PropertyValue row={row} side="after" /></td>
                  </tr>)}</tbody>
                </table></div>
              </div>
            </div>
          </article>;
        })}
        {!filtered.length && <p className="settings-review-empty" role="status">{changes.length ? '没有匹配的配置变更' : '暂无配置变更'}</p>}
      </section>
    </div>
  </div>;
}
