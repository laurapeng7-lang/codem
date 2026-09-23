import { useMemo, useState } from 'react';
import type { ConfigChange, SettingsExecutionResult } from './settings-execution-result';
import { reviewChanges, reviewSummary, type ReviewChangeKind, type SettingsReview } from './settings-review';
import { SettingsChangeCount } from './SettingsChangeCount';
import { discardSettingsDraft, useDiscardedSettingsDraft } from './settings-draft-state';
import './settings-change-diff.css';

const assetRoot = '/assets/figma/settings-diff/';
function ConfigDiffRow({ change, propertyCount, kind, onOpen }: { change: ConfigChange; propertyCount: number; kind: ReviewChangeKind; onOpen: () => void }) {
  return <button type="button" className="settings-diff-row" onClick={onOpen}>
    <span className="settings-diff-row-title" title={change.title}>{change.title}</span><SettingsChangeCount count={propertyCount} kind={kind} /><img className="settings-diff-chevron" src={`${assetRoot}chevron-right.svg`} width="12" height="12" alt="" />
  </button>;
}

export function SettingsChangeDiff({ result, executionId, onReviewChanges }: { result: SettingsExecutionResult; executionId: string; onReviewChanges?: (review: SettingsReview) => void }) {
  const discarded = useDiscardedSettingsDraft(executionId);
  const [showAll, setShowAll] = useState(false);
  const changes = useMemo(() => reviewChanges(result.changes), [result]);
  const title = discarded ? `已撤销 ${changes.length} 个配置草案` : result.kind === 'document' ? `已生成 ${changes.length} 个手册章节` : `已生成 ${changes.length} 个配置改动草案`;
  if (!changes.length) return null;
  return <section className={`settings-change-diff${discarded ? ' is-discarded' : ''}`} aria-label="配置改动" data-draft-state={discarded ? 'discarded' : 'ready'}>
    <header className="settings-diff-header">
      <div className="settings-diff-file-icon"><span><img src={`${assetRoot}edit.svg`} width="16" height="16" alt="" /></span></div>
      <div className="settings-diff-heading"><p title={title}>{title}</p><SettingsChangeCount {...reviewSummary(changes)} /></div>
      <div className="settings-diff-actions">
        <button type="button" className="settings-diff-review" onClick={() => onReviewChanges?.({ executionId, result })}>review 变更</button>
        <button type="button" className="settings-diff-undo" disabled={discarded} title="撤销本次生成的草案" onClick={() => discardSettingsDraft(executionId)}>{discarded ? '已撤销' : '撤销修改'}</button>
      </div>
    </header>
    <div className="settings-diff-rows">{changes.slice(0, showAll ? undefined : 4).map(({ change, propertyCount, kind }) => <ConfigDiffRow key={change.path} change={change} propertyCount={propertyCount} kind={kind} onOpen={() => onReviewChanges?.({ executionId, result, path: change.path })} />)}</div>
    {changes.length > 4 && <button type="button" className="settings-diff-more" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}><span>{showAll ? '收起' : '展示更多'}</span><img src={`${assetRoot}chevron-down.svg`} width="12" height="12" alt="" /></button>}
    <span className="visually-hidden" role="status">{discarded ? '本次草案已撤销' : ''}</span>
  </section>;
}
