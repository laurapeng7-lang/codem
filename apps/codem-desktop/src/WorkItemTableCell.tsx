import { useRef, type RefObject } from 'react';
import type { WorkItem } from './work-items-data';
import { WorkItemOwnerPicker, type WorkItemOwner } from './WorkItemOwnerPicker';
import { WorkItemAppPicker } from './WorkItemAppPicker';
import { WorkItemPlanningPicker, formatWorkItemSchedule, type WorkItemSchedule } from './WorkItemPlanningPicker';
import { tablePeople, tableOwnerRecommendations, tableAppName, type WorkItemApp } from './work-item-table-data';
import { renderWorkItemOwnerAvatar } from './work-item-owner-avatar';

type CellProps = {
  id: string; item: WorkItem; selected: boolean; editing: boolean; pageRef: RefObject<HTMLElement | null>;
  onSelect: () => void; onEdit: () => void; onClose: () => void; onDeselect: () => void;
  onContinueInChat: (item: WorkItem, fieldName: string) => void;
} & ({ field: 'app'; value: WorkItemApp[]; onChange: (value: WorkItemApp[]) => void }
  | { field: 'owner' | 'secondary-owner'; value: WorkItemOwner; onChange: (value: WorkItemOwner) => void }
  | { field: 'pd'; value: string; onChange: (value: string) => void }
  | { field: 'schedule'; value?: WorkItemSchedule; onChange: (value: WorkItemSchedule) => void });

export function WorkItemTableCell(props: CellProps) {
  const { id, item, field, selected, editing, pageRef, onSelect, onEdit, onClose, onDeselect } = props;
  const cellRef = useRef<HTMLTableCellElement | null>(null);
  const label = { app: 'APP', owner: 'Owner', 'secondary-owner': 'Owner（右侧）', pd: 'PD', schedule: 'Schedule' }[field];
  const continueInChat = () => props.onContinueInChat(item, field === 'secondary-owner' ? 'Owner' : label);
  const valueLabel = props.field === 'app' ? props.value.map(tableAppName).join(', ')
    : props.field === 'schedule' ? props.value ? formatWorkItemSchedule(props.value) : ''
    : props.field === 'pd' ? props.value.replace(/PD$/, '') : props.value.name;
  return <td ref={cellRef} id={id} className="work-editable-cell" data-work-editable-cell={id} data-cell-selected={selected || undefined} data-cell-editing={editing || undefined}
    tabIndex={0} aria-label={`${item.title}，${label}：${valueLabel || 'empty'}`} aria-keyshortcuts="Enter F2"
    onFocus={event => { if (event.target === event.currentTarget) onSelect(); }}
    onClick={event => { event.stopPropagation(); if (event.currentTarget.contains(event.target as Node)) onSelect(); }}
    onDoubleClick={event => { event.stopPropagation(); if (event.currentTarget.contains(event.target as Node) && !editing) { event.preventDefault(); onEdit(); } }}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); event.stopPropagation(); onEdit(); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (editing) onClose(); else { onDeselect(); event.currentTarget.blur(); } }
    }}>
    {editing ? props.field === 'app'
      ? <WorkItemAppPicker id={id} item={item} value={props.value} anchorRef={cellRef} onChange={props.onChange} onClose={onClose} onContinueInChat={continueInChat} />
      : props.field === 'pd' || props.field === 'schedule'
      ? <WorkItemPlanningPicker {...(props.field === 'pd' ? { field: props.field, value: props.value, onChange: props.onChange } : { field: props.field, value: props.value, onChange: props.onChange })}
          drawerRef={pageRef} table={{ id, anchorRef: cellRef, onClose, itemTitle: item.title }} onContinueInChat={continueInChat} />
      : <WorkItemOwnerPicker owner={props.value} onChange={props.onChange} drawerRef={pageRef} onContinueInChat={continueInChat}
          table={{ id, anchorRef: cellRef, onClose, people: tablePeople, recommendations: tableOwnerRecommendations(item) }} />
      : <div className="work-cell-display">{props.field === 'app'
        ? props.value.length ? <div className="work-app-tags">{props.value.map(app => <span className={`work-tag work-app-${app}`} key={app}>{tableAppName(app)}</span>)}</div> : <span className="work-cell-empty">empty</span>
        : props.field === 'pd' || props.field === 'schedule' ? <span className={valueLabel ? 'work-cell-planning-value' : 'work-cell-empty'} title={valueLabel || undefined}>{valueLabel || 'empty'}</span>
        : <span className="work-owner">{renderWorkItemOwnerAvatar(props.value, 20)}<span>{props.value.name}</span></span>}
      </div>}
    <button type="button" className="work-cell-edit-arrow" aria-label={`编辑第 ${item.id} 行 ${label}`} aria-haspopup="dialog" aria-expanded={editing} tabIndex={-1}
      onClick={event => { event.stopPropagation(); onEdit(); }}>
      <img src="/assets/figma/work-item-table-edit/cell-arrow.svg" width="16" height="16" alt="" draggable="false" />
    </button>
  </td>;
}
