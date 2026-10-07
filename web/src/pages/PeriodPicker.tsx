import { PRESETS, type Period } from '../period';

export default function PeriodPicker({ value, onChange, withDates = true }: {
  value: Period; onChange: (p: Period) => void; withDates?: boolean;
}) {
  return (
    <div className="row">
      <div className="chips" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
        {PRESETS.map((p) => {
          const v = p.get();
          const active = v.from === value.from && v.to === value.to;
          return (
            <button key={p.label} type="button" className={`chip ${active ? 'on' : ''}`} onClick={() => onChange(v)}>{p.label}</button>
          );
        })}
      </div>
      {withDates && (
        <div className="row hide-mobile" style={{ gap: 6 }}>
          <input className="input" type="date" aria-label="Du" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} style={{ width: 160, height: 32 }} />
          <span className="muted small">→</span>
          <input className="input" type="date" aria-label="Au" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} style={{ width: 160, height: 32 }} />
        </div>
      )}
    </div>
  );
}
