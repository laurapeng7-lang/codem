import { useLayoutEffect, useRef, useState } from 'react';
import workflow from './work-item-workflow.json';
import { layoutWorkflow, workflowLogoWidth } from './work-item-workflow-layout';
import './work-item-workflow.css';

const assetRoot = '/assets/figma/work-item-workflow/';
const statusLabels: Record<string, string> = { completed: '已完成', current: '进行中', pending: '未开始' };
export type WorkItemWorkflowNode = 'Initial Review' | 'Detail Review' | 'DA Tracking';

/** DOM nodes with geometry and connector assets exported from Figma 44:17221. */
export function WorkItemWorkflow({ selectedNode = 'Detail Review', onSelectNode }: {
  selectedNode?: WorkItemWorkflowNode;
  onSelectNode?: (node: WorkItemWorkflowNode) => void;
} = {}) {
  const viewport = useRef<HTMLDivElement>(null);
  const nodeList = useRef<HTMLOListElement>(null);
  const [contentWidths, setContentWidths] = useState<Record<string, number>>({});
  const layout = layoutWorkflow(contentWidths);
  useLayoutEffect(() => {
    // Match the existing drawer's opening view without shrinking the graph on narrow screens.
    if (viewport.current) viewport.current.scrollLeft = workflow.initialScrollLeft;
  }, []);
  useLayoutEffect(() => {
    const contents = nodeList.current?.querySelectorAll<HTMLElement>('[data-workflow-content]');
    if (!contents?.length) return;
    const measure = () => {
      const widths: Record<string, number> = {};
      contents.forEach(content => {
        const width = content.getBoundingClientRect().width;
        if (width > 0) widths[content.dataset.workflowContent!] = width;
      });
      setContentWidths(previous => Object.keys(widths).length === Object.keys(previous).length &&
        Object.entries(widths).every(([id, width]) => Math.abs(width - (previous[id] ?? 0)) < .01) ? previous : widths);
    };
    measure();
    // Observe intrinsic content, not the sized node, to avoid a resize feedback loop.
    // This also updates the layout when the web font finishes loading.
    const observer = new ResizeObserver(measure);
    contents.forEach(content => observer.observe(content));
    return () => observer.disconnect();
  }, []);

  return <div ref={viewport} className="work-detail-flow" role="region" aria-label="工作项流程，可横向滚动查看" tabIndex={0}>
    <div className="work-flow-canvas" style={{ width: layout.width, height: layout.height }}>
      <div className="work-flow-connectors" aria-hidden="true">
        {layout.connectors.map(line => <img key={line.id} className="work-flow-connector" src={`${assetRoot}${line.asset}`}
          style={{ left: line.x, top: line.y, width: line.width, height: line.height, transform: line.scaleX === 1 ? undefined : `scaleX(${line.scaleX})` }} alt="" draggable="false" />)}
      </div>
      <ol ref={nodeList} className="work-flow-nodes" aria-label="流程节点">
        {layout.nodes.map(node => <li key={node.id} className={`work-flow-node is-${node.state}${node.label === selectedNode ? ' is-selected' : ''}`} data-workflow-node={node.id}
          style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
          aria-current={node.state === 'current' ? 'step' : undefined} aria-label={`${node.label}，${statusLabels[node.state]}`}>
          {(node.label === 'Initial Review' || node.label === 'DA Tracking' || node.label === 'Detail Review') && <button type="button" className="work-flow-node-select"
            aria-label={`查看 ${node.label} 节点`} aria-pressed={node.label === selectedNode} aria-controls="work-detail-node-card"
            onClick={() => onSelectNode?.(node.label as WorkItemWorkflowNode)} />}
          <span className="work-flow-node-content" data-workflow-content={node.id}>
            <img className="work-flow-status" src={`${assetRoot}${node.state}.svg`} width={10} height={10} alt="" draggable="false" />
            {node.hasLogo && <img className="work-flow-logo" src={`${assetRoot}codem-logo.svg`} width={workflowLogoWidth} height={12} alt="CodeM" draggable="false" />}
            <span className="work-flow-label">{node.label}</span>
          </span>
          {node.hasLogo && <span className="work-flow-agent-badge" aria-label="CodeM 智能体"><span className="work-flow-agent-symbol" aria-hidden="true" /></span>}
        </li>)}
      </ol>
    </div>
  </div>;
}
