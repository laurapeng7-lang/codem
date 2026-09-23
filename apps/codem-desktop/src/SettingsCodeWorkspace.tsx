import { useCallback, useEffect, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import { initialCodePath, initialCodeTabs, settingsCodeFileMap, settingsCodeTabsReducer } from './settings-code-data';
import type { SettingsCodeRuntime } from './settings-code-runtime';
import './settings-code.css';

function CodeIcon({ name, size = 14 }: { name: string; size?: number }) {
  return <img src={`/assets/settings/code/${name}.svg`} width={size} height={size} alt="" draggable="false" />;
}

export function SettingsCodeWorkspace({ active, notify }: { active: boolean; notify: (message: string) => void }) {
  const [tabs, dispatch] = useReducer(settingsCodeTabsReducer, initialCodeTabs);
  const [expanded, setExpanded] = useState(true);
  const [menu, setMenu] = useState<'tree' | 'code' | null>(null);
  const [wrap, setWrap] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const treeContainer = useRef<HTMLDivElement>(null);
  const editorContainer = useRef<HTMLDivElement>(null);
  const treeMenu = useRef<HTMLDivElement>(null);
  const codeMenu = useRef<HTMLDivElement>(null);
  const treeTrigger = useRef<HTMLButtonElement>(null);
  const workspaceTrigger = useRef<HTMLButtonElement>(null);
  const codeTrigger = useRef<HTMLButtonElement>(null);
  const tabList = useRef<HTMLDivElement>(null);
  const runtime = useRef<SettingsCodeRuntime | null>(null);
  const activeFile = tabs.activePath ? settingsCodeFileMap.get(tabs.activePath) : undefined;
  const latestFile = useRef(activeFile);
  latestFile.current = activeFile;
  const openFile = useCallback((path: string) => dispatch({ type: 'open', path }), []);

  useEffect(() => {
    const treeElement = treeContainer.current;
    const editorElement = editorContainer.current;
    if (!treeElement || !editorElement) return;
    let disposed = false;
    setStatus('loading');
    import('./settings-code-runtime').then(({ mountSettingsCode, defaultSettingsCodeFile }) => {
      if (disposed) return;
      runtime.current = mountSettingsCode({ treeContainer: treeElement, editorContainer: editorElement, file: latestFile.current ?? defaultSettingsCodeFile, onOpen: openFile });
      runtime.current.setFile(latestFile.current);
      setStatus('ready');
    }).catch(() => { if (!disposed) setStatus('error'); });
    return () => { disposed = true; runtime.current?.destroy(); runtime.current = null; };
  }, [attempt, openFile]);

  useEffect(() => {
    runtime.current?.setFile(activeFile);
    if (active) tabList.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeFile, active]);
  useEffect(() => { runtime.current?.setWrapping(wrap); }, [wrap, status]);
  useEffect(() => { if (!active) setMenu(null); }, [active]);
  useEffect(() => {
    if (!menu) return;
    const popover = menu === 'tree' ? treeMenu.current : codeMenu.current;
    const trigger = menu === 'tree' ? treeTrigger.current : codeTrigger.current;
    popover?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !popover?.contains(event.target) && !trigger?.contains(event.target)) setMenu(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menu]);

  const closeMenu = () => {
    (menu === 'tree' ? treeTrigger : codeTrigger).current?.focus({ preventScroll: true });
    setMenu(null);
  };
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, path: string) => {
    const index = tabs.paths.indexOf(path);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.paths.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.paths.length) % tabs.paths.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.paths.length - 1;
    else return;
    event.preventDefault();
    openFile(tabs.paths[next]);
    tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  const closeTab = (path: string) => {
    const next = settingsCodeTabsReducer(tabs, { type: 'close', path });
    dispatch({ type: 'close', path });
    const buttons = tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    if (next.activePath) buttons?.[tabs.paths.indexOf(next.activePath)]?.focus();
    else workspaceTrigger.current?.focus();
  };
  const copyCode = async () => {
    closeMenu();
    if (!activeFile) return;
    try { await navigator.clipboard.writeText(activeFile.code); notify('配置已复制'); }
    catch { notify('复制失败，请在代码区选择内容后复制'); }
  };

  return <section className="settings-code-workspace" hidden={!active} aria-label="Code 配置视图" onKeyDown={event => {
    if (event.key === 'Escape' && menu) { event.stopPropagation(); closeMenu(); }
  }}>
    <aside className="settings-code-explorer" aria-label="配置文件">
      <div className="settings-code-explorer-header">
        <button type="button" ref={workspaceTrigger} className="settings-code-workspace-toggle" aria-expanded={expanded} aria-controls="settings-code-tree" onClick={() => setExpanded(value => !value)}>
          <CodeIcon name={expanded ? 'chevron-down' : 'chevron-right'} />
          <span className="workspace-avatar" aria-hidden="true">A</span><span>Agile Development</span>
        </button>
        <button type="button" ref={treeTrigger} className="settings-code-icon-button" aria-label="文件树选项" title="文件树选项" aria-expanded={menu === 'tree'} aria-haspopup="dialog" onClick={() => setMenu(value => value === 'tree' ? null : 'tree')}><CodeIcon name="tree-settings" /></button>
        {menu === 'tree' && <div ref={treeMenu} className="settings-code-menu" role="dialog" aria-label="文件树选项">
          <button type="button" disabled={status !== 'ready'} onClick={() => { setExpanded(true); runtime.current?.setExpanded(true); closeMenu(); }}>展开所有分组</button>
          <button type="button" disabled={status !== 'ready'} onClick={() => { runtime.current?.setExpanded(false); closeMenu(); }}>收起所有分组</button>
          <button type="button" disabled={!activeFile || status !== 'ready'} onClick={() => { if (activeFile) { setExpanded(true); runtime.current?.reveal(activeFile.path); } closeMenu(); }}>定位当前文件</button>
        </div>}
      </div>
      <div id="settings-code-tree" className="settings-code-tree" ref={treeContainer} hidden={!expanded} aria-busy={status === 'loading'} />
    </aside>
    <div className="settings-code-preview">
      <div className="settings-code-file-toolbar">
        <div className="settings-code-file-tabs" role="tablist" aria-label="已打开的配置" ref={tabList}>
          {tabs.paths.map(path => {
            const file = settingsCodeFileMap.get(path)!;
            const selected = path === tabs.activePath;
            return <div className={`settings-code-file-tab${selected ? ' is-active' : ''}`} key={path}>
              <button type="button" role="tab" id={`settings-code-tab-${encodeURIComponent(path)}`} aria-selected={selected} aria-controls="settings-code-document" tabIndex={selected ? 0 : -1} title={path} onClick={() => openFile(path)} onKeyDown={event => moveTab(event, path)}><CodeIcon name={file.icon === 'folder' ? 'tab-folder' : file.icon} size={12} /><span>{file.name}</span></button>
              <button type="button" className="settings-code-close-tab" aria-label={`关闭 ${file.name}`} onClick={() => closeTab(path)}><CodeIcon name="close" size={16} /></button>
            </div>;
          })}
        </div>
        <button type="button" ref={codeTrigger} className="settings-code-icon-button" aria-label="代码选项" title="代码选项" aria-haspopup="dialog" aria-expanded={menu === 'code'} onClick={() => setMenu(value => value === 'code' ? null : 'code')}><CodeIcon name="more" size={16} /></button>
        {menu === 'code' && <div ref={codeMenu} className="settings-code-menu" role="dialog" aria-label="代码选项">
          <button type="button" disabled={!activeFile || status !== 'ready'} onClick={() => { closeMenu(); runtime.current?.search(); }}>查找代码</button>
          <button type="button" disabled={!activeFile} onClick={copyCode}>复制配置</button>
          <button type="button" aria-pressed={wrap} onClick={() => { setWrap(value => !value); closeMenu(); }}>{wrap ? '关闭自动换行' : '开启自动换行'}</button>
          <button type="button" disabled={!tabs.paths.length} onClick={() => { dispatch({ type: 'close-all' }); closeMenu(); }}>关闭全部文件</button>
        </div>}
      </div>
      <div className="settings-code-breadcrumb" aria-label="当前配置路径">
        {activeFile?.path.split('/').filter(Boolean).map((part, index, parts) => <span key={index}>
          {index > 0 && <CodeIcon name="chevron-right" size={10} />}
          {index === 0 && <CodeIcon name="tab-folder" size={12} />}
          <span aria-current={index === parts.length - 1 ? 'page' : undefined}>{part}</span>
        </span>)}
      </div>
      <div id="settings-code-document" className="settings-code-document" role="tabpanel" aria-labelledby={activeFile ? `settings-code-tab-${encodeURIComponent(activeFile.path)}` : undefined}>
        <div className="settings-code-editor" ref={editorContainer} hidden={!activeFile || status !== 'ready'} />
        {status === 'loading' && <p className="settings-code-placeholder" role="status">正在加载配置…</p>}
        {status === 'error' && <div className="settings-code-placeholder" role="alert"><p>配置预览加载失败</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重新加载</button></div>}
        {status === 'ready' && !activeFile && <div className="settings-code-placeholder"><p>从左侧选择配置文件查看代码</p><button type="button" onClick={() => openFile(initialCodePath)}>打开空间信息</button></div>}
      </div>
    </div>
  </section>;
}
