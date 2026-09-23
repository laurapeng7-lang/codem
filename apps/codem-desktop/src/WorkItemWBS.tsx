import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { CodeMLogo } from './CodeMLogo';
import { WorkItemAskCodeM } from './WorkItemAskCodeM';
import { WorkItemWBSAddMenu } from './WorkItemWBSAddMenu';
import { insertWBSChildren, manualWBSChild, wbsChildKinds, type WBSChild, type WBSRow } from './work-item-wbs-children';
import { tablePeople } from './work-item-table-data';
import type { TableMenuAnchorPoint } from './useWorkItemTableMenu';
import type { Application } from './work-item-navigation';
import type { WorkItem } from './work-items-data';
import type { Conversation } from './conversation-history';
import initialRows from './work-item-wbs-data.json';
import './work-item-wbs.css';

const assetRoot = '/assets/figma/work-item-wbs/';
const ownersByName = new Map(tablePeople.map(person => [person.name, person]));
const tabs = ['Info', 'WBS', 'Workflow', 'Activity', 'Comments', 'Issues', 'Gitlab'];

function WBSIcon({ name, size = 16 }: { name: string; size?: number }) {
  const kind = wbsChildKinds.find(kind => `child-${kind.id}` === name);
  if (kind) return <span className="work-wbs-child-icon" style={{ width: size, height: size, background: kind.color }}><img src={`/assets/figma/${kind.asset}`} width={size * .625} height={size * .625} alt="" draggable="false" /></span>;
  return <img src={`${assetRoot}${name}.svg`} width={size} height={size} alt="" draggable="false" />;
}

