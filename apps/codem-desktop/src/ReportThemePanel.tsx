import { useEffect, useRef } from 'react';
import assets from './assets.json';
import themes from './report-themes.json';
import { initialReportState } from './report-controls';
import './report-toolbar.css';

const menuThemes = [
  ...themes.filter(theme => theme.id === initialReportState.theme),
  ...themes.filter(theme => theme.id !== initialReportState.theme),
];

export function ReportThemePanel({ selected, onSelect, onClose }: { selected: string; onSelect: (id: string) => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selectedOption = panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    selectedOption?.focus({ preventScroll: true });
    selectedOption?.scrollIntoView({ block: 'nearest' });
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!panel.current?.contains(event.target) && !document.getElementById('report-theme-trigger')?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [onClose]);

  const closeAndFocus = () => { onClose(); document.getElementById('report-theme-trigger')?.focus(); };

  return <div ref={panel} id="report-theme-panel" className="report-theme-panel" role="dialog" aria-labelledby="report-theme-title"
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeAndFocus(); } }}>
    <div className="report-theme-heading"><h2 id="report-theme-title">主题</h2><button type="button" className="icon-button" aria-label="关闭主题面板" onClick={closeAndFocus}><img src={assets['preview/imgIconCloseSmallOutlined']} width="16" height="16" alt="" /></button></div>
    <div className="report-theme-grid">
      {menuThemes.map(theme => <button type="button" key={theme.id} className="report-theme-option" aria-pressed={selected === theme.id} title={theme.name} onClick={() => onSelect(theme.id)}>
        <span className="report-theme-swatch" style={{ backgroundColor: theme.colors[0], color: theme.colors[2] }} aria-hidden="true"><span className="report-theme-accent" style={{ backgroundColor: theme.colors[1] }} /><span>Aa</span></span>
        <span className="report-theme-label">{theme.label}</span>
      </button>)}
    </div>
  </div>;
}
