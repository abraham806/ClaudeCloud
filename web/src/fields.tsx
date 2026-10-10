import { useEffect, useState } from 'react';
import { api, type CustomField, type CustomValue, type Kind } from './api';

export const FIELD_TYPE_LABEL: Record<CustomField['field_type'], string> = {
  text: 'Texte', number: 'Nombre', date: 'Date', select: 'Liste de choix', checkbox: 'Oui / Non',
};
export const APPLIES_LABEL: Record<CustomField['applies_to'], string> = {
  all: 'Ventes et achats', sale: 'Ventes', purchase: 'Achats',
};

export const fieldsFor = (fields: CustomField[], kind: Kind) =>
  fields.filter((f) => f.applies_to === 'all' || f.applies_to === kind);

// Variables de l'entreprise (chargées une fois par écran).
export function useFields() {
  const [fields, setFields] = useState<CustomField[]>([]);
  useEffect(() => { api.fields().then(setFields, () => {}); }, []);
  return fields;
}

// Texte affiché d'une valeur (aperçu de la facture).
export function fieldText(f: CustomField, v: CustomValue | undefined) {
  if (v === undefined || v === null || v === '') return '';
  if (f.field_type === 'checkbox') return v ? 'Oui' : 'Non';
  if (f.field_type === 'date') return String(v).split('-').reverse().join('/');
  return String(v);
}

// Champs de saisie des variables sur une pièce.
export function CustomFieldInputs({ fields, values, onChange }: {
  fields: CustomField[]; values: Record<string, CustomValue>; onChange: (id: number, v: CustomValue | undefined) => void;
}) {
  return (
    <div className="grid-form">
      {fields.map((f) => {
        const key = String(f.id);
        const v = values[key];
        const label = <span>{f.label}{f.required && <span className="req" aria-hidden="true"> *</span>}</span>;
        if (f.field_type === 'checkbox') {
          return (
            <label key={f.id} className="check field-check">
              <input type="checkbox" checked={v === true} onChange={(e) => onChange(f.id, e.target.checked)} />{f.label}
            </label>
          );
        }
        if (f.field_type === 'select') {
          return (
            <label key={f.id} className="field">{label}
              <select required={f.required} value={v === undefined ? '' : String(v)} onChange={(e) => onChange(f.id, e.target.value || undefined)}>
                <option value="">{f.required ? 'Choisir…' : '—'}</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          );
        }
        return (
          <label key={f.id} className="field">{label}
            <input
              type={f.field_type === 'date' ? 'date' : 'text'}
              inputMode={f.field_type === 'number' ? 'decimal' : undefined}
              className={f.field_type === 'number' ? 'num' : undefined}
              required={f.required}
              value={v === undefined ? '' : String(v)}
              onChange={(e) => onChange(f.id, e.target.value === '' ? undefined : e.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
