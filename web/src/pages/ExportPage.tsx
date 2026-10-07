import { useEffect, useState } from 'react';
import { api, saveBlob } from '../api';
import PeriodPicker from './PeriodPicker';
import { PRESETS, type Period } from '../period';

export default function ExportPage() {
  const [period, setPeriod] = useState<Period>(PRESETS[1].get());
  const [formats, setFormats] = useState<{ id: string; label: string }[]>([]);
  const [format, setFormat] = useState('standard');
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.exportFormats().then(setFormats); }, []);

  async function download() {
    setBusy(true);
    setError('');
    try {
      const blob = await api.exportExcel({ ...period, kind, format });
      saveBlob(blob, `export-${format}-${period.from || 'debut'}_${period.to || 'fin'}.xlsx`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head"><h1>Export comptable</h1></header>
      <div className="card narrow">
        <p className="muted">
          Générez le fichier Excel de la période à envoyer à votre comptable ou à importer dans votre logiciel de comptabilité.
        </p>
        <h3>Période</h3>
        <PeriodPicker value={period} onChange={setPeriod} />
        <div className="form-grid">
          <label>Pièces
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Achats et ventes</option>
              <option value="purchase">Achats uniquement</option>
              <option value="sale">Ventes uniquement</option>
            </select>
          </label>
          <label>Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary" onClick={download} disabled={busy}>{busy ? 'Génération…' : 'Télécharger le fichier Excel'}</button>
      </div>
    </>
  );
}
