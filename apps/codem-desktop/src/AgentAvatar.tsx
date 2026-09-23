import { useEffect, useRef } from 'react';
import { recolorAvatarBackground } from './agent-avatar-pixels';

const webpAvatars = new Map(['planner', 'architect', 'reviewer', 'tester', 'sheriff', 'release', 'radar'].flatMap(name => [
  [`/assets/settings/${name}.png`, `/assets/settings/animated/${name}.webp`],
  [`/assets/settings/agent-detail/avatar-${name}.png`, `/assets/settings/animated/${name}.webp`],
]));
webpAvatars.set('/assets/settings/create-agent/reviewer-avatar.png', '/assets/settings/animated/reviewer.webp');

export function AgentAvatar({ src, background, className, size = 64, alt = '' }: { src: string; background?: string; className?: string; size?: number; alt?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const displaySrc = webpAvatars.get(src) ?? src;
  useEffect(() => {
    const node = canvas.current;
    if (!node || !background) return;
    let cancelled = false;
    const source = new Image();
    source.onload = () => {
      if (cancelled) return;
      const context = node.getContext('2d');
      if (!context) return;
      node.width = source.naturalWidth;
      node.height = source.naturalHeight;
      context.drawImage(source, 0, 0);
      const bitmap = context.getImageData(0, 0, node.width, node.height);
      // Only overlay the stationary background; the native image keeps playing underneath.
      bitmap.data.set(recolorAvatarBackground(bitmap.data, node.width, node.height, background, true));
      context.putImageData(bitmap, 0, 0);
      node.style.opacity = '1';
    };
    node.style.opacity = '0';
    source.src = displaySrc;
    return () => { cancelled = true; source.onload = null; };
  }, [displaySrc, background]);
  return <span className={`agent-avatar-image${className ? ` ${className}` : ''}`} style={{ width: size, height: size }}>
    <picture>
      {displaySrc !== src && <source media="(prefers-reduced-motion: reduce)" srcSet={src} />}
      <img src={displaySrc} width={size} height={size} alt={alt} draggable="false" />
    </picture>
    {background && <canvas ref={canvas} width={128} height={128} aria-hidden="true" />}
  </span>;
}
