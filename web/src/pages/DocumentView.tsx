import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, openBlob, saveBlob, type Doc } from '../api';
import { useAuth } from '../auth';
import { KIND_LABEL, TYPE_LABEL, frDate, money } from '../format';

export default function DocumentView() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { company, user } = useAuth();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState('');
  const cur = company?.currency || 'EUR';
  const canWrite = user?.role !== 'accountant';

  const load = useCallback(() => api.getDocument(id).then(setDoc, (e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="error">{error}</p>;
  if (!doc) return <p className="muted">Chargement…</p>;

  const pdfName = `${doc.number || `document-${doc.id}`}.pdf`;

  async function remove() {
    if (!confirm('Supprimer définitivement cette pièce et ses justificatifs ?')) return;
    await api.deleteDocument(id);
    navigate(doc!.kind === 'purchase' ? '/achats' : '/ventes');
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      await api.uploadAttachments(id, Array.from(files));
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <p className="muted small">{KIND_LABEL[doc.kind]} · {TYPE_LABEL[doc.doc_type]}</p>
          <h1>{doc.number || 'Sans numéro'} — {doc.party_name}</h1>
        </div>
        <div className="actions">
          <button onClick={async () => openBlob(await api.documentPdf(id))}>Imprimer</button>
          <button onClick={async () => saveBlob(await api.documentPdf(id), pdfName)}>Télécharger PDF</button>
          {canWrite && <Link className="button" to={`/documents/${id}/modifier`}>Modifier</Link>}
          {canWrite && <button className="danger" onClick={remove}>Supprimer</button>}
        </div>
      </header>

      <div className="grid-2">
        <div className="card">
          <dl className="meta">
            <dt>Date</dt><dd>{frDate(doc.date)}</dd>
            {doc.due_date && <><dt>Échéance</dt><dd>{frDate(doc.due_date)}</dd></>}
            <dt>{doc.kind === 'purchase' ? 'Fournisseur' : 'Client'}</dt><dd>{doc.party_name}{doc.party_address && <><br /><span className="muted">{doc.party_address}</span></>}</dd>
            {doc.category && <><dt>Catégorie</dt><dd>{doc.category}</dd></>}
            {doc.payment_method && <><dt>Paiement</dt><dd>{doc.payment_method}</dd></>}
            <dt>Statut</dt><dd><span className={`badge ${doc.status}`}>{doc.status === 'paid' ? 'Payé' : 'Non payé'}</span></dd>
            {doc.notes && <><dt>Notes</dt><dd>{doc.notes}</dd></>}
          </dl>
        </div>
        <div className="card">
          <h2>Justificatifs</h2>
          {doc.attachments?.length ? (
            <ul className="files">
              {doc.attachments.map((a) => (
                <li key={a.id}>
                  <button className="link" onClick={async () => openBlob(await api.attachment(id, a.id))}>
                    {a.mime_type === 'application/pdf' ? '📄' : '🖼️'} {a.original_name}
                  </button>
                  <span className="muted small">{Math.ceil(a.size / 1024)} Ko</span>
                  {canWrite && (
                    <button className="icon" title="Retirer" onClick={async () => {
                      if (confirm('Retirer ce justificatif ?')) { await api.deleteAttachment(id, a.id); load(); }
                    }}>✕</button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="muted">Aucun justificatif.</p>}
          {canWrite && (
            <label className="button">
              + Ajouter un fichier
              <input type="file" hidden multiple accept="application/pdf,image/*" onChange={(e) => addFiles(e.target.files)} />
            </label>
          )}
        </div>
      </div>

      <div className="card flush">
        <table className="table">
          <thead><tr><th>Désignation</th><th className="num">Qté</th><th className="num">P.U. HT</th><th className="num">TVA</th><th className="num">Total HT</th></tr></thead>
          <tbody>
            {doc.lines?.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td><td className="num">{l.quantity}</td><td className="num">{money(l.unit_price, cur)}</td>
                <td className="num">{l.vat_rate} %</td><td className="num">{money(l.total_ht || 0, cur)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4}>Total HT</td><td className="num">{money(doc.total_ht, cur)}</td></tr>
            <tr><td colSpan={4}>TVA</td><td className="num">{money(doc.total_tva, cur)}</td></tr>
            <tr className="strong"><td colSpan={4}>Total TTC</td><td className="num">{money(doc.total_ttc, cur)}</td></tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
