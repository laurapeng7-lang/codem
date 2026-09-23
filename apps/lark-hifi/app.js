const toast = document.querySelector('#toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1500);
}

const commandChips = document.querySelector('.command-chips');
const commandOptions = [...commandChips.querySelectorAll('.command-chip')];
const commandOverflow = commandChips.querySelector('.command-overflow');
const commandOverflowMenu = document.querySelector('#commandOverflowMenu');
const composerForm = document.querySelector('#composerForm');
const composerInput = document.querySelector('#composerInput');
const conversation = document.querySelector('#conversation');
const scenarioPicker = document.querySelector('#scenarioPicker');

function closeCommandOverflow() {
  commandOverflowMenu.hidden = true;
  commandOverflow.setAttribute('aria-expanded', 'false');
}

function openCommandOverflow() {
  const hiddenOptions = commandOptions.filter((option) => option.hidden);
  if (!hiddenOptions.length) return;

  commandOverflowMenu.replaceChildren(...hiddenOptions.map((option) => {
    const menuItem = document.createElement('button');
    menuItem.type = 'button';
    menuItem.setAttribute('role', 'menuitem');
    menuItem.innerHTML = option.innerHTML;
    menuItem.addEventListener('click', () => {
      option.click();
      closeCommandOverflow();
    });
    return menuItem;
  }));

  commandOverflowMenu.hidden = false;
  commandOverflow.setAttribute('aria-expanded', 'true');

  const triggerRect = commandOverflow.getBoundingClientRect();
  const menuRect = commandOverflowMenu.getBoundingClientRect();
  const left = Math.min(window.innerWidth - menuRect.width - 8, Math.max(8, triggerRect.right - menuRect.width));
  const top = Math.max(8, triggerRect.top - menuRect.height - 6);
  commandOverflowMenu.style.left = `${left}px`;
  commandOverflowMenu.style.top = `${top}px`;
}

function updateCommandOverflow() {
  closeCommandOverflow();
  commandOptions.forEach((option) => { option.hidden = false; });
  commandOverflow.hidden = true;

  const styles = window.getComputedStyle(commandChips);
  const gap = Number.parseFloat(styles.columnGap) || 0;
  const widths = commandOptions.map((option) => option.getBoundingClientRect().width);
  const fullWidth = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
  const availableWidth = commandChips.clientWidth;
  const fitReserve = 8;
  if (fullWidth + fitReserve <= availableWidth + 0.5) return;

  commandOverflow.hidden = false;
  const overflowWidth = commandOverflow.getBoundingClientRect().width;
  let usedWidth = overflowWidth;
  let visibleCount = 0;

  widths.some((width) => {
    const nextWidth = usedWidth + gap + width;
    if (nextWidth > availableWidth + 0.5) return true;
    usedWidth = nextWidth;
    visibleCount += 1;
    return false;
  });

  commandOptions.forEach((option, index) => { option.hidden = index >= visibleCount; });
  const hiddenCount = commandOptions.length - visibleCount;
  commandOverflow.setAttribute('aria-label', `更多配置，已收起 ${hiddenCount} 项`);
}

commandOverflow.addEventListener('click', (event) => {
  event.stopPropagation();
  if (commandOverflowMenu.hidden) openCommandOverflow();
  else closeCommandOverflow();
});

document.addEventListener('click', (event) => {
  if (!commandOverflowMenu.contains(event.target)) closeCommandOverflow();
  if (!composerForm.contains(event.target)) scenarioPicker.hidden = true;
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeCommandOverflow();
  if (event.key === 'Escape') scenarioPicker.hidden = true;
});

if ('ResizeObserver' in window) {
  new ResizeObserver(updateCommandOverflow).observe(commandChips);
} else {
  window.addEventListener('resize', updateCommandOverflow);
}
window.requestAnimationFrame(updateCommandOverflow);

document.querySelectorAll('.chat-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.chat-tab').forEach((item) => item.classList.remove('is-active'));
    tab.classList.add('is-active');
  });
});

document.querySelectorAll('.session-row').forEach((row) => {
  row.addEventListener('click', () => {
    document.querySelectorAll('.session-row').forEach((item) => item.classList.remove('is-selected'));
    row.classList.add('is-selected');
  });
});

document.querySelectorAll('[data-toast]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    showToast(link.dataset.toast);
  });
});

