import { useEffect, useState } from 'react';
import { api, type Company, type CustomField, type Doc, type DocInput } from './api';
import { fieldText } from './fields';
import { TYPE_LABEL, frDate, money } from './format';
import { Icon } from './icons';

export function StatusPill({ doc }: { doc: Pick<Doc, 'status' | 'doc_type' | 'overdue'> }) {
  if (doc.doc_type === 'quote') return <span className="pill quote">Devis</span>;
  if (doc.overdue) return <span className="pill late">En retard</span>;
  return doc.status === 'paid' ? <span className="pill paid">Payé</span> : <span className="pill unpaid">Non payé</span>;
}

// Miniature d'un justificatif (image chargée avec le jeton d'accès).
export function AttachmentThumb({ docId, att, onRemove }: {
  docId: number; att: { id: number; mime_type: string; original_name: string }; onRemove?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!att.mime_type.startsWith('image/')) return;
    let objectUrl: string | null = null;
    api.attachment(docId, att.id).then((b) => {
      objectUrl = URL.createObjectURL(b);
      setUrl(objectUrl);
    }, () => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [docId, att.id, att.mime_type]);

  async function open() {
    const blob = await api.attachment(docId, att.id);
    const u = URL.createObjectURL(blob);
    window.open(u, '_blank');
  }

  return (
    <div className="thumb" title={att.original_name}>
      {url ? <img src={url} alt={att.original_name} /> : <span><Icon name="file" size={22} /><br />PDF</span>}
      <button type="button" aria-label={`Ouvrir ${att.original_name}`} onClick={open}
        style={{ inset: 0, width: '100%', height: '100%', background: 'transparent', borderRadius: 0, top: 0, right: 0 }} />
      {onRemove && <button type="button" aria-label="Retirer" onClick={onRemove}>×</button>}
    </div>
  );
}

// Aperçu en direct de la facture (format A4), utilisé pendant la saisie.
export function InvoicePreview({ doc, company, totals, fields = [] }: {
  doc: DocInput; company: Company | null; totals: { ht: number; tva: number }; fields?: CustomField[];
}) {
  const custom = fields
    .filter((f) => f.on_document)
    .map((f) => ({ f, text: fieldText(f, doc.custom_values?.[String(f.id)]) }))
    .filter((c) => c.text);
  const cur = company?.currency || 'XOF';
  const sale = doc.kind === 'sale';
  const title = { invoice: sale ? 'FACTURE' : "FACTURE D'ACHAT", receipt: sale ? 'REÇU' : "REÇU D'ACHAT", quote: 'DEVIS' }[doc.doc_type];
  const issuer = sale ? company?.name : doc.party_name || '[FOURNISSEUR]';
  const recipient = sale ? doc.party_name || '[CLIENT]' : company?.name;
  const taxLabel = company?.accounting_plan === 'pcg' ? 'N° TVA' : 'NINEA';
  return (
    <div className="paper">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="stack-sm" style={{ gap: 3 }}>
          <strong style={{ fontSize: 18 }}>{issuer}</strong>
          {sale && company?.address && <span style={{ color: '#52525b' }}>{company.address}</span>}
          {sale && company?.tax_id && <span style={{ color: '#52525b' }}>{taxLabel} : {company.tax_id}</span>}
          {sale && company?.rccm && <span style={{ color: '#52525b' }}>RCCM : {company.rccm}</span>}
        </div>
        <div className="stack-sm right" style={{ gap: 3 }}>
          <strong style={{ fontSize: 20, letterSpacing: '0.04em' }}>{title}</strong>
          <span className="num">{doc.number || (sale ? 'N° automatique' : '')}</span>
          <span className="num" style={{ color: '#52525b' }}>{frDate(doc.date)}</span>
          {doc.due_date && <span className="num" style={{ color: '#52525b' }}>Échéance {frDate(doc.due_date)}</span>}
        </div>
      </div>
      <div style={{ alignSelf: 'flex-end', border: '1px solid #e4e4e7', borderRadius: 6, padding: '10px 14px', minWidth: 200 }} className="stack-sm">
        <span style={{ fontSize: 10, color: '#71717a', letterSpacing: '0.08em' }}>{sale ? 'CLIENT' : 'ACHETEUR'}</span>
        <strong>{recipient}</strong>
        {sale && doc.party_address && <span style={{ color: '#52525b' }}>{doc.party_address}</span>}
      </div>
      <table>
        <thead><tr><th>Désignation</th><th className="r">Qté</th><th className="r">P.U. HT</th><th className="r">TVA</th><th className="r">Total HT</th></tr></thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description || '—'}</td>
              <td className="r num">{l.quantity}</td>
              <td className="r num">{money(l.unit_price, cur)}</td>
              <td className="r num">{l.vat_rate} %</td>
              <td className="r num">{money(Math.round(l.quantity * l.unit_price * 100) / 100, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ alignSelf: 'flex-end', minWidth: 220 }} className="stack-sm">
        <div className="between"><span>Total HT</span><span className="num">{money(totals.ht / 100, cur)}</span></div>
        <div className="between"><span>TVA</span><span className="num">{money(totals.tva / 100, cur)}</span></div>
        <div className="between" style={{ fontSize: 15, fontWeight: 700, borderTop: '1px solid #09090b', paddingTop: 6 }}>
          <span>Total TTC</span><span className="num">{money((totals.ht + totals.tva) / 100, cur)}</span>
        </div>
      </div>
      {custom.length > 0 && (
        <div className="stack-sm" style={{ gap: 3 }}>
          {custom.map(({ f, text }) => <span key={f.id}><strong>{f.label} :</strong> {text}</span>)}
        </div>
      )}
      {(doc.payment_method || doc.notes) && (
        <span style={{ color: '#52525b', whiteSpace: 'pre-line' }}>
          {doc.payment_method && `Paiement : ${doc.payment_method}. `}{doc.notes}
        </span>
      )}
      {company?.invoice_footer && sale && (
        <span style={{ marginTop: 'auto', textAlign: 'center', fontSize: 10, color: '#a1a1aa' }}>{company.invoice_footer}</span>
      )}
      <span className="xs" style={{ color: '#a1a1aa', marginTop: company?.invoice_footer && sale ? 0 : 'auto' }}>{TYPE_LABEL[doc.doc_type]}</span>
    </div>
  );
}

// Choix de fichiers : photo directe (appareil photo sur mobile) ou fichier existant.
export function FilePickers({ onFiles, compact }: { onFiles: (files: File[]) => void; compact?: boolean }) {
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };
  return (
    <div className="row">
      <label className={`btn ${compact ? 'sm' : ''}`}>
        <Icon name="camera" />Prendre une photo
        <input type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      </label>
      <label className={`btn ${compact ? 'sm' : ''}`}>
        <Icon name="upload" />Choisir un fichier
        <input type="file" accept="application/pdf,image/*" multiple hidden onChange={pick} />
      </label>
    </div>
  );
}
