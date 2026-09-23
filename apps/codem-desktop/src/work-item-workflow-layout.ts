import workflow from './work-item-workflow.json';

export const workflowLogoWidth = 15.345268249511719;
const logoGap = 4;
const horizontalPadding = 16;
const additionalLogoNodes = new Set(['DA Tracking', 'QA JAB', 'PM Audit', 'Pre release']);

export function hasWorkflowLogo(label: string) {
  return /\b(?:tech|dev)\b/i.test(label) || additionalLogoNodes.has(label);
}

const columns = [...new Set(workflow.nodes.map(node => node.x))].sort((a, b) => a - b).map(x => {
  const nodes = workflow.nodes.filter(node => node.x === x);
  return { x, nodes, width: Math.max(...nodes.map(node => node.width)) };
});

/** Grow entire columns together so the original branch spacing and vertical lanes stay intact. */
export function layoutWorkflow(contentWidths: Readonly<Record<string, number>> = {}) {
  let offset = 0;
  const layoutColumns = columns.map(column => {
    const width = Math.max(column.width, ...column.nodes.map(node => {
      const measured = contentWidths[node.id];
      return measured > 0 && Number.isFinite(measured)
        ? measured + horizontalPadding
        : node.width + (hasWorkflowLogo(node.label) ? workflowLogoWidth + logoGap : 0);
    }));
    const growth = width - column.width;
    const result = { ...column, width, growth, offset };
    offset += growth;
    return result;
  });
  const byX = new Map(layoutColumns.map(column => [column.x, column]));
  // Export bounds include a few pixels of transparent padding around each endpoint.
  // The column midpoint separates incoming (left) from outgoing (right) anchors.
  const connectorX = (x: number) => x + layoutColumns.reduce((shift, column) =>
    shift + (x > column.x + (column.width - column.growth) / 2 ? column.growth : 0), 0);

  return {
    width: workflow.width + offset,
    height: workflow.height,
    nodes: workflow.nodes.map(node => {
      const column = byX.get(node.x)!;
      return { ...node, x: node.x + column.offset, width: column.width, hasLogo: hasWorkflowLogo(node.label) };
    }),
    connectors: workflow.connectors.map(line => {
      const x = connectorX(line.x);
      const width = connectorX(line.x + line.width) - x;
      const scaleX = Math.abs(width - line.width) < .01 ? 1 : width / line.width;
      return { ...line, x, scaleX };
    }),
  };
}