function appendUserMessage(value) {
  const row = document.createElement('article');
  row.className = 'message-row user-message';
  row.innerHTML = `
    <img class="message-avatar" src="./assets/figma-12553/laura.png" alt="Laura" />
    <div class="message-main">
      <div class="user-meta"><span>Laura</span><span>刚刚</span></div>
      <div class="user-bubble"></div>
    </div>
  `;
  row.querySelector('.user-bubble').textContent = value;
  conversation.append(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function appendAutomationReply(previousMessage) {
  const row = document.createElement('article');
  row.className = 'message-row bot-message automation-message';
  row.innerHTML = `
    <img class="message-avatar bot-avatar" src="./assets/figma-12553/codem-message.svg" alt="CodeM" />
    <div class="message-main">
      <div class="bot-meta"><strong>CodeM</strong><span class="bot-label">机器人</span><time>刚刚</time></div>
      <div class="response-card automation-card">
        <div class="reply-quote">回复 Laura：${escapeAutomationHtml(previousMessage)}</div>
        <p>我会帮你创建一个自动任务，首先，请说明任务内容，然后告诉我自动触发的时间。<br />你可以这样说：每个工作日上午9点，检查代码仓库昨天合并的mr，生成摘要发给我。</p>
      </div>
    </div>
  `;
  conversation.append(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function appendScheduledReviewReply(previousMessage) {
  const row = document.createElement('article');
  row.className = 'message-row bot-message scheduled-review-message';
  row.innerHTML = `
    <img class="message-avatar bot-avatar" src="./assets/figma-12553/codem-message.svg" alt="CodeM" />
    <div class="message-main">
      <div class="bot-meta"><strong>CodeM</strong><span class="bot-label">机器人</span><time>刚刚</time></div>
      <div class="response-card scheduled-review-card">
        <div class="reply-quote">回复 Laura：${escapeAutomationHtml(previousMessage)}</div>
        <p class="scheduled-review-intro">已经帮你创建好了。之后每个工作日上午 9:00，我会检查 codem-server 昨天合并的 MR，提炼主要改动和风险，再把摘要发给你。</p>
        <div class="scheduled-review-preflight" aria-label="预执行结果">
          <p>预执行完成：已通过 <strong>bot 身份</strong> 在 codem-server 跑了一次只读检查，并把 2026-08-26 的 <strong>Code Review 摘要</strong>卡片发到你的飞书私聊。</p>
          <p>摘要包含昨天合并的 <strong>12 个 MR</strong>、<strong>3 个高风险项</strong>、平均评审时长与 TOP 风险清单（见下方卡片）。</p>
        </div>
        <section class="scheduled-task-content" aria-label="定时任务：MR 摘要">
          <button type="button" class="scheduled-task-file" data-open-automation-task="mr-summary" aria-label="打开 MR 摘要定时任务详情">
            <span class="scheduled-task-icon" aria-hidden="true"><img src="./assets/figma-12553/scheduled-clock.svg" alt="" /></span>
            <div class="scheduled-task-title">
              <strong>MR 摘要</strong>
              <span>工作日 9:00</span>
            </div>
          </button>
        </section>
        <p class="scheduled-review-note">任务会从下一个工作日开始执行，如果你有需要修改的内容，请告诉我。</p>
      </div>
    </div>
  `;
  conversation.append(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function normalizeScenario(value) {
  return value.toLowerCase().replace(/[\s，,。.!！：:]/g, '');
}

function isAutomationScenario(value) {
  return normalizeScenario(value) === '帮我做个自动化任务';
}

function isScheduledReviewScenario(value) {
  return normalizeScenario(value) === '请帮我创建一个自动化任务每个工作日上午9点检查codem-server仓库昨天合并的mr生成摘要发给我';
}

composerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = composerInput.value.trim();
  if (!value) return;

  scenarioPicker.hidden = true;
  appendUserMessage(value);
  composerInput.value = '';
  if (isAutomationScenario(value)) window.setTimeout(() => appendAutomationReply(value), 1000);
  else if (isScheduledReviewScenario(value)) window.setTimeout(() => appendScheduledReviewReply(value), 1600);
});

composerInput.addEventListener('focus', () => {
  if (!composerInput.value.trim()) scenarioPicker.hidden = false;
});

composerInput.addEventListener('input', () => {
  if (composerInput.value.trim()) scenarioPicker.hidden = true;
});

document.querySelectorAll('.scenario-option').forEach((option) => {
  option.addEventListener('click', () => {
    scenarioPicker.hidden = true;
    composerInput.value = option.dataset.scenarioMessage;
    composerForm.requestSubmit();
  });
});

composerInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.form.requestSubmit();
  }
});

// Automatic tasks
const automationWorkspace = document.querySelector('#automationWorkspace');
const automationSavedView = document.querySelector('#automationSavedView');
const automationTemplatesView = document.querySelector('#automationTemplatesView');
const automationGroups = document.querySelector('#automationGroups');
const automationFilterButton = document.querySelector('#automationFilterButton');
const automationFilterLabel = document.querySelector('#automationFilterLabel');
const automationFilterMenu = document.querySelector('#automationFilterMenu');
const automationCreateButton = document.querySelector('#automationCreateButton');
const automationCreateMenu = document.querySelector('#automationCreateMenu');
const automationDetailDrawer = document.querySelector('#automationDetailDrawer');
const automationDetailName = document.querySelector('#automationDetailName');
const automationDetailContent = document.querySelector('#automationDetailContent');
const automationRunConversation = document.querySelector('#automationRunConversation');
const automationDetailMore = document.querySelector('#automationDetailMore');
const automationDetailMenu = document.querySelector('#automationDetailMenu');
const automationDetailToggle = document.querySelector('#automationDetailToggle');
const automationDetailClose = document.querySelector('#automationDetailClose');
const automationDialogLayer = document.querySelector('#automationDialogLayer');
const automationDialog = document.querySelector('#automationDialog');
const automationDialogTitle = document.querySelector('#automationDialogTitle');
const automationDialogDescription = document.querySelector('#automationDialogDescription');
const automationDialogBody = document.querySelector('#automationDialogBody');
const automationDialogSubmit = document.querySelector('#automationDialogSubmit');
const sessionsPanel = document.querySelector('.sessions-panel');
const messageTab = document.querySelector('.chat-tab:not(.automation-tab)');
const automationTab = document.querySelector('.automation-tab');
const automationStorageKey = 'feishu-codem-automation-tasks:v2';

const automationSeeds = [
  {
    id: 'mr-summary', groupName: 'codem web', name: 'MR 摘要', kind: 'scheduled', enabled: true,
    creator: 'Laura', instruction: '每个工作日上午9点，检查 codem-server 仓库昨天合并的 MR，生成摘要发给我。',
    project: 'codem/codem-server', space: 'Codem产研', reasoning: '高', runMode: '运行时新建聊天',
    repeat: 'workdays', weekday: '1', time: '09:00', taskType: '摘要', push: true
  },
  {
    id: 'workflow-brief', groupName: 'codem workflow', name: '项目简报', kind: 'scheduled', enabled: true,
    creator: 'Laura', instruction: '汇总项目本周进展、风险和下周计划，生成一份项目简报。',
    project: 'codem workflow', space: 'Codem产研', reasoning: '中', runMode: '运行时新建聊天',
    repeat: 'weekly', weekday: '1', time: '09:00', taskType: '摘要', push: true
  },
  {
    id: 'workflow-changes', groupName: 'codem workflow', name: '改动总结', kind: 'event', enabled: true,
    creator: '张雯', instruction: '代码变更后总结影响范围，同时识别高风险改动。',
    project: 'codem workflow', space: 'Codem产研', reasoning: '高', runMode: '在当前会话运行',
    eventType: 'repository', conditions: [{ type: 'MR 合并', value: 'codem workflow' }], taskType: '代码检查', push: true
  },
  {
    id: 'semi-brief', groupName: 'semi design', name: '项目简报', kind: 'scheduled', enabled: false,
    creator: 'Laura', instruction: '每周五整理 Semi Design 进展、风险和待办。',
    project: 'semi design', space: 'Semi Design', reasoning: '中', runMode: '运行时新建聊天',
    repeat: 'weekly', weekday: '5', time: '17:30', taskType: '摘要', push: true
  },
  {
    id: 'semi-webhook', groupName: 'semi design', name: '发布后检查', kind: 'webhook', enabled: true,
    creator: '李梅', instruction: '收到发布 Webhook 后检查构建结果和主要指标。',
    project: 'semi design', space: 'Semi Design', reasoning: '中', runMode: '在当前会话运行',
    webhookUrl: 'https://open.feishu.cn/codem/hooks/semi-release', webhookToken: 'cm_live_P8dJ3k', taskType: '发布检查', push: false
  }
];

function cloneAutomation(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadAutomationTasks() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(automationStorageKey));
    if (Array.isArray(stored) && stored.length) return stored;
  } catch (error) {
    // Fall back to deterministic demo data when storage is unavailable or invalid.
  }
  return cloneAutomation(automationSeeds);
}

