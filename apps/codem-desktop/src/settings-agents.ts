export const defaultAgentInstructions = '互联网-产品研发是平台业务线的产研协作空间，所有 meego 节点需要人确认。流转节点前需要阅读节点操作说明。';

export const agentTemplates = [
  { id: 'planner', name: 'Planner', member: '需求规划专家', description: '拆需求、排计划、追里程碑' },
  { id: 'architect', name: 'Architect', member: '技术架构专家', description: '看技术方案、依赖和架构风险' },
  { id: 'reviewer', name: 'Reviewer', member: '代码审查专家', description: '辅助架构设计与技术评审' },
  { id: 'tester', name: 'Tester', member: '测试验收专家', description: '补用例、验收变更、发现回归' },
  { id: 'sheriff', name: 'Sheriff', member: '问题排查专家', description: '盯 Bug、阻塞和线上异常' },
  { id: 'release', name: 'Release', member: '发布管理专家', description: '检查发布条件与遗留风险' },
  { id: 'radar', name: 'Radar', member: '项目洞察专家', description: '跨项目扫描进度、资源与风险' },
] as const;

export type AgentMemberId = typeof agentTemplates[number]['id'];
export const codemSpaces = [
  { id: 'frontend', name: '前端研发', icon: '/assets/settings/create-agent/space-frontend.png' },
  { id: 'backend', name: '服务端研发', icon: '/assets/settings/create-agent/space-backend.png' },
] as const;
export const agentAvatarColors = [
  { name: '蓝色', value: '#3067FF' }, { name: '粉色', value: '#FE2B98' },
  { name: '橙色', value: '#FF6924' }, { name: '紫色', value: '#8533FF' },
  { name: '绿色', value: '#2ABB1F' }, { name: '青色', value: '#27BED9' },
  { name: '灰色', value: '#8F959E' }, { name: '深蓝色', value: '#243CC7' },
] as const;
export type AgentSpaceId = typeof codemSpaces[number]['id'];
export type AgentDraft = { memberId: AgentMemberId; spaceId: AgentSpaceId; name: string; description: string; instructions: string; avatar: string; avatarBackground?: string };
export type SettingsAgent = AgentDraft & { id: string };

export function draftForMember(memberId: AgentMemberId): AgentDraft {
  const member = agentTemplates.find(agent => agent.id === memberId)!;
  // Radar starts disabled, but its saved appearance must be an awake, selectable avatar.
  // The sleeping avatar is only an overlay for disabled cards and drawers.
  const avatarMemberId = memberId === 'radar' ? 'release' : memberId;
  return {
    memberId: avatarMemberId, spaceId: 'frontend', name: member.name, description: member.description, instructions: defaultAgentInstructions,
    avatar: avatarMemberId === 'reviewer' ? '/assets/settings/create-agent/reviewer-avatar.png' : `/assets/settings/${avatarMemberId}.png`,
  };
}

export const initialSettingsAgents: SettingsAgent[] = agentTemplates.map(agent => {
  const draft = draftForMember(agent.id);
  return { ...draft, id: agent.id, avatar: `/assets/settings/${draft.memberId}.png` };
});
