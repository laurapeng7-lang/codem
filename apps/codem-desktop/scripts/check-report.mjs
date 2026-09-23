import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import ts from 'typescript';
import { checkReportControls } from './check-report-controls.mjs';

const root = new URL('../', import.meta.url);
const filename = 'reports/project-risk-report-beautified.html';
const bytes = await readFile(new URL(`public/${filename}`, root));
const html = bytes.toString('utf8');
const provenance = JSON.parse(await readFile(new URL('public/reports/provenance.json', root), 'utf8'));
assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.sha256, 'The report must match its recorded version');
assert.equal(bytes.length, provenance.bytes);
assert.deepEqual(await readFile(new URL(`dist/${filename}`, root)), bytes, 'The production build must include the complete report');

const themes = new Set(Array.from(html.matchAll(/data-theme-id="([^"]+)"/g), match => match[1]));
assert.equal(themes.size, 46, 'All report themes must be included');
for (const id of ['reading-report', 'theme-dialog', 'theme-search', 'theme-family', 'chart-matrix', 'matrix-select', 'matrix-table-link', 'risk-filter', 'priority-filter', 'project-search', 'deck-viewport', 'deck-stage', 'slide-outline', 'slide-jump', 'slide-fullscreen', 'slide-edit', 'slide-save']) {
  assert.ok(html.includes(`id="${id}"`), `Missing report feature: ${id}`);
}
let scripts = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const [, attributes, content] = match;
  if (/type="application\/json"/.test(attributes)) {
    JSON.parse(content);
  } else {
    const embedded = attributes.match(/src="data:application\/javascript;base64,([^"]+)"/);
    new Script(embedded ? Buffer.from(embedded[1], 'base64').toString('utf8') : content);
    scripts++;
  }
}
assert.equal(scripts, 4, 'All executable report scripts must be retained');
for (const match of html.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="([^"]+)"/gi)) {
  assert.ok(match[1].startsWith('data:'), 'The imported report must not depend on a remote asset server');
}
for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
  for (const match of style[1].matchAll(/url\((['"]?)([^)]+?)\1\)/gi)) {
    assert.ok(match[2].startsWith('data:') || match[2].startsWith('#'), 'Report CSS assets must be embedded');
  }
}

// Exercise loading, retries and downloads without opening a browser.
await checkReportControls(html);
const source = await readFile(new URL('src/report.ts', root), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const report = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalCreateUrl = URL.createObjectURL;
let requests = 0;
let downloaded;
let clicked = false;
try {
  globalThis.fetch = async url => {
    assert.equal(url, report.reportUrl);
    requests++;
    if (requests === 1) return new Response('unavailable', { status: 503 });
    if (requests === 2) return new Response('<html>unexpected fallback page</html>');
    return new Response(html);
  };
  await assert.rejects(report.loadReportHtml(), /503/);
  await assert.rejects(report.loadReportHtml(), /Invalid report/);
  const pending = report.loadReportHtml();
  assert.equal(report.loadReportHtml(), pending, 'Concurrent loads should share one request');
  assert.equal(await pending, html);
  assert.equal(await report.loadReportHtml(), html);
  assert.equal(requests, 3, 'A successful load should be cached');
  const anchor = { href: '', download: '', click() { clicked = true; } };
  globalThis.document = { createElement(tag) { assert.equal(tag, 'a'); return anchor; } };
  URL.createObjectURL = blob => { downloaded = blob; return 'blob:report-check'; };
  await report.downloadReport();
  assert.ok(clicked);
  assert.equal(anchor.download, `${report.reportTitle}.html`);
  assert.equal(await downloaded.text(), html, 'HTML downloads must contain the full versioned document');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  URL.createObjectURL = originalCreateUrl;
}
console.log('Report checks passed: versioned bytes, production asset, 46 theme palettes, real mode/theme controls, host state sync, standalone controls, embedded scripts/assets, load retry/cache, complete HTML download.');