const automationState = {
  tasks: loadAutomationTasks(),
  view: 'saved',
  creatorFilter: 'all',
  selectedTaskId: null,
  dialogTaskId: null,
  dialogKind: 'scheduled',
  dialogDraft: null
};

function persistAutomationTasks() {
  try { window.localStorage.setItem(automationStorageKey, JSON.stringify(automationState.tasks)); } catch (error) { /* demo remains usable */ }
}

function escapeAutomationHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function automationKindLabel(task) {
  if (task.kind === 'scheduled') {
    const repeat = task.repeat === 'daily' ? '每天' : task.repeat === 'weekly' ? `每周·${['日', '一', '二', '三', '四', '五', '六'][Number(task.weekday || 1)]}` : '工作日';
    return `${repeat} ${task.time || '09:00'}`;
  }
  if (task.kind === 'event') return task.eventType === 'lark' ? '飞书消息事件' : '代码仓库事件';
  return 'Webhook 触发';
}

function automationIcon(task) {
  if (task.kind === 'scheduled') return '<img src="./assets/figma-12553/scheduled-clock.svg" alt="" />';
  if (task.kind === 'event') return '<span aria-hidden="true">ϟ</span>';
  return '<span aria-hidden="true">⌡</span>';
}

function closeAutomationMenus(except) {
  document.querySelectorAll('.automation-popover').forEach((menu) => {
    if (menu === except) return;
    menu.hidden = true;
    const trigger = menu.parentElement?.querySelector('[aria-expanded]');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

function toggleAutomationMenu(trigger, menu) {
  const willOpen = menu.hidden;
  closeAutomationMenus(menu);
  menu.hidden = !willOpen;
  trigger.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) menu.querySelector('button:not([disabled])')?.focus();
}

function renderAutomationList() {
  const visibleTasks = automationState.tasks.filter((task) => automationState.creatorFilter === 'all' || task.creator === 'Laura');
  const grouped = visibleTasks.reduce((result, task) => {
    (result[task.groupName] ||= []).push(task);
    return result;
  }, {});

  automationGroups.innerHTML = Object.entries(grouped).map(([groupName, tasks]) => `
    <section class="automation-group">
      <h2><img src="./assets/figma-12553/right-folder.svg" alt="" />${escapeAutomationHtml(groupName)}</h2>
      <div class="automation-task-list">
        ${tasks.map((task) => `
          <article class="automation-task-row${automationState.selectedTaskId === task.id ? ' is-selected' : ''}" data-task-id="${task.id}">
            <button type="button" class="automation-task-open" data-open-task="${task.id}">
              <span class="automation-task-icon">${automationIcon(task)}</span>
              <span class="automation-task-copy"><strong>${escapeAutomationHtml(task.name)}</strong><span>${escapeAutomationHtml(automationKindLabel(task))}·${escapeAutomationHtml(task.creator)}</span></span>
            </button>
            <div class="automation-task-actions">
              <button type="button" class="automation-switch" role="switch" aria-checked="${task.enabled}" aria-label="${task.enabled ? '暂停' : '启用'} ${escapeAutomationHtml(task.name)}" data-toggle-task="${task.id}"></button>
              <div class="automation-menu-wrap">
                <button type="button" class="automation-row-more" aria-label="${escapeAutomationHtml(task.name)} 更多操作" aria-haspopup="menu" aria-expanded="false" data-task-menu-trigger="${task.id}">•••</button>
                <div class="automation-popover automation-row-menu" role="menu" data-task-menu="${task.id}" hidden>
                  <button type="button" role="menuitem" data-task-action="run" data-task-id="${task.id}"><span>▶</span>立即运行</button>
                  <button type="button" role="menuitem" data-task-action="edit" data-task-id="${task.id}"><span>✎</span>编辑</button>
                  <span class="automation-menu-divider"></span>
                  <button type="button" role="menuitem" class="is-danger" data-task-action="delete" data-task-id="${task.id}"><span>⌫</span>删除</button>
                </div>
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('') || '<div class="automation-empty">没有找到符合条件的自动任务</div>';
}

function setAutomationView(visible) {
  automationWorkspace.hidden = !visible;
  conversation.hidden = visible;
  composerForm.hidden = visible;
  if (visible) renderAutomationList();
}

document.querySelectorAll('.chat-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const isAutomation = tab === automationTab;
    setAutomationView(isAutomation);
    if (!isAutomation) closeAutomationDetail();
  });
});

document.querySelectorAll('[data-automation-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    automationState.view = tab.dataset.automationTab;
    document.querySelectorAll('[data-automation-tab]').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
    automationSavedView.hidden = automationState.view !== 'saved';
    automationTemplatesView.hidden = automationState.view !== 'templates';
  });
});

automationFilterButton.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleAutomationMenu(automationFilterButton, automationFilterMenu);
});

automationFilterMenu.addEventListener('click', (event) => {
  const option = event.target.closest('[data-creator-filter]');
  if (!option) return;
  automationState.creatorFilter = option.dataset.creatorFilter;
  automationFilterLabel.textContent = option.dataset.creatorFilter === 'mine' ? '我创建的' : '全部创建人';
  automationFilterMenu.querySelectorAll('[data-creator-filter]').forEach((item) => {
    const selected = item === option;
    item.setAttribute('aria-checked', String(selected));
    item.lastElementChild.textContent = selected ? '✓' : '';
  });
  closeAutomationMenus();
  renderAutomationList();
});

automationCreateButton.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleAutomationMenu(automationCreateButton, automationCreateMenu);
});

automationCreateMenu.addEventListener('click', (event) => {
  const option = event.target.closest('[data-create-kind]');
  if (!option) return;
  closeAutomationMenus();
  openAutomationDialog(option.dataset.createKind);
});

function defaultAutomationTask(kind) {
  return {
    id: '', groupName: 'codem web', name: '', kind, enabled: true, creator: 'Laura', instruction: '',
    instructionMode: 'custom', project: 'codem web', space: 'Codem产研', reasoning: '中', runMode: '运行时新建聊天',
    repeat: 'workdays', weekday: '1', time: '09:00', eventType: 'repository', conditions: [],
    webhookUrl: `https://open.feishu.cn/codem/hooks/${Math.random().toString(36).slice(2, 9)}`,
    webhookToken: `cm_${Math.random().toString(36).slice(2, 10)}`, taskType: '摘要', push: true
  };
}

