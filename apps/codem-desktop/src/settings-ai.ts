import { agentAvatarColors, agentTemplates, codemSpaces, type AgentMemberId } from './settings-agents';

export const settingsAiStorageKey = 'meego:settings:ai-config:agile-development:v1';
export const availableSpaceAgents = [
  { id: 'platform', name: 'Reviewer', space: '平台业务空间', icon: '/assets/figma/codem-navigation/codem-violet.png' },
  { id: 'foundation', name: 'Designer', space: 'Foundation产研协同空间', icon: '/assets/figma/sidebar-codem-39-7831.svg' },
] as const;
export const spaceAgentSources = [
  { id: 'platform', name: '平台业务空间', initial: 'P', color: '#7A32F5' },
  { id: 'foundation', name: 'Foundation产研协同空间', initial: 'F', color: '#5083FB' },
  ...codemSpaces.map(space => ({ id: space.id, name: space.name, initial: space.id === 'frontend' ? 'F' : 'B', color: space.id === 'frontend' ? '#FA4846' : '#00B89F' })),
] as const;
export type SpaceAgentSourceId = typeof spaceAgentSources[number]['id'];
export type SettingsSpaceAgent = { id: string; name: string; spaceId: SpaceAgentSourceId | null; memberId: AgentMemberId; avatarBackground?: string };
export const aiApplicationSpaces = [
  { id: 'meego', name: 'Meego', icon: '/assets/figma/admin/logo.svg' },
  { id: 'lark-office', name: 'Lark Office', icon: '/assets/figma/new-chat-spaces/lark-office.svg' },
  { id: 'aily', name: 'Aily', icon: '/assets/figma/new-chat-spaces/aily.svg' },
] as const;
export type AiApplicationSpaceId = typeof aiApplicationSpaces[number]['id'];
export type SettingsAiPreferences = { workSuggestions: boolean; independentTasks: boolean; agents: SettingsSpaceAgent[]; disabledAgents: string[]; authorizedSpaces: AiApplicationSpaceId[] };
const defaultMember = (id: string): AgentMemberId => id === 'platform' ? 'planner' : id === 'foundation' ? 'architect' : 'reviewer';
const legacyDefaultNames: Record<string, string> = { platform: '平台业务智能体', foundation: 'Foundation产研协同空间' };

export function loadSettingsAiPreferences(): SettingsAiPreferences {
  const defaults: SettingsAiPreferences = {
    workSuggestions: true, independentTasks: true, authorizedSpaces: ['meego'],
    agents: availableSpaceAgents.map(agent => ({ id: agent.id, name: agent.name, spaceId: agent.id, memberId: defaultMember(agent.id) })), disabledAgents: [],
  };
  try {
    const saved = JSON.parse(window.localStorage.getItem(settingsAiStorageKey) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;
    if (typeof saved.workSuggestions === 'boolean') defaults.workSuggestions = saved.workSuggestions;
    if (typeof saved.independentTasks === 'boolean') defaults.independentTasks = saved.independentTasks;
    if (Array.isArray(saved.authorizedSpaces)) defaults.authorizedSpaces = aiApplicationSpaces.filter(space => saved.authorizedSpaces.includes(space.id)).map(space => space.id);
    if (Array.isArray(saved.agents)) {
      const seen = new Set<string>();
      defaults.agents = saved.agents.flatMap((row: unknown): SettingsSpaceAgent[] => {
        if (!row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string' || !row.id || seen.has(row.id)
          || !('name' in row) || typeof row.name !== 'string') return [];
        seen.add(row.id);
        const source = spaceAgentSources.find(space => 'spaceId' in row && space.id === row.spaceId);
        const member = agentTemplates.find(member => member.id !== 'radar' && 'memberId' in row && member.id === row.memberId);
        const color = agentAvatarColors.find(color => 'avatarBackground' in row && color.value === row.avatarBackground);
        const defaultName = row.name === legacyDefaultNames[row.id] ? availableSpaceAgents.find(agent => agent.id === row.id)?.name : undefined;
        return [{ id: row.id, name: defaultName ?? row.name.slice(0, 80), spaceId: source?.id ?? null, memberId: member?.id ?? defaultMember(row.id), ...(color ? { avatarBackground: color.value } : {}) }];
      });
    }
    if (Array.isArray(saved.disabledAgents)) defaults.disabledAgents = defaults.agents.filter(agent => saved.disabledAgents.includes(agent.id)).map(agent => agent.id);
  } catch { /* Keep the settings usable when browser storage is unavailable. */ }
  return defaults;
}

export function saveSettingsAiPreferences(settings: SettingsAiPreferences): boolean {
  try { window.localStorage.setItem(settingsAiStorageKey, JSON.stringify(settings)); return true; }
  catch { return false; }
}
