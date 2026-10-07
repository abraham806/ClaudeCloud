import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, openBlob, saveBlob, shareBlob, type Doc, type DocInput } from '../api';
import { useAuth } from '../auth';
import { AttachmentThumb, FilePickers, StatusPill } from '../components';
import { KIND_LABEL, TYPE_LABEL, frDate, money } from '../format';
import { Icon } from '../icons';

export default function DocumentView() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { company, user } = useAuth();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cur = company?.currency || 'XOF';
  const canWrite = user?.role !== 'accountant';

  const load = useCallback(() => api.getDocument(id).then(setDoc, (e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  // Aperçu PDF intégré (écrans larges).
  useEffect(() => {
    if (!doc || window.matchMedia('(max-width: 860px)').matches) return;
    let url: string | null = null;
    api.documentPdf(doc.id).then((b) => { url = URL.createObjectURL(b); setPdfUrl(url); }, () => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc]);

  if (error && !doc) return <p className="error">{error}</p>;
  if (!doc) return <p className="muted">Chargement…</p>;

  const pdfName = `${doc.number || `piece-${doc.id}`}.pdf`;
  const sale = doc.kind === 'sale';

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const remove = () => run(async () => {
    if (!confirm('Supprimer définitivement cette pièce et ses justificatifs ?')) return;
    await api.deleteDocument(id);
    navigate(sale ? '/app/ventes' : '/app/achats', { replace: true });
  });
  const toggleStatus = () => run(async () => setDoc(await api.setStatus(id, doc.status === 'paid' ? 'unpaid' : 'paid')));
  const convert = () => run(async () => {
    const inv = await api.convertQuote(id);
    navigate(`/app/pieces/${inv.id}`);
  });
  const duplicate = () => {
    const copy: DocInput = {
      kind: doc.kind, doc_type: doc.doc_type, number: '', date: doc.date, due_date: null,
      party_name: doc.party_name, party_address: doc.party_address, party_tax_id: doc.party_tax_id,
      category: doc.category, payment_method: doc.payment_method, status: doc.status, notes: doc.notes,
      lines: (doc.lines || []).map(({ description, quantity, unit_price, vat_rate }) => ({ description, quantity, unit_price, vat_rate })),
    };
    navigate(`/app/pieces/nouvelle?kind=${doc.kind}`, { state: { copy } });
  };
  const addFiles = (files: File[]) => run(async () => {
    if (!files.length) return;
    await api.uploadAttachments(id, files);
    await load();
  });

  return (
    <>
      <header className="page-head">
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="Retour"><Icon name="arrowLeft" /></button>
          <div className="stack-sm" style={{ gap: 4 }}>
            <span className="small muted">{KIND_LABEL[doc.kind]} · {TYPE_LABEL[doc.doc_type]} · <span className="num">{doc.number || 'sans numéro'}</span></span>
            <h1>{doc.party_name}</h1>
            <div className="row"><strong className="num" style={{ fontSize: 26, fontWeight: 500 }}>{money(doc.total_ttc, cur)}</strong><StatusPill doc={doc} /></div>
          </div>
        </div>
        <div className="row hide-mobile">
          <button className="btn" onClick={() => run(async () => openBlob(await api.documentPdf(id)))}><Icon name="printer" />Imprimer</button>
          <button className="btn" onClick={() => run(async () => saveBlob(await api.documentPdf(id), pdfName))}><Icon name="download" />PDF</button>
          {canWrite && <Link className="btn" to={`/app/pieces/${id}/modifier`}><Icon name="edit" />Modifier</Link>}
          {canWrite && doc.doc_type === 'quote' && <button className="btn dark" disabled={busy} onClick={convert}>Transformer en facture</button>}
          {canWrite && doc.doc_type !== 'quote' && (
            <button className={`btn ${doc.status === 'unpaid' ? 'dark' : ''}`} disabled={busy} onClick={toggleStatus}>
              <Icon name="check" />{doc.status === 'unpaid' ? 'Marquer comme payé' : 'Marquer non payé'}
            </button>
          )}
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="show-mobile card" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, padding: 14 }}>
        {[
          { label: 'Imprimer', icon: 'printer' as const, fn: () => run(async () => openBlob(await api.documentPdf(id))) },
          { label: 'Partager', icon: 'share' as const, fn: () => run(async () => shareBlob(await api.documentPdf(id), pdfName, `${TYPE_LABEL[doc.doc_type]} ${doc.number || ''}`)) },
          { label: 'PDF', icon: 'download' as const, fn: () => run(async () => saveBlob(await api.documentPdf(id), pdfName)) },
          ...(canWrite ? [{ label: 'Modifier', icon: 'edit' as const, fn: () => navigate(`/app/pieces/${id}/modifier`) }] : []),
        ].map((a) => (
          <button key={a.label} onClick={a.fn} disabled={busy} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 0, font: '500 12px Inter, sans-serif', color: 'inherit', cursor: 'pointer' }}>
            <span style={{ width: 48, height: 48, borderRadius: 999, border: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}><Icon name={a.icon} size={20} /></span>{a.label}
          </button>
        ))}
      </div>
      {canWrite && (
        <div className="show-mobile">
          {doc.doc_type === 'quote'
            ? <button className="btn dark lg block" disabled={busy} onClick={convert}>Transformer en facture</button>
            : <button className={`btn lg block ${doc.status === 'unpaid' ? 'dark' : ''}`} disabled={busy} onClick={toggleStatus}>{doc.status === 'unpaid' ? 'Marquer comme payé' : 'Marquer non payé'}</button>}
        </div>
      )}

      <div className="grid-3">
        <div className="stack span-2">
          <div className="card flush">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Désignation</th><th className="r">Qté</th><th className="r">P.U. HT</th><th className="r">TVA</th><th className="r">Total HT</th></tr></thead>
                <tbody>
                  {doc.lines?.map((l) => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: 'normal' }}>{l.description}</td><td className="r num">{l.quantity}</td><td className="r num">{money(l.unit_price, cur)}</td>
                      <td className="r num">{l.vat_rate} %</td><td className="r num">{money(l.total_ht || 0, cur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={4} className="muted" style={{ fontWeight: 400 }}>Total HT</td><td className="r num">{money(doc.total_ht, cur)}</td></tr>
                  <tr><td colSpan={4} className="muted" style={{ fontWeight: 400 }}>TVA</td><td className="r num">{money(doc.total_tva, cur)}</td></tr>
                  <tr><td colSpan={4}>Total TTC</td><td className="r num" style={{ fontSize: 16 }}>{money(doc.total_ttc, cur)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
          {pdfUrl && (
            <div className="card flush hide-mobile" style={{ height: 720 }}>
              <iframe src={pdfUrl} title="Aperçu de la pièce" style={{ width: '100%', height: '100%', border: 0 }} />
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <dl className="kv">
              <dt>Date</dt><dd className="num">{frDate(doc.date)}</dd>
              {doc.due_date && <><dt>{doc.doc_type === 'quote' ? 'Valable jusqu’au' : 'Échéance'}</dt><dd className="num">{frDate(doc.due_date)}</dd></>}
              <dt>{sale ? 'Client' : 'Fournisseur'}</dt><dd>{doc.party_name}</dd>
              {doc.party_address && <><dt>Adresse</dt><dd>{doc.party_address}</dd></>}
              {doc.party_tax_id && <><dt>NINEA</dt><dd className="num">{doc.party_tax_id}</dd></>}
              {doc.category && <><dt>Catégorie</dt><dd>{doc.category}</dd></>}
              {doc.payment_method && <><dt>Paiement</dt><dd>{doc.payment_method}</dd></>}
              {doc.notes && <><dt>Notes</dt><dd style={{ whiteSpace: 'pre-line' }}>{doc.notes}</dd></>}
            </dl>
          </div>
          <div className="card stack-sm" style={{ gap: 12 }}>
            <div className="between"><h2>Justificatifs</h2><span className="small muted">{doc.attachments?.length || 0}</span></div>
            {doc.attachments?.length ? (
              <div className="thumbs">
                {doc.attachments.map((a) => (
                  <AttachmentThumb key={a.id} docId={id} att={a} onRemove={canWrite ? () => run(async () => {
                    if (!confirm('Retirer ce justificatif ?')) return;
                    await api.deleteAttachment(id, a.id);
                    await load();
                  }) : undefined} />
                ))}
              </div>
            ) : <p className="small muted">{doc.kind === 'purchase' ? 'Aucun justificatif : votre comptable en aura besoin.' : 'Aucune pièce jointe.'}</p>}
            {canWrite && <FilePickers compact onFiles={addFiles} />}
          </div>
          {canWrite && (
            <div className="row">
              <button className="btn grow" onClick={duplicate}><Icon name="copy" />Dupliquer</button>
              <button className="btn grow" onClick={remove} disabled={busy}><Icon name="trash" />Supprimer</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
