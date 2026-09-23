import assets from './assets.json';
import { conversationUrl } from './conversation-url';

export type ApplicationSlug = 'epic' | 'version' | 'sprint' | 'story' | 'bug' | 'story-list' | '2025-ybr' | '2024-ybr';
export type Application = { id: string; slug: ApplicationSlug; label: string; icon: keyof typeof assets; color: string };

// Stable IDs also distinguish the two Story entries when the navigation is searched.
export const applications: Application[] = [
  { id: 'Epic-0', slug: 'epic', label: 'Epic', icon: 'sidebar/imgOutlinedFlag', color: '#ffc60a' },
  { id: 'Version-1', slug: 'version', label: 'Version', icon: 'sidebar/imgOutlinedVersion', color: '#e27ee2' },
  { id: 'Sprint-2', slug: 'sprint', label: 'Sprint', icon: 'sidebar/imgOutlinedMindMapping', color: '#3dbc2f' },
  { id: 'Story-3', slug: 'story', label: 'Story', icon: 'sidebar/imgOutlinedStory', color: '#6f5ff4' },
  { id: 'Bug-4', slug: 'bug', label: 'Bug', icon: 'sidebar/imgOutlinedIssue', color: '#f67e7a' },
  { id: 'Story-5', slug: 'story-list', label: 'Story', icon: 'sidebar/imgOutlinedVersion', color: '#5789ff' },
];

export const personalApplications: Application[] = [
  { id: '2025 YBR', slug: '2025-ybr', label: '2025 YBR', icon: 'sidebar/imgIconListViewOutlined', color: '#6f5ff414' },
  { id: '2024 YBR', slug: '2024-ybr', label: '2024 YBR', icon: 'sidebar/imgIconListViewOutlined', color: '#6f5ff414' },
];
export const workItemApplications = [...applications, ...personalApplications];

export function getWorkItemTitleIcon(application: Application) {
  return application.slug === '2025-ybr' || application.slug === '2024-ybr'
    ? applications.find(item => item.slug === 'story') ?? application : application;
}

const workItemNavigationEvent = 'work-item-navigation';

function parseApplicationPath(pathname: string) {
  const match = /^\/apps\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  return { application: workItemApplications.find(app => app.slug === match?.[1]), itemId: match?.[2] };
}

export function applicationFromPath(pathname: string) {
  return parseApplicationPath(pathname).application;
}

export function workItemIdFromPath(pathname: string, slug: ApplicationSlug) {
  const { application, itemId } = parseApplicationPath(pathname);
  if (application?.slug !== slug || !itemId || !/^[1-9]\d*$/.test(itemId)) return null;
  const id = Number(itemId);
  return Number.isSafeInteger(id) ? id : null;
}

export function subscribeWorkItemNavigation(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(workItemNavigationEvent, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(workItemNavigationEvent, listener);
  };
}

export function navigateWorkItem(id: string, itemId: number | null) {
  const app = workItemApplications.find(item => item.id === id);
  if (!app || (itemId !== null && (!Number.isSafeInteger(itemId) || itemId < 1))) return;
  const url = conversationUrl(window.location.href, false);
  url.pathname = `/apps/${app.slug}${itemId === null ? '' : `/${itemId}`}`;
  url.hash = '';
  if (url.href === window.location.href) return;
  window.history.pushState(null, '', url.href);
  // pushState does not emit popstate, including when the active sidebar entry is clicked again.
  window.dispatchEvent(new Event(workItemNavigationEvent));
}

export function navigateApplication(id: string) {
  navigateWorkItem(id, null);
}
