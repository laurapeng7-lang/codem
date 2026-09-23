import { useState, type KeyboardEvent } from 'react';
import assets from './assets.json';
import tools from './codem-tools-data.json';
import './codem-page.css';
import './codem-tools.css';

const tabs = [{ id: 'popular', label: '热门' }, { id: 'installed', label: '已安装' }] as const;
const categories = [{ id: 'plugin', label: '插件' }, { id: 'skill', label: '技能' }] as const;
type ToolsTab = typeof tabs[number]['id'];

export function CodeMTools({ notify, onToggleNavigation }: { notify: (message: string) => void; onToggleNavigation: () => void }) {
  const [tab, setTab] = useState<ToolsTab>('popular');
  const [query, setQuery] = useState('');
  const search = query.trim().toLocaleLowerCase();
  // Seeded installation state for the frontend catalog.
  const visibleTools = tools.filter(tool => (tab !== 'installed' || tool.installed)
    && `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(search));
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[next].id);
    document.getElementById(`codem-tools-tab-${tabs[next].id}`)?.focus();
  };

  return <main className="codem-tools-workspace">
    <section className="codem-tools-panel" aria-labelledby="codem-tools-title">
      <header className="codem-tools-header">
        <button type="button" className="icon-button desktop-nav-toggle" aria-label="打开导航" onClick={onToggleNavigation}><img src={assets['sidebar/img24X24']} width="16" height="16" alt="" /></button>
        <h1 id="codem-tools-title">Tools</h1>
      </header>
      <div className="codem-tools-scroll">
        <div className="codem-tools-toolbar">
          <div className="codem-tools-tabs" role="tablist" aria-label="工具列表">
            {tabs.map((item, index) => <button key={item.id} type="button" role="tab" id={`codem-tools-tab-${item.id}`} aria-selected={tab === item.id}
              aria-controls="codem-tools-results" tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => onTabKeyDown(event, index)}>{item.label}</button>)}
          </div>
          <div className="codem-tools-actions">
            <label className="codem-tools-search"><img src="/assets/figma/codem-tools/search.svg" width="16" height="16" alt="" /><input type="search" aria-label="搜索工具" placeholder="搜索" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <button type="button" className="codem-tools-upload" onClick={() => notify('本地上传暂未接入')}>本地上传</button>
          </div>
        </div>
        <div id="codem-tools-results" className="codem-tools-results" role="tabpanel" aria-labelledby={`codem-tools-tab-${tab}`} tabIndex={0}>
          {tab === 'popular' && <section className="codem-tools-banner" aria-labelledby="codem-tools-banner-title">
            <div className="codem-tools-banner-copy">
              <div className="codem-tools-banner-text">
                <h2 id="codem-tools-banner-title">从项目代码仓库生成 <span>Harness</span> 流程</h2>
                <p>根据研发规范自动生成、迭代、沉淀标准化研发流程</p>
              </div>
              <button type="button" className="codem-tools-banner-details" onClick={() => notify('详情页面暂未接入')}>了解详情</button>
            </div>
            <img className="codem-tools-banner-illustration" src="/assets/figma/codem-tools-banner/daily-bug-scan.png" width="1037" height="356" alt="" draggable="false" />
          </section>}
          {visibleTools.length ? categories.map(category => {
            const items = visibleTools.filter(tool => tool.category === category.id);
            return items.length ? <section key={category.id} className="codem-tools-category" aria-labelledby={`codem-tools-${category.id}`}>
              <h2 id={`codem-tools-${category.id}`}>{category.label}</h2>
              <ul className="codem-tools-grid">{items.map(tool => <li key={tool.id} className={`codem-tool-card${tool.relaxed ? ' is-relaxed' : ''}`} data-tool={tool.id}>
                <img className="codem-tool-icon" src={tool.icon} width="50" height="50" alt="" draggable="false" />
                <div className="codem-tool-copy"><h3 className={tool.titleWeight === 600 ? 'is-latin' : undefined}>{tool.name}</h3><p title={tool.description}>{tool.description}</p></div>
              </li>)}</ul>
            </section> : null;
          }) : <p className="codem-tools-empty" role="status">{tab === 'installed' ? (search ? '未找到匹配的已安装工具' : '暂无已安装的工具') : '未找到匹配的工具'}</p>}
        </div>
      </div>
    </section>
  </main>;
}
