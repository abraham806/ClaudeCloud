import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, saveBlob, shareBlob, type ExportRow } from '../api';
import { useAuth } from '../auth';
import { frDate, money } from '../format';
import { Icon } from '../icons';
import { PRESETS, type Period } from '../period';
import PeriodPicker from './PeriodPicker';

const FORMAT_HELP: Record<string, string> = {
  standard: 'Une ligne par pièce, le détail des lignes et une synthèse. Lisible par tous.',
  ecritures: 'Journal ACH / VTE en débit / crédit, prêt à importer dans un logiciel comptable.',
};

export default function ExportPage() {
  const { company } = useAuth();
  const cur = company?.currency || 'XOF';
  const [period, setPeriod] = useState<Period>(PRESETS[1].get());
  const [formats, setFormats] = useState<{ id: string; label: string }[]>([]);
  const [format, setFormat] = useState('standard');
  const [kind, setKind] = useState('');
  const [check, setCheck] = useState<{ purchases: number; sales: number; missing: number; total: number } | null>(null);
  const [history, setHistory] = useState<ExportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.exportFormats().then(setFormats, () => {});
    api.exportHistory().then(setHistory, () => {});
  }, []);

  useEffect(() => {
    const p = { from: period.from, to: period.to, limit: 1 };
    Promise.all([
      api.listDocuments({ ...p, kind: 'purchase' }),
      api.listDocuments({ ...p, kind: 'sale' }),
      api.listDocuments({ ...p, kind: 'purchase', missing: true }),
      api.stats(period.from, period.to),
    ]).then(([pu, sa, mi, st]) => setCheck({
      purchases: st.purchases.count, sales: st.sales.count, missing: mi.total,
      total: pu.total + sa.total,
    }), () => setCheck(null));
  }, [period]);

  const filename = `export-${format}-${period.from || 'debut'}_${period.to || 'fin'}.xlsx`;

  async function run(share: boolean) {
    setBusy(true);
    setError('');
    try {
      const blob = await api.exportExcel({ ...period, kind, format });
      if (share) await shareBlob(blob, filename, `Export comptable ${company?.name || ''}`);
      else saveBlob(blob, filename);
      api.exportHistory().then(setHistory, () => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const periodLabel = period.from || period.to ? `du ${frDate(period.from) || '…'} au ${frDate(period.to) || '…'}` : 'toutes les dates';

  return (
    <>
      <header className="page-head">
        <div><p className="sub">Pour votre comptable</p><h1>Export comptable</h1></div>
      </header>

      <div className="grid-3">
        <div className="stack span-2">
          <section className="card stack">
            <div className="row" style={{ gap: 12 }}><span className="step">1</span><h2>Période</h2></div>
            <PeriodPicker value={period} onChange={setPeriod} />
            <label className="field" style={{ maxWidth: 320 }}>Pièces
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Achats et ventes</option>
                <option value="purchase">Achats uniquement</option>
                <option value="sale">Ventes uniquement</option>
              </select>
            </label>
          </section>

          <section className="card stack">
            <div className="row" style={{ gap: 12 }}><span className="step">2</span><h2>Format du fichier</h2></div>
            <div className="opt-grid">
              {formats.map((f) => (
                <label key={f.id} className={`opt ${format === f.id ? 'on' : ''}`}>
                  <input type="radio" name="format" checked={format === f.id} onChange={() => setFormat(f.id)} />
                  <span className="stack-sm" style={{ gap: 4 }}><strong>{f.label}</strong><span className="small muted">{FORMAT_HELP[f.id] || ''}</span></span>
                </label>
              ))}
              <div className="opt" style={{ borderStyle: 'dashed', cursor: 'default' }}>
                <span className="stack-sm" style={{ gap: 4 }}><strong>Format de votre logiciel</strong><span className="small muted">Le format exact de votre logiciel comptable sera ajouté dès réception de sa description.</span></span>
              </div>
            </div>
            <p className="xs muted">Plan comptable : {company?.accounting_plan === 'pcg' ? 'PCG (France)' : 'SYSCOHADA'} — modifiable dans les paramètres. Les devis ne sont jamais exportés.</p>
          </section>

          <section className="card stack-sm" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 12 }}><span className="step">3</span><h2>Vérifications avant envoi</h2></div>
            {check ? (
              <>
                <div className="check"><Icon name="check" /><span>{check.purchases + check.sales} pièce(s) {periodLabel} ({check.purchases} achats, {check.sales} ventes)</span></div>
                <div className="check"><Icon name="check" /><span>Écritures équilibrées : total débit = total crédit</span></div>
                {check.missing > 0 ? (
                  <div className="between" style={{ padding: '10px 12px', border: '1px dashed var(--ink)', borderRadius: 8 }}>
                    <span className="check"><strong>!</strong>{check.missing} achat(s) sans justificatif</span>
                    <Link to="/app/justificatifs" className="small">Compléter →</Link>
                  </div>
                ) : <div className="check"><Icon name="check" /><span>Tous les achats ont leur justificatif</span></div>}
              </>
            ) : <p className="small muted">Calcul…</p>}
          </section>
        </div>

        <div className="stack">
          <section className="card stack-sm" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 12 }}><span className="step">4</span><h2>Envoyer</h2></div>
            <span className="small muted">Fichier</span>
            <span className="num small" style={{ wordBreak: 'break-all' }}>{filename}</span>
            {error && <p className="error">{error}</p>}
            <button className="btn dark lg block" disabled={busy} onClick={() => run(false)}><Icon name="download" />{busy ? 'Génération…' : 'Télécharger le fichier Excel'}</button>
            <button className="btn lg block" disabled={busy} onClick={() => run(true)}><Icon name="share" />Partager (WhatsApp, email…)</button>
            <span className="xs muted">Vous pouvez aussi créer un accès « comptable » en lecture seule dans les paramètres : il télécharge lui-même ses exports.</span>
          </section>
          <section className="card stack-sm" style={{ gap: 10 }}>
            <h2>Historique</h2>
            {history.length === 0 && <p className="small muted">Aucun export pour l'instant.</p>}
            {history.slice(0, 8).map((h) => (
              <div key={h.id} className="between small">
                <span>{h.date_from || h.date_to ? `${frDate(h.date_from)} → ${frDate(h.date_to)}` : 'Toutes dates'}<br /><span className="xs muted">{h.doc_count} pièces · {h.format}{h.user_name ? ` · ${h.user_name}` : ''}</span></span>
                <span className="xs muted num">{frDate(h.created_at.slice(0, 10))}</span>
              </div>
            ))}
          </section>
          <p className="xs muted">Montants en {cur} ({money(1000, cur)}).</p>
        </div>
      </div>
    </>
  );
}
