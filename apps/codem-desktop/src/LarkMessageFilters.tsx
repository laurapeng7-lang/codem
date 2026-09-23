import { useRef } from 'react';
import { ChevronDownIcon, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export const messageFilterOptions = [
  { value: 'group', label: '指定群组' },
  { value: 'sender', label: '指定发送人' },
  { value: 'any-keyword', label: '含任意发送词' },
  { value: 'all-keywords', label: '含全部关键词' },
  { value: 'mention-me', label: '@我的消息' },
  { value: 'direct-message', label: '单聊' },
] as const;

export type MessageFilter = {
  id: string;
  type: typeof messageFilterOptions[number]['value'];
  values: string[];
  keywords: string;
};

const mockGroups = ['CodeM 研发群', 'CodeM 产品设计群', '项目协作群'];
const mockSenders = ['张明', '李然', '王晓'];

function FilterIcon({ name }: { name: 'close' | 'add' }) {
  const path = name === 'close' ? '/assets/figma/work-item-drawer/close.svg' : '/assets/figma/work-items/plus.svg';
  return <span aria-hidden="true" className="size-4 shrink-0 bg-current" style={{ mask: `url(${path}) center / contain no-repeat` }} />;
}

function PeopleOrGroupSelect({ filter, onChange }: { filter: MessageFilter; onChange: (values: string[]) => void }) {
  const isGroup = filter.type === 'group';
  const placeholder = isGroup ? '选择群组' : '选择发送人';
  const options = isGroup ? mockGroups : mockSenders;
  return <div className="relative flex min-h-9 min-w-0 flex-wrap items-center gap-1 rounded-lg border border-input py-1 pr-9 pl-2 transition-colors hover:bg-muted has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
    {filter.values.map(value => <span key={value} className="pointer-events-none relative z-10 inline-flex max-w-full items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-500">
      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-violet-500 text-[10px] text-white">{isGroup ? '群' : value[0]}</span>
      <span className="truncate">{value}</span>
      <button type="button" aria-label={`移除${value}`} className="pointer-events-auto shrink-0 rounded hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onChange(filter.values.filter(item => item !== value))}><FilterIcon name="close" /></button>
    </span>)}
    <span aria-hidden="true" className="pointer-events-none text-sm text-muted-foreground">{placeholder}</span>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={placeholder} className="absolute inset-0 flex w-full items-center justify-end rounded-lg pr-3 outline-none">
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-0">
        {options.map(option => <DropdownMenuCheckboxItem key={option} checked={filter.values.includes(option)} onSelect={event => event.preventDefault()} onCheckedChange={checked => onChange(checked ? [...new Set([...filter.values, option])] : filter.values.filter(value => value !== option))} className="h-9">{option}</DropdownMenuCheckboxItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

export function LarkMessageFilters({ filters, onChange }: { filters: MessageFilter[]; onChange: (filters: MessageFilter[]) => void }) {
  const nextId = useRef(1);
  const update = (id: string, patch: Partial<MessageFilter>) => onChange(filters.map(filter => filter.id === id ? { ...filter, ...patch } : filter));
  return <div className="mt-[6px] grid min-w-0 grid-cols-[max-content_minmax(0,1fr)_24px] items-start gap-2" aria-label="飞书消息筛选条件">
    {filters.map((filter, index) => <div key={filter.id} className="col-span-3 grid grid-cols-subgrid items-start gap-2">
      <Select value={filter.type} onValueChange={type => update(filter.id, { type: type as MessageFilter['type'], values: [], keywords: '' })}>
        <SelectTrigger aria-label={`筛选条件 ${index + 1}`} className="w-auto gap-2 rounded-lg px-3 hover:bg-muted data-[size=default]:h-9">
          <span className="grid text-left">
            {messageFilterOptions.map(option => <span key={option.value} aria-hidden="true" className="invisible col-start-1 row-start-1">{option.label}</span>)}
            <span className="col-start-1 row-start-1 self-center"><SelectValue /></span>
          </span>
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) min-w-0">
          <SelectGroup>{messageFilterOptions.map(option => <SelectItem key={option.value} value={option.value} className="h-9">{option.label}</SelectItem>)}</SelectGroup>
        </SelectContent>
      </Select>
      {filter.type === 'group' || filter.type === 'sender' ? <PeopleOrGroupSelect filter={filter} onChange={values => update(filter.id, { values })} />
        : filter.type === 'any-keyword' || filter.type === 'all-keywords' ? <Input className="h-9 min-w-0 rounded-lg" aria-label={`筛选条件 ${index + 1} 的关键词`} placeholder={filter.type === 'any-keyword' ? '任意词，逗号分隔' : '全部关键词，逗号分隔'} value={filter.keywords} onChange={event => update(filter.id, { keywords: event.target.value })} />
        : <span className="flex min-h-9 items-center text-xs text-muted-foreground">{filter.type === 'mention-me' ? '仅接收 @我的消息' : '仅接收单聊消息'}</span>}
      <button type="button" aria-label={`删除筛选条件 ${index + 1}`} title="删除筛选条件" className="mt-1.5 grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onChange(filters.filter(item => item.id !== filter.id))}><Trash2 className="size-4" aria-hidden="true" /></button>
    </div>)}
    <Button type="button" variant="outline" className="col-start-1 h-9 w-full gap-1 font-normal" onClick={() => onChange([...filters, { id: `message-filter-${nextId.current++}`, type: 'group', values: [], keywords: '' }])}><FilterIcon name="add" />添加事件</Button>
  </div>;
}
