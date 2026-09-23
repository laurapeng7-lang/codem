import { AgentAvatar } from './AgentAvatar';
import { agentTemplates, agentAvatarColors, draftForMember, type AgentMemberId } from './settings-agents';

export function AgentAvatarChoices({ memberId, background, onMemberChange, onBackgroundChange, onClose }: {
  memberId: AgentMemberId; background?: string; onMemberChange: (id: AgentMemberId) => void;
  onBackgroundChange: (color: string) => void; onClose: () => void;
}) {
  const selectedBackground = background ?? agentAvatarColors[agentTemplates.findIndex(member => member.id === memberId)]?.value;
  return <>
    <div className="create-agent-avatar-options-heading"><span>形象</span><button type="button" aria-label="关闭头像设置" onClick={onClose}><img src="/assets/settings/create-agent/close.svg" width={16} height={16} alt="" /></button></div>
    <div className="create-agent-avatar-shapes" role="group" aria-label="选择头像形象">{agentTemplates.filter(member => member.id !== 'radar').map(member => <button key={member.id} type="button" aria-label={`${member.name} 形象`} aria-pressed={memberId === member.id} onClick={() => onMemberChange(member.id)}><AgentAvatar src={draftForMember(member.id).avatar} background="#D3D3D3" size={40} /></button>)}</div>
    <span className="create-agent-avatar-options-heading">背景色</span>
    <div className="create-agent-avatar-colors" role="group" aria-label="选择头像背景色">{agentAvatarColors.map(color => <button key={color.value} type="button" style={{ backgroundColor: color.value }} aria-label={`${color.name}背景`} aria-pressed={selectedBackground === color.value} onClick={() => onBackgroundChange(color.value)} />)}</div>
  </>;
}
