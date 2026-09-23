import './codem-logo.css';

export function CodeMLogo({ size = 16 }: { size?: number }) {
  return <picture className="codem-logo" style={{ width: size, height: size }} aria-hidden="true">
    <source media="(prefers-reduced-motion: reduce)" srcSet="/assets/codem-motion-still.png" />
    <img src="/assets/codem-motion.webp" width={size} height={size} alt="" draggable="false" />
  </picture>;
}
