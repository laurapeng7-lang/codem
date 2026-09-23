import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { AgentAvatarChoices } from './AgentAvatarChoices';
import { codemSpaces, draftForMember, type AgentDraft } from './settings-agents';
import './create-agent-dialog.css';

const assetRoot = '/assets/settings/create-agent/';

type CreateAgentDialogProps = { onClose: () => void } & (
  | { initialValues?: never; onCreate: (draft: AgentDraft) => void; onSave?: never }
  | { initialValues: AgentDraft; onSave: (draft: AgentDraft) => void; onCreate?: never }
);

export function CreateAgentDialog({ initialValues, onClose, onCreate, onSave }: CreateAgentDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const backdropPressed = useRef(false);
  const submitted = useRef(false);
  const [draft, setDraft] = useState(() => initialValues ? { ...initialValues } : draftForMember('reviewer'));
  const [nameError, setNameError] = useState(false);
  const [panel, setPanel] = useState<'space' | 'avatar' | null>(null);
  const [activeSpace, setActiveSpace] = useState(0);
  const spaceControl = useRef<HTMLDivElement>(null);
  const spaceTrigger = useRef<HTMLButtonElement>(null);
  const avatarControl = useRef<HTMLDivElement>(null);
  const avatarTrigger = useRef<HTMLButtonElement>(null);
  const title = initialValues ? '配置智能体' : '添加智能体';
  const selectedSpace = codemSpaces.find(space => space.id === draft.spaceId)!;
  const closePanel = () => {
    if (panel === 'space') spaceTrigger.current?.focus();
    if (panel === 'avatar') avatarTrigger.current?.focus();
    setPanel(null);
  };
  const selectSpace = (index: number) => {
    setDraft(current => ({ ...current, spaceId: codemSpaces[index].id }));
    setPanel(null);
    spaceTrigger.current?.focus();
  };

  useEffect(() => {
    if (!panel) return;
    const outside = (event: PointerEvent) => {
      const container = panel === 'space' ? spaceControl.current : avatarControl.current;
      if (event.target instanceof Node && !container?.contains(event.target)) setPanel(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [panel]);

  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node?.showModal();
    node?.focus({ preventScroll: true });
    return () => {
      node?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitted.current) return;
    if (!draft.name.trim()) {
      setNameError(true);
      nameInput.current?.focus();
      return;
    }
    submitted.current = true;
    const commitDraft = onSave ?? onCreate;
    commitDraft({ ...draft, name: draft.name.trim() });
  };

  return <dialog id="create-agent-dialog" ref={dialog} className="create-agent-dialog" aria-labelledby="create-agent-title" tabIndex={-1}
    onCancel={event => { event.preventDefault(); if (panel) closePanel(); else onClose(); }}
    onKeyDown={event => { if (event.key === 'Escape' && panel) { event.preventDefault(); event.stopPropagation(); closePanel(); } }}
    onPointerDown={event => { backdropPressed.current = event.target === event.currentTarget; }}
    onClick={event => { if (event.target === event.currentTarget && backdropPressed.current) onClose(); backdropPressed.current = false; }}>
    <form className="create-agent-form" onSubmit={submit} noValidate>
      <header className="create-agent-header">
        <h2 id="create-agent-title">{title}</h2>
        <button type="button" className="create-agent-close" aria-label={`关闭${title}`} onClick={onClose}><img src={`${assetRoot}close.svg`} width={16} height={16} alt="" /></button>
      </header>
      <div className="create-agent-body">
        <div className="create-agent-field create-agent-source">
          <span id="create-agent-source-label" className="create-agent-label">智能体来源</span>
          <label className="create-agent-source-card">
            <input className="visually-hidden" type="radio" name="agent-source" value="codem" defaultChecked aria-label="飞书 CodeM" aria-describedby="create-agent-source-label" />
            <img src={`${assetRoot}radio-selected.svg`} width={16} height={16} alt="" />
            <span className="create-agent-source-icon"><img src={`${assetRoot}codem.svg`} width={17.176} height={13.987} alt="" /></span>
            <span className="create-agent-source-copy"><span>飞书 CodeM</span><span>飞书原生的 AI 研发智能体</span></span>
          </label>
        </div>
        <div className="create-agent-field create-agent-space">
          <label id="create-agent-space-label" htmlFor="create-agent-space" className="create-agent-label">选择 CodeM 空间</label>
          <div className="create-agent-select" ref={spaceControl} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPanel(current => current === 'space' ? null : current); }}>
            <button id="create-agent-space" ref={spaceTrigger} type="button" role="combobox" aria-labelledby="create-agent-space-label" aria-haspopup="listbox" aria-expanded={panel === 'space'} aria-controls={panel === 'space' ? 'create-agent-space-options' : undefined} aria-activedescendant={panel === 'space' ? `create-agent-space-option-${activeSpace}` : undefined}
              onClick={() => { setPanel(current => current === 'space' ? null : 'space'); setActiveSpace(codemSpaces.findIndex(space => space.id === draft.spaceId)); }}
              onKeyDown={event => {
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  setPanel('space');
                  setActiveSpace(current => event.key === 'Home' ? 0 : event.key === 'End' ? codemSpaces.length - 1 : panel !== 'space' ? codemSpaces.findIndex(space => space.id === draft.spaceId) : (current + (event.key === 'ArrowDown' ? 1 : -1) + codemSpaces.length) % codemSpaces.length);
                } else if (panel === 'space' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectSpace(activeSpace); }
              }}>
              <img src={selectedSpace.icon} width={20} height={20} alt="" /><span>{selectedSpace.name}</span><img className="create-agent-select-chevron" src={`${assetRoot}chevron-down.svg`} width={16} height={16} alt="" />
            </button>
            {panel === 'space' && <div id="create-agent-space-options" className="create-agent-space-options" role="listbox" aria-labelledby="create-agent-space-label">
              {codemSpaces.map((space, index) => <button key={space.id} id={`create-agent-space-option-${index}`} className={activeSpace === index ? 'is-active' : ''} type="button" role="option" aria-selected={space.id === draft.spaceId} tabIndex={-1} onPointerEnter={() => setActiveSpace(index)} onPointerDown={event => event.preventDefault()} onClick={() => selectSpace(index)}>
                <img src={space.icon} width={20} height={20} alt="" /><span>{space.name}</span><img src={`${assetRoot}chevron-right.svg`} width={16} height={16} alt="" />
              </button>)}
            </div>}
          </div>
        </div>
        <div className="create-agent-field">
          <label htmlFor="create-agent-name" className="create-agent-label">名称</label>
          <div className={`create-agent-name${nameError ? ' is-invalid' : ''}`}>
            <input id="create-agent-name" ref={nameInput} value={draft.name} maxLength={80} required aria-invalid={nameError || undefined} aria-describedby={nameError ? 'create-agent-name-error' : undefined}
              onChange={event => { setDraft(current => ({ ...current, name: event.target.value.slice(0, 80) })); setNameError(false); }} />
            <img src={`${assetRoot}name-suffix.svg`} width={16} height={16} alt="" />
          </div>
          {nameError && <p id="create-agent-name-error" className="create-agent-error" role="alert">请输入智能体名称</p>}
        </div>
        <div className="create-agent-field create-agent-avatar-field" ref={avatarControl} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPanel(current => current === 'avatar' ? null : current); }}>
          <span id="create-agent-avatar-label" className="create-agent-label">头像</span>
          <button type="button" ref={avatarTrigger} className="create-agent-avatar-trigger" aria-label="切换头像形象和背景色" aria-expanded={panel === 'avatar'} aria-controls={panel === 'avatar' ? 'create-agent-avatar-options' : undefined} onClick={() => setPanel(current => current === 'avatar' ? null : 'avatar')}>
            <AgentAvatar className="create-agent-avatar" src={draft.avatar} background={draft.avatarBackground} alt={`${draft.name || '智能体'}头像`} />
          </button>
          {panel === 'avatar' && <div id="create-agent-avatar-options" className="create-agent-avatar-options" role="group" aria-label="头像设置">
            <AgentAvatarChoices memberId={draft.memberId} background={draft.avatarBackground}
              onMemberChange={memberId => setDraft(current => ({ ...current, memberId, avatar: draftForMember(memberId).avatar }))}
              onBackgroundChange={avatarBackground => setDraft(current => ({ ...current, avatarBackground }))} onClose={closePanel} />
          </div>}
        </div>
        <div className="create-agent-field">
          <label htmlFor="create-agent-description" className="create-agent-label">描述</label>
          <div className="create-agent-textarea">
            <textarea id="create-agent-description" value={draft.description} maxLength={200} aria-describedby="create-agent-description-count" onChange={event => setDraft(current => ({ ...current, description: event.target.value.slice(0, 200) }))} />
            <span id="create-agent-description-count" className="create-agent-count">{draft.description.length}/200</span>
          </div>
        </div>
        <div className="create-agent-field">
          <div className="create-agent-label"><label htmlFor="create-agent-instructions">操作规范说明</label><img src={`${assetRoot}info.svg`} width={16} height={16} alt="" title="说明智能体操作项目时需要遵守的规则" /></div>
          <div className="create-agent-textarea">
            <textarea id="create-agent-instructions" value={draft.instructions} maxLength={200} aria-describedby="create-agent-instructions-count" onChange={event => setDraft(current => ({ ...current, instructions: event.target.value.slice(0, 200) }))} />
            <span id="create-agent-instructions-count" className="create-agent-count">{draft.instructions.length}/200</span>
          </div>
        </div>
      </div>
      <footer className="create-agent-footer"><button type="button" onClick={onClose}>取消</button><button type="submit" className="create-agent-confirm">{initialValues ? '保存' : '确定'}</button></footer>
    </form>
  </dialog>;
}