export function WorkItemWBS({ application, item, onOpenConversation }: {
  application: Application;
  item: WorkItem;
  onOpenConversation: (conversation: Conversation) => void;
}) {
  const [publishedRows, setPublishedRows] = useState(initialRows);
  const [draftRows, setDraftRows] = useState<WBSRow[] | null>(null);
  const [pendingAIRowIds, setPendingAIRowIds] = useState<Set<string>>(() => new Set());
  const editing = draftRows !== null;
  const rows = draftRows ?? publishedRows;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [askOpen, setAskOpen] = useState(false);
  const [addMenu, setAddMenu] = useState<{ rowId: string; point: TableMenuAnchorPoint; version: number } | null>(null);
  const addMenuId = addMenu?.rowId;
  const [notice, setNotice] = useState('');
  const addTriggerRef = useRef<HTMLButtonElement | null>(null);
  const addAnchorRef = useRef<HTMLTableRowElement | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const fullScreenRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const askTriggerRef = useRef<HTMLButtonElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const inlineLayout = useRef({ height: 896, scrollTop: 0, scrollLeft: 0 });
  const closeAsk = useCallback((restoreFocus = true) => {
    setAskOpen(false);
    if (restoreFocus) askTriggerRef.current?.focus({ preventScroll: true });
  }, []);
  const closeAdd = useCallback((restoreFocus = true) => {
    setAddMenu(null);
    if (restoreFocus) addTriggerRef.current?.focus({ preventScroll: true });
  }, []);
  const startEditing = (nextRows = publishedRows) => {
    inlineLayout.current = { height: cardRef.current?.getBoundingClientRect().height ?? 896, scrollTop: tableRef.current?.scrollTop ?? 0, scrollLeft: tableRef.current?.scrollLeft ?? 0 };
    setAskOpen(false);
    setDraftRows(nextRows);
  };
  const finishEditing = (publish: boolean) => {
    if (publish && draftRows) setPublishedRows(draftRows);
    const keptIds = new Set((publish ? rows : publishedRows).map(row => row.id));
    setSelected(current => new Set([...current].filter(id => keptIds.has(id))));
    setAskOpen(false);
    setAddMenu(null);
    setNotice('');
    setDraftRows(null);
    setPendingAIRowIds(new Set());
  };
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2000);
    return () => clearTimeout(timer);
  }, [notice]);
  useLayoutEffect(() => {
    if (tableRef.current) {
      tableRef.current.scrollTop = inlineLayout.current.scrollTop;
      tableRef.current.scrollLeft = inlineLayout.current.scrollLeft;
    }
    if (editing) exitRef.current?.focus({ preventScroll: true });
  }, [editing]);
  useEffect(() => {
    if (!editing) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      editRef.current?.focus({ preventScroll: true });
    };
  }, [editing]);
  useLayoutEffect(() => {
    if (askOpen && !editing) cardRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [askOpen, editing]);
  const children = new Set(rows.filter(row => editing || row.kind !== 'add').map(row => row.parent).filter((id): id is string => Boolean(id)));
  const byId = new Map(rows.map(row => [row.id, row]));
  const visibleRows = rows.filter(row => {
    if (!editing && row.kind === 'add') return false;
    let parent = row.parent;
    while (parent) { if (collapsed.has(parent)) return false; parent = byId.get(parent)?.parent ?? null; }
    return true;
  });
  const selectable = visibleRows.filter(row => row.kind === 'task');
  const allSelected = selectable.length > 0 && selectable.every(row => selected.has(row.id));
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };
  const updateRow = (id: string, field: keyof WBSRow, value: string) => setDraftRows(current => current?.map(row => row.id === id ? { ...row, [field]: value } : row) ?? null);
  const addRow = (row: WBSRow) => {
    const parent = byId.get(row.parent ?? '');
    if (parent) setDraftRows(current => current ? insertWBSChildren(current, row.id, [manualWBSChild(parent, 'task')]) : null);
  };
  const openChildMenu = (row: WBSRow, event: MouseEvent<HTMLTableRowElement>) => {
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    const button = element.querySelector<HTMLButtonElement>('.work-wbs-add');
    const buttonBounds = button?.getBoundingClientRect() ?? bounds;
    addTriggerRef.current = button;
    addAnchorRef.current = element;
    const point = event.detail > 0 ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      : { x: buttonBounds.left - bounds.left, y: buttonBounds.bottom - bounds.top };
    setAskOpen(false);
    setAddMenu(current => ({ rowId: row.id, point, version: (current?.version ?? 0) + 1 }));
  };
  const addAnchor = addMenuId ? byId.get(addMenuId) : undefined;
  const addParent = addAnchor?.parent ? byId.get(addAnchor.parent) : undefined;
  const acceptChildren = (children: WBSChild[], linked = false) => {
    if (!addMenuId || !draftRows || !children.length) return;
    const nextRows = insertWBSChildren(draftRows, addMenuId, children, linked);
    setDraftRows(nextRows);
    if (linked) {
      const addedIds = nextRows.filter(row => !byId.has(row.id)).map(row => row.id);
      setPendingAIRowIds(current => new Set([...current, ...addedIds]));
    }
    if (addParent) setCollapsed(current => { const next = new Set(current); next.delete(addParent.id); return next; });
    closeAdd();
    setNotice(`已添加 ${children.length} 个子级`);
  };
  const textCell = (row: WBSRow, field: 'schedule' | 'owner' | 'dependency' | 'predecessor') => {
    const value = row[field];
    if (editing && row.kind === 'task') return <input aria-label={`${row.name} ${field}`} value={value} onChange={event => updateRow(row.id, field, event.target.value)} />;
    if (!value) return null;
    if (value === '待填') return <span className="work-wbs-placeholder">待填</span>;
    if (field === 'owner') {
      const [name, extra] = value.split('|');
      const person = ownersByName.get(name.trim());
      return <div className="work-wbs-owner"><span>
        {person ? <img src={`/assets/figma/work-item-owner/${person.avatar}`} width="20" height="20" alt="" />
          : <span className="work-wbs-owner-initial" aria-hidden="true">{Array.from(name.trim())[0]?.toUpperCase()}</span>}
        <span>{name}</span>
      </span>{extra && <span className="work-wbs-extra">{extra}</span>}</div>;
    }
    if (field === 'predecessor') return <div className="work-wbs-predecessor"><span title={value.split('|')[0]}>{value.split('|')[0]}</span>{value.includes('|') && <span>{value.split('|')[1]}</span>}</div>;
    return value;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && (addMenuId || askOpen || editing)) {
      event.preventDefault(); event.stopPropagation();
      if (addMenuId) closeAdd(); else if (askOpen) closeAsk(); else finishEditing(false);
    }
    if (event.key === 'Tab' && editing) {
      const focusable = Array.from(fullScreenRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="hidden"]):not([tabindex="-1"]), textarea, [tabindex="0"]') ?? []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  const card = <section ref={cardRef} className={`work-wbs-card${askOpen ? ' has-ask' : ''}`} aria-labelledby="work-wbs-title">
      <header className="work-wbs-header">
        <h3 id="work-wbs-title"><span className="work-wbs-glyph"><WBSIcon name="schedule" size={12} /></span>WBS Schedule</h3>
        <div className="work-wbs-header-actions">{editing ? <><button ref={exitRef} type="button" className="work-wbs-edit" onClick={() => finishEditing(false)}>Exit</button><button type="button" className="work-wbs-publish" onClick={() => finishEditing(true)}>Publish</button></> : <button ref={editRef} type="button" className="work-wbs-edit" onClick={() => startEditing()}>Edit</button>}</div>
      </header>
      <div className="work-wbs-toolbar">
        <div className="work-wbs-tools">
          <div className="work-wbs-ask-anchor">
            <button ref={askTriggerRef} type="button" aria-haspopup="dialog" aria-expanded={askOpen} aria-controls={askOpen ? 'work-wbs-ask-codem' : undefined} onClick={() => setAskOpen(!askOpen)}><CodeMLogo size={18} />Ask CodeM</button>
            {askOpen && <WorkItemAskCodeM application={application} item={item} context="wbs" triggerRef={askTriggerRef} onClose={closeAsk} onOpenConversation={onOpenConversation} />}
          </div>
          <button type="button"><WBSIcon name="filter" size={18} />Filters</button>
          <button type="button"><WBSIcon name="search" size={18} />Search</button>
        </div>
        <div className="work-wbs-view-tools">
          <button type="button">仅显示计划表<WBSIcon name="chevron-down" /></button>
          <i aria-hidden="true" />
          <button type="button"><WBSIcon name="legend" />图例</button>
          <i aria-hidden="true" />
          <button type="button" className="work-wbs-more" aria-label="更多 WBS 操作"><WBSIcon name="more" /></button>
        </div>
      </div>
      <div ref={tableRef} className={`work-wbs-table-scroll${addMenuId ? ' is-scroll-locked' : ''}`} role="region" aria-label="WBS 层级计划表" tabIndex={0}>
        <table className="work-wbs-table">
          <colgroup>{[54, 304, 312, 140, 300, 200].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
          <thead><tr><th scope="col"><input type="checkbox" aria-label="选择全部 WBS 任务" checked={allSelected} ref={input => { if (input) input.indeterminate = !allSelected && selectable.some(row => selected.has(row.id)); }} onChange={() => setSelected(current => { const next = new Set(current); selectable.forEach(row => { if (allSelected) next.delete(row.id); else next.add(row.id); }); return next; })} /></th>{['名称', '计划排期', '负责人', '排期依赖', '前序依赖'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{visibleRows.map(row => <tr key={row.id} className={`${selected.has(row.id) ? 'is-selected ' : ''}work-wbs-row-${row.kind}${row.kind === 'add' && row.name === '添加子级' ? ' is-child-add' : ''}${editing && pendingAIRowIds.has(row.id) ? ' is-ai-added' : ''}`}
            onClick={row.kind === 'add' && row.name === '添加子级' ? event => openChildMenu(row, event) : undefined}>
            <td className="work-wbs-number">{row.kind === 'task' && <input type="checkbox" aria-label={`选择 ${row.name}`} checked={selected.has(row.id)} onChange={() => setSelected(current => toggle(current, row.id))} />}<span>{row.number}</span></td>
            <td className="work-wbs-name">
              <div className="work-wbs-name-content" style={{ '--wbs-indent': `${row.indent * 24}px` } as CSSProperties}>
                {row.kind === 'add' ? <button type="button" className={`work-wbs-add${['97:26152', '97:26179'].includes(row.id) ? '' : ' is-muted'}`}
                  aria-haspopup={row.name === '添加子级' ? 'menu' : undefined} aria-expanded={row.name === '添加子级' ? addMenuId === row.id : undefined} aria-controls={addMenuId === row.id ? 'work-wbs-add-menu' : undefined}
                  onClick={row.name === '添加子级' ? undefined : () => addRow(row)}><WBSIcon name="add" />{row.name}</button> : <>
                  {children.has(row.id) ? <button type="button" className="work-wbs-tree-toggle" aria-label={`${collapsed.has(row.id) ? '展开' : '收起'} ${row.name}`} aria-expanded={!collapsed.has(row.id)} onClick={() => setCollapsed(current => toggle(current, row.id))}><WBSIcon name={collapsed.has(row.id) ? 'chevron-right' : 'tree-down'} size={10} /></button> : <span className="work-wbs-tree-toggle"><WBSIcon name="chevron-right" size={10} /></span>}
                  {row.kind === 'phase' ? <span className={`work-wbs-phase work-wbs-phase-${row.phase}`}>{row.name}</span> : <div className="work-wbs-task-name"><WBSIcon name={row.icon} />{editing ? <input aria-label={`任务名称 ${row.number || row.name}`} value={row.name} onChange={event => updateRow(row.id, 'name', event.target.value)} /> : <span title={row.name}>{row.name}</span>}</div>}
                </>}
              </div>
            </td>
            {(['schedule', 'owner', 'dependency', 'predecessor'] as const).map(field => <td key={field}>{textCell(row, field)}</td>)}
          </tr>)}{visibleRows.length === 0 && <tr><td colSpan={6} className="work-wbs-empty">没有匹配的任务</td></tr>}</tbody>
        </table>
      </div>
    </section>;
  return <section className="work-wbs" aria-label="工作项 WBS" onKeyDown={onKeyDown}>
    <nav className="work-wbs-tabs" aria-label="工作项详情分区">
      {tabs.map(tab => <span key={tab} className={`work-wbs-tab${tab === 'WBS' ? ' is-active' : ''}`} aria-current={tab === 'WBS' ? 'page' : undefined}>
        {tab === 'Gitlab' && <span className="work-wbs-gitlab"><WBSIcon name="gitlab" size={12} /></span>}
        {tab}{tab === 'Comments' && <WBSIcon name="comments-order" />}
      </span>)}
    </nav>
    {editing ? <><div className="work-wbs-placeholder-block" style={{ height: inlineLayout.current.height }} aria-hidden="true" />{createPortal(<div ref={fullScreenRef} className="work-wbs work-wbs-fullscreen" data-work-item-layer={item.id} role="dialog" aria-modal="true" aria-labelledby="work-wbs-title">{card}</div>, document.body)}</> : card}
    {editing && addParent && addMenu && fullScreenRef.current && createPortal(<WorkItemWBSAddMenu key={`${addMenu.rowId}-${addMenu.version}`} parent={addParent} rows={rows} anchorRef={addAnchorRef} anchorPoint={addMenu.point} onClose={closeAdd} onAdd={acceptChildren} />, fullScreenRef.current)}
    {notice && editing && fullScreenRef.current && createPortal(<div className="work-owner-toast" role="status"><img src="/assets/figma/work-item-owner-ai/success.svg" width="16" height="16" alt="" />{notice}</div>, fullScreenRef.current)}
  </section>;
}
