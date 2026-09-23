import assets from './assets.json';
import content from './framework-content.json';
import './framework.css';

type TextNode = keyof typeof content;

function FigmaText({ node }: { node: TextNode }) {
  return content[node].map((part, index) => part.bold
    ? <strong key={index}>{part.text}</strong>
    : <span key={index}>{part.text}</span>);
}

const columnNames = ['分析内容', '分析逻辑', '分析产出'];

function AnalysisTable({ nodes, label, compact = false }: { nodes: [TextNode, TextNode, TextNode]; label: string; compact?: boolean }) {
  return (
    <dl className={`framework-table ${compact ? 'framework-table-compact' : ''}`} aria-label={label}>
      {nodes.map((node, index) => (
        <div className="framework-column" key={node}>
          <dt>{columnNames[index]}</dt>
          <dd className="framework-cell" tabIndex={compact && index === 1 ? 0 : undefined} aria-label={compact && index === 1 ? '分析逻辑，滚动查看更多' : undefined}>
            <p><FigmaText node={node} /></p>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function FrameworkDocument() {
  return (
    <article className="framework-document" aria-label="进行中项目进展与风险诊断报告" data-node-id="1:9121">
      <header className="framework-section">
        <h2><FigmaText node="1:9123" /></h2>
        <p><FigmaText node="1:9124" /></p>
      </header>
      <div className="framework-divider" aria-hidden="true"><img src={assets['framework/imgVector7714']} alt="" width="592" height="1" /></div>
      <section className="framework-section" aria-labelledby="framework-overview">
        <h3 id="framework-overview"><FigmaText node="1:9127" /></h3>
        <p><FigmaText node="1:9128" /></p>
        <h3><FigmaText node="1:9129" /></h3>
        <AnalysisTable label="全局交付进度盘点分析" nodes={['1:9135', '1:9140', '1:9145']} />
      </section>
      <section className="framework-section" aria-labelledby="framework-milestones">
        <h3 id="framework-milestones"><FigmaText node="1:9147" /></h3>
        <AnalysisTable label="关键里程碑与高优需求达标率分析" nodes={['1:9153', '1:9158', '1:9163']} />
      </section>
      <section className="framework-section" aria-labelledby="framework-risks">
        <h3 id="framework-risks"><FigmaText node="1:9165" /></h3>
        <p><FigmaText node="1:9166" /></p>
        <div className="framework-section">
          <h3><FigmaText node="1:9168" /></h3>
          <p><FigmaText node="1:9169" /></p>
        </div>
        <h3><FigmaText node="1:9170" /></h3>
        <AnalysisTable label="延期事项对后续关键交付的影响分析" nodes={['1:9176', '1:9181', '1:9186']} compact />
      </section>
    </article>
  );
}