function renderConditionRows() {
  const container = automationDialogBody.querySelector('#automationConditionList');
  if (!container) return;
  const isLark = automationState.dialogDraft.eventType === 'lark';
  container.innerHTML = automationState.dialogDraft.conditions.map((condition, index) => `
    <div class="automation-condition-row" data-condition-index="${index}">
      <select class="automation-select" aria-label="事件类型" data-condition-field="type">
        ${(isLark ? ['收到消息', '被@提及', '关键词匹配'] : ['MR 合并', 'MR 创建', '推送分支', '构建失败']).map((item) => `<option${condition.type === item ? ' selected' : ''}>${item}</option>`).join('')}
      </select>
      ${isLark
        ? `<input class="automation-text-input" data-condition-field="value" aria-label="群聊或关键词" value="${escapeAutomationHtml(condition.value)}" placeholder="输入群聊或关键词" />`
        : `<select class="automation-select" data-condition-field="value" aria-label="代码仓库">${['codem/codem-server', 'codem web', 'codem workflow', 'semi design'].map((item) => `<option${condition.value === item ? ' selected' : ''}>${item}</option>`).join('')}</select>`}
      <button type="button" class="automation-condition-delete" data-delete-condition="${index}" aria-label="删除条件">×</button>
    </div>
  `).join('');
}

function renderAutomationDialogBody() {
  const task = automationState.dialogDraft;
  const kindSpecific = task.kind === 'scheduled' ? `
    <div class="automation-form-field"><span class="automation-field-label">执行计划</span><div class="automation-form-grid is-three">
      <select class="automation-select" id="automationRepeat"><option value="daily"${task.repeat === 'daily' ? ' selected' : ''}>每天</option><option value="workdays"${task.repeat === 'workdays' ? ' selected' : ''}>工作日</option><option value="weekly"${task.repeat === 'weekly' ? ' selected' : ''}>每周</option></select>
      <select class="automation-select" id="automationWeekday"${task.repeat === 'weekly' ? '' : ' hidden'}>${['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((label, index) => `<option value="${index}"${String(index) === String(task.weekday) ? ' selected' : ''}>${label}</option>`).join('')}</select>
      <input class="automation-text-input" id="automationTime" type="time" value="${escapeAutomationHtml(task.time)}" aria-label="执行时间" />
    </div><span class="automation-field-help">时区：UTC+8（北京时间）</span></div>
  ` : task.kind === 'event' ? `
    <div class="automation-form-field"><span class="automation-field-label">触发事件</span><div class="automation-event-cards">
      <label class="automation-event-card"><input type="radio" name="automationEventType" value="repository"${task.eventType === 'repository' ? ' checked' : ''} />代码仓库</label>
      <label class="automation-event-card"><input type="radio" name="automationEventType" value="lark"${task.eventType === 'lark' ? ' checked' : ''} />飞书消息</label>
    </div><div class="automation-condition-list" id="automationConditionList"></div><button type="button" class="automation-add-condition" id="automationAddCondition">＋ 添加事件</button></div>
  ` : `
    <div class="automation-form-field"><span class="automation-field-label">Webhook 地址</span><div class="automation-webhook-box"><code id="automationWebhookUrl">${escapeAutomationHtml(task.webhookUrl)}</code></div><div class="automation-inline-actions"><button type="button" class="secondary-button" id="automationCopyWebhook">复制地址</button><button type="button" class="secondary-button" id="automationRegenerateWebhook">重新生成</button></div><span class="automation-field-help">收到 POST 请求时触发任务，Token：${escapeAutomationHtml(task.webhookToken)}</span></div>
  `;

  automationDialogBody.innerHTML = `
    <div class="automation-form-stack">
      <div class="automation-form-field"><label for="automationTaskName">任务名称</label><input class="automation-text-input" id="automationTaskName" maxlength="50" value="${escapeAutomationHtml(task.name)}" placeholder="输入任务名称" /><p class="automation-field-error" id="automationNameError" hidden>请输入任务名称</p></div>
      <div class="automation-form-field"><span class="automation-field-label">任务指令</span><div class="automation-radio-line">
        <label><input type="radio" name="instructionMode" value="custom"${task.instructionMode !== 'official' && task.instructionMode !== 'mine' ? ' checked' : ''} />自定义</label>
        <label><input type="radio" name="instructionMode" value="official"${task.instructionMode === 'official' ? ' checked' : ''} />官方指令</label>
        <label><input type="radio" name="instructionMode" value="mine"${task.instructionMode === 'mine' ? ' checked' : ''} />我的指令</label>
      </div><select class="automation-select" id="automationInstructionTemplate"${task.instructionMode === 'official' || task.instructionMode === 'mine' ? '' : ' hidden'}><option value="">选择指令</option><option>项目进展摘要</option><option>代码风险检查</option><option>群聊重点回顾</option></select>
      <div class="automation-textarea-wrap"><textarea class="automation-textarea" id="automationInstruction" maxlength="2000" placeholder="请说明 CodeM 需要完成的任务">${escapeAutomationHtml(task.instruction)}</textarea><div class="automation-textarea-toolbar"><div class="automation-menu-wrap"><button type="button" class="automation-add-content" id="automationAddContent" aria-expanded="false">＋ 添加内容</button><div class="automation-popover automation-content-menu" id="automationAddContentMenu" role="menu" hidden><button type="button" data-insert-content="@项目 ">引用项目</button><button type="button" data-insert-content="@文档 ">引用文档</button><button type="button" id="automationAttachFile">添加附件</button></div></div><span id="automationInstructionCount">${task.instruction.length}/2000</span></div></div><input type="file" id="automationFileInput" hidden multiple /></div>
      <div class="automation-form-grid"><div class="automation-form-field"><label for="automationProject">执行项目</label><select class="automation-select" id="automationProject">${['codem web', 'codem/codem-server', 'codem workflow', 'semi design'].map((item) => `<option${task.project === item ? ' selected' : ''}>${item}</option>`).join('')}</select></div><div class="automation-form-field"><label for="automationSpace">所属空间</label><select class="automation-select" id="automationSpace">${['Codem产研', 'Codem Web', 'Semi Design'].map((item) => `<option${task.space === item ? ' selected' : ''}>${item}</option>`).join('')}</select></div></div>
      <div class="automation-form-grid"><div class="automation-form-field"><label for="automationReasoning">思考强度</label><select class="automation-select" id="automationReasoning">${['低', '中', '高'].map((item) => `<option${task.reasoning === item ? ' selected' : ''}>${item}</option>`).join('')}</select></div><div class="automation-form-field"><label for="automationRunMode">运行方式</label><select class="automation-select" id="automationRunMode">${['运行时新建聊天', '在当前会话运行'].map((item) => `<option${task.runMode === item ? ' selected' : ''}>${item}</option>`).join('')}</select></div></div>
      ${kindSpecific}
      <div class="automation-form-grid"><div class="automation-form-field"><label for="automationTaskType">任务类型</label><select class="automation-select" id="automationTaskType">${['摘要', '代码检查', '发布检查', '消息处理'].map((item) => `<option${task.taskType === item ? ' selected' : ''}>${item}</option>`).join('')}</select></div><label class="automation-checkbox-line"><input type="checkbox" id="automationPush"${task.push ? ' checked' : ''} />完成后推送到飞书</label></div>
    </div>
  `;
  bindAutomationDialogBody();
  renderConditionRows();
}

