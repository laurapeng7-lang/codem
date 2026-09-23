import type { ReviewChangeKind } from './settings-review';
import './settings-change-count.css';

export function SettingsChangeCount({ count, kind, className = '' }: { count: number; kind: ReviewChangeKind; className?: string }) {
  const label = kind === 'A' ? '新增' : '修改';
  return <span className={`settings-change-count ${className}`.trim()}>
    {count > 0 && <span className={`settings-review-status is-${kind}`} aria-label={label} title={label}>{kind}</span>}
    <span>{count} 个属性变更</span>
  </span>;
}
