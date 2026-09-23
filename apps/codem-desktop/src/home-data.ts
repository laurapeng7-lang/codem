export const homeAssetRoot = '/assets/figma/home/';

export const homeRecommendations = [
  { id: 'work', category: 'My work', title: 'Start working', image: 'my-work.png' },
  { id: 'weekly', category: 'AI Weekly', title: 'Weekly highlights', image: 'weekly.png' },
  { id: 'create', category: 'Create', title: 'Create work item', image: 'create-work.png' },
  { id: 'template', category: 'Best Practice', title: 'Template update', image: 'template.png' },
] as const;

export const homeSpaces = [
  { name: 'Agile Development', initial: 'A', color: '#00b89f', application: 'Story-3' },
  { name: 'Issue Resolution', initial: 'I', color: '#fa8500', application: 'Bug-4' },
  { name: 'Product Dev', initial: 'P', color: '#1f232999', application: 'Epic-0' },
];

export type HomeEntry = { id: string; name: string; kind: 'view' | 'file' | 'folder'; space: string; application: string; icon?: string; children?: HomeEntry[] };
const folder = (id: string, name: string, icon: string): HomeEntry => ({
  id, name, kind: 'folder', space: '-', icon, application: '2025 YBR',
  children: [
    { id: `${id}-milestones`, name: 'Q3 Milestones', kind: 'view', space: 'Meego', application: '2025 YBR' },
    { id: `${id}-plan`, name: 'Product roadmap', kind: 'view', space: 'Meego', application: '2024 YBR' },
  ],
});

export const homeEntries: HomeEntry[] = [
  { id: 'milestones-view', name: 'Q3 Milestones', kind: 'view', space: 'Meego', application: '2025 YBR' },
  { id: 'milestones-plan', name: 'Q3 Milestones', kind: 'view', space: 'Meego', application: '2024 YBR' },
  { id: 'milestones-file', name: 'Q3 Milestones', kind: 'file', space: 'Meego', application: 'Epic-0' },
  folder('novabook', 'NovaBook 2', 'folder-blue.svg'),
  folder('atlas', 'Atlas Audio 产品族', 'folder-yellow.svg'),
  folder('orion', 'Orion Pad Portfolio Hub', 'folder-purple.svg'),
  folder('luna', 'Luna Watch Program Center', 'folder-blue.svg'),
  folder('novabook-portfolio', 'NovaBook Portfolio Control', 'folder-orange.svg'),
  folder('aquila-product', 'Aquila-S Product Portfolio', 'folder-green.svg'),
  folder('aquila-program', 'Aquila-S Product Portfolio', 'folder-pink.svg'),
];

export function visibleHomeEntries(tab: 'favorites' | 'frequent', expanded: string[], removed: string[], flat: boolean, space: string) {
  const entries = tab === 'frequent' ? homeEntries.slice(0, 5) : homeEntries.filter(entry => !removed.includes(entry.id));
  return entries.flatMap(entry => [
    { ...entry, depth: 0 },
    ...(entry.children && (flat || expanded.includes(entry.id)) ? entry.children.map(child => ({ ...child, depth: 1 })) : []),
  ]).filter(entry => !space || entry.space === space);
}