function bindAutomationDialogBody() {
  const task = automationState.dialogDraft;
  const nameInput = automationDialogBody.querySelector('#automationTaskName');
  const error = automationDialogBody.querySelector('#automationNameError');
  nameInput.addEventListener('input', () => { nameInput.removeAttribute('aria-invalid'); error.hidden = true; });
  const instruction = automationDialogBody.querySelector('#automationInstruction');
  const instructionCount = automationDialogBody.querySelector('#automationInstructionCount');
  instruction.addEventListener('input', () => { instructionCount.textContent = `${instruction.value.length}/2000`; });
  automationDialogBody.querySelectorAll('[name="instructionMode"]').forEach((radio) => radio.addEventListener('change', () => {
    automationDialogBody.querySelector('#automationInstructionTemplate').hidden = radio.value === 'custom';
  }));
  automationDialogBody.querySelector('#automationInstructionTemplate').addEventListener('change', (event) => {
    const content = { '项目进展摘要': '汇总项目的关键进展、风险和下一步计划。', '代码风险检查': '检查最新代码变更，识别潜在风险并给出修复建议。', '群聊重点回顾': '整理群聊中的重要结论、待办和责任人。' }[event.target.value];
    if (content) { instruction.value = content; instruction.dispatchEvent(new Event('input')); }
  });
  const addContentButton = automationDialogBody.querySelector('#automationAddContent');
  const addContentMenu = automationDialogBody.querySelector('#automationAddContentMenu');
  addContentButton.addEventListener('click', (event) => { event.stopPropagation(); toggleAutomationMenu(addContentButton, addContentMenu); });
  addContentMenu.addEventListener('click', (event) => {
    const insert = event.target.closest('[data-insert-content]');
    if (insert) { instruction.setRangeText(insert.dataset.insertContent, instruction.selectionStart, instruction.selectionEnd, 'end'); instruction.focus(); instruction.dispatchEvent(new Event('input')); closeAutomationMenus(); }
    if (event.target.closest('#automationAttachFile')) automationDialogBody.querySelector('#automationFileInput').click();
  });
  automationDialogBody.querySelector('#automationFileInput').addEventListener('change', (event) => { if (event.target.files.length) showToast(`已添加 ${event.target.files.length} 个附件`); });
  automationDialogBody.querySelector('#automationRepeat')?.addEventListener('change', (event) => { automationDialogBody.querySelector('#automationWeekday').hidden = event.target.value !== 'weekly'; });
  automationDialogBody.querySelectorAll('[name="automationEventType"]').forEach((radio) => radio.addEventListener('change', () => {
    task.eventType = radio.value;
    task.conditions = [];
    renderConditionRows();
  }));
  automationDialogBody.querySelector('#automationAddCondition')?.addEventListener('click', () => {
    task.conditions.push(task.eventType === 'lark' ? { type: '收到消息', value: '' } : { type: 'MR 合并', value: 'codem/codem-server' });
    renderConditionRows();
  });
  automationDialogBody.querySelector('#automationConditionList')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-condition]');
    if (!button) return;
    task.conditions.splice(Number(button.dataset.deleteCondition), 1);
    renderConditionRows();
  });
  automationDialogBody.querySelector('#automationConditionList')?.addEventListener('input', (event) => {
    const row = event.target.closest('[data-condition-index]');
    if (!row || !event.target.dataset.conditionField) return;
    task.conditions[Number(row.dataset.conditionIndex)][event.target.dataset.conditionField] = event.target.value;
  });
  automationDialogBody.querySelector('#automationCopyWebhook')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(task.webhookUrl); } catch (error) { /* Clipboard may be blocked on file previews. */ }
    showToast('Webhook 地址已复制');
  });
  automationDialogBody.querySelector('#automationRegenerateWebhook')?.addEventListener('click', () => {
    task.webhookUrl = `https://open.feishu.cn/codem/hooks/${Math.random().toString(36).slice(2, 9)}`;
    automationDialogBody.querySelector('#automationWebhookUrl').textContent = task.webhookUrl;
    showToast('已重新生成 Webhook');
  });
}

function openAutomationDialog(kind, task, templateName) {
  automationState.dialogTaskId = task?.id || null;
  automationState.dialogKind = kind;
  automationState.dialogDraft = task ? cloneAutomation(task) : defaultAutomationTask(kind);
  if (templateName) {
    automationState.dialogDraft.name = templateName;
    automationState.dialogDraft.instruction = `请按照${templateName}模板整理内容，并将结果发给我。`;
  }
  const label = kind === 'scheduled' ? '定时任务' : kind === 'event' ? '事件触发' : 'Webhook';
  automationDialogTitle.textContent = `${task ? '编辑' : '创建'}${label}`;
  automationDialogDescription.textContent = kind === 'scheduled' ? '配置自动执行的时间与指令' : kind === 'event' ? '选择可触发任务的事件' : '通过 Webhook 请求触发任务';
  automationDialogSubmit.textContent = task ? '保存' : '创建';
  renderAutomationDialogBody();
  automationDialogLayer.hidden = false;
  window.requestAnimationFrame(() => automationDialogBody.querySelector('#automationTaskName')?.focus());
}

function closeAutomationDialog() {
  automationDialogLayer.hidden = true;
  closeAutomationMenus();
}

automationDialog.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = automationDialogBody.querySelector('#automationTaskName').value.trim();
  if (!name) {
    const input = automationDialogBody.querySelector('#automationTaskName');
    input.setAttribute('aria-invalid', 'true');
    automationDialogBody.querySelector('#automationNameError').hidden = false;
    input.focus();
    return;
  }
  const task = automationState.dialogDraft;
  Object.assign(task, {
    name,
    instructionMode: automationDialogBody.querySelector('[name="instructionMode"]:checked').value,
    instruction: automationDialogBody.querySelector('#automationInstruction').value.trim(),
    project: automationDialogBody.querySelector('#automationProject').value,
    groupName: automationDialogBody.querySelector('#automationProject').value.replace('codem/codem-server', 'codem web'),
    space: automationDialogBody.querySelector('#automationSpace').value,
    reasoning: automationDialogBody.querySelector('#automationReasoning').value,
    runMode: automationDialogBody.querySelector('#automationRunMode').value,
    taskType: automationDialogBody.querySelector('#automationTaskType').value,
    push: automationDialogBody.querySelector('#automationPush').checked
  });
  if (task.kind === 'scheduled') Object.assign(task, { repeat: automationDialogBody.querySelector('#automationRepeat').value, weekday: automationDialogBody.querySelector('#automationWeekday').value, time: automationDialogBody.querySelector('#automationTime').value || '09:00' });
  if (automationState.dialogTaskId) {
    const index = automationState.tasks.findIndex((item) => item.id === automationState.dialogTaskId);
    automationState.tasks[index] = task;
  } else {
    task.id = `automation-${Date.now()}`;
    automationState.tasks.unshift(task);
  }
  persistAutomationTasks();
  renderAutomationList();
  closeAutomationDialog();
  showToast(`已${automationState.dialogTaskId ? '保存' : '创建'}自动任务`);
});

