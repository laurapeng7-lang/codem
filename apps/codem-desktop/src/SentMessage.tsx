import { sentPromptSegments } from './prompt-content';

export function SentMessage({ text, workItem }: { text: string; workItem?: { title: string; href: string } }) {
  return <p className="conversation-user-message" data-message-role="user">
    {sentPromptSegments(text).map((segment, index) => !segment.emphasized ? segment.text : index === 1 && workItem ?
      <a className="conversation-message-reference" href={workItem.href} title={workItem.title} key={index}>{segment.text}</a> :
      <strong key={index}>{segment.text}</strong>)}
  </p>;
}
