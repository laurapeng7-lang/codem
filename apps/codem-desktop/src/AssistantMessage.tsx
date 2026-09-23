import { createMockChatReply } from './work-item-chat-replies';
import { createSettingsChatReply } from './settings-chat';
import { SettingsExecutionMessage } from './SettingsExecutionMessage';
import { settingsExecutionKey } from './settings-chat-execution';
import { ReplyCompletion } from './ReplyCompletion';
import type { SettingsReview } from './settings-review';
import type { DevelopmentReply } from './development-chat-content';
import { ExecutionLog } from './ExecutionLog';
export { ReplyCompletion } from './ReplyCompletion';

export function AssistantMessage({ prompt, workItem, settings, previousPrompts, summary, executionId, onReviewChanges, developmentReply }: {
  prompt: string;
  workItem?: { title: string; href: string };
  settings?: { title: string; href: string };
  previousPrompts?: readonly string[];
  summary?: string;
  executionId?: string;
  onReviewChanges?: (review: SettingsReview) => void;
  developmentReply?: DevelopmentReply;
}) {
  const reply = settings ? createSettingsChatReply(prompt, previousPrompts) : workItem ? createMockChatReply(prompt, workItem, previousPrompts) : developmentReply;
  if (settings) return <section className="conversation-assistant-message" aria-label="AI 回复" data-reply-scenario={reply?.scenario}>
    <SettingsExecutionMessage key={executionId ?? prompt} prompt={prompt} previousPrompts={previousPrompts} executionId={executionId ?? settingsExecutionKey(prompt)} onReviewChanges={onReviewChanges} />
  </section>;
  return <section className="conversation-assistant-message" aria-label="AI 回复" data-reply-scenario={reply?.scenario}>
    <ReplyCompletion durationSeconds={reply?.durationSeconds}>{developmentReply && developmentReply.process.length > 0 && <div className="settings-execution-transcript" aria-label="开发任务处理过程">
      {developmentReply.process.map((step, index) => <section key={index} className="settings-execution-transcript">
        <p className="settings-execution-narration">{step.narration}</p>
        <ExecutionLog calls={step.calls}>{`已整理 · ${step.calls.length} 项检查`}</ExecutionLog>
      </section>)}
    </div>}</ReplyCompletion>
    <div className="conversation-reply-body">
      {reply ? <>
        <p>{reply.introduction}</p>
        <p><strong>{reply.recommendation}</strong></p>
        {reply.sections.map(section => <section key={section.title}>
          <h3>{section.title}</h3>
          <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>
        </section>)}
        {'requirement' in reply && reply.requirement && <section><h3>结合你的补充要求</h3><p className="conversation-reply-requirement">{reply.requirement.text}</p><p>{reply.requirement.response}</p></section>}
        <p>{reply.conclusion}</p>
      </> : <p>{summary}</p>}
    </div>
  </section>;
}
