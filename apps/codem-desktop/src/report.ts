export const reportTitle = '项目进展与风险分析报告';
export const reportIntro = '覆盖当前进行中的项目、需求及其近期动态,回答整体交付推进到什么程度、关键目标是否按计划达成,以及进展主要集中在哪里,为后续风险识别建立统一分析基线。';
export const reportSummary = '已生成《项目进展与风险分析报告》，涵盖整体进展、关键里程碑、交付风险及本周治理建议，并附上分析依据与重点督办事项。你可以点击下方卡片查看完整报告，或下载为图片、网页或 Markdown 文档。';
export const reportSections = [
  ['1.1 全局交付进度盘点', '报告采用“项目组合管理 + 流程效率分析 + 风险管理 + 数据治理”四层框架，而不是简单统计数量。', '判断整体交付结果是否健康；定位需求主要堆积在哪个流程阶段；识别高优需求、长期停滞项和责任风险。'],
  ['二、交付风险与瓶颈诊断', '结合排期偏差、节点积压与依赖阻塞，建立统一的风险判断口径。', '重点关注计划延期、依赖未就绪和负责人负载，按影响范围与紧急程度排序。'],
  ['三、本周治理建议', '将问题转化为分优先级、可执行的管理动作。', '明确重点事项负责人、下一步行动与检查时间，并在下次项目回顾中复核处理结果。'],
];
export const reportUrl = '/reports/project-risk-report-beautified.html';
let reportSource: Promise<string> | undefined;

export function loadReportHtml() {
  reportSource ??= fetch(reportUrl).then(async response => {
    if (!response.ok) throw new Error(`Report HTTP ${response.status}`);
    const html = await response.text();
    if (!html.includes('id="reading-report"') || !html.includes('id="report-data"')) throw new Error('Invalid report document');
    return html;
  }).catch(error => { reportSource = undefined; throw error; });
  return reportSource;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadReport() {
  downloadBlob(new Blob([await loadReportHtml()], { type: 'text/html;charset=utf-8' }), `${reportTitle}.html`);
}

export function reportMarkdown() {
  const sections = reportSections.flatMap(([title, ...paragraphs]) => [
    `## ${title}`,
    '',
    ...paragraphs.flatMap(paragraph => [paragraph, '']),
  ]);
  return [
    `# ${reportTitle}`,
    '',
    '## 进行中项目进展总结',
    '',
    reportIntro,
    '',
    ...sections,
  ].join('\n').trimEnd() + '\n';
}

export function downloadReportMarkdown() {
  downloadBlob(new Blob([reportMarkdown()], { type: 'text/markdown;charset=utf-8' }), `${reportTitle}.md`);
}

function reportFontCss(element: HTMLElement) {
  const doc = element.ownerDocument;
  const view = doc.defaultView!;
  const families = new Set<string>();
  const normalize = (family: string) => family.trim().replace(/["']/g, '');
  [element, ...element.querySelectorAll('*')].forEach(node => {
    view.getComputedStyle(node).fontFamily.split(',').forEach(family => families.add(normalize(family)));
  });
  return Array.from(doc.styleSheets).flatMap(sheet => Array.from(sheet.cssRules))
    .filter((rule): rule is CSSFontFaceRule => rule.type === CSSRule.FONT_FACE_RULE)
    .filter(rule => families.has(normalize(rule.style.fontFamily)))
    .map(rule => rule.cssText).join('\n');
}

function inlineSvgStyles(element: HTMLElement) {
  const view = element.ownerDocument.defaultView!;
  const snapshots = Array.from(element.querySelectorAll<SVGElement>('svg, svg *'), node => ({ node, style: node.getAttribute('style') }));
  // SVG descendants are cloned as a subtree by html-to-image; resolve their
  // theme styles first so the exported image keeps chart colors and labels.
  snapshots.forEach(({ node }) => {
    const computed = view.getComputedStyle(node);
    const properties = Array.from(computed, name => [name, computed.getPropertyValue(name)]);
    properties.forEach(([name, value]) => node.style.setProperty(name, value));
  });
  return () => snapshots.forEach(({ node, style }) => {
    if (style === null) node.removeAttribute('style');
    else node.setAttribute('style', style);
  });
}

export async function downloadReportImage(doc: Document) {
  const { toBlob } = await import('html-to-image');
  await doc.fonts.ready;
  const slides = doc.documentElement.dataset.view === 'slides';
  const element = doc.querySelector<HTMLElement>(slides ? '.slide.active' : '#reading-report');
  if (!element) throw new Error('Report preview is unavailable');
  const width = slides ? 1920 : element.offsetWidth;
  const height = slides ? 1080 : element.scrollHeight;
  if (!width || !height) throw new Error('Report preview is hidden');
  const backgroundColor = doc.defaultView!.getComputedStyle(doc.documentElement).getPropertyValue('--bg').trim() || '#fff';
  const fontEmbedCSS = reportFontCss(element);
  const restoreSvgStyles = inlineSvgStyles(element);
  try {
    const blob = await toBlob(element, {
      width, height, backgroundColor, fontEmbedCSS,
      pixelRatio: Math.min(2, 16384 / Math.max(width, height)),
      style: { margin: '0', transform: 'none', animation: 'none' },
    });
    if (!blob) throw new Error('Report image export failed');
    downloadBlob(blob, `${reportTitle}${slides ? '-当前演示页' : ''}.png`);
  } finally {
    restoreSvgStyles();
  }
}
