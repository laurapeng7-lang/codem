import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useWorkItemTableMenu } from './useWorkItemTableMenu';
import './settings-basic.css';

const assets = '/assets/figma/settings-basic/';
const initialApprovers = [
  { id: 'li-tiantian', name: '李天天', email: 'fourthquarter@163.com', avatar: 'approver-li-tiantian.png' },
  { id: 'li-mei', name: '李梅', email: 'antinuclear@outlook.com', avatar: 'approver-li-mei.png' },
];
const timezones = ['(GMT+08:00) 中国标准时间-北京', '(GMT+09:00) 日本标准时间-东京', '(GMT+00:00) 协调世界时'];
const dataActions = [
  { title: '导入数据', description: <>可将 <span className="settings-basic-latin">Jira</span> 或其他平台数据快速迁移至本空间</>, action: '导入' },
  { title: '数据回收站', description: '管理空间内已删除的工作项数据，支持恢复和彻底删除', action: '管理' },
  { title: '分享空间配置', description: '可将本空间的配置数据分享给其他用户使用', action: '分享' },
  { title: '上传为模板', description: '可将本空间的配置数据分享给其他用户使用', action: '分享', icon: 'template.svg' },
  { title: '删除空间', description: '删除后，该空间的所有数据将不可访问，且不可恢复', action: '删除', danger: true },
];

function BasicIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <img src={`${assets}${name}`} alt="" width={size} height={size} draggable="false" />;
}

function BasicGroup({ id, title, children, className = '' }: { id: string; title: string; children: ReactNode; className?: string }) {
  return <section className={`settings-basic-group ${className}`} aria-labelledby={`settings-basic-${id}-title`}>
    <h3 id={`settings-basic-${id}-title`}><span aria-hidden="true" />{title}</h3>
    {children}
  </section>;
}

type MenuOption = { label: string; selected?: boolean; onSelect: () => void };
type Popup = { label: string; trigger: HTMLButtonElement; options: MenuOption[]; width?: number };

