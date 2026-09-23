import { resolveConversation } from './work-item-chat';

export function isNewConversationUrl(search: string) {
  return new URLSearchParams(search).get('view') === 'new-chat';
}

export function conversationIdFromUrl(pathname: string, search: string) {
  if (pathname === '/chat' || pathname.startsWith('/chat/')) {
    const match = /^\/chat\/([^/]+)\/?$/.exec(pathname);
    if (!match) return null;
    try {
      const id = decodeURIComponent(match[1]);
      return resolveConversation(id) ? id : null;
    } catch { return null; }
  }
  return isNewConversationUrl(search) ? null : 'project-report';
}

export function conversationUrl(href: string, newConversation: boolean, conversationId?: string) {
  const url = new URL(href);
  url.searchParams.delete('workspace');
  url.pathname = !newConversation && conversationId ? `/chat/${encodeURIComponent(conversationId)}` : '/';
  if (newConversation) url.searchParams.set('view', 'new-chat');
  else if (isNewConversationUrl(url.search)) url.searchParams.delete('view');
  if (url.hash === '#report') url.hash = '';
  return url;
}

export function navigateConversation(newConversation: boolean, conversationId?: string) {
  const url = conversationUrl(window.location.href, newConversation, conversationId);
  if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
}

export function isHomeUrl(pathname: string) {
  return pathname.replace(/\/$/, '') === '/home';
}

export function redirectRootToHome() {
  const url = new URL(window.location.href);
  if (url.pathname !== '/' || isNewConversationUrl(url.search) || url.hash === '#report') return;
  url.pathname = '/home';
  window.history.replaceState(window.history.state, '', url.href);
}

export function navigateHome() {
  const url = conversationUrl(window.location.href, false);
  url.pathname = '/home';
  url.hash = '';
  if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
}

export function isMarketplaceUrl(pathname: string) {
  return pathname.replace(/\/$/, '') === '/marketplace';
}

export function navigateMarketplace() {
  const url = conversationUrl(window.location.href, false);
  url.pathname = '/marketplace';
  url.hash = '';
  if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
}

export function isAdminUrl(pathname: string) {
  return pathname.replace(/\/$/, '') === '/admin';
}

export function navigateAdmin() {
  const url = conversationUrl(window.location.href, false);
  url.pathname = '/admin';
  url.hash = '';
  if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
}

export function isSettingsUrl(pathname: string) {
  return pathname.replace(/\/$/, '') === '/settings';
}

export function navigateSettings() {
  const url = conversationUrl(window.location.href, false);
  url.pathname = '/settings';
  url.hash = '';
  if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
}

export function isCodeMSettingsUrl(pathname: string) {
  return pathname.replace(/\/$/, '') === '/codem/settings';
}

export function navigateCodeMSettings() {
  const url = conversationUrl(window.location.href, false);
  url.pathname = '/codem/settings';
  url.hash = '';
  if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
}

export function isCodeMToolsUrl(pathname: string) {
  return pathname.replace(/\/$/, '') === '/codem/tools';
}

export function navigateCodeMTools() {
  const url = conversationUrl(window.location.href, false);
  url.pathname = '/codem/tools';
  url.hash = '';
  if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
}

export function isCodeMAutomationsUrl(pathname: string) {
  return pathname.replace(/\/$/, '') === '/codem/automations';
}

export function navigateCodeMAutomations() {
  const url = conversationUrl(window.location.href, false);
  url.pathname = '/codem/automations';
  url.hash = '';
  if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
}
