export const adminSettingsKey = 'meego-admin:function-settings:v1';
export const navigationItems = [
  { id: 'home', label: '主页', icon: 'sidebar/imgIconHomeFilled', color: '#0046fe', locked: true },
  { id: 'agent', label: 'CodeM', icon: 'sidebar/codem', locked: true },
  { id: 'my-work', label: '我的工作', icon: 'sidebar/imgIconMemberFilled', color: '#fa8500' },
  { id: 'team', label: '团队', icon: 'sidebar/imgIconCommunityTabFilled', color: '#02a28c' },
  { id: 'marketplace', label: '模版中心', icon: 'sidebar/imgIconTemplateColorful' },
] as const;
export type NavigationId = typeof navigationItems[number]['id'];
export type AdminSettings = {
  showUnauthorizedSpaces: boolean;
  syncTasks: boolean;
  shareTemplates: boolean;
  navigation: { id: NavigationId; visible: boolean }[];
};
export function defaultAdminSettings(): AdminSettings {
  return { showUnauthorizedSpaces: true, syncTasks: true, shareTemplates: true,
    navigation: navigationItems.map(item => ({ id: item.id, visible: true })) };
}
export function loadAdminSettings(): AdminSettings {
  const defaults = defaultAdminSettings();
  try {
    const saved = JSON.parse(window.localStorage.getItem(adminSettingsKey) ?? 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    for (const key of ['showUnauthorizedSpaces', 'syncTasks', 'shareTemplates'] as const) {
      if (typeof saved[key] === 'boolean') defaults[key] = saved[key];
    }
    if (Array.isArray(saved.navigation)) {
      const seen = new Set<NavigationId>(['home', 'agent']);
      const configurable: AdminSettings['navigation'] = [];
      for (const item of saved.navigation) {
        if (!item || !navigationItems.some(option => option.id === item.id) || seen.has(item.id)) continue;
        seen.add(item.id);
        configurable.push({ id: item.id, visible: typeof item.visible === 'boolean' ? item.visible : true });
      }
      defaults.navigation = [...defaults.navigation.slice(0, 2), ...configurable,
        ...defaults.navigation.filter(item => !seen.has(item.id))];
    }
  } catch { /* Use defaults when browser storage is unavailable or malformed. */ }
  return defaults;
}
export function saveAdminSettings(settings: AdminSettings) {
  try { window.localStorage.setItem(adminSettingsKey, JSON.stringify(settings)); } catch { /* Keep controls usable without storage. */ }
}
export function moveNavigation(settings: AdminSettings, source: NavigationId, target: NavigationId): AdminSettings {
  const from = settings.navigation.findIndex(item => item.id === source);
  const to = settings.navigation.findIndex(item => item.id === target);
  if (from < 2 || to < 2 || from === to) return settings;
  const navigation = [...settings.navigation];
  const [item] = navigation.splice(from, 1);
  navigation.splice(to, 0, item);
  return { ...settings, navigation };
}
