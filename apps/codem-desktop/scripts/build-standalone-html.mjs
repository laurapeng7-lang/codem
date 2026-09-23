import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const distDir = join(root, 'dist');
const publicDir = join(root, 'public');
const outputDir = join(root, 'artifacts');
const outputPath = join(outputDir, 'meego-codem-standalone.html');

const mimeTypes = {
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const ignoredCssPlugin = {
  name: 'ignore-css',
  setup(context) {
    context.onResolve({ filter: /\.css$/ }, (args) => ({
      path: args.path,
      namespace: 'ignored-css',
    }));
    context.onLoad({ filter: /.*/, namespace: 'ignored-css' }, () => ({
      contents: '',
      loader: 'js',
    }));
  },
};

function asDataUrl(path, contents) {
  const mime = mimeTypes[extname(path).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mime};base64,${contents.toString('base64')}`;
}

async function inlinePublicFiles(source) {
  const candidates = new Set(
    source.match(/\/[A-Za-z0-9@._~!$&'()*+,;=:%/-]+\.(?:gif|html|jpe?g|json|md|png|svg|ttf|txt|webp|woff2?)(?:[?#][^"'`\s)]*)?/gi) ?? [],
  );

  let result = source;
  let inlined = 0;
  for (const candidate of candidates) {
    const cleanPath = candidate.split(/[?#]/, 1)[0];
    const relativePath = decodeURIComponent(cleanPath.slice(1));
    const possiblePaths = [join(publicDir, relativePath), join(distDir, relativePath)];
    try {
      let localPath;
      let contents;
      for (const possiblePath of possiblePaths) {
        try {
          contents = await readFile(possiblePath);
          localPath = possiblePath;
          break;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      if (!localPath || !contents) continue;
      result = result.split(candidate).join(asDataUrl(localPath, contents));
      inlined += 1;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return { source: result, inlined };
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

async function createPublicAssetMap() {
  const entries = await Promise.all((await listFiles(publicDir)).map(async (path) => {
    const publicPath = `/${path.slice(publicDir.length + 1).replaceAll('\\', '/')}`;
    return [publicPath, asDataUrl(path, await readFile(path))];
  }));
  return Object.fromEntries(entries);
}

const bundle = await build({
  entryPoints: [join(root, 'src/main.tsx')],
  bundle: true,
  define: {
    'import.meta.env.BASE_URL': '"/"',
    'import.meta.env.DEV': 'false',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.PROD': 'true',
  },
  format: 'iife',
  globalName: 'MeegoCodeMApp',
  legalComments: 'none',
  loader: {
    '.gif': 'dataurl',
    '.jpeg': 'dataurl',
    '.jpg': 'dataurl',
    '.png': 'dataurl',
    '.svg': 'dataurl',
    '.ttf': 'dataurl',
    '.woff': 'dataurl',
    '.woff2': 'dataurl',
  },
  minify: true,
  platform: 'browser',
  plugins: [ignoredCssPlugin],
  splitting: false,
  target: 'es2022',
  write: false,
});

const cssFiles = (await readdir(join(distDir, 'assets')))
  .filter((name) => name.endsWith('.css'))
  .sort();
const css = await Promise.all(cssFiles.map((name) => readFile(join(distDir, 'assets', name), 'utf8')))
  .then((parts) => parts.join('\n'));
const javascript = bundle.outputFiles[0].text;
const inlinedCss = await inlinePublicFiles(css);
const inlinedJavascript = await inlinePublicFiles(javascript);
const publicAssets = await createPublicAssetMap();
const assetBootstrap = `(()=>{const assets=${JSON.stringify(publicAssets)};const resolve=value=>typeof value==='string'&&(assets[value]||value);const setAttribute=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,value){return setAttribute.call(this,name,name==='src'||name==='href'?resolve(value):value)};for(const Constructor of [globalThis.HTMLImageElement,globalThis.HTMLSourceElement]){if(!Constructor)continue;const descriptor=Object.getOwnPropertyDescriptor(Constructor.prototype,'src');if(descriptor?.set)Object.defineProperty(Constructor.prototype,'src',{...descriptor,set(value){descriptor.set.call(this,resolve(value))}})}const nativeFetch=globalThis.fetch?.bind(globalThis);if(nativeFetch)globalThis.fetch=(input,init)=>nativeFetch(typeof input==='string'?resolve(input):input,init);if(location.protocol==='file:'){const pushState=history.pushState.bind(history),replaceState=history.replaceState.bind(history);history.pushState=(state,unused,url)=>{if(url==null)return pushState(state,unused,url);const target=new URL(String(url),location.href);if(target.pathname===location.pathname)return pushState(state,unused,target.href)};history.replaceState=(state,unused,url)=>{if(url==null)return replaceState(state,unused,url);const target=new URL(String(url),location.href);if(target.pathname===location.pathname)return replaceState(state,unused,target.href)}}globalThis.__MEEGO_CODEM_ASSETS__=assets})();`;

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#ffffff" />
    <meta name="description" content="Meego CodeM — 对话、分析与产物预览工作台" />
    <title>Meego · CodeM</title>
    <style>${inlinedCss.source.replaceAll('</style', '<\\/style')}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${assetBootstrap.replaceAll('</script', '<\\/script')}</script>
    <script>${inlinedJavascript.source.replaceAll('</script', '<\\/script')}</script>
  </body>
</html>
`;

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, html);

console.log(`Created ${outputPath}`);
console.log(`Inlined ${inlinedCss.inlined + inlinedJavascript.inlined} public asset references.`);
console.log(`Size: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB`);
