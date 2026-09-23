"""Save the exact Figma MCP exports locally; never redraw or rewrite an SVG."""
import concurrent.futures
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'sidebar': 'sidebar-reference.txt',
    'header': 'context-1-11589.txt',
    'chat': 'context-1-11704.txt',
    'composer': 'context-1-12009.txt',
    'preview': 'preview-reference.txt',
    'framework': 'framework-9121-reference.txt',
    'report-menu': 'report-menu-13284-reference.txt',
    'toolbar': 'toolbar-12162-reference.txt',
    'new-chat': 'new-chat-hero-reference.txt',
    'new-chat-categories': 'new-chat-categories-reference.txt',
    'new-chat-templates': 'new-chat-thumbnails-reference.txt',
}
destination = ROOT / 'public/assets/figma'
destination.mkdir(parents=True, exist_ok=True)
manifest = {}
jobs = []
for prefix, filename in SOURCES.items():
    source = (ROOT / 'design' / filename).read_text()
    for variable, url in re.findall(r'const (\w+) = "(https://www\.figma\.com/api/mcp/asset/[^\"]+)";', source):
        slug = re.sub(r'(?<!^)(?=[A-Z])', '-', variable).lower()
        name = f'{prefix}-{slug}.{url.rsplit(".", 1)[-1]}'
        key = f'{prefix}/{variable}'
        manifest[key] = f'/assets/figma/{name}'
        jobs.append((url, destination / name))

def download(job):
    url, output = job
    if output.is_file() and output.stat().st_size:
        return output.name
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '2', '--max-time', '45', '-o', str(output), url], check=True)
    return output.name

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for name in pool.map(download, jobs):
        print(name)
(ROOT / 'src').mkdir(exist_ok=True)
(ROOT / 'src/assets.json').write_text(json.dumps(manifest, indent=2) + '\n')
(destination / 'provenance.json').write_text(json.dumps({
    'source': 'https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=1-11296',
    'additionalSources': [
        'https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=1-9121',
        'https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=1-13284',
        'https://www.figma.com/design/ijwAFgHcsNwcLoHFlCFFFX/Untitled?node-id=1-12162',
        'https://www.figma.com/design/ikOzcz7SHXYx5mPyg5QHtk/meego-agent-mode-2?node-id=11742-66335',
    ],
    'note': 'Original Figma MCP export bytes; all SVGs unmodified.',
    'assets': manifest,
}, indent=2) + '\n')
print(f'Exported {len(jobs)} original assets.')
