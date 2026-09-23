import { AgentAvatar } from './AgentAvatar';
import { draftForMember } from './settings-agents';
import type { WorkItemOwner } from './WorkItemOwnerPicker';

export function renderWorkItemOwnerAvatar(owner: WorkItemOwner, size: number, className?: string) {
  return owner.spaceAgent
    ? <AgentAvatar src={draftForMember(owner.spaceAgent.memberId).avatar} background={owner.spaceAgent.avatarBackground} size={size} className={className} />
    : <img src={`/assets/figma/work-item-owner/${owner.avatar}`} width={size} height={size} className={className} alt="" draggable="false" />;
}