document.querySelector('#automationDialogClose').addEventListener('click', closeAutomationDialog);
document.querySelector('#automationDialogCancel').addEventListener('click', closeAutomationDialog);
automationDialogLayer.addEventListener('click', (event) => { if (event.target === automationDialogLayer) closeAutomationDialog(); });

const automationDetailOptions = {
  space: [
    { value: 'Codem产研', label: 'Codem产研', avatar: '开发', color: '#8d55ed' },
    { value: '飞书项目空间Pilot', label: '飞书项目空间Pilot', avatar: '项目', color: '#5e36ef' },
    { value: 'Meego AI', label: 'Meego AI', avatar: 'AI', color: '#00a870' }
  ],
  reasoning: ['低', '中', '高', '极高'].map((value) => ({ value, label: value })),
  runMode: [
    { value: '运行时新建聊天', label: '运行时新建聊天' },
    { value: '继续当前对话', label: '继续当前对话' }
  ],
  repeat: [
    { value: 'daily', label: '每天' },
    { value: 'workdays', label: '工作日' },
    { value: 'weekly', label: '每周' }
  ],
  weekday: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, index) => ({ value: String(index + 1), label }))
};

const automationProjectDevices = [
  { name: 'MacBook Pro', online: true, projects: ['codem/codem-server', 'codem-shell', 'light-app-database', 'lark-mind-skill', 'lark-mind-app', 'todo-ai-note'] },
  { name: 'Mac Mini', online: true, projects: ['meego-api', 'workflow-worker', 'design-system', 'integration-tests', 'release-tools'] },
  { name: 'DC’s MacBook Air', online: false, projects: [] }
];

let automationDetailFloatingMenu = null;
let automationDetailMenuTrigger = null;

function automationDetailOptionLabel(field, value) {
  return automationDetailOptions[field]?.find((option) => option.value === value)?.label || value;
}

function automationDetailControl(field, value, ariaLabel) {
  return `<button type="button" class="automation-detail-dropdown-trigger" data-detail-menu-field="${field}" aria-label="${ariaLabel}" aria-haspopup="menu" aria-expanded="false"><span>${escapeAutomationHtml(automationDetailOptionLabel(field, value))}</span><i class="automation-detail-chevron" aria-hidden="true"></i></button>`;
}

function closeAutomationDetailFieldMenu(restoreFocus = false) {
  if (automationDetailMenuTrigger) {
    automationDetailMenuTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && automationDetailMenuTrigger.isConnected) automationDetailMenuTrigger.focus();
  }
  automationDetailFloatingMenu?.remove();
  automationDetailFloatingMenu = null;
  automationDetailMenuTrigger = null;
}

function positionAutomationDetailFieldMenu(menu, trigger) {
  const rect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, rect.right - menuRect.width));
  let top = rect.bottom + 5;
  if (top + menuRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - menuRect.height - 5);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function renderAutomationProjectMenu(task) {
  return `
    <button type="button" role="menuitemradio" aria-checked="${task.project === 'Cloud'}" data-detail-project="Cloud"><span class="automation-detail-menu-icon">☁</span><span>Cloud</span>${task.project === 'Cloud' ? '<b>✓</b>' : ''}</button>
    <span class="automation-menu-divider"></span>
    ${automationProjectDevices.map((device) => `
      <div class="automation-detail-project-device">
        <button type="button" role="menuitem" class="automation-detail-device-option" data-project-device="${escapeAutomationHtml(device.name)}"${device.online ? '' : ' disabled'}><span class="automation-detail-menu-icon">▣</span><span>${escapeAutomationHtml(device.name)}</span>${device.online ? '<i>›</i>' : '<em>离线</em><i>›</i>'}</button>
        ${device.online ? `<div class="automation-detail-project-submenu" role="menu" aria-label="${escapeAutomationHtml(device.name)} 项目">${device.projects.map((project) => `<button type="button" role="menuitemradio" aria-checked="${task.project === project}" data-detail-project="${escapeAutomationHtml(project)}"><span class="automation-detail-menu-icon">□</span><span>${escapeAutomationHtml(project)}</span>${task.project === project ? '<b>✓</b>' : ''}</button>`).join('')}<span class="automation-menu-divider"></span><button type="button" role="menuitem" data-new-project><span class="automation-detail-menu-icon">＋</span><span>New project</span></button></div>` : ''}
      </div>
    `).join('')}
  `;
}

function renderAutomationTimeMenu(task) {
  const [hour = '09', minute = '00'] = (task.time || '09:00').split(':');
  return `<div class="automation-detail-time-grid" aria-label="执行时间"><div class="automation-detail-time-column" aria-label="小时">${Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map((value) => `<button type="button" data-detail-hour="${value}" class="${hour === value ? 'is-selected' : ''}">${value}</button>`).join('')}</div><div class="automation-detail-time-column" aria-label="分钟">${Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map((value) => `<button type="button" data-detail-minute="${value}" class="${minute === value ? 'is-selected' : ''}">${value}</button>`).join('')}</div></div>`;
}

