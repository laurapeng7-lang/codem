import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import assets from './assets.json';
import { cloudEnvironment, type ConversationEnvironment } from './conversation-history';
import { codeMSpaces, resolveCodeMSpace } from './codem-spaces';
import { useWorkItemTableMenu } from './useWorkItemTableMenu';
import { IntelligenceSlider, type IntelligenceLevel } from './IntelligenceSlider';

const iconRoot = '/assets/figma/new-chat-composer/';
export function NewChatIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <img src={`${iconRoot}${name}.svg`} width={size} height={size} alt="" draggable="false" />;
}

export const newChatDevices = [
  { name: 'MacBook Pro', online: true, projects: ['codem-shell', 'light-app-database', 'lark-mind-skill', 'lark-mind-app', 'todo-ai-note'] },
  { name: 'Mac Mini', online: true, projects: ['meego-api', 'workflow-worker', 'design-system', 'integration-tests', 'release-tools'] },
  { name: 'DC’s MacBook Air', online: false, projects: [] },
];
const devices = newChatDevices;
type Environment = ConversationEnvironment;
const approvalOptions = [
  { label: 'Ask for approval', icon: 'ask-approve', description: 'Always ask before editing files or using the internet' },
  { label: 'Approve for me', icon: 'approve', description: 'Only ask for actions that may be unsafe' },
  { label: 'Full access', icon: 'full-access', description: 'Unrestricted access to files and the internet' },
];
type ToolbarMenu = 'add' | 'cloud' | 'space' | 'approval' | 'intelligence';
type MenuOption = { label: string; icon: string; description?: string; selected?: boolean; separator?: boolean; device?: string; disabled?: boolean; action: () => void };

function MenuIcon({ name, size = 20 }: { name: string; size?: number }) {
  const source = name.startsWith('/') ? name : name === 'chat' ? '/assets/figma/work-item-drawer/chat.svg' : `/assets/figma/new-chat-menus/${name}.svg`;
  return <img className={name === 'device' || name === 'chat' ? 'new-chat-compact-icon' : undefined} src={source} width={size} height={size} alt="" draggable="false" />;
}

function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
    .filter(option => !option.disabled && option.closest('[role="menu"]') === event.currentTarget);
  const index = options.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
    : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  options[next]?.focus({ preventScroll: true });
}

