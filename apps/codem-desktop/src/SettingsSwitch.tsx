import './settings-switch.css';

export function SettingsSwitch({ label, descriptionId, checked, disabled = false, onChange }: {
  label: string; descriptionId?: string; checked: boolean; disabled?: boolean; onChange: () => void;
}) {
  return <button type="button" role="switch" className="settings-switch" aria-label={label} aria-describedby={descriptionId} aria-checked={checked}
    disabled={disabled} onClick={onChange}><span /></button>;
}
