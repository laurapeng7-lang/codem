export type ReportMode = 'reading' | 'slides';
export type ReportState = { mode: ReportMode; theme: string };
export type ReportController = {
  getState: () => ReportState;
  setMode: (mode: ReportMode) => void;
  setTheme: (theme: string) => void;
};

export const initialReportState: ReportState = { mode: 'reading', theme: 'paper-ink' };

export function getReportController(frame: HTMLIFrameElement | null) {
  return (frame?.contentWindow as (Window & { projectRiskReport?: ReportController }) | null)?.projectRiskReport;
}

export function subscribeReportState(doc: Document, controller: ReportController, onChange: (state: ReportState) => void) {
  const sync = () => onChange(controller.getState());
  doc.addEventListener('report-mode-change', sync);
  doc.addEventListener('report-theme-change', sync);
  sync();
  return () => {
    doc.removeEventListener('report-mode-change', sync);
    doc.removeEventListener('report-theme-change', sync);
  };
}
