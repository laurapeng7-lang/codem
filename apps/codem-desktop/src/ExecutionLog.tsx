import type { AgentToolCall } from './work-item-agent-execution';
import './work-item-agent-panel.css';

const assetRoot = '/assets/figma/work-item-agent-panel/';
function ToolIcon({ name, size = 20 }: { name: string; size?: number }) {
  return <img src={`${assetRoot}${name}.svg`} width={size} height={size} alt="" draggable="false" />;
}

export function ExecutionLog({ terminal = false, running = false, canceled = false, calls, children }: { terminal?: boolean; running?: boolean; canceled?: boolean; calls: readonly AgentToolCall[]; children: string }) {
  return <details className={`work-agent-log${running ? ' is-running' : ''}`}>
    <summary><ToolIcon name={terminal ? 'terminal' : 'explored'} /><span>{children}</span><ToolIcon name="chevron" size={14} /></summary>
    <ul className="work-agent-log-calls" aria-label={canceled ? '已停止的工具调用' : '工具调用'}>{calls.map((call, index) => {
      const active = running && !canceled && index === calls.length - 1;
      const label = call.detail && !active && !canceled ? `${call.name}：${call.detail}` : call.name;
      return <li key={call.name} className={`work-agent-log-call${active ? ' is-running' : ''}`}>
        <ToolIcon name={call.terminal ? 'terminal' : 'explored'} /><span title={label}>{label}</span>
      </li>;
    })}</ul>
  </details>;
}