function DeviceSubmenu({ device, projects, environment, anchorRef, parentPosition, placement, onBack, onSelect, onNewProject }: {
  device: string; projects: string[]; environment: Environment; anchorRef: RefObject<HTMLButtonElement | null>;
  parentPosition: { left: number; top: number; width: number; maxHeight: number };
  placement: 'top' | 'bottom';
  onBack: () => void; onSelect: (project: string | null) => void; onNewProject: () => void;
}) {
  const submenuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 240, maxHeight: 266, stacked: false });
  useLayoutEffect(() => {
    // The parent DOM is mounted before this effect, but its React ref may attach later.
    const parentMenu = submenuRef.current?.parentElement;
    const update = () => {
      const parent = parentMenu?.getBoundingClientRect();
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!parent || !anchor) return;
      const width = Math.min(240, window.innerWidth - 24);
      const right = parent.right;
      const left = parent.left - width;
      const stacked = right + width > window.innerWidth - 12 && left < 12;
      const height = 96 + projects.length * 34 + (stacked ? 34 : 0);
      // Keep both levels on the same side of the toolbar, scrolling long lists as needed.
      const top = placement === 'bottom' ? Math.max(12, parent.top) : 12;
      const bottom = placement === 'bottom' ? window.innerHeight - 12 : Math.min(window.innerHeight - 12, parent.bottom);
      const maxHeight = Math.min(height, Math.max(0, bottom - top));
      setPosition({ width, maxHeight, stacked,
        left: right + width <= window.innerWidth - 12 ? right : left >= 12 ? left : Math.max(12, Math.min(parent.left, window.innerWidth - width - 12)),
        top: Math.max(top, Math.min(anchor.top - 4, bottom - maxHeight)) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { capture: true, passive: true });
    const observer = new ResizeObserver(update);
    if (parentMenu) observer.observe(parentMenu);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, { capture: true });
    };
  }, [device, projects.length, anchorRef, parentPosition.left, parentPosition.top, parentPosition.width, parentPosition.maxHeight, placement]);
  useLayoutEffect(() => {
    const selected = submenuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (selected ?? submenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]'))?.focus({ preventScroll: true });
  }, [device]);
  const options: MenuOption[] = [
    { label: 'Chat mode', icon: 'chat', selected: environment.device === device && environment.project === null, action: () => onSelect(null) },
    ...projects.map((name, index) => ({ label: name, icon: 'folder', separator: index === 0,
      selected: environment.device === device && environment.project === name, action: () => onSelect(name) })),
    { label: 'New project', icon: 'add-project', separator: true, action: onNewProject },
  ];
  return <div ref={submenuRef} id="new-chat-device-menu" role="menu" aria-label={`${device} 项目`}
    className="new-chat-select-menu new-chat-device-menu" style={{ position: 'fixed', left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}
    onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'ArrowLeft') {
        event.preventDefault(); event.stopPropagation(); onBack();
      } else navigateMenu(event);
    }}>
    {position.stacked && <button type="button" role="menuitem" className="new-chat-menu-back" aria-label="返回设备列表" tabIndex={-1} onClick={onBack}>
      <img src="/assets/figma/codem-navigation/back.svg" width="20" height="20" alt="" /><span>{device}</span>
    </button>}
    {options.map(option => <Fragment key={option.label}>
      {option.separator && <div className="new-chat-menu-divider" role="separator" />}
      <button type="button" role={option.selected === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={option.selected}
        tabIndex={-1} onClick={option.action}><MenuIcon name={option.icon} /><span>{option.label}</span></button>
    </Fragment>)}
  </div>;
}

