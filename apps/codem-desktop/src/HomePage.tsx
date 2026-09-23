import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import assets from './assets.json';
import { CodeMLogo } from './CodeMLogo';
import { NewChatIcon, NewChatToolbar } from './NewChatToolbar';
import { cloudEnvironment, type ConversationEnvironment } from './conversation-history';
import { homeAssetRoot, homeEntries, homeRecommendations, homeSpaces, visibleHomeEntries, type HomeEntry } from './home-data';
import './home.css';

function HomeIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <img src={`${homeAssetRoot}${name}`} width={size} height={size} alt="" draggable="false" />;
}

/** Home dashboard matching Figma 119:47771; shared navigation owns page transitions. */
export function HomePage({ onNavigate, onSend, onStartChat, notify }: {
  onNavigate: (destination: string) => void;
  onSend: (prompt: string, environment: ConversationEnvironment) => void;
  onStartChat: (prompt: string) => void;
  notify: (message: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [tab, setTab] = useState<'favorites' | 'frequent'>('favorites');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [flat, setFlat] = useState(false);
  const [space, setSpace] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const environment = useRef(cloudEnvironment);
  const rows = visibleHomeEntries(tab, expanded, removed, flat, space);

  const resizeInput = useCallback(() => {
    const field = input.current;
    if (!field) return;
    const scrollTop = field.scrollTop;
    field.style.height = '51.689px';
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
    field.scrollTop = scrollTop;
  }, []);
  useLayoutEffect(resizeInput, [draft, resizeInput]);
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      resizeInput();
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [resizeInput]);

  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('[data-home-menu]')) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [menu]);

  const toggleMenu = (name: string) => setMenu(current => current === name ? null : name);
  const toggleFolder = (id: string) => setExpanded(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const submit = () => {
    if (!draft.trim()) return;
    onSend([draft.trim(), ...attachments.map(name => `附件：${name}`)].join('\n'), environment.current);
  };
  const openEntry = (entry: HomeEntry) => {
    setMenu(null);
    if (entry.kind === 'folder') toggleFolder(entry.id);
    else onNavigate(entry.application);
  };
  const insertPrompt = (value: string) => { setDraft(current => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${value}`); setMenu(null); input.current?.focus(); };

  return <main className="home-page" aria-label="Home">
    <div className="home-content">
      <section className="home-intro" aria-labelledby="home-title">
        <h1 id="home-title"><CodeMLogo size={36} /><span>开启今日工作，<span>CodeM</span> 随时待命</span></h1>
        <form className="composer home-composer" onSubmit={event => { event.preventDefault(); submit(); }}>
          {attachments.length > 0 && <div className="home-attachments">{attachments.map((name, index) => <button key={`${name}-${index}`} type="button" aria-label={`移除附件 ${name}`} onClick={() => setAttachments(current => current.filter((_, i) => i !== index))}><HomeIcon name="attachment.svg" size={12} /><span>{name}</span><img src={assets['preview/imgIconCloseSmallOutlined']} width={12} height={12} alt="" /></button>)}</div>}
          <textarea ref={input} aria-label="Home 消息输入框" placeholder="What can I help you today?" rows={2} maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); submit(); }
          }} />
          <div data-home-menu>
            <NewChatToolbar onEnvironmentChange={next => { environment.current = next; }} onAttach={() => fileInput.current?.click()} onMention={() => setMenu('mention')} onSkill={() => setMenu('skill')} onMenuOpen={() => setMenu(null)} notify={notify} scrollContainerSelector=".home-page" menuPlacement="bottom">
              <button type="submit" className="send-button" data-editable={true} aria-label="发送消息" title="发送消息" disabled={!draft.trim()}><NewChatIcon name="send" size={15.076} /></button>
            </NewChatToolbar>
            {(menu === 'mention' || menu === 'skill') && <div className="home-popover home-composer-menu" role="group" aria-label={menu === 'mention' ? '引用项目' : '选择技能'}>{(menu === 'mention' ? homeSpaces.map(item => `@${item.name} `) : ['总结本周项目进展与风险', '梳理高优先级需求', '规划下一轮迭代']).map(label => <button key={label} type="button" onClick={() => insertPrompt(label)}>{label}</button>)}</div>}
          </div>
          <input ref={fileInput} type="file" multiple className="visually-hidden" tabIndex={-1} aria-label="选择 Home 附件" onChange={event => { setAttachments(current => [...current, ...Array.from(event.target.files ?? []).map(file => file.name)]); event.target.value = ''; }} />
        </form>
      </section>

      <section className="home-for-you" aria-labelledby="home-for-you-title">
        <h2 id="home-for-you-title">For you</h2>
        <div className="home-recommendations">{homeRecommendations.map(card => <button key={card.id} type="button" className={`home-recommendation home-recommendation-${card.id}`} onClick={() => {
          if (card.id === 'weekly') onStartChat('请生成本周项目进展周报，汇总关键成果、交付风险和下周计划。');
          else onNavigate(card.id === 'template' ? 'Marketplace' : 'Story-3');
        }}>
          {card.id === 'weekly' && <><span className="home-weekly-glow home-weekly-glow-left" aria-hidden="true"><img src={`${homeAssetRoot}weekly-glow-left.svg`} alt="" /></span><span className="home-weekly-glow home-weekly-glow-right" aria-hidden="true"><img src={`${homeAssetRoot}weekly-glow-right.svg`} alt="" /></span></>}
          <span className="home-recommendation-label">{card.category}</span><strong>{card.title}</strong>
          <img className="home-recommendation-art" src={`${homeAssetRoot}${card.image}`} width={card.id === 'create' ? 176 : 179} height={card.id === 'create' ? 88 : 96} alt="" draggable="false" />
          <span className="home-recommendation-cta" aria-hidden="true">立即使用<HomeIcon name="send.svg" size={12} /></span>
        </button>)}</div>
      </section>

      <section className="home-spaces" aria-labelledby="home-spaces-title">
        <header><h2 id="home-spaces-title">我的空间</h2><div className="home-spaces-more" data-home-menu><button type="button" className="home-see-all" aria-expanded={menu === 'spaces'} onClick={() => toggleMenu('spaces')}>查看全部<HomeIcon name="chevron-right.svg" size={12} /></button>{menu === 'spaces' && <div className="home-popover">{homeSpaces.map(item => <button key={item.name} type="button" onClick={() => onNavigate(item.application)}>{item.name}</button>)}</div>}</div></header>
        <div className="home-space-grid">{homeSpaces.map(item => <button key={item.name} type="button" className="home-space" onClick={() => onNavigate(item.application)}><span className="home-space-avatar" style={{ background: item.color }}>{item.initial}</span><span>{item.name}</span></button>)}</div>
      </section>

      <section className="home-resources" aria-label="我的常用与收藏">
        <div className="home-resource-toolbar">
          <div className="home-resource-tabs" role="tablist" aria-label="资源分类">{(['frequent', 'favorites'] as const).map(value => <button key={value} type="button" role="tab" id={`home-${value}-tab`} aria-selected={tab === value} aria-controls="home-resources-panel" tabIndex={tab === value ? 0 : -1} onClick={() => { setTab(value); setMenu(null); }} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); const next = event.key === 'Home' ? 'frequent' : event.key === 'End' ? 'favorites' : value === 'favorites' ? 'frequent' : 'favorites';
            setTab(next); document.getElementById(`home-${next}-tab`)?.focus();
          }}>{value === 'frequent' ? '我的常用' : '我的收藏'}</button>)}</div>
          <div className="home-resource-view" role="group" aria-label="资源显示方式"><button type="button" aria-label="分组视图" aria-pressed={!flat} onClick={() => setFlat(false)}><HomeIcon name="grid.svg" size={12} /></button><button type="button" aria-label="展开列表视图" aria-pressed={flat} onClick={() => setFlat(true)}><HomeIcon name="list.svg" size={12} /></button></div>
        </div>
        <div id="home-resources-panel" role="tabpanel" aria-labelledby={`home-${tab}-tab`} className="home-resource-scroll">
          <table className="home-resource-table"><colgroup><col className="home-name-column" /><col /><col className="home-actions-column" /></colgroup>
            <thead><tr><th scope="col">名称</th><th scope="col"><div className="home-space-filter" data-home-menu><button type="button" aria-label="筛选所属空间" aria-expanded={menu === 'filter'} className={space ? 'is-filtered' : ''} onClick={() => toggleMenu('filter')}>所属空间<HomeIcon name="filter.svg" size={12} /></button>{menu === 'filter' && <div className="home-popover" role="group" aria-label="所属空间">{[['', '全部空间'], ['Meego', 'Meego'], ['-', '未分配空间']].map(([value, label]) => <button type="button" key={value} aria-pressed={space === value} onClick={() => { setSpace(value); setMenu(null); }}>{label}</button>)}</div>}</div></th><th scope="col">快捷操作</th></tr></thead>
            <tbody>{rows.map(entry => <tr key={entry.id}>
              <td><button type="button" className="home-resource-name" style={{ '--home-row-depth': entry.depth } as CSSProperties} aria-label={`${entry.kind === 'folder' ? '展开' : '打开'} ${entry.name}`} aria-expanded={entry.kind === 'folder' ? flat || expanded.includes(entry.id) : undefined} onClick={() => openEntry(entry)}>
                <span className="home-resource-chevron">{entry.kind === 'folder' && <img src={assets['sidebar/imgIconExpandRightFilled']} width={6} height={6} alt="" className={flat || expanded.includes(entry.id) ? 'is-expanded' : ''} />}</span>
                <span className={`home-resource-icon is-${entry.kind}`}>{entry.kind === 'folder' ? <HomeIcon name={entry.icon!} size={24} /> : entry.kind === 'file' ? <span><HomeIcon name="file.svg" size={10} /></span> : <span><img src={assets['sidebar/imgIconListViewOutlined']} width={10} height={10} alt="" /></span>}</span>
                <span className="home-resource-title">{entry.name}</span>
              </button></td><td>{entry.space}</td><td><div className="home-resource-actions" data-home-menu><button type="button" className="home-more" aria-label={`${entry.name} 快捷操作`} aria-expanded={menu === entry.id} onClick={() => toggleMenu(entry.id)}><HomeIcon name="more.svg" /></button>{menu === entry.id && <div className="home-popover"><button type="button" onClick={() => { setMenu(null); onNavigate(entry.application); }}>打开</button><button type="button" onClick={() => {
                  setMenu(null); void navigator.clipboard.writeText(entry.name).then(() => notify('名称已复制')).catch(() => notify('无法访问剪贴板，请选择文字复制'));
                }}>复制名称</button>{tab === 'favorites' && homeEntries.some(item => item.id === entry.id) && <button type="button" onClick={() => { setRemoved(current => [...current, entry.id]); setMenu(null); }}>取消收藏</button>}</div>}</div></td>
            </tr>)}</tbody>
          </table>
          {!rows.length && <p className="home-empty">暂无匹配的内容</p>}
        </div>
      </section>
    </div>
  </main>;
}
