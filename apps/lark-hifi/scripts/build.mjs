import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([
  cp(path.join(root, 'index.html'), path.join(output, 'index.html')),
  cp(path.join(root, 'styles.css'), path.join(output, 'styles.css')),
  cp(path.join(root, 'app.js'), path.join(output, 'app.js')),
  cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true }),
]);

console.log(`Built static demo in ${output}`);