function BasicMenu({ popup, onClose }: { popup: Popup; onClose: () => void }) {
  const anchor = useRef<HTMLElement>(popup.trigger);
  const menu = useRef<HTMLDivElement>(null);
  const position = useWorkItemTableMenu({ open: true, anchorRef: anchor, menuRef: menu, width: popup.width ?? 192, height: popup.options.length * 36 + 12, scrollContainerSelector: '.settings-basic-panel', onClose });
  const close = () => { onClose(); popup.trigger.focus({ preventScroll: true }); };
  useLayoutEffect(() => { menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], [role^="menuitem"]')?.focus({ preventScroll: true }); }, []);
  return createPortal(<div ref={menu} id="settings-basic-menu" role="menu" aria-label={popup.label} className="settings-basic-menu" style={position} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') onClose();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? []);
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>{popup.options.map(option => <button type="button" key={option.label} role={option.selected === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={option.selected} onClick={() => { option.onSelect(); close(); }}>{option.label}</button>)}</div>, document.body);
}

export function SettingsBasicInfo({ active, notify }: { active: boolean; notify: (message: string) => void }) {
  const [name, setName] = useState('test');
  const [approvers, setApprovers] = useState(initialApprovers);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [languageManagement, setLanguageManagement] = useState(false);
  const [translationHint, setTranslationHint] = useState(false);
  const [timezone, setTimezone] = useState(timezones[0]);
  const [businessQuery, setBusinessQuery] = useState('');
  const [businessLines, setBusinessLines] = useState([{ id: 'message', name: 'Message', color: 'red' }, { id: 'video', name: 'Video', color: 'pink' }]);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState('');
  const [popup, setPopup] = useState<Popup | null>(null);
  const lineInput = useRef<HTMLInputElement>(null);
  const nextLineId = useRef(0);
  useEffect(() => { if (!active) setPopup(null); }, [active]);
  useLayoutEffect(() => { if (editingLine) lineInput.current?.focus(); }, [editingLine]);
  const availableApprovers = initialApprovers.filter(person => !approvers.some(item => item.id === person.id));
  const visibleApprovers = approvers.filter(person => person.name.toLowerCase().includes(peopleQuery.trim().toLowerCase()));
  const visibleLines = businessLines.filter(line => line.name.toLowerCase().includes(businessQuery.trim().toLowerCase()));
  const openMenu = (trigger: HTMLButtonElement, label: string, options: MenuOption[], width?: number) => setPopup({ trigger, label, options, width });
  const beginLineEdit = (id: string, value: string) => { setEditingLine(id); setLineDraft(value); };
  const finishLineEdit = (save: boolean) => {
    if (save && lineDraft.trim()) setBusinessLines(lines => lines.map(line => line.id === editingLine ? { ...line, name: lineDraft.trim() } : line));
    setEditingLine(null);
  };
  const pending = (label: string) => notify(`${label}暂未接入`);

  return <section id="settings-basic-panel" role="tabpanel" aria-labelledby="settings-basic-tab" className="settings-basic-panel" hidden={!active}>
    <div className="settings-basic-content" data-figma-node="171:6460">
      <BasicGroup id="identity" title="基础信息" className="settings-basic-identity">
        <div className="settings-basic-field settings-basic-name-field">
          <label htmlFor="settings-basic-space-name">空间名称<BasicIcon name="required.svg" size={7} /></label>
          <input id="settings-basic-space-name" className="settings-basic-input settings-basic-latin" value={name} required maxLength={80} onChange={event => setName(event.target.value)} onBlur={() => { if (!name.trim()) setName('test'); }} />
        </div>
        <div className="settings-basic-field">
          <span className="settings-basic-field-label">空间图标<BasicIcon name="required.svg" size={7} /></span>
          <img className="settings-basic-space-icon" src={`${assets}space-icon.png`} width="72" height="72" alt="空间图标 A" draggable="false" />
        </div>
      </BasicGroup>

      <BasicGroup id="access" title="空间访问设置">
        <div className="settings-basic-form-width settings-basic-access">
          <div className="settings-basic-row">
            <div className="settings-basic-approver-label"><span>访问申请审批人（共 <span className="settings-basic-latin">{approvers.length}</span> 人）</span><span title="负责审批加入本空间的访问申请"><BasicIcon name="info.svg" /></span></div>
            <button type="button" className="settings-basic-button" aria-haspopup="menu" onClick={event => {
              if (!availableApprovers.length) { notify('当前可选审批人均已添加'); return; }
              openMenu(event.currentTarget, '添加审批人', availableApprovers.map(person => ({ label: person.name, onSelect: () => setApprovers(current => [...current, person]) })));
            }}>添加</button>
          </div>
          <div className="settings-basic-people">
            <label className="settings-basic-search"><BasicIcon name="search.svg" /><input aria-label="按姓名搜索" placeholder="按姓名搜索" value={peopleQuery} onChange={event => setPeopleQuery(event.target.value)} /></label>
            {visibleApprovers.map(person => <div className="settings-basic-person" key={person.id}>
              <span className="settings-basic-person-name"><img src={`${assets}${person.avatar}`} alt="" width="20" height="20" /><span>{person.name}</span></span>
              <span className="settings-basic-person-email settings-basic-latin">{person.email}</span>
              <button type="button" className="settings-basic-icon-button" aria-label={`${person.name}的更多操作`} aria-haspopup="menu" onClick={event => openMenu(event.currentTarget, `${person.name}的更多操作`, [{ label: '移除审批人', onSelect: () => setApprovers(current => current.filter(item => item.id !== person.id)) }])}><BasicIcon name="more.svg" /></button>
            </div>)}
            {!visibleApprovers.length && <p className="settings-basic-empty">{peopleQuery ? '未找到匹配的审批人' : '暂无审批人'}</p>}
          </div>
        </div>
      </BasicGroup>

      <BasicGroup id="navigation" title="导航配置">
        <div className="settings-basic-form-width settings-basic-row">
          <div className="settings-basic-copy"><h4>导航功能配置</h4><p>配置在导航上显示的功能及排列顺序，对空间所有成员生效</p></div>
          <button type="button" className="settings-basic-button" aria-label="配置导航功能" onClick={() => pending('导航功能配置')}>配置</button>
        </div>
      </BasicGroup>

      <BasicGroup id="language" title="语言配置">
        <div className="settings-basic-check-field">
          <label className="settings-basic-checkbox"><input type="checkbox" checked={languageManagement} onChange={event => setLanguageManagement(event.target.checked)} /><span>语言管理</span></label>
          <p>启用多语言设置，即可为自定义内容设置多语言版本 <button type="button" className="settings-basic-text-button" onClick={() => notify('启用语言管理后，可以为自定义内容维护不同语言的版本。')}>查看功能说明</button></p>
        </div>
        <div className="settings-basic-language-detail">
          <div className="settings-basic-row settings-basic-language-row">
            <div className="settings-basic-copy"><h4>启用的语言种类</h4><div className="settings-basic-language-progress">
              <span>简体中文 <BasicIcon name="progress-partial.svg" /><span className="settings-basic-latin">43%</span></span>
              <span>English <BasicIcon name="progress-complete.svg" /><span className="settings-basic-latin">100%</span></span>
              <span>日本语 <BasicIcon name="progress-complete.svg" /><span className="settings-basic-latin">100%</span></span>
            </div></div>
            <button type="button" className="settings-basic-button" aria-label="配置语言种类" onClick={() => pending('语言种类配置')}>配置</button>
          </div>
          <div className="settings-basic-check-field">
            <label className="settings-basic-checkbox"><input type="checkbox" checked={translationHint} onChange={event => setTranslationHint(event.target.checked)} /><span>翻译填写提示</span></label>
            <p>当文案翻译为空时进行提示</p>
          </div>
        </div>
      </BasicGroup>

      <BasicGroup id="timezone" title="基准时区">
        <div className="settings-basic-form-width settings-basic-field">
          <p className="settings-basic-muted">该时区为本空间的标准时区，所有日期和时间以此为基准进行计算和展示。<button type="button" className="settings-basic-text-button" onClick={() => notify('基准时区用于统一空间内日期和时间的计算与展示。')}>了解详情</button></p>
          <button type="button" className="settings-basic-select" aria-label="基准时区" aria-haspopup="menu" aria-expanded={popup?.label === '选择基准时区'} aria-controls={popup?.label === '选择基准时区' ? 'settings-basic-menu' : undefined} onClick={event => openMenu(event.currentTarget, '选择基准时区', timezones.map(value => ({ label: value, selected: timezone === value, onSelect: () => setTimezone(value) })), 360)}>
            <span>{timezone}</span><BasicIcon name="select-chevron.svg" size={12} />
          </button>
        </div>
      </BasicGroup>

      <BasicGroup id="business" title="业务线配置">
        <div className="settings-basic-form-width settings-basic-business">
          <label className="settings-basic-search"><BasicIcon name="search.svg" /><input aria-label="搜索业务线名称" placeholder="搜索业务线名称" value={businessQuery} onChange={event => setBusinessQuery(event.target.value)} /></label>
          <div className="settings-basic-business-list">
            {visibleLines.map((line, index) => <div className="settings-basic-business-row" key={line.id}>
              <button type="button" className="settings-basic-icon-button" aria-label={`调整 ${line.name} 的顺序`} aria-haspopup="menu" onClick={event => openMenu(event.currentTarget, '调整业务线顺序', [{ label: '向上移动', onSelect: () => setBusinessLines(current => { const next = [...current]; const position = next.findIndex(item => item.id === line.id); if (position > 0) [next[position - 1], next[position]] = [next[position], next[position - 1]]; return next; }) }, { label: '向下移动', onSelect: () => setBusinessLines(current => { const next = [...current]; const position = next.findIndex(item => item.id === line.id); if (position < next.length - 1) [next[position], next[position + 1]] = [next[position + 1], next[position]]; return next; }) }])}><BasicIcon name="handle.svg" /></button>
              <span className="settings-basic-tree-arrow"><BasicIcon name={index === 0 ? 'tree-triangle.svg' : 'tree-triangle-muted.svg'} /></span>
              <div className="settings-basic-business-name">{editingLine === line.id ? <input ref={lineInput} aria-label="业务线名称" className="settings-basic-input" value={lineDraft} onChange={event => setLineDraft(event.target.value)} onBlur={() => finishLineEdit(true)} onKeyDown={event => { if (event.key === 'Enter') finishLineEdit(true); else if (event.key === 'Escape') finishLineEdit(false); }} /> : <span className={`settings-basic-tag is-${line.color}`}>{line.name}</span>}</div>
              <div className="settings-basic-business-actions">
                <button type="button" className="settings-basic-icon-button" aria-label={`更改 ${line.name} 的颜色`} aria-haspopup="menu" onClick={event => openMenu(event.currentTarget, '业务线颜色', ['red', 'pink'].map((color, colorIndex) => ({ label: colorIndex === 0 ? '红色' : '粉色', selected: line.color === color, onSelect: () => setBusinessLines(current => current.map(item => item.id === line.id ? { ...item, color } : item)) })))}><span className={`settings-basic-color is-${line.color}`}><BasicIcon name="color-chevron.svg" size={12} /></span></button>
                <button type="button" className="settings-basic-icon-button" aria-label={`编辑业务线 ${line.name}`} onClick={() => beginLineEdit(line.id, line.name)}><BasicIcon name="setting.svg" /></button>
                <button type="button" className="settings-basic-icon-button" aria-label={`${line.name}的更多操作`} aria-haspopup="menu" onClick={event => openMenu(event.currentTarget, `${line.name}的更多操作`, [{ label: '移除业务线', onSelect: () => setBusinessLines(current => current.filter(item => item.id !== line.id)) }])}><BasicIcon name="more.svg" /></button>
              </div>
            </div>)}
            {!visibleLines.length && <p className="settings-basic-empty">未找到匹配的业务线</p>}
            <button type="button" className="settings-basic-add-line" onClick={() => { const id = `business-${nextLineId.current++}`; setBusinessQuery(''); setBusinessLines(current => [...current, { id, name: '新业务线', color: 'red' }]); beginLineEdit(id, '新业务线'); }}><BasicIcon name="plus.svg" /><span>添加业务线</span></button>
          </div>
        </div>
      </BasicGroup>

      <BasicGroup id="data" title="数据管理">
        <div className="settings-basic-form-width settings-basic-data-actions">{dataActions.map(item => <div className="settings-basic-row" key={item.title}>
          <div className="settings-basic-copy"><h4>{item.icon && <BasicIcon name={item.icon} />}{item.title}</h4><p>{item.description}</p></div>
          <button type="button" className={`settings-basic-button${item.danger ? ' is-danger' : ''}`} aria-label={item.title} onClick={() => pending(item.title)}>{item.action}</button>
        </div>)}</div>
      </BasicGroup>
    </div>
    {active && popup && <BasicMenu key={popup.label} popup={popup} onClose={() => setPopup(null)} />}
  </section>;
}
