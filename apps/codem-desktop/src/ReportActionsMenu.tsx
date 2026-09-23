import { useEffect, useRef, type KeyboardEvent } from 'react';
import assets from './assets.json';
import './report-menu.css';

type Props = {
  imageExporting: boolean;
  linkAccess: boolean;
  onDownloadImage: () => void;
  onDownloadWebpage: () => void;
  onCopyLink: () => void;
  onToggleLinkAccess: () => void;
  onClose: () => void;
};

export function ReportActionsMenu({ imageExporting, linkAccess, onDownloadImage, onDownloadWebpage, onCopyLink, onToggleLinkAccess, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!menu.current?.contains(event.target) && !document.getElementById('report-actions-trigger')?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [onClose]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      document.getElementById('report-actions-trigger')?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return (
    <div ref={menu} id="report-actions-menu" className="report-actions-menu" role="menu" aria-label="分析报告操作" onKeyDown={handleKeyDown}
      onBlur={event => {
        const nextTarget = event.relatedTarget;
        if (!nextTarget || event.currentTarget.contains(nextTarget)) return;
        // Let the trigger handle its own toggle after receiving focus.
        if (document.getElementById('report-actions-trigger')?.contains(nextTarget)) return;
        onClose();
      }}>
      <button type="button" role="menuitem" className="report-menu-item" onClick={onDownloadImage} disabled={imageExporting}>
        <img src={assets['report-menu/imgImage']} width="16" height="16" alt="" />
        <span>下载为图片</span>
      </button>
      <button type="button" role="menuitem" className="report-menu-item" onClick={onDownloadWebpage}>
        <img src={assets['report-menu/imgIconDownloadOutlined']} width="16" height="16" alt="" />
        <span>下载为网页</span>
      </button>
      <img className="report-menu-divider" src={assets['report-menu/imgFrame2147239709']} width="212" height="8" alt="" role="separator" />
      <button type="button" role="menuitem" className="report-menu-item" onClick={onCopyLink}>
        <img src={assets['report-menu/imgIconCopyOutlined']} width="16" height="16" alt="" />
        <span>复制链接</span>
      </button>
      <button type="button" role="menuitemcheckbox" aria-checked={linkAccess} className="report-menu-item report-menu-access" onClick={onToggleLinkAccess}>
        <img src={assets['report-menu/imgGlobe']} width="16" height="16" alt="" />
        <span>允许通过链接访问</span>
        <span className={`report-access-switch ${linkAccess ? 'is-on' : ''}`} aria-hidden="true">
          <img src={assets['report-menu/imgDSwitch']} width="36" height="32" alt="" />
        </span>
      </button>
    </div>
  );
}
