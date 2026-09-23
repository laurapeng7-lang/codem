import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import assets from './assets.json';
import { loadAdminSettings, moveNavigation, navigationItems, saveAdminSettings, type NavigationId } from './admin-settings';
import { navigationOffset, projectNavigationDrag, reorderDuration, reorderEasing, type NavigationDrag } from './admin-navigation-motion';
import { SettingsSwitch } from './SettingsSwitch';
import './admin.css';

const icon = (name: string) => `/assets/figma/admin/${name}.svg`;
const adminSections = [
  { id: 'organization', label: '组织架构', items: ['成员管理', '团队管理', '集成与同步'] },
  { id: 'interconnect', label: '企业互联', items: ['企业列表', '开放空间'] },
  { id: 'billing', label: '费用中心', items: ['资产与席位', '权益用量', '订单管理', '已购服务'] },
  { id: 'company-settings', label: '企业设置', items: ['企业日历', '企业日历', '企业词库', '企业品牌', '功能设置', '首页配置'] },
  { id: 'analytics', label: '数据报表' },
  { id: 'security', label: '安全合规', items: ['安全设置', '管理员日志', '成员审计日志'] },
  { id: 'recycle', label: '空间回收站' },
  { id: 'plugin-review', label: '插件审核' },
  { id: 'plugin-group', label: '插件审核', items: [] },
];

