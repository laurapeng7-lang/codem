import { useEffect, useRef } from 'react';
import type { SettingsExecutionResult } from './settings-execution-result';
import './settings-confirmation.css';

export function settingsConfirmationCopy(scenario: string, result: SettingsExecutionResult) {
  if (scenario === 'settings-member-permissions') return {
    introduction: '即将生成以下权限调整草案，请确认变更范围：',
    items: [result.bullets[0], `${result.bullets[1]}${result.bullets[2]}`, '限制只读组的工作项、字段与流程操作；成员基础角色调整会影响该角色下的成员。'],
  };
  if (result.title.includes('优化草案')) return {
    introduction: '即将生成以下展示配置优化草案，请确认：',
    items: [`${result.bullets[0]}${result.bullets[1]}`, `${result.bullets[2]}${result.bullets[3]}`],
  };
  if (result.kind === 'document') return {
    introduction: '即将依据当前空间配置生成操作手册，请确认内容范围：',
    items: ['按创建需求、填写表单、推进流程、查询数据和权限提醒整理五个章节。', '说明必填字段、节点顺序与角色权限，保留尚未明确的业务规则。'],
  };
  if (scenario === 'settings-create-field') return {
    introduction: '即将生成以下字段与表单配置草案，请确认：',
    items: [`整理${result.changes[0].title}，${result.bullets[0].replace('，字段定义已纳入草案', '')}`, '将字段加入表单的“基本信息”分区，保留待确认的字段标识、可见条件和编辑权限。'],
  };
  if (scenario === 'settings-replace-field') return {
    introduction: '即将整理字段替换草案与配置差异，请确认：',
    items: [result.bullets[0], `${result.bullets[1]}同时核对表单、列表与排序的引用，保留历史值映射的待确认项。`],
  };
  return {
    introduction: '即将生成以下流程配置草案，请确认调整范围：',
    items: result.title.includes('安全审核')
      ? [result.bullets[0], result.bullets[1], `${result.bullets[2]}${result.bullets[3]}`]
      : [result.bullets[0], `${result.bullets[2]}节点完成条件、审批分支与异常回退保留为待确认项。`],
  };
}

export function SettingsConfirmationCard({ scenario, result, onCancel, onConfirm }: {
  scenario: string; result: SettingsExecutionResult; onCancel: () => void; onConfirm: () => void;
}) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const copy = settingsConfirmationCopy(scenario, result);
  useEffect(() => {
    cancelButton.current?.focus({ preventScroll: true });
  }, []);

  return <section className="settings-confirmation-card" aria-label="变更确认"
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.repeat) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault(); onConfirm();
      }
    }}>
    <h2>变更确认</h2>
    <div className="settings-confirmation-body">
      <p>{copy.introduction}</p>
      <ol>{copy.items.map((item, index) => <li key={index}>{item}</li>)}</ol>
    </div>
    <footer>
      <button ref={cancelButton} type="button" className="settings-confirmation-cancel" onClick={onCancel}>取消</button>
      <button type="button" className="settings-confirmation-confirm" onClick={onConfirm} aria-keyshortcuts="Meta+Enter Control+Enter">
        <span>确认</span><img src="/assets/figma/settings-hitl/confirm-shortcut.svg" width="30.67" height="16.76" alt="" />
      </button>
    </footer>
  </section>;
}
