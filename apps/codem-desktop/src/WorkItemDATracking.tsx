import { useEffect, useState } from 'react';
import { CodeMLogo } from './CodeMLogo';
import log from './work-item-da-tracking-log.json';
import './work-item-da-tracking.css';

const assetRoot = '/assets/figma/work-item-da-tracking/';
const toolGroups = [
  {
    label: 'Browsed the web, used a tool',
    narration: 'The response is a gzip binary. Let me decompress and read it.',
    calls: ['Browse project documentation', 'Fetch project source archive'],
  },
  {
    label: 'Ran 4 commands, read 2 files',
    narration: 'Now let me read the project files.',
    calls: ['Decompress source archive', 'List project files', 'Read README.md', 'Read package.json'],
  },
  {
    label: 'Ran a command, read 7 files',
    narration: 'Now let me check the standalone HTML file to understand the bundled structure.',
    calls: ['Inspect project structure', 'Read apps/server/public/app.html', 'Read apps/server/ui/app.jsx'],
  },
];

/** Completed intelligent-node card, using the dimensions and assets from Figma 124:54419. */
export function WorkItemDATracking() {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setRunning(false), 2400);
    return () => clearTimeout(timer);
  }, [running]);

  return <section id="work-detail-node-card" className="work-da-card" aria-labelledby="work-da-title">
    <header className="work-da-header">
      <span className="work-da-status-icon"><img src={`${assetRoot}completed.svg`} width="11.2" height="11.2" alt="已完成" draggable="false" /></span>
      <div className="work-da-heading"><img src={`${assetRoot}codem-logo.svg`} width="15.345" height="12" alt="" draggable="false" /><h3 id="work-da-title">DA Tracking</h3></div>
    </header>
    <div className="work-da-completion">
      <div className="work-da-completion-label" role="status">
        <span className="work-da-finished-icon">{running ? <CodeMLogo size={26} /> : <img src={`${assetRoot}finished.png`} width="26" height="26" alt="" draggable="false" />}</span>
        <span>{running ? 'CodeM is working...' : 'CodeM has finished task.'}</span>
      </div>
      <button type="button" className="work-da-rerun" aria-label="重新运行 DA Tracking" disabled={running} onClick={() => setRunning(true)}>
        <img src={`${assetRoot}rerun.svg`} width="16" height="16" alt="" draggable="false" />Rerun
      </button>
    </div>
    <div className="work-da-transcript" aria-label="DA Tracking 执行日志">
      <div className="work-da-transcript-content">
        {toolGroups.map(group => <div className="work-da-log-group" key={group.label}>
          <details className="work-da-tool-group">
            <summary>{group.label}<img src={`${assetRoot}caret.svg`} width="16" height="16" alt="" draggable="false" /></summary>
            <ul className="work-da-tool-calls">{group.calls.map(call => <li key={call}><img src="/assets/figma/work-item-agent-panel/explored.svg" width="16" height="16" alt="" draggable="false" />{call}</li>)}</ul>
          </details>
          <p>{group.narration}</p>
        </div>)}
        <details className="work-da-tool-group work-da-terminal-group" open>
          <summary>Ran git status --short<img src={`${assetRoot}caret.svg`} width="16" height="16" alt="" draggable="false" /></summary>
          <div className="work-da-terminal" tabIndex={0} role="region" aria-label="git status 命令输出，可滚动查看">
            <span className="work-da-terminal-label">shell</span>
            <pre>{log.terminalOutput}</pre>
          </div>
        </details>
      </div>
    </div>
  </section>;
}
