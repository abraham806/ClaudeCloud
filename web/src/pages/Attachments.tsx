import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AttachmentRow, type Doc } from '../api';
import { useAuth } from '../auth';
import { AttachmentThumb, FilePickers } from '../components';
import { TYPE_LABEL, frDate, money } from '../format';

export default function Attachments() {
  const { company, user } = useAuth();
  const cur = company?.currency || 'XOF';
  const canWrite = user?.role !== 'accountant';
  const [missing, setMissing] = useState<Doc[]>([]);
  const [all, setAll] = useState<AttachmentRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.listDocuments({ kind: 'purchase', missing: true, limit: 100 }).then((r) => setMissing(r.items), (e) => setError(e.message));
    api.attachments().then(setAll, (e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function attach(doc: Doc, files: File[]) {
    if (!files.length) return;
    try {
      await api.uploadAttachments(doc.id, files);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <header className="page-head">
        <div><p className="sub">Photos de tickets, factures fournisseurs, PDF</p><h1>Justificatifs</h1></div>
        {canWrite && <Link className="btn dark" to="/app/pieces/nouvelle?kind=purchase&type=receipt&photo=1">Nouvel achat avec photo</Link>}
      </header>
      {error && <p className="error">{error}</p>}

      <section className="card flush">
        <div className="card-head">
          <h2>Achats sans justificatif</h2>
          <span className={`pill ${missing.length ? 'late' : 'paid'}`}>{missing.length ? `${missing.length} à compléter` : 'Tout est en ordre'}</span>
        </div>
        {missing.length === 0 ? (
          <p className="empty">Chaque achat a son justificatif. Votre comptable vous remercie.</p>
        ) : (
          <div style={{ padding: '0 20px 8px' }}>
            {missing.map((d) => (
              <div key={d.id} className="mitem" style={{ flexWrap: 'wrap' }}>
                <Link to={`/app/pieces/${d.id}`} className="t" style={{ textDecoration: 'none', color: 'inherit', minWidth: 180 }}>
                  <span>{d.party_name}</span>
                  <span className="xs muted">{frDate(d.date)} · {d.category || TYPE_LABEL[d.doc_type]} · <span className="num">{money(d.total_ttc, cur)}</span></span>
                </Link>
                {canWrite && <FilePickers compact onFiles={(f) => attach(d, f)} />}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stack-sm" style={{ gap: 12 }}>
        <h2>Tous les justificatifs <span className="muted small">({all.length})</span></h2>
        {all.length === 0 ? <p className="small muted">Aucun fichier pour l'instant.</p> : (
          <div className="gallery">
            {all.map((a) => (
              <div key={a.id} className="stack-sm" style={{ gap: 6 }}>
                <AttachmentThumb docId={a.document_id} att={a} />
                <Link to={`/app/pieces/${a.document_id}`} className="small" style={{ textDecoration: 'none' }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.party_name}</strong>
                  <span className="xs muted">{frDate(a.date)} · <span className="num">{money(a.total_ttc, cur)}</span></span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
