export type ArtifactId = 'report' | 'markdown' | 'framework' | 'settings-review';
export type ArtifactTabsState = { items: ArtifactId[]; active: ArtifactId | null };
export type ArtifactTabsAction = { type: 'open' | 'select' | 'close'; id: ArtifactId } | { type: 'close-all' };

export const initialArtifactTabs: ArtifactTabsState = { items: ['report'], active: 'report' };

export function artifactTabsReducer(state: ArtifactTabsState, action: ArtifactTabsAction): ArtifactTabsState {
  if (action.type === 'close-all') return { items: [], active: null };
  if (action.type === 'open') {
    return { items: state.items.includes(action.id) ? state.items : [...state.items, action.id], active: action.id };
  }
  if (action.type === 'select') {
    return state.items.includes(action.id) ? { ...state, active: action.id } : state;
  }
  const index = state.items.indexOf(action.id);
  if (index === -1) return state;
  const items = state.items.filter(id => id !== action.id);
  const active = state.active === action.id ? (items[Math.min(index, items.length - 1)] ?? null) : state.active;
  return { items, active };
}
