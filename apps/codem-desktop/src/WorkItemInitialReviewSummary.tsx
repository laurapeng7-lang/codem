import { useState } from 'react';
import './work-item-initial-review.css';

const assetRoot = '/assets/figma/work-item-initial-review/';
const agentAssetRoot = '/assets/figma/work-item-agent-summary/';
const people = {
  Mei: `${agentAssetRoot}mei.png`,
  Xin: `${assetRoot}xin.png`,
  Qian: `${assetRoot}qian.png`,
  参与人: `${assetRoot}participant.png`,
};

function PersonTag({ name }: { name: keyof typeof people }) {
  return <span className="work-detail-person"><img src={people[name]} width="20" height="20" alt="" draggable="false" /><span>{name}</span></span>;
}

function AgentProgress({ standalone = false, agent = 'codem', finished = false }: { standalone?: boolean; agent?: 'codem' | 'reviewer'; finished?: boolean }) {
  return <span className={`work-initial-agent-progress${standalone ? ' is-standalone' : ''}`} data-agent={agent}>
    <span className="work-initial-agent-avatar">{agent === 'reviewer'
      ? <img src="/assets/figma/work-item-agents/reviewer.png" width="20" height="20" alt="" draggable="false" />
      : <span className="work-detail-agent-codem"><img src={`${agentAssetRoot}codem-logo.svg`} width="9.66175" height="7.86759" alt="" draggable="false" /></span>}
    </span>
    <span className="work-detail-agent-name">{agent === 'reviewer' ? 'Reviewer' : 'CodeM'}</span><span className={finished ? 'work-initial-agent-finished' : 'work-detail-agent-working'}>{finished ? 'has finished the task.' : 'is working...'}</span>
  </span>;
}

/** Initial Review's expanded owner list, from Figma 191:6867. */
export function WorkItemInitialReviewSummary() {
  const [expanded, setExpanded] = useState(true);
  const [assignmentExpanded, setAssignmentExpanded] = useState(true);
  return <div className="work-initial-summary-scroll" role="region" aria-label="Initial Review 负责人汇总，可横向滚动查看" tabIndex={0}>
    <table className="work-initial-summary" aria-label="Initial Review 负责人和排期">
      <colgroup><col className="work-initial-owner-column" /><col className="work-initial-pd-column" /><col /><col className="work-initial-action-column" /></colgroup>
      <thead><tr><th scope="col">Owner</th><th scope="col">PD</th><th scope="col">Schedule</th><th scope="col"><span className="visually-hidden">操作</span></th></tr></thead>
      <tbody><tr className="work-initial-total">
        <td><div className="work-initial-people"><PersonTag name="Mei" /><PersonTag name="Xin" /><span>+4</span></div></td>
        <td><span className="work-initial-pd"><span className="work-initial-derived">16</span><span>PD</span></span></td>
        <td colSpan={2}><div className="work-initial-schedule"><span className="work-initial-derived">03.15 - 04.05</span><span className="work-initial-formula" title="自动计算排期"><img src={`${assetRoot}formula.svg`} width="14" height="14" alt="自动计算" draggable="false" /></span></div></td>
      </tr></tbody>
      <tbody id="initial-review-owner-details" hidden={!expanded}>
        <tr><td><PersonTag name="Mei" /></td><td><span className="work-initial-pd"><span>2</span><span>PD</span></span></td><td>03.15 - 04.05</td><td><button type="button" className="work-initial-complete">Complete</button></td></tr>
        <tr className="work-initial-divider" aria-hidden="true"><td colSpan={4} /></tr>
        <tr><td><PersonTag name="Xin" /></td><td><span className="work-initial-pd"><span>3</span><span>PD</span></span></td><td>03.15 - 04.05</td><td><img src={`${assetRoot}pending.svg`} width="16" height="16" alt="待完成" draggable="false" /></td></tr>
        <tr><td colSpan={4} className="work-initial-assignment-cell">
          <div className="work-initial-assignment">
            <div className="work-initial-assigned-by">
              <button type="button" className="work-initial-assignment-toggle" aria-label={assignmentExpanded ? '收起 Mei 分配的智能体' : '展开 Mei 分配的智能体'} aria-expanded={assignmentExpanded} aria-controls="initial-review-assigned-agent" onClick={() => setAssignmentExpanded(value => !value)}><img src={`${assetRoot}collapse.svg`} width="12" height="12" alt="" draggable="false" /></button>
              <PersonTag name="Mei" /><span>已分配给智能体执行</span>
            </div>
            {assignmentExpanded && <div id="initial-review-assigned-agent" className="work-initial-assigned-agent"><img className="work-initial-branch" src={`${assetRoot}branch.svg`} width="11.0693" height="20.5057" alt="" draggable="false" /><AgentProgress /></div>}
          </div>
        </td></tr>
        <tr><td colSpan={4}><AgentProgress standalone agent="reviewer" finished /></td></tr>
        {([['Qian', 6], ['参与人', 8]] as const).map(([name, pd]) => <tr key={name}><td><PersonTag name={name} /></td><td><span className="work-initial-pd"><span>{pd}</span><span>PD</span></span></td><td>03.15 - 04.05</td><td /></tr>)}
      </tbody>
      <tfoot><tr><td colSpan={4}><button type="button" className="work-initial-collapse" aria-expanded={expanded} aria-controls="initial-review-owner-details" onClick={() => setExpanded(value => !value)}>{expanded ? 'Collapse' : 'Expand'}</button></td></tr></tfoot>
    </table>
  </div>;
}
