import type { WorkItemOwner } from './WorkItemOwnerPicker';
import { loadSettingsAiPreferences, type SettingsSpaceAgent } from './settings-ai';
import { draftForMember } from './settings-agents';

export type WorkItemAgent = WorkItemOwner & { color: string };
export type WorkItemAgentAction = 'stop' | 'rerun' | 'cancel';

export const workItemAgents: WorkItemAgent[] = [
  { id: 'agent-codem', name: 'CodeM', email: '', avatar: '../work-item-agents/codem.svg', color: '#611fd6' },
  { id: 'agent-planner', name: 'Planner', email: '', avatar: '../work-item-agents/planner.png', color: '#333dcc' },
  { id: 'agent-reviewer', name: 'Reviewer', email: '', avatar: '../work-item-agents/reviewer.png', color: '#7f4401' },
  { id: 'agent-architect', name: 'Architect', email: '', avatar: '../work-item-agents/architect.png', color: '#9d1562' },
];

function spaceAgentOwner(agent: SettingsSpaceAgent): WorkItemAgent {
  return {
    id: `agent-space-${agent.id}`, name: agent.name, email: '',
    avatar: draftForMember(agent.memberId).avatar.replace('/assets/', '../../'),
    color: '#1f2329', spaceAgent: { ...agent },
  };
}

export function getSelectableWorkItemAgents(): WorkItemAgent[] {
  const settings = loadSettingsAiPreferences();
  const spaceAgents = settings.independentTasks ? settings.agents.filter(agent =>
    agent.name.trim() && agent.spaceId && !settings.disabledAgents.includes(agent.id)) : [];
  return [workItemAgents[0], ...spaceAgents.map(spaceAgentOwner)];
}

export function getWorkItemAgent(owner?: WorkItemOwner) {
  // Keep the assigned identity available even if its settings are later removed or disabled.
  if (owner?.spaceAgent && owner.id === `agent-space-${owner.spaceAgent.id}`) return spaceAgentOwner(owner.spaceAgent);
  return workItemAgents.find(agent => agent.id === owner?.id);
}
