import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import assets from './assets.json';
import { SettingsSwitch } from './SettingsSwitch';
import { useWorkItemTableMenu } from './useWorkItemTableMenu';
import { assistantSpaces, assistantTools, loadAssistantSettings, saveAssistantSettings, type AssistantSettings } from './codem-assistant-settings';
import './codem-page.css';
import './codem-settings.css';

const assetRoot = '/assets/figma/codem-settings/';

export function CodeMSettings({ notify, onToggleNavigation }: { notify: (message: string) => void; onToggleNavigation: () => void }) {
  const [settings, setSettings] = useState(loadAssistantSettings);
  const [menuOpen, setMenuOpen] = useState(false);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const availableSpaces = assistantSpaces.filter(space => !settings.authorizedSpaces.includes(space.id));
  const closeMenu = () => { setMenuOpen(false); addTrigger.current?.focus({ preventScroll: true }); };
  const position = useWorkItemTableMenu({ open: menuOpen, anchorRef: addTrigger, menuRef: menu, width: 256, height: Math.max(1, availableSpaces.length) * 40 + 12, scrollContainerSelector: '.codem-settings-scroll', onClose: () => setMenuOpen(false) });
  useLayoutEffect(() => {
    if (menuOpen) (menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]') ?? menu.current)?.focus({ preventScroll: true });
  }, [menuOpen]);
  const save = (next: AssistantSettings) => {
    setSettings(next);
    if (!saveAssistantSettings(next)) notify('设置已更新，但未能保存到浏览器');
  };

  return <main className="codem-settings-workspace">
    <section className="codem-settings-panel" aria-labelledby="codem-settings-title">
      <button type="button" className="icon-button desktop-nav-toggle codem-settings-nav-toggle" aria-label="打开导航" onClick={onToggleNavigation}><img src={assets['sidebar/img24X24']} width="16" height="16" alt="" /></button>
      <div className="codem-settings-scroll">
        <div className="codem-settings-content">
          <h1 id="codem-settings-title">Settings</h1>
          <section className="codem-settings-group" aria-labelledby="codem-settings-tools-title">
            <div className="codem-settings-section-heading">
              <h2 id="codem-settings-tools-title">工具管理</h2>
              <p>启用后，AI 助手可获得相关的读写能力</p>
            </div>
            <ul className="codem-settings-tools" aria-label="工具管理">{assistantTools.map(tool => <li key={tool.id} className="codem-settings-tool" data-tool={tool.id}>
              <div className="codem-settings-tool-info">
                <span className="codem-settings-tool-icon"><img src={tool.icon} alt="" width={tool.id === 'base' ? 24 : tool.id === 'calendar' ? 20 : 20.571} height={tool.id === 'base' ? 24 : tool.id === 'calendar' ? 20 : 20.571} /></span>
                <div className="codem-settings-tool-copy"><h3>{tool.name}</h3><p id={`codem-tool-${tool.id}-description`}>{tool.description}</p></div>
              </div>
              <SettingsSwitch label={tool.name} descriptionId={`codem-tool-${tool.id}-description`} checked={settings.enabledTools.includes(tool.id)} disabled={tool.required} onChange={() => {
                if (tool.required) return;
                save({ ...settings, enabledTools: settings.enabledTools.includes(tool.id) ? settings.enabledTools.filter(id => id !== tool.id) : [...settings.enabledTools, tool.id] });
              }} />
            </li>)}</ul>
          </section>
          <section className="codem-settings-group" aria-labelledby="codem-settings-spaces-title">
            <div className="codem-settings-section-heading">
              <h2 id="codem-settings-spaces-title">授权 AI 应用空间管理</h2>
              <p>授权后，空间内的 AI 应用（AI 节点、AI 状态、AI 字段）可以使用 AI 助手访问空间数据</p>
            </div>
            <div className="codem-settings-spaces">
              <ul aria-label="已授权空间">{assistantSpaces.filter(space => settings.authorizedSpaces.includes(space.id)).map(space => <li key={space.id} className="codem-settings-space" data-space={space.id}>
                <img className="codem-settings-space-icon" src={space.icon} width="32" height="32" alt="" />
                <div className="codem-settings-space-copy"><h3>{space.name}</h3><p>已授权</p></div>
                <div className="codem-settings-space-actions">
                  <button type="button" className="codem-settings-revoke" aria-label={`取消授权 ${space.name}`} onClick={() => { save({ ...settings, authorizedSpaces: settings.authorizedSpaces.filter(id => id !== space.id) }); addTrigger.current?.focus({ preventScroll: true }); }}>取消授权</button>
                  <button type="button" className="codem-settings-open-space" aria-label={`打开 ${space.name} 空间`} title={`打开 ${space.name} 空间`} onClick={() => notify('空间详情暂未接入')}><img src={`${assetRoot}open-space.svg`} width="16" height="16" alt="" /></button>
                </div>
              </li>)}</ul>
              <button ref={addTrigger} type="button" className="codem-settings-add-space" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? 'codem-settings-space-menu' : undefined} onClick={() => setMenuOpen(value => !value)} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setMenuOpen(true); } }}>
                <img src={`${assetRoot}add-space.svg`} width="16" height="16" alt="" /><span>添加授权空间</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </section>
    {menuOpen && createPortal(<div ref={menu} id="codem-settings-space-menu" role="menu" aria-label="添加授权空间" tabIndex={-1} className="codem-settings-space-menu" style={position} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); }
      else if (event.key === 'Tab') closeMenu();
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        if (!items.length) return;
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>{availableSpaces.length ? availableSpaces.map(space => <button key={space.id} type="button" role="menuitem" onClick={() => { save({ ...settings, authorizedSpaces: [...settings.authorizedSpaces, space.id] }); closeMenu(); }}>
      <img src={space.icon} width="24" height="24" alt="" /><span>{space.name}</span>
    </button>) : <p>所有空间均已授权</p>}</div>, document.body)}
  </main>;
}
