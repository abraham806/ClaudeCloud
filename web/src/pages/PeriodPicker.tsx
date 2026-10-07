import { PRESETS, type Period } from '../period';

export default function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="period">
      <div className="chips">
        {PRESETS.map((p) => {
          const v = p.get();
          const active = v.from === value.from && v.to === value.to;
          return (
            <button key={p.label} type="button" className={active ? 'chip active' : 'chip'} onClick={() => onChange(v)}>
              {p.label}
            </button>
          );
        })}
      </div>
      <label className="inline">Du <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></label>
      <label className="inline">au <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></label>
    </div>
  );
}
