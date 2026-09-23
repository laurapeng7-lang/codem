import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

const platforms = [
  { id: 'github', name: 'GitHub', icon: '/assets/figma/codem-automations/github.svg' },
  { id: 'gitlab', name: 'GitLab', icon: '/assets/figma/work-item-wbs/gitlab.svg' },
] as const;
type PlatformId = typeof platforms[number]['id'];

export function RepositoryAuthorization({ visible }: { visible: boolean }) {
  const [authorized, setAuthorized] = useState<Record<PlatformId, boolean>>({ github: true, gitlab: false });
  const [popupBlocked, setPopupBlocked] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timerRef.current), []);

  function openAuthorization(platform: PlatformId) {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }
    const popup = window.open(`/mock-repository-authorization.html?platform=${platform}`, '_blank', 'popup,width=640,height=760');
    setPopupBlocked(!popup);
    if (!popup) return;
    popupRef.current = popup;
    window.clearInterval(timerRef.current);
    // This is intentionally a mock: closing the local page completes authorization.
    timerRef.current = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(timerRef.current);
      popupRef.current = null;
      setAuthorized(current => ({ ...current, [platform]: true }));
    }, 300);
  }

  return <div hidden={!visible} className="mt-[6px]">
    <div className="flex min-w-0 flex-col gap-[6px]" aria-label="代码仓库授权">
      <div className="overflow-hidden rounded-xl border border-input" role="list" aria-label="代码仓库平台">
        {platforms.map(item => <div key={item.id} role="listitem" className="flex min-w-0 items-center justify-between gap-3 border-b border-input py-[10px] pl-4 pr-3 last:border-b-0 hover:bg-muted/40 focus-within:bg-muted/40">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-[8px] border border-input bg-muted/20">
              <img src={item.icon} width="20" height="20" className="size-5 object-contain" alt="" />
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">{item.name}</span>
              {authorized[item.id] && <span className="inline-flex shrink-0 items-center gap-1 text-sm leading-5 text-green-600">
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
                已授权
              </span>}
            </div>
          </div>
          <button type="button" className="inline-flex w-[60px] shrink-0 cursor-pointer items-center justify-start rounded-sm border-0 bg-transparent p-0 text-left text-sm leading-5 font-medium text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" aria-label={authorized[item.id] ? `${item.name} 已授权，前往修改（打开模拟授权窗口）` : `前往授权 ${item.name}（打开模拟授权窗口）`} onClick={() => openAuthorization(item.id)}>
            <span>{authorized[item.id] ? '前往修改' : '前往授权'}</span>
          </button>
        </div>)}
      </div>
      {popupBlocked && <p role="alert" className="text-xs text-muted-foreground">模拟授权窗口被浏览器拦截，请允许弹出窗口后重试。</p>}
    </div>
  </div>;
}