export function AdminPage({ onExit, notify }: { onExit: () => void; notify: (message: string) => void }) {
  const [settings, setSettings] = useState(loadAdminSettings);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(adminSections.map(item => [item.id, true])));
  const [dragging, setDragging] = useState<NavigationDrag | null>(null);
  const dragSession = useRef<NavigationDrag | null>(null);
  const navigationList = useRef<HTMLDivElement>(null);
  const rowAnimations = useRef<Animation[]>([]);
  const previousPositions = useRef<Map<string, number> | null>(null);
  const [lockedTooltip, setLockedTooltip] = useState<NavigationId | null>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const content = useRef<HTMLElement>(null);
  useEffect(() => { saveAdminSettings(settings); }, [settings]);
  useEffect(() => {
    const dismissTooltip = (event: KeyboardEvent) => { if (event.key === 'Escape') setLockedTooltip(null); };
    document.addEventListener('keydown', dismissTooltip);
    return () => {
      document.removeEventListener('keydown', dismissTooltip);
      rowAnimations.current.forEach(animation => animation.cancel());
    };
  }, []);
  useLayoutEffect(() => {
    const previous = previousPositions.current;
    if (!previous) return;
    previousPositions.current = null;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    rowAnimations.current = Array.from(navigationList.current?.children ?? []).flatMap(child => {
      const row = child as HTMLElement;
      const before = previous.get(row.dataset.adminNavId!);
      const offset = before === undefined ? 0 : before - row.getBoundingClientRect().top;
      return Math.abs(offset) < .5 ? [] : [row.animate([
        { transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' },
      ], { duration: reorderDuration, easing: reorderEasing })];
    });
  }, [settings.navigation, dragging]);
  useEffect(() => {
    if (!drawerOpen) return;
    drawer.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        mobileTrigger.current?.focus();
      } else if (event.key === 'Tab') {
        const buttons = Array.from(drawer.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [drawerOpen]);
  const chooseSection = (label: string) => {
    if (label === '功能设置') { content.current?.scrollTo({ top: 0 }); setDrawerOpen(false); }
    else notify(`${label}页面尚未接入`);
  };
  const capturePositions = () => {
    previousPositions.current = new Map(Array.from(navigationList.current?.children ?? []).map(child => {
      const row = child as HTMLElement;
      return [row.dataset.adminNavId!, row.getBoundingClientRect().top];
    }));
    rowAnimations.current.forEach(animation => animation.cancel());
    rowAnimations.current = [];
  };
  const finishDrag = (commit: boolean) => {
    const drag = dragSession.current;
    if (!drag) return;
    capturePositions();
    if (commit) setSettings(current => moveNavigation(current, current.navigation[drag.from].id, current.navigation[drag.to].id));
    dragSession.current = null;
    setDragging(null);
  };

  return <div className={`admin-page${collapsed ? ' admin-nav-collapsed' : ''}`}>
    <header className="admin-header">
      <button type="button" ref={mobileTrigger} className="admin-mobile-toggle" aria-label="打开管理导航" aria-expanded={drawerOpen} aria-controls="admin-navigation" onClick={() => { setCollapsed(false); setDrawerOpen(true); }}>
        <img src={icon('collapse')} width="20" height="20" alt="" />
      </button>
      <div className="admin-heading-brand">
        <button type="button" className="admin-brand" onClick={onExit} aria-label="返回飞书项目">
          <img src={icon('logo')} width="24" height="24" alt="" /><span>飞书项目</span>
        </button>
        <span className="admin-brand-divider" /><span>企业管理后台</span>
      </div>
    </header>
    <div className="admin-body">
      {drawerOpen && <button type="button" className="admin-scrim" aria-label="关闭管理导航" onClick={() => { setDrawerOpen(false); mobileTrigger.current?.focus(); }} />}
      <aside id="admin-navigation" ref={drawer} className={`admin-sidebar${drawerOpen ? ' is-open' : ''}`} role={drawerOpen ? 'dialog' : undefined} aria-modal={drawerOpen ? true : undefined} aria-label="企业管理导航">
        <nav className="admin-nav-scroll">
          {adminSections.map(section => <div className="admin-nav-section" key={section.id}>
            <button type="button" className="admin-nav-row" title={section.label}
              aria-expanded={section.items ? expanded[section.id] : undefined}
              aria-controls={section.items ? `admin-group-${section.id}` : undefined}
              onClick={() => {
                if (!section.items) { chooseSection(section.label); return; }
                if (collapsed) { setCollapsed(false); setExpanded(current => ({ ...current, [section.id]: true })); }
                else setExpanded(current => ({ ...current, [section.id]: !current[section.id] }));
              }}>
              <img src={icon(section.id)} className="admin-nav-icon" width="20" height="20" alt="" />
              <span className="admin-nav-label">{section.label}</span>
              {section.items && <span className={`admin-nav-chevron${expanded[section.id] ? '' : ' is-closed'}`}><img src={icon('chevron')} width="12" height="12" alt="" /></span>}
            </button>
            {section.items && expanded[section.id] && <div className="admin-nav-children" id={`admin-group-${section.id}`}>
              {section.items.map((label, index) => <button type="button" className="admin-nav-row admin-nav-child" key={`${label}-${index}`}
                aria-current={label === '功能设置' ? 'page' : undefined} onClick={() => chooseSection(label)}>{label}</button>)}
            </div>}
          </div>)}
        </nav>
        <footer className="admin-nav-footer"><button type="button" className="admin-nav-row" aria-label={collapsed ? '展开管理导航' : '收起管理导航'} onClick={() => { setCollapsed(value => !value); setDrawerOpen(false); }}>
          <span className="admin-collapse-icon"><img src={icon('collapse')} width="16" height="16" alt="" /></span>
          <span className="admin-nav-label">{collapsed ? '展开导航' : '收起导航'}</span>
        </button></footer>
      </aside>
      <main className="admin-main" ref={content}>
        <h1>功能设置</h1>
        <div className="admin-settings">
          <section className="admin-setting-card" aria-labelledby="space-settings-title">
            <h2 id="space-settings-title">空间列表展示范围</h2>
            <div className="admin-setting-row"><span className="admin-setting-label">展示无权限空间
              <button type="button" className="admin-info" aria-label="关于展示无权限空间" title="开启后，空间列表也会展示当前成员没有访问权限的空间。"><img src={icon('info')} width="16" height="16" alt="" /></button>
            </span><SettingsSwitch label="展示无权限空间" checked={settings.showUnauthorizedSpaces} onChange={() => setSettings(current => ({ ...current, showUnauthorizedSpaces: !current.showUnauthorizedSpaces }))} /></div>
          </section>
          <section className="admin-setting-card" aria-labelledby="task-settings-title">
            <div className="admin-card-heading"><h2 id="task-settings-title">任务设置</h2><p>勾选后，子任务将同步至 飞书任务中心，所有修改双向同步</p></div>
            <div className="admin-setting-row"><span className="admin-setting-label">子任务同步至飞书任务</span><SettingsSwitch label="子任务同步至飞书任务" checked={settings.syncTasks} onChange={() => setSettings(current => ({ ...current, syncTasks: !current.syncTasks }))} /></div>
          </section>
          <section className="admin-setting-card" aria-labelledby="template-settings-title">
            <div className="admin-card-heading"><h2 id="template-settings-title">模版共享</h2><p>允许企业用户将个人模板共享到飞书项目官方市场，在市场中上架</p></div>
            <div className="admin-setting-row"><span className="admin-setting-label">允许个人上传到飞书项目官方模板市场
              <button type="button" className="admin-info" aria-label="关于模版共享" title="开启后，企业成员可以将个人模板提交到飞书项目官方模板市场。"><img src={icon('info')} width="16" height="16" alt="" /></button>
            </span><SettingsSwitch label="允许个人上传到飞书项目官方模板市场" checked={settings.shareTemplates} onChange={() => setSettings(current => ({ ...current, shareTemplates: !current.shareTemplates }))} /></div>
          </section>
          <section className="admin-setting-card" aria-labelledby="navigation-settings-title">
            <div className="admin-card-heading"><h2 id="navigation-settings-title">主导航入口配置</h2><p>为企业内所有用户配置飞书项目导航功能入口的顺序和显隐</p></div>
            <p id="admin-reorder-help" className="visually-hidden">拖动手柄调整顺序，或聚焦手柄后按上下方向键移动。主页和 CodeM 固定显示。</p>
            <div ref={navigationList} className={`admin-navigation-settings${dragging ? ' is-reordering' : ''}`}>
              {settings.navigation.map((entry, index) => {
                const item = navigationItems.find(option => option.id === entry.id)!;
                const locked = 'locked' in item && item.locked;
                return <div key={entry.id} className={`admin-navigation-setting${dragging?.from === index ? ' is-dragging' : ''}${locked ? ' is-locked' : ''}`} data-admin-nav-id={entry.id}
                  style={{ transform: `translateY(${navigationOffset(index, dragging)}px)` }} tabIndex={locked ? 0 : undefined}
                  aria-describedby={locked ? `admin-fixed-tooltip-${entry.id}` : undefined}
                  onPointerEnter={() => { if (locked && !dragSession.current) setLockedTooltip(entry.id); }}
                  onPointerLeave={event => { if (locked && !event.currentTarget.contains(document.activeElement)) setLockedTooltip(null); }}
                  onFocus={() => { if (locked) setLockedTooltip(entry.id); }}
                  onBlur={event => { if (locked && !event.currentTarget.contains(event.relatedTarget)) setLockedTooltip(null); }}>
                  <button type="button" className="admin-drag-handle" disabled={locked} aria-label={`调整${item.label}顺序`} aria-describedby="admin-reorder-help" title={locked ? undefined : '拖动排序，或按上下方向键移动'}
                    onPointerDown={event => {
                      if (event.button !== 0 || locked || dragSession.current || !navigationList.current) return;
                      event.preventDefault();
                      event.currentTarget.focus();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      rowAnimations.current.forEach(animation => animation.cancel());
                      const rows = navigationList.current.children;
                      const step = (rows[1] as HTMLElement).offsetTop - (rows[0] as HTMLElement).offsetTop;
                      const drag = { pointerId: event.pointerId, from: index, to: index, step, pointerOffset: event.clientY - navigationList.current.getBoundingClientRect().top, delta: 0 };
                      dragSession.current = drag;
                      setDragging(drag);
                      setLockedTooltip(null);
                    }}
                    onPointerMove={event => {
                      const drag = dragSession.current;
                      if (!drag || event.pointerId !== drag.pointerId || !navigationList.current) return;
                      const next = projectNavigationDrag(drag, event.clientY, navigationList.current.getBoundingClientRect().top, settings.navigation.length);
                      dragSession.current = next;
                      setDragging(next);
                    }}
                    onPointerUp={event => { if (event.pointerId === dragSession.current?.pointerId) finishDrag(true); }}
                    onPointerCancel={event => { if (event.pointerId === dragSession.current?.pointerId) finishDrag(false); }}
                    onLostPointerCapture={event => { if (event.pointerId === dragSession.current?.pointerId) finishDrag(false); }}
                    onKeyDown={event => {
                      if (event.key === 'Escape') { finishDrag(false); return; }
                      if (dragSession.current) return;
                      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                      event.preventDefault();
                      const target = settings.navigation[index + (event.key === 'ArrowUp' ? -1 : 1)];
                      if (target && index + (event.key === 'ArrowUp' ? -1 : 1) >= 2) {
                        capturePositions();
                        setSettings(current => moveNavigation(current, entry.id, target.id));
                      }
                    }}>
                    <img src={icon(locked ? 'drag-disabled' : 'drag')} width="16" height="16" alt="" />
                  </button>
                  <span className="admin-entry-icon"><span style={{ background: 'color' in item ? item.color : undefined }}>
                    <img src={assets[item.icon]} width={'color' in item ? 11.25 : 18} height={'color' in item ? 11.25 : 18} alt="" />
                  </span></span>
                  <span className={`admin-entry-label${entry.id === 'agent' ? ' is-english' : ''}`}>{item.label}</span>
                  <SettingsSwitch label={`显示${item.label}`} checked={entry.visible} disabled={locked} onChange={() => setSettings(current => ({ ...current, navigation: current.navigation.map(option => option.id === entry.id ? { ...option, visible: !option.visible } : option) }))} />
                  {locked && <span id={`admin-fixed-tooltip-${entry.id}`} role="tooltip" className={`admin-fixed-tooltip${lockedTooltip === entry.id ? ' is-visible' : ''}`} aria-hidden={lockedTooltip !== entry.id}>飞书项目系统默认启用并置顶，暂不支持修改</span>}
                </div>;
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  </div>;
}
