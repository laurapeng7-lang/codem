import { useEffect, useState, type RefObject } from 'react';
import { reportTitle, reportUrl } from './report';
import { getReportController, subscribeReportState, type ReportMode, type ReportState } from './report-controls';
import './report-preview.css';

type Props = {
  active: boolean;
  mode: ReportMode;
  frameRef: RefObject<HTMLIFrameElement | null>;
  initialTheme?: string;
  onInteract: () => void;
  onStateChange: (state: ReportState) => void;
  onReadyChange: (ready: boolean) => void;
};

export function ReportPreview({ active, mode, frameRef, initialTheme, onInteract, onStateChange, onReadyChange }: Props) {
  const [frameState, setFrameState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [frameVersion, setFrameVersion] = useState(0);
  useEffect(() => {
    if (frameState !== 'ready') return;
    const doc = frameRef.current?.contentDocument;
    const controller = getReportController(frameRef.current);
    if (!doc || !controller) return;
    const unsubscribe = subscribeReportState(doc, controller, onStateChange);
    onReadyChange(true);
    // Pointer events inside an iframe do not bubble to the app's menus.
    doc.addEventListener('pointerdown', onInteract);
    const dismissOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onInteract(); };
    doc.addEventListener('keydown', dismissOnEscape);
    return () => { doc.removeEventListener('pointerdown', onInteract); doc.removeEventListener('keydown', dismissOnEscape); unsubscribe(); onReadyChange(false); };
  }, [frameState, frameVersion, frameRef, onInteract, onStateChange, onReadyChange]);

  return <div className="report-panel-content" id="artifact-panel-report" role="tabpanel" aria-labelledby="artifact-tab-report" hidden={!active}>
    <div id="report-content" className="report-content" role="tabpanel" aria-labelledby={`report-mode-${mode}`}>
      <div className="report-frame-wrap">
        <iframe
          key={frameVersion}
          ref={frameRef}
          className="report-frame"
          src={`${reportUrl}?embedded=1`}
          title={reportTitle}
          allow="fullscreen; clipboard-write"
          allowFullScreen
          onLoad={() => {
            const controller = getReportController(frameRef.current);
            if (!frameRef.current?.contentDocument?.getElementById('reading-report') || !controller) {
              setFrameState('error');
              return;
            }
            // Apply the selected cover's theme before removing the loading overlay.
            if (initialTheme) {
              controller.setTheme(initialTheme);
              controller.setMode('reading');
            }
            setFrameState('ready');
          }}
          onError={() => setFrameState('error')}
        />
        {frameState !== 'ready' && <div className="report-load-state" role="status">
          <p>{frameState === 'error' ? '报告加载失败，请重试' : '正在加载报告…'}</p>
          {frameState === 'error' && <button type="button" onClick={() => { setFrameState('loading'); setFrameVersion(value => value + 1); }}>重新加载</button>}
        </div>}
      </div>
    </div>
  </div>;
}
