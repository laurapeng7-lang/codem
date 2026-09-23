import { useEffect, useRef, useState, type ReactNode } from 'react';
import assets from './assets.json';
import './marketplace.css';
import { templates, agentSkills, applications, plugins, courses, marketplaceCatalogs, type CatalogCategory } from './marketplace-data';
import { createTemplatePrompt, type ReportPrompt } from './report-prompts';

const asset = (file: string) => `/assets/figma/marketplace/${file}`;
const categories = ['Discover', 'AI Apps', 'Agent Skills', 'Plugins', 'Templates'] as const;
type Category = typeof categories[number];
type Detail = { title: string; description: string; image: string; kind: string; cover?: boolean; color?: string; size?: number; roundImage?: boolean };
type SkillAction = { onChooseSkill: (selection: ReportPrompt) => void };

function OfficialBadge() {
  return <span className="marketplace-official">官方</span>;
}

function MarketplaceCatalog({ category, onDetail, onChooseSkill }: { category: CatalogCategory; onDetail: (item: Detail) => void } & SkillAction) {
  const catalog = marketplaceCatalogs[category];
  const [filter, setFilter] = useState(catalog.filters[0]);
  const items = filter === catalog.filters[0] ? catalog.items : catalog.items.filter(item => item.scenarios.includes(filter));
  return <section className={`marketplace-catalog marketplace-catalog-${catalog.kind}`} aria-label={category}>
    <div className="marketplace-filters" role="group" aria-label={`${category} 场景筛选`}>
      {catalog.filters.map(label => <button type="button" key={label} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}
    </div>
    <div className={`marketplace-catalog-grid marketplace-${catalog.kind}-grid`}>
      {items.map(item => <button
        type="button" key={item.id} data-catalog-card={catalog.kind}
        className={`marketplace-card marketplace-${catalog.kind === 'app' ? 'catalog-app' : catalog.kind}-card`}
        onClick={() => catalog.kind === 'skill'
          ? onChooseSkill(createTemplatePrompt(item))
          : onDetail({ ...item, kind: item.category ?? category, cover: catalog.kind === 'template' })}
      >
        {catalog.kind === 'app' && <>
          <span className="marketplace-catalog-app-heading">
            {item.color ? <span className="marketplace-catalog-app-icon" style={{ backgroundColor: item.color }}><img src={asset(item.image)} width={item.size ?? 20} height={item.size ?? 20} alt="" loading="lazy" /></span> : <img src={asset(item.image)} width="32" height="32" alt="" loading="lazy" />}
            <strong>{item.title}</strong>
          </span>
          <span className="marketplace-catalog-app-description">{item.description}</span>
        </>}
        {catalog.kind === 'skill' && <>
          <img className="marketplace-skill-cover" src={asset(item.image)} width="263" height="100" alt="" loading="lazy" />
          <span className="marketplace-skill-copy"><strong>{item.title}</strong><span>{item.description}</span></span>
        </>}
        {catalog.kind === 'plugin' && <>
          <span className="marketplace-plugin-heading"><span className="marketplace-plugin-icon" style={{ backgroundColor: item.color }}><img className={item.roundImage ? 'marketplace-rounded-image' : undefined} src={asset(item.image)} width={item.size ?? 42} height={item.size ?? 42} alt="" loading="lazy" /></span><span className="marketplace-plugin-name"><strong>{item.title}</strong>{item.official && <OfficialBadge />}</span></span>
          <span className="marketplace-plugin-description">{item.description}</span>
          <span className="marketplace-downloads"><img src={asset('download.svg')} width="12" height="12" alt="" />{item.downloads}</span>
        </>}
        {catalog.kind === 'template' && <>
          <span className="marketplace-template-cover"><img src={asset(item.image)} alt="" loading="lazy" /></span>
          <span className="marketplace-template-copy"><strong>{item.title}</strong><span style={{ color: item.color }}>{item.category}</span></span>
        </>}
      </button>)}
    </div>
    {items.length === 0 && <div className="marketplace-empty" role="status"><p>暂无匹配内容</p><button type="button" onClick={() => setFilter(catalog.filters[0])}>查看全部</button></div>}
  </section>;
}

function Section({ id, title, onMore, children }: { id: string; title: string; onMore?: () => void; children: ReactNode }) {
  return <section className="marketplace-section" aria-labelledby={`marketplace-${id}-heading`}>
    <header className="marketplace-section-heading">
      <h2 id={`marketplace-${id}-heading`}>{title}</h2>
      {onMore && <button type="button" className="marketplace-view-more" aria-label={`查看更多${title}`} onClick={onMore}>View more</button>}
    </header>
    {children}
  </section>;
}

function ItemDetail({ item, onClose }: { item: Detail; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="marketplace-detail" aria-labelledby="marketplace-detail-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="marketplace-detail-content">
      <button type="button" className="icon-button marketplace-detail-close" aria-label="关闭详情" onClick={onClose} autoFocus><img src={assets['preview/imgIconCloseSmallOutlined']} width="20" height="20" alt="" /></button>
      {item.cover ? <img className="marketplace-detail-cover" src={asset(item.image)} alt="" /> : <span className="marketplace-detail-icon" style={{ backgroundColor: item.color }}><img className={item.roundImage ? 'marketplace-rounded-image' : undefined} src={asset(item.image)} width={item.color ? 30 : 48} height={item.color ? 30 : 48} alt="" /></span>}
      <p className="marketplace-detail-kind">{item.kind}</p>
      <h2 id="marketplace-detail-title">{item.title}</h2>
      <p className="marketplace-detail-description">{item.description}</p>
    </div>
  </dialog>;
}

export function Marketplace({ onChooseSkill }: SkillAction) {
  const [category, setCategory] = useState<Category>('Discover');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [focusedSection, setFocusedSection] = useState<'academy' | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const scroll = useRef<HTMLElement>(null);
  const scrollToTop = () => {
    setHasScrolled(false);
    scroll.current?.scrollTo({ top: 0 });
  };
  const selectCategory = (next: Category) => {
    setCategory(next);
    setFocusedSection(null);
    scrollToTop();
  };
  const discover = category === 'Discover' && !focusedSection;
  return <main className="marketplace-page" aria-label="Marketplace" ref={scroll} data-scrolled={hasScrolled} onScroll={event => setHasScrolled(event.currentTarget.scrollTop > 0)}>
    <div className="marketplace-layout">
      <div className="marketplace-tabs" role="tablist" aria-label="市场分类">
        {categories.map((label, index) => <button
          type="button" role="tab" key={label} id={`marketplace-tab-${index}`} aria-controls="marketplace-content"
          aria-selected={category === label} tabIndex={category === label ? 0 : -1}
          className={category === label ? 'selected' : ''} onClick={() => selectCategory(label)}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + categories.length) % categories.length;
            selectCategory(categories[next]);
            document.getElementById(`marketplace-tab-${next}`)?.focus();
          }}
        >{label}</button>)}
      </div>
      <div id="marketplace-content" role="tabpanel" aria-labelledby={`marketplace-tab-${categories.indexOf(category)}`}>
        {discover && <div className="marketplace-banners">
          <article className="marketplace-main-banner">
            <img className="marketplace-banner-wash" src={asset('banner-wash.png')} alt="" />
            <img className="marketplace-banner-interface" src={asset('banner-interface.png')} alt="" />
            <div className="marketplace-banner-copy">
              <div className="marketplace-banner-brand"><img src={asset('meego.svg')} width="16" height="16" alt="" /><span>飞书项目</span></div>
              <h1>轻应用现已支持 AI 搭建</h1>
              <p>支持自然语言搭建界面与原生数据库，基于真实项目数据构建业务系统</p>
              <button type="button" onClick={() => setDetail({ title: '轻应用现已支持 AI 搭建', description: '支持自然语言搭建界面与原生数据库，基于真实项目数据构建业务系统', image: 'banner-interface.png', kind: '飞书项目 · 轻应用', cover: true })}>Learn more</button>
            </div>
          </article>
          <button type="button" className="marketplace-codem-banner" onClick={() => setDetail({ title: '飞书 CodeM 九月上新', description: '自动驾驶模式现已上线', image: 'banner-codem.png', kind: 'AI Apps', cover: true })}>
            <img className="marketplace-banner-sky" src={asset('banner-sky.png')} alt="" />
            <img className="marketplace-banner-wash" src={asset('banner-wash.png')} alt="" />
            <img className="marketplace-codem-screen" src={asset('banner-codem.png')} alt="" />
            <img className="marketplace-codem-logo" src={asset('codem-white.svg')} alt="" />
            <span className="marketplace-codem-caption"><strong>飞书 CodeM 九月上新</strong><span>自动驾驶模式现已上线</span></span>
          </button>
        </div>}
        {category !== 'Discover' && <MarketplaceCatalog key={category} category={category} onDetail={setDetail} onChooseSkill={onChooseSkill} />}
        <div className="marketplace-sections">
          {discover && <Section id="templates" title="热门模版" onMore={() => selectCategory('Templates')}>
            <div className="marketplace-template-grid">{templates.map(item => <button type="button" className="marketplace-template-card marketplace-card" key={item.title} onClick={() => setDetail({ ...item, kind: item.category, cover: true })}>
              <span className="marketplace-template-cover"><img src={asset(item.image)} alt="" loading="lazy" /></span>
              <span className="marketplace-template-copy"><strong>{item.title}</strong><span style={{ color: item.color }}>{item.category}</span></span>
            </button>)}</div>
          </Section>}
          {discover && <Section id="skills" title="热门 Agent 技能" onMore={() => selectCategory('Agent Skills')}>
            <div className="marketplace-skill-grid">{agentSkills.map(item => <button type="button" className="marketplace-skill-card marketplace-card" key={item.image} onClick={() => onChooseSkill(createTemplatePrompt(item))}>
              <img className="marketplace-skill-cover" src={asset(item.image)} width="263" height="100" alt="" loading="lazy" />
              <span className="marketplace-skill-copy"><strong>{item.title}</strong><span>{item.description}</span></span>
            </button>)}</div>
          </Section>}
          {discover && <Section id="apps" title="热门 AI 应用" onMore={() => selectCategory('AI Apps')}>
            <div className="marketplace-app-grid">{applications.map(item => <button type="button" className="marketplace-app-card marketplace-card" key={item.title} onClick={() => setDetail({ ...item, kind: 'AI Apps' })}>
              <span className={`marketplace-app-icon ${item.color ? 'has-background' : ''}`} style={{ backgroundColor: item.color }}><img src={asset(item.image)} width={item.size ?? 32} height={item.size ?? 32} alt="" loading="lazy" /></span>
              <span className="marketplace-app-copy"><span className="marketplace-app-name"><strong>{item.title}</strong>{item.official && <OfficialBadge />}</span><span className="marketplace-app-description">{item.description}</span></span>
            </button>)}</div>
          </Section>}
          {discover && <Section id="plugins" title="热门插件" onMore={() => selectCategory('Plugins')}>
            <div className="marketplace-plugin-grid">{plugins.map(item => <button type="button" className="marketplace-plugin-card marketplace-card" key={item.title} onClick={() => setDetail({ ...item, kind: 'Plugins' })}>
              <span className="marketplace-plugin-heading"><span className="marketplace-plugin-icon" style={{ backgroundColor: item.color }}><img className={item.roundImage ? 'marketplace-rounded-image' : undefined} src={asset(item.image)} width={item.size ?? 42} height={item.size ?? 42} alt="" loading="lazy" /></span><span className="marketplace-plugin-name"><strong>{item.title}</strong>{item.official && <OfficialBadge />}</span></span>
              <span className="marketplace-plugin-description">{item.description}</span>
              <span className="marketplace-downloads"><img src={asset('download.svg')} width="12" height="12" alt="" />{item.downloads}</span>
            </button>)}</div>
          </Section>}
          {(discover || focusedSection === 'academy') && <Section id="academy" title="飞书项目学院" onMore={discover ? () => { setFocusedSection('academy'); scrollToTop(); } : undefined}>
            <div className="marketplace-academy-grid">{courses.map(item => <button type="button" className={`marketplace-academy-card ${item.className}`} key={item.title} onClick={() => setDetail({ ...item, kind: item.caption, cover: true })}>
              <img className="marketplace-academy-art" src={asset(item.image)} width={item.className === 'automation' ? 360 : 300} height="200" alt="" loading="lazy" />
              <span className="marketplace-academy-copy"><span>{item.caption}</span><strong>{item.title}</strong></span>
            </button>)}</div>
          </Section>}
        </div>
      </div>
    </div>
    {detail && <ItemDetail item={detail} onClose={() => setDetail(null)} />}
  </main>;
}
