import { CodeMLogo } from './CodeMLogo';
// Shared Figma loading presentation for drawer and table field recommendations.
export function renderWorkItemAILoading(titles: readonly string[], step: number) {
  return <div key="loading" className="work-owner-ai-loading" role="status" aria-live="polite">
    <span className="visually-hidden">{titles[step]}</span>
    <div className="work-owner-ai-heading" aria-hidden="true">
      <CodeMLogo size={12} />
      <div className="work-owner-ai-title-carousel"><div className="work-owner-ai-title-track" style={{ transform: `translateY(-${step * 16}px)` }}>
        {titles.map(title => <span key={title}>{title}</span>)}
      </div></div>
    </div>
    <div className="work-owner-ai-skeleton" aria-hidden="true"><i /><i /><i /><i /></div>
  </div>;
}