function openAutomationDetailFieldMenu(trigger) {
  const task = automationState.tasks.find((item) => item.id === automationState.selectedTaskId);
  if (!task) return;
  const field = trigger.dataset.detailMenuField;
  if (automationDetailMenuTrigger === trigger) return closeAutomationDetailFieldMenu(true);
  closeAutomationDetailFieldMenu();
  closeAutomationMenus();
  const menu = document.createElement('div');
  menu.className = `automation-detail-floating-menu${field === 'time' ? ' is-time-menu' : ''}${field === 'project' ? ' is-project-menu' : ''}`;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', trigger.getAttribute('aria-label') || '选择');
  if (field === 'project') menu.innerHTML = renderAutomationProjectMenu(task);
  else if (field === 'time') menu.innerHTML = renderAutomationTimeMenu(task);
  else menu.innerHTML = automationDetailOptions[field].map((option) => `<button type="button" role="menuitemradio" aria-checked="${task[field] === option.value}" data-detail-option="${escapeAutomationHtml(option.value)}">${option.avatar ? `<span class="automation-detail-option-avatar" style="background:${option.color}">${option.avatar}</span>` : ''}<span>${escapeAutomationHtml(option.label)}</span>${task[field] === option.value ? '<b>✓</b>' : ''}</button>`).join('');
  document.body.append(menu);
  automationDetailFloatingMenu = menu;
  automationDetailMenuTrigger = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  positionAutomationDetailFieldMenu(menu, trigger);
  menu.addEventListener('click', (event) => {
    event.stopPropagation();
    const option = event.target.closest('[data-detail-option]');
    if (option) return updateAutomationDetailField(field, option.dataset.detailOption);
    const project = event.target.closest('[data-detail-project]');
    if (project) return updateAutomationDetailField('project', project.dataset.detailProject);
    if (event.target.closest('[data-new-project]')) { showToast('新建项目暂未接入'); return; }
    const hourButton = event.target.closest('[data-detail-hour]');
    const minuteButton = event.target.closest('[data-detail-minute]');
    if (hourButton || minuteButton) {
      const [currentHour = '09', currentMinute = '00'] = (task.time || '09:00').split(':');
      const nextHour = hourButton?.dataset.detailHour || currentHour;
      const nextMinute = minuteButton?.dataset.detailMinute || currentMinute;
      task.time = `${nextHour}:${nextMinute}`;
      persistAutomationTasks();
      trigger.querySelector('span').textContent = task.time;
      const selector = hourButton ? '[data-detail-hour]' : '[data-detail-minute]';
      menu.querySelectorAll(selector).forEach((button) => button.classList.toggle('is-selected', button === (hourButton || minuteButton)));
    }
  });
  const selected = menu.querySelector('[aria-checked="true"], .is-selected');
  (selected || menu.querySelector('button:not([disabled])'))?.focus({ preventScroll: true });
  if (selected?.scrollIntoView) selected.scrollIntoView({ block: 'center' });
}

function updateAutomationDetailField(field, value, keepMenuOpen = false) {
  const task = automationState.tasks.find((item) => item.id === automationState.selectedTaskId);
  if (!task) return;
  task[field] = value;
  if (field === 'project' && value !== 'Cloud') task.groupName = value === 'codem/codem-server' ? 'codem web' : value;
  persistAutomationTasks();
  renderAutomationList();
  if (!keepMenuOpen) {
    closeAutomationDetailFieldMenu();
    renderAutomationDetail();
  }
}

function renderAutomationDetail() {
  closeAutomationDetailFieldMenu();
  const task = automationState.tasks.find((item) => item.id === automationState.selectedTaskId);
  if (!task) return closeAutomationDetail();
  automationDetailName.innerHTML = `<button type="button" id="automationDetailTitle" title="点击修改任务名称">${escapeAutomationHtml(task.name)}</button>`;
  automationDetailToggle.textContent = task.enabled ? 'Ⅱ' : '▶';
  automationDetailToggle.setAttribute('aria-label', task.enabled ? '暂停任务' : '启用任务');
  const scheduleRows = task.kind === 'scheduled' ? `
    <section class="automation-detail-section"><h3>执行计划</h3><div class="automation-detail-card">
      <div class="automation-detail-row"><label>重复</label>${automationDetailControl('repeat', task.repeat, '选择重复频率')}</div>
      <div class="automation-detail-row" id="detailWeekdayRow"${task.repeat === 'weekly' ? '' : ' hidden'}><label>星期</label>${automationDetailControl('weekday', String(task.weekday || '1'), '选择星期')}</div>
      <div class="automation-detail-row"><label>时间</label>${automationDetailControl('time', task.time || '09:00', '选择执行时间')}</div>
    </div></section>
  ` : `
    <section class="automation-detail-section"><h3>${task.kind === 'event' ? '触发事件' : 'Webhook'}</h3><div class="automation-detail-card"><div class="automation-detail-row"><label>${task.kind === 'event' ? (task.eventType === 'lark' ? '飞书消息' : '代码仓库') : '请求地址'}</label><span class="automation-detail-value">${escapeAutomationHtml(task.kind === 'event' ? `${task.conditions?.length || 0} 个事件条件` : task.webhookUrl)}</span></div></div></section>
  `;
  const histories = [
    { time: '09:00', completed: true },
    { time: '09-21 09:00', completed: true },
    { time: '09-20 09:00', completed: true },
    { time: '09-19 09:00', completed: false }
  ];
  automationDetailContent.innerHTML = `
    <label class="automation-detail-field-label" for="automationDetailInstruction">任务指令</label>
    <textarea class="automation-detail-instruction" id="automationDetailInstruction" aria-label="任务指令">${escapeAutomationHtml(task.instruction)}</textarea>
    <section class="automation-detail-section"><h3>详情</h3><div class="automation-detail-card">
      <div class="automation-detail-row"><label>运行项目</label>${automationDetailControl('project', task.project, '选择运行项目')}</div>
      <div class="automation-detail-row"><label>所属空间</label>${automationDetailControl('space', task.space, '选择所属空间')}</div>
      <div class="automation-detail-row"><label>推理强度</label>${automationDetailControl('reasoning', task.reasoning, '选择推理强度')}</div>
      <div class="automation-detail-row"><label>运行方式</label>${automationDetailControl('runMode', task.runMode, '选择运行方式')}</div>
    </div></section>
    ${scheduleRows}
    <section class="automation-detail-section automation-detail-history"><h3>运行历史</h3><div class="automation-history-list">${histories.map((history, index) => `<button type="button" data-history-index="${index}" aria-label="打开每日简报会话，运行时间 ${history.time}"><span class="automation-history-main"><img class="automation-history-chat" src="./assets/figma-12553/automation-history-chat.svg" alt="" /><span class="automation-history-title">每日简报</span>${history.completed ? '<img class="automation-history-completed" src="./assets/figma-12553/automation-history-status.svg" alt="已完成" />' : ''}</span><time>${history.time}</time></button>`).join('')}</div></section>
  `;
  automationDetailName.querySelector('#automationDetailTitle').addEventListener('click', beginAutomationNameEdit);
}

function beginAutomationNameEdit() {
  const task = automationState.tasks.find((item) => item.id === automationState.selectedTaskId);
  if (!task) return;
  automationDetailName.innerHTML = `<input id="automationDetailTitle" maxlength="50" value="${escapeAutomationHtml(task.name)}" aria-label="任务名称" />`;
  const input = automationDetailName.querySelector('input');
  const finish = (save) => {
    if (save && input.value.trim()) { task.name = input.value.trim(); persistAutomationTasks(); renderAutomationList(); }
    renderAutomationDetail();
  };
  input.addEventListener('blur', () => finish(true), { once: true });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
    if (event.key === 'Escape') { event.preventDefault(); input.removeEventListener('blur', finish); renderAutomationDetail(); }
  });
  input.focus(); input.select();
}

