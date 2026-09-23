import { spaceAgentSources, type SpaceAgentSourceId } from './settings-ai';
import './agent-profile-controls.css';

export function renderAgentSource(spaceId: SpaceAgentSourceId | null | undefined) {
  const source = spaceAgentSources.find(space => space.id === spaceId);
  return <>
    <span className="agent-source-initial" style={{ background: source?.color ?? '#8F959E' }} aria-hidden="true">{source?.initial ?? 'C'}</span>
    <span className="agent-source-label">{source ? `CodeM·${source.name}` : '选择 CodeM 空间'}</span>
  </>;
}