export function NewChatToolbar({ children, onAttach, onMention, onSkill, onMenuOpen, notify, initialEnvironment = cloudEnvironment, onEnvironmentChange, scrollContainerSelector = '.chat-panel', menuPlacement = 'top', menuRef: externalMenuRef, workItemLayerId, externalMenuOpen = false, mentionLabel = '引用项目' }: {
  children: ReactNode; onAttach: () => void; onMention: () => void; onSkill: () => void; onMenuOpen: () => void; notify: (message: string) => void;
  scrollContainerSelector?: string;
  menuPlacement?: 'top' | 'bottom';
  initialEnvironment?: Environment;
  onEnvironmentChange?: (environment: Environment) => void;
  menuRef?: RefObject<HTMLDivElement | null>;
  workItemLayerId?: number;
  externalMenuOpen?: boolean;
  mentionLabel?: string;
}) {
  const [menu, setMenu] = useState<ToolbarMenu | null>(null);
  const [plan, setPlan] = useState(false);
  const [environment, setEnvironment] = useState<Environment>(initialEnvironment);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [deviceProjects, setDeviceProjects] = useState<Record<string, string[]>>(() => Object.fromEntries(devices.filter(device => device.online).map(({ name: device, projects }) => [device,
    initialEnvironment.device === device && initialEnvironment.project && !projects.includes(initialEnvironment.project)
      ? [...projects, initialEnvironment.project] : projects])));
  const selectEnvironment = (next: Environment) => {
    const selection = environment.spaceId ? { ...next, spaceId: next.spaceId ?? environment.spaceId } : next;
    setEnvironment(selection); onEnvironmentChange?.(selection);
  };
  const space = resolveCodeMSpace(environment.spaceId);
  const project = environment.device ? environment.project ?? 'Chat mode' : 'Cloud';
  const environmentLabel = environment.device ? `${environment.device} · ${project}` : 'Cloud';
  const selectedFolderDevice = environment.project
    ? devices.find(device => device.name === environment.device && device.online)?.name ?? null : null;
  const [approval, setApproval] = useState(approvalOptions[1]);
  const [approvalMenuHeight, setApprovalMenuHeight] = useState(208);
  const [intelligence, setIntelligence] = useState<IntelligenceLevel>('High');
  const [draftIntelligence, setDraftIntelligence] = useState<IntelligenceLevel>(intelligence);
  const intelligenceDraft = useRef(intelligence);
  const changeMenu = (next: ToolbarMenu | null) => {
    // As in codem-app, preview while adjusting and commit when the popover closes.
    if (menu === 'intelligence' && next !== menu) setIntelligence(intelligenceDraft.current);
    if (next === 'intelligence' && menu !== next) {
      intelligenceDraft.current = intelligence;
      setDraftIntelligence(intelligence);
    }
    setMenu(next);
  };
  const toolbar = useRef<HTMLDivElement>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const cloudTrigger = useRef<HTMLButtonElement>(null);
  const spaceTrigger = useRef<HTMLButtonElement>(null);
  const approvalTrigger = useRef<HTMLButtonElement>(null);
  const intelligenceTrigger = useRef<HTMLButtonElement>(null);
  const localMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = externalMenuRef ?? localMenuRef;
  const deviceTrigger = useRef<HTMLButtonElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const folderDevice = useRef<string | null>(null);
  const focusOnOpen = useRef<'first' | 'last' | 'selected'>('selected');
  useLayoutEffect(() => {
    if (!externalMenuOpen) return;
    setIntelligence(intelligenceDraft.current);
    setExpandedDevice(null);
    setMenu(null);
  }, [externalMenuOpen]);
  const trigger = menu === 'add' ? addTrigger : menu === 'cloud' ? cloudTrigger : menu === 'space' ? spaceTrigger : menu === 'approval' ? approvalTrigger : intelligenceTrigger;
  const selectionMenu = menu !== null && menu !== 'add';
  const position = useWorkItemTableMenu({ open: selectionMenu, anchorRef: trigger, menuRef, width: menu === 'cloud' ? 256 : menu === 'intelligence' ? 248 : menu === 'approval' ? 360 : 206,
    height: menu === 'cloud' ? 85 + devices.length * 34 : menu === 'space' ? 40 + codeMSpaces.length * 34 : menu === 'approval' ? approvalMenuHeight : 88,
    placement: menuPlacement,
    gap: menu === 'intelligence' ? 8 : 4,
    align: menu === 'intelligence' ? 'center' : 'start',
    scrollContainerSelector, onClose: () => changeMenu(null) });
  useLayoutEffect(() => {
    if (menu !== 'approval' || !menuRef.current) return;
    const items = Array.from(menuRef.current.children);
    const measure = () => {
      // Include menu padding and gaps so wrapped descriptions keep the popover anchored.
      const contentHeight = items.reduce((total, item) => total + item.getBoundingClientRect().height, 0);
      if (contentHeight > 0) setApprovalMenuHeight(Math.ceil(contentHeight + 8 + Math.max(0, items.length - 1) * 2));
    };
    measure();
    const observer = new ResizeObserver(measure);
    items.forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [menu]);
  const focusOption = (edge: 'first' | 'last' | 'selected') => {
    if (menu === 'intelligence') {
      if (edge !== 'selected') menuRef.current?.querySelector<HTMLInputElement>('input[type="range"]')?.focus({ preventScroll: true });
      return;
    }
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .filter(option => !option.disabled && option.closest('[role="menu"]') === menuRef.current);
    const selected = edge === 'selected' ? menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], [data-selected="true"]') : null;
    (selected && !selected.disabled ? selected : options[edge === 'last' ? options.length - 1 : 0])?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    // The submenu focuses its selected folder when both levels open together.
    if (selectionMenu && !(menu === 'cloud' && expandedDevice)) focusOption(focusOnOpen.current);
  }, [menu]);
  useEffect(() => {
    if (menu !== 'add') return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !toolbar.current?.contains(event.target)) changeMenu(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const toggleMenu = (next: ToolbarMenu) => {
    setExpandedDevice(menu !== next && next === 'cloud' ? selectedFolderDevice : null);
    onMenuOpen(); focusOnOpen.current = 'selected';
    changeMenu(menu === next ? null : next);
  };
  const openWithArrow = (event: KeyboardEvent<HTMLButtonElement>, next: ToolbarMenu) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const device = next === 'cloud' ? selectedFolderDevice : null;
    setExpandedDevice(device);
    focusOnOpen.current = event.key === 'ArrowUp' ? 'last' : 'first';
    onMenuOpen();
    if (menu === next) { if (!device) focusOption(focusOnOpen.current); }
    else changeMenu(next);
  };
  const finishSelection = (action: () => void) => {
    action(); setExpandedDevice(null); changeMenu(null); trigger.current?.focus({ preventScroll: true });
  };
  const addProjectFolder = (device: string, name: string) => {
    if (!name) return;
    setDeviceProjects(current => {
      const projects = current[device] ?? [];
      return projects.includes(name) ? current : { ...current, [device]: [...projects, name] };
    });
    selectEnvironment({ device, project: name });
  };
  const pickProjectFolder = async (device: string) => {
    const pickerWindow = window as Window & { showDirectoryPicker?: (options: { mode: 'read' }) => Promise<FileSystemDirectoryHandle> };
    if (!pickerWindow.showDirectoryPicker) {
      folderDevice.current = device;
      if (folderInput.current) { folderInput.current.value = ''; folderInput.current.click(); }
      return;
    }
    try {
      const directory = await pickerWindow.showDirectoryPicker({ mode: 'read' });
      addProjectFolder(device, directory.name);
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')) notify('无法选择文件夹，请重试');
    } finally {
      cloudTrigger.current?.focus({ preventScroll: true });
    }
  };
  const menuOptions: MenuOption[] = menu === 'cloud' ? [
    { label: 'Cloud', icon: 'cloud', selected: !environment.device, action: () => selectEnvironment(cloudEnvironment) },
    ...devices.map(({ name: device, online }, index) => ({ label: device, icon: 'device', device, disabled: !online, separator: index === 0,
      action: () => setExpandedDevice(current => current === device ? null : device) })),
  ] : menu === 'space' ? codeMSpaces.map(option => ({ label: option.name, icon: option.icon, selected: space.id === option.id,
    action: () => selectEnvironment({ ...environment, spaceId: option.id }) }))
    : menu === 'approval' ? approvalOptions.map(option => ({ ...option, selected: approval.label === option.label, action: () => setApproval(option) }))
    : [];

  return <div className="new-chat-controls" ref={toolbar} onKeyDown={event => {
    if (event.key === 'Escape' && menu) {
      event.preventDefault(); event.stopPropagation();
      trigger.current?.focus();
      changeMenu(null);
    }
  }}>
    <input ref={folderInput} type="file" hidden multiple {...{ webkitdirectory: '' }} aria-label="选择项目文件夹"
      onChange={event => {
        const device = folderDevice.current;
        const name = event.currentTarget.files?.[0]?.webkitRelativePath.split('/')[0];
        if (device && name) addProjectFolder(device, name);
        event.currentTarget.value = ''; folderDevice.current = null;
        cloudTrigger.current?.focus({ preventScroll: true });
      }} />
    <div className="new-chat-toolbar">
      <div className="new-chat-toolbar-left">
        <div className="new-chat-control-anchor">
          <button type="button" className="new-chat-add" ref={addTrigger} aria-label="添加内容" title="添加内容"
            aria-expanded={menu === 'add'} aria-controls={menu === 'add' ? 'new-chat-add-menu' : undefined}
            onClick={() => toggleMenu('add')}><NewChatIcon name="add" size={17.23} /></button>
          {menu === 'add' && <div className="popover new-chat-control-menu" id="new-chat-add-menu" aria-label="添加内容">
            {[
              { label: '添加附件', icon: 'composer/imgIconAttachmentOutlined', action: onAttach },
              { label: mentionLabel, icon: 'new-chat/imgIconAtOutlined', action: onMention },
              { label: '选择技能', icon: 'new-chat/imgSkill', action: onSkill },
            ].map(item => <button type="button" key={item.label} onClick={() => { changeMenu(null); item.action(); }}>
              <img src={assets[item.icon as keyof typeof assets]} width="16" height="16" alt="" />{item.label}
            </button>)}
          </div>}
        </div>
        <div className="new-chat-context-switcher" role="group" aria-label="运行环境与 CodeM 空间">
          <button type="button" className="new-chat-environment-trigger" ref={cloudTrigger} aria-label={`项目：${environmentLabel}`} title={environmentLabel} aria-haspopup="menu"
            aria-expanded={menu === 'cloud'} aria-controls={menu === 'cloud' ? 'new-chat-cloud-menu' : undefined}
            onClick={() => toggleMenu('cloud')} onKeyDown={event => openWithArrow(event, 'cloud')}>
            {!environment.device ? <NewChatIcon name="cloud" /> : <MenuIcon name={environment.project ? 'folder' : 'chat'} size={16} />}<span>{project}</span>
          </button>
          <button type="button" className="new-chat-space-trigger" ref={spaceTrigger} aria-label={`CodeM 空间：${space.name}`} title={space.name} aria-haspopup="menu"
            aria-expanded={menu === 'space'} aria-controls={menu === 'space' ? 'new-chat-space-menu' : undefined}
            onClick={() => toggleMenu('space')} onKeyDown={event => openWithArrow(event, 'space')}>
            <img src={space.icon} width="16" height="16" alt="" draggable="false" /><span>{space.name}</span>
          </button>
        </div>
        <button type="button" className="new-chat-option" ref={approvalTrigger} aria-label={`审批方式：${approval.label}`} title={approval.label} aria-haspopup="menu"
          aria-expanded={menu === 'approval'} aria-controls={menu === 'approval' ? 'new-chat-approval-menu' : undefined}
          onClick={() => toggleMenu('approval')} onKeyDown={event => openWithArrow(event, 'approval')}>
          <span className="new-chat-approval-icon" aria-hidden="true">
            {approval.icon === 'approve' ? <NewChatIcon name="approve" /> : <MenuIcon name={approval.icon} />}
          </span><span>{approval.label}</span>
        </button>
        <label className="new-chat-plan" title="Plan"><input type="checkbox" aria-label="Plan" checked={plan} onChange={event => setPlan(event.target.checked)} /><span>Plan</span></label>
      </div>
      <div className="new-chat-toolbar-right">
        <div className="new-chat-control-anchor">
          <button type="button" className="new-chat-intelligence" ref={intelligenceTrigger} aria-label={`Intelligence ${intelligence}`} title={`Intelligence ${intelligence}`} aria-haspopup="dialog"
            aria-expanded={menu === 'intelligence'} aria-controls={menu === 'intelligence' ? 'new-chat-intelligence-menu' : undefined}
            onClick={event => {
              toggleMenu('intelligence');
              if (event?.detail === 0) focusOnOpen.current = 'first';
            }} onKeyDown={event => openWithArrow(event, 'intelligence')}>
            <NewChatIcon name="intelligence" /><span className="new-chat-intelligence-level">{intelligence}</span><NewChatIcon name="chevron" size={12} />
          </button>
        </div>
        {children}
      </div>
    </div>
    {selectionMenu && createPortal(<div className={`new-chat-select-menu${menu === 'intelligence' ? ' new-chat-intelligence-popover' : menu === 'approval' ? ' new-chat-approval-menu' : ''}`} id={`new-chat-${menu}-menu`} role={menu === 'intelligence' ? 'dialog' : 'menu'}
      data-work-item-layer={workItemLayerId}
      aria-label={menu === 'cloud' ? '设备' : menu === 'space' ? 'CodeM 空间' : menu === 'approval' ? '审批方式' : 'Intelligence'} ref={menuRef} style={position}
      onKeyDown={event => {
        if (event.key === 'Tab' || (menu === 'intelligence' && event.key === 'Enter')) {
          if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); }
          changeMenu(null); trigger.current?.focus({ preventScroll: true });
        } else if (menu !== 'intelligence') navigateMenu(event);
      }}>
      {menu === 'intelligence' && <IntelligenceSlider value={draftIntelligence} onChange={value => {
        intelligenceDraft.current = value; setDraftIntelligence(value);
      }} />}
      {menu !== 'intelligence' && <div className="new-chat-menu-title" role="presentation">{menu === 'cloud' ? 'Devices' : menu === 'space' ? 'CodeM Space' : 'Permissions'}</div>}
      {menuOptions.map(option => <Fragment key={option.label}>
        {option.separator && <div className="new-chat-menu-divider" role="separator" />}
        <button type="button" role={option.selected === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={option.selected}
          aria-label={option.description ? option.label : undefined} aria-describedby={option.description ? `new-chat-approval-${option.icon}-description` : undefined}
          className={option.description ? `new-chat-approval-option${option.icon === 'full-access' ? ' new-chat-approval-full-access' : ''}` : undefined}
          ref={option.device === expandedDevice ? deviceTrigger : undefined}
          disabled={option.disabled} aria-disabled={option.disabled || undefined} title={option.disabled ? `${option.label} · 离线` : undefined}
          data-selected={option.device ? environment.device === option.device : undefined}
          aria-haspopup={option.device ? 'menu' : undefined} aria-expanded={option.device ? expandedDevice === option.device : undefined}
          aria-controls={option.device && expandedDevice === option.device ? 'new-chat-device-menu' : undefined}
          tabIndex={-1} onKeyDown={event => {
            if (option.disabled) return;
            if (option.device && event.key === 'ArrowRight') {
              event.preventDefault(); event.stopPropagation(); deviceTrigger.current = event.currentTarget; setExpandedDevice(option.device);
            }
          }} onClick={event => {
            if (option.disabled) return;
            if (option.device) { deviceTrigger.current = event.currentTarget; option.action(); }
            else finishSelection(option.action);
          }}><MenuIcon name={option.icon} />{option.description ? <span className="new-chat-menu-copy">
            <span>{option.label}</span>
            <span id={`new-chat-approval-${option.icon}-description`} className="new-chat-menu-description">{option.description}</span>
          </span> : <span>{option.label}</span>}
          {option.disabled && <span className="new-chat-device-status">离线</span>}
          {option.device && <img className="new-chat-menu-chevron" src="/assets/figma/settings-diff/chevron-right.svg" width="12" height="12" alt="" />}
        </button>
      </Fragment>)}
      {menu === 'cloud' && expandedDevice && <DeviceSubmenu device={expandedDevice} projects={deviceProjects[expandedDevice] ?? []} environment={environment} anchorRef={deviceTrigger} parentPosition={position} placement={menuPlacement}
        onBack={() => { setExpandedDevice(null); deviceTrigger.current?.focus({ preventScroll: true }); }}
        onSelect={name => finishSelection(() => selectEnvironment({ device: expandedDevice, project: name }))}
        onNewProject={() => finishSelection(() => { void pickProjectFolder(expandedDevice); })} />}
    </div>, document.body)}
  </div>;
}