function openAutomationDetail(taskId) {
  const task = automationState.tasks.find((item) => item.id === taskId);
  if (!task) return;
  automationState.selectedTaskId = taskId;
  renderAutomationList();
  renderAutomationDetail();
  automationRunConversation.hidden = true;
  automationDetailDrawer.hidden = false;
  sessionsPanel.classList.add('is-automation-detail-open');
  automationDetailDrawer.focus();
}

function openAutomationRunConversation() {
  if (!automationState.selectedTaskId) return;
  closeAutomationDetailFieldMenu();
  closeAutomationMenus();
  automationDetailDrawer.hidden = true;
  automationRunConversation.hidden = false;
  sessionsPanel.classList.add('is-automation-detail-open');
  automationRunConversation.focus();
}

function returnToAutomationDetail() {
  if (!automationState.selectedTaskId) return closeAutomationDetail();
  automationRunConversation.hidden = true;
  renderAutomationDetail();
  automationDetailDrawer.hidden = false;
  automationDetailDrawer.focus();
}

function closeAutomationDetail() {
  automationState.selectedTaskId = null;
  automationDetailDrawer.hidden = true;
  automationRunConversation.hidden = true;
  sessionsPanel.classList.remove('is-automation-detail-open');
  closeAutomationDetailFieldMenu();
  closeAutomationMenus();
  if (!automationWorkspace.hidden) renderAutomationList();
}

function deleteAutomationTask(taskId) {
  const task = automationState.tasks.find((item) => item.id === taskId);
  automationState.tasks = automationState.tasks.filter((item) => item.id !== taskId);
  persistAutomationTasks();
  if (automationState.selectedTaskId === taskId) closeAutomationDetail();
  renderAutomationList();
  showToast(`已删除「${task?.name || '自动任务'}」`);
}

automationGroups.addEventListener('click', (event) => {
  const openButton = event.target.closest('[data-open-task]');
  if (openButton) return openAutomationDetail(openButton.dataset.openTask);
  const toggle = event.target.closest('[data-toggle-task]');
  if (toggle) {
    const task = automationState.tasks.find((item) => item.id === toggle.dataset.toggleTask);
    task.enabled = !task.enabled; persistAutomationTasks(); renderAutomationList(); showToast(task.enabled ? '任务已启用' : '任务已暂停'); return;
  }
  const menuTrigger = event.target.closest('[data-task-menu-trigger]');
  if (menuTrigger) { event.stopPropagation(); return toggleAutomationMenu(menuTrigger, automationGroups.querySelector(`[data-task-menu="${menuTrigger.dataset.taskMenuTrigger}"]`)); }
  const action = event.target.closest('[data-task-action]');
  if (!action) return;
  const task = automationState.tasks.find((item) => item.id === action.dataset.taskId);
  closeAutomationMenus();
  if (action.dataset.taskAction === 'run') showToast(`正在运行「${task.name}」`);
  if (action.dataset.taskAction === 'edit') openAutomationDialog(task.kind, task);
  if (action.dataset.taskAction === 'delete') deleteAutomationTask(task.id);
});

conversation.addEventListener('click', (event) => {
  const entry = event.target.closest('[data-open-automation-task]');
  if (entry) openAutomationDetail(entry.dataset.openAutomationTask);
});

document.querySelectorAll('[data-template-name]').forEach((button) => {
  button.addEventListener('click', () => openAutomationDialog('scheduled', null, button.dataset.templateName));
});

automationDetailContent.addEventListener('input', (event) => {
  const task = automationState.tasks.find((item) => item.id === automationState.selectedTaskId);
  if (!task) return;
  if (event.target.id === 'automationDetailInstruction') task.instruction = event.target.value;
  if (event.target.dataset.detailField) task[event.target.dataset.detailField] = event.target.value;
  persistAutomationTasks();
  if (event.target.dataset.detailField === 'repeat') {
    automationDetailContent.querySelector('#detailWeekdayRow').hidden = event.target.value !== 'weekly';
    renderAutomationList();
  }
});

automationDetailContent.addEventListener('click', (event) => {
  const fieldTrigger = event.target.closest('[data-detail-menu-field]');
  if (fieldTrigger) {
    event.stopPropagation();
    openAutomationDetailFieldMenu(fieldTrigger);
    return;
  }
  const history = event.target.closest('[data-history-index]');
  if (!history) return;
  openAutomationRunConversation();
});

automationDetailMore.addEventListener('click', (event) => { event.stopPropagation(); toggleAutomationMenu(automationDetailMore, automationDetailMenu); });
automationDetailMenu.addEventListener('click', (event) => {
  const action = event.target.closest('[data-detail-action]');
  if (!action) return;
  const task = automationState.tasks.find((item) => item.id === automationState.selectedTaskId);
  closeAutomationMenus();
  if (action.dataset.detailAction === 'run') showToast(`正在运行「${task.name}」`);
  if (action.dataset.detailAction === 'delete') deleteAutomationTask(task.id);
});
automationDetailToggle.addEventListener('click', () => {
  const task = automationState.tasks.find((item) => item.id === automationState.selectedTaskId);
  if (!task) return;
  task.enabled = !task.enabled; persistAutomationTasks(); renderAutomationDetail(); renderAutomationList(); showToast(task.enabled ? '任务已启用' : '任务已暂停');
});
automationDetailClose.addEventListener('click', closeAutomationDetail);

document.addEventListener('click', (event) => {
  if (!event.target.closest('.automation-detail-floating-menu') && !event.target.closest('[data-detail-menu-field]')) closeAutomationDetailFieldMenu();
  if (!event.target.closest('.automation-menu-wrap')) closeAutomationMenus();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !automationDialogLayer.hidden) { closeAutomationDialog(); return; }
  if (event.key === 'Escape' && automationDetailFloatingMenu) { event.preventDefault(); closeAutomationDetailFieldMenu(true); return; }
  if (event.key === 'Escape' && !automationRunConversation.hidden) { event.preventDefault(); returnToAutomationDetail(); return; }
  if (event.key === 'Escape' && !automationDetailDrawer.hidden) { closeAutomationDetail(); return; }
  if (event.key === 'Escape') closeAutomationMenus();
  const menu = event.target.closest?.('.automation-popover');
  if (menu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    const items = [...menu.querySelectorAll('button:not([disabled])')];
    const index = items.indexOf(document.activeElement);
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }
  const detailMenu = event.target.closest?.('.automation-detail-floating-menu');
  if (detailMenu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const items = [...detailMenu.querySelectorAll('button:not([disabled])')].filter((item) => item.offsetParent !== null);
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  if (!automationDialogLayer.hidden && event.key === 'Tab') {
    const focusable = [...automationDialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')].filter((item) => !item.hidden);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

renderAutomationList();
