const levels = [
  { label: 'Low', emoji: '😏', color: '#F1F1FC' },
  { label: 'Medium', emoji: '🤓', color: '#FFE46C' },
  { label: 'High', emoji: '😎', color: '#FFB36C' },
  { label: 'Ultra', emoji: '😈', color: '#8C6CFF' },
] as const;

export type IntelligenceLevel = typeof levels[number]['label'];

// Match codem-app's reasoning-slider: quarter fills, centered ticks and a slim indicator.
export function IntelligenceSlider({ value, onChange }: { value: IntelligenceLevel; onChange: (value: IntelligenceLevel) => void }) {
  const selectedIndex = levels.findIndex(level => level.label === value);
  const selected = levels[selectedIndex];
  const fillRatio = (selectedIndex + 1) / levels.length;
  const ticks = levels.map((level, index) => <span key={level.label} data-selected={index === selectedIndex} />);

  return <div className="intelligence-control">
    <div className="intelligence-slider-labels">
      <span>Intelligence</span>
      <span><span aria-hidden="true">{selected.emoji}</span> {selected.label}</span>
    </div>
    <div className="intelligence-slider" data-level={value} data-contrast={value === 'Ultra' ? 'inverse' : 'default'}>
      <div aria-hidden="true" className="intelligence-slider-fill" style={{ backgroundColor: selected.color, transform: `scaleX(${fillRatio})` }} />
      <div aria-hidden="true" className="intelligence-slider-ticks">{ticks}</div>
      <div aria-hidden="true" className="intelligence-slider-ticks intelligence-slider-filled-ticks" style={{ clipPath: `inset(0 ${(1 - fillRatio) * 100}% 0 0)` }}>{ticks}</div>
      <span aria-hidden="true" className="intelligence-slider-indicator" style={{ left: `${(selectedIndex + .5) / levels.length * 100}%` }} />
      <input type="range" min={0} max={levels.length - 1} step={1} value={selectedIndex} aria-label="Intelligence level" aria-valuetext={selected.label}
        onChange={event => {
          const level = levels[Number(event.currentTarget.value)];
          if (level) onChange(level.label);
        }} />
    </div>
  </div>;
}
