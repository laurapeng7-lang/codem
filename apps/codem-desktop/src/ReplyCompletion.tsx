import type { ReactNode } from 'react';

export function ReplyCompletion({ durationSeconds = 192, children }: { durationSeconds?: number; children?: ReactNode }) {
  const label = `已完成（${Math.floor(durationSeconds / 60)} 分 ${durationSeconds % 60} 秒）`;
  if (children) return <details className="conversation-completion-group">
    <summary><span>{label}</span><img src="/assets/figma/settings-diff/chevron-right.svg" width="12" height="12" alt="" /></summary>
    {children}
  </details>;
  return <div className="conversation-completion">
    <p className="completed">{label}</p>
    <div className="conversation-completion-divider" aria-hidden="true"><img src="/assets/figma/chat-completion/divider.svg" width="900" height="1" alt="" /></div>
  </div>;
}
