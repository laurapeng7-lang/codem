const assetRoot = '/assets/figma/codem-settings/';

export const assistantTools = [
  { id: 'meego', name: '飞书项目', description: '查询、编辑飞书项目的数据', icon: 'tool-meego.svg', required: true },
  { id: 'chat', name: '飞书消息', description: '搜索消息和群聊、发消息、回复话题、管理成员与表情回应、收发图片文件', icon: 'tool-chat.svg' },
  { id: 'doc', name: '云文档', description: '创建文档、读取内容、更新正文、插入图片附件、搜索云文档', icon: 'tool-doc.svg' },
  { id: 'meeting', name: '飞书会议', description: '创建文档、读取内容、更新正文、插入图片附件、搜索云文档', icon: 'tool-meeting.svg' },
  { id: 'drive', name: '云空间', description: '上传下载文件、整理目录、导入导出文档、管理权限、处理评论', icon: 'tool-drive.svg' },
  { id: 'sheet', name: '电子表格', description: '创建表格、读写单元格、批量追加、查找替换、筛选视图、导出下载', icon: 'tool-sheet.svg' },
  { id: 'base', name: '多维表格', description: '管理数据表、字段、记录、视图、表单、仪表盘、自动化与权限角色', icon: 'tool-base.svg' },
  { id: 'calendar', name: '日历', description: '查日程、约会议、查忙闲、推荐时间、预定会议室、回复邀约', icon: 'tool-calendar.svg' },
].map(tool => ({ ...tool, required: 'required' in tool && tool.required, icon: assetRoot + tool.icon }));

export const assistantSpaces = [
  { id: 'meego', name: 'Meego', icon: 'space-meego.svg' },
  { id: 'lark', name: 'Lark', icon: 'space-lark.svg' },
  { id: 'codem', name: 'CodeM', icon: 'space-codem.svg' },
  { id: 'board', name: 'Board', icon: 'space-board.svg' },
  { id: 'supernova', name: 'Supernova', icon: 'space-supernova.svg' },
].map(space => ({ ...space, icon: assetRoot + space.icon }));

export type AssistantSettings = { enabledTools: string[]; authorizedSpaces: string[] };
export const assistantSettingsStorageKey = 'meego:codem:assistant-settings:v1';

export function loadAssistantSettings(): AssistantSettings {
  const defaults = { enabledTools: assistantTools.filter(tool => tool.id !== 'calendar').map(tool => tool.id), authorizedSpaces: assistantSpaces.map(space => space.id) };
  try {
    const saved = JSON.parse(window.localStorage.getItem(assistantSettingsStorageKey) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;
    return {
      enabledTools: Array.isArray(saved.enabledTools) ? assistantTools.filter(tool => tool.required || saved.enabledTools.includes(tool.id)).map(tool => tool.id) : defaults.enabledTools,
      authorizedSpaces: Array.isArray(saved.authorizedSpaces) ? assistantSpaces.filter(space => saved.authorizedSpaces.includes(space.id)).map(space => space.id) : defaults.authorizedSpaces,
    };
  } catch { return defaults; }
}

export function saveAssistantSettings(settings: AssistantSettings): boolean {
  try { window.localStorage.setItem(assistantSettingsStorageKey, JSON.stringify(settings)); return true; }
  catch { return false; }
}
