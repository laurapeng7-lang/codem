import { useRef } from 'react';
import { ChevronDownIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export const repositoryEventOptions = [
  { value: 'merge-request-created', label: 'MR/PR创建' },
  { value: 'merge-request-updated', label: 'MR/PR更新' },
  { value: 'merge-request-merged', label: 'MR/PR合并' },
  { value: 'merge-request-closed', label: 'MR/PR关闭' },
] as const;

export type RepositoryEventCondition = {
  id: string;
  event: typeof repositoryEventOptions[number]['value'];
  repositories: string[];
};

const authorizedRepositories = [
  'codem/codem-web',
  'codem/codem-workflow',
  'meego/meego-ai',
  'semi-design/semi-design',
];

function ConditionIcon({ name }: { name: 'close' | 'add' }) {
  const path = name === 'close' ? '/assets/figma/work-item-drawer/close.svg' : '/assets/figma/work-items/plus.svg';
  return <span aria-hidden="true" className="size-4 shrink-0 bg-current" style={{ mask: `url(${path}) center / contain no-repeat` }} />;
}

function RepositoryMultiSelect({ condition, onChange }: { condition: RepositoryEventCondition; onChange: (repositories: string[]) => void }) {
  return <div className="relative flex min-h-9 min-w-0 flex-wrap items-center gap-1 rounded-lg border border-input py-1 pr-9 pl-2 transition-colors hover:bg-muted has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
    {condition.repositories.map(repository => <span key={repository} className="pointer-events-none relative z-10 inline-flex max-w-full items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-500">
      <span className="grid size-4 shrink-0 place-items-center overflow-hidden rounded-full bg-white"><img src="/assets/figma/codem-automations/github.svg" width="12" height="12" alt="" /></span>
      <span className="truncate">{repository}</span>
      <button type="button" aria-label={`移除${repository}`} className="pointer-events-auto shrink-0 rounded hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onChange(condition.repositories.filter(item => item !== repository))}><ConditionIcon name="close" /></button>
    </span>)}
    {!condition.repositories.length && <span aria-hidden="true" className="pointer-events-none text-sm text-muted-foreground">选择代码仓库</span>}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="选择已授权的代码仓库" className="absolute inset-0 flex w-full items-center justify-end rounded-lg pr-3 outline-none">
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-0">
        {authorizedRepositories.map(repository => <DropdownMenuCheckboxItem key={repository} checked={condition.repositories.includes(repository)} onSelect={event => event.preventDefault()} onCheckedChange={checked => onChange(checked ? [...new Set([...condition.repositories, repository])] : condition.repositories.filter(item => item !== repository))} className="h-9">
          <img src="/assets/figma/codem-automations/github.svg" width="16" height="16" alt="" /><span className="truncate">{repository}</span>
        </DropdownMenuCheckboxItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

export function RepositoryEventConditions({ conditions, onChange }: { conditions: RepositoryEventCondition[]; onChange: (conditions: RepositoryEventCondition[]) => void }) {
  const nextId = useRef(1);
  const update = (id: string, patch: Partial<RepositoryEventCondition>) => onChange(conditions.map(condition => condition.id === id ? { ...condition, ...patch } : condition));
  return <div className="mt-[6px] grid min-w-0 grid-cols-[max-content_minmax(0,1fr)_24px] items-start gap-2" aria-label="代码仓库触发条件">
    {conditions.map((condition, index) => <div key={condition.id} className="col-span-3 grid grid-cols-subgrid items-start gap-2">
      <Select value={condition.event} onValueChange={event => update(condition.id, { event: event as RepositoryEventCondition['event'] })}>
        <SelectTrigger aria-label={`代码仓库条件 ${index + 1}`} className="w-auto gap-2 rounded-lg px-3 hover:bg-muted data-[size=default]:h-9">
          <span className="grid text-left">
            {repositoryEventOptions.map(option => <span key={option.value} aria-hidden="true" className="invisible col-start-1 row-start-1">{option.label}</span>)}
            <span className="col-start-1 row-start-1 self-center"><SelectValue /></span>
          </span>
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) min-w-0">
          <SelectGroup>{repositoryEventOptions.map(option => <SelectItem key={option.value} value={option.value} className="h-9">{option.label}</SelectItem>)}</SelectGroup>
        </SelectContent>
      </Select>
      <RepositoryMultiSelect condition={condition} onChange={repositories => update(condition.id, { repositories })} />
      <button type="button" aria-label={`删除代码仓库条件 ${index + 1}`} title="删除条件" className="mt-1.5 grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onChange(conditions.filter(item => item.id !== condition.id))}><Trash2 className="size-4" aria-hidden="true" /></button>
    </div>)}
    <Button type="button" variant="outline" className="col-start-1 h-9 w-full gap-1 font-normal" onClick={() => onChange([...conditions, { id: `repository-condition-${nextId.current++}`, event: 'merge-request-created', repositories: [] }])}><ConditionIcon name="add" />添加事件</Button>
  </div>;
}
