export type Kind = 'purchase' | 'sale';
export type DocType = 'invoice' | 'receipt' | 'quote';
export type Role = 'owner' | 'member' | 'accountant';

export interface User { id: number; name: string; email: string; role: Role; company_id: number; created_at?: string }
export interface Company {
  id: number; name: string; address: string | null; phone: string | null; email: string | null;
  tax_id: string | null; rccm: string | null; currency: string; default_vat: number;
  accounting_plan: 'syscohada' | 'pcg'; invoice_footer: string | null;
}
export interface Line {
  id?: number; description: string; quantity: number; unit_price: number; vat_rate: number;
  total_ht?: number; total_tva?: number;
}
export interface Attachment { id: number; original_name: string; mime_type: string; size: number; created_at: string }
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';
export type CustomValue = string | number | boolean;
export interface CustomField {
  id: number; label: string; field_type: FieldType; options: string[]; applies_to: Kind | 'all';
  required: boolean; on_document: boolean; position: number;
}
export type FieldInput = Omit<CustomField, 'id' | 'position'>;
export interface Doc {
  id: number; kind: Kind; doc_type: DocType; number: string | null; date: string; due_date: string | null;
  party_name: string; party_address: string | null; party_tax_id: string | null; category: string | null;
  payment_method: string | null; status: 'paid' | 'unpaid'; notes: string | null; overdue: boolean;
  total_ht: number; total_tva: number; total_ttc: number;
  lines?: Line[]; attachments?: Attachment[]; attachment_count?: number;
  custom_values: Record<string, CustomValue>;
  custom?: { id: number; label: string; value: CustomValue; text: string; on_document: boolean }[];
}
export type DocInput = Pick<
  Doc,
  'kind' | 'doc_type' | 'number' | 'date' | 'due_date' | 'party_name' | 'party_address' | 'party_tax_id' |
  'category' | 'payment_method' | 'status' | 'notes' | 'custom_values'
> & { lines: Line[] };

export interface Totals { count: number; total_ht: number; total_tva: number; total_ttc: number; unpaid: number }
export interface Stats {
  purchases: Totals; sales: Totals; balance: number; vat_due: number;
  todo: { missing_attachments: number; overdue_count: number; overdue_amount: number };
  monthly: { month: string; purchases: number; sales: number }[];
  by_category: { category: string; total: number; count: number }[];
  top_suppliers: { name: string; total: number; count: number }[];
}
export interface Party {
  name: string; kind: Kind; address: string | null; tax_id: string | null;
  count: number; total: number; unpaid: number; last_date: string;
}
export interface AttachmentRow extends Attachment {
  document_id: number; kind: Kind; doc_type: DocType; number: string | null; date: string; party_name: string; total_ttc: number;
}
export interface ExportRow {
  id: number; format: string; date_from: string | null; date_to: string | null; kind: string | null;
  doc_count: number; created_at: string; user_name: string | null;
}
export interface DocQuery {
  kind?: string; from?: string; to?: string; q?: string; status?: string; doc_type?: string; party?: string;
  missing?: boolean; overdue?: boolean; offset?: number; limit?: number;
}

const TOKEN_KEY = 'facturo.token';
export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* stockage indisponible */ }
  },
};

const BASE = import.meta.env.VITE_API_URL || '/api';
// Version de démonstration (GitHub Pages) : l'API tourne dans le navigateur.
export const DEMO = import.meta.env.VITE_DEMO === '1';
export const appUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = DEMO
      ? await (await import('./demo/backend.js')).handle(path, init, headers)
      : await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Connexion impossible. Vérifiez votre réseau.', 0);
  }
  if (res.status === 401 && token) {
    tokenStore.set(null);
    window.location.assign(appUrl('/connexion'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Erreur ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') || '';
  return (type.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === '' || v === false) return;
    p.set(k, v === true ? '1' : String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  register: (data: { name: string; email: string; password: string; company_name: string; currency: string }) =>
    request<{ token: string; user: User }>('/auth/register', json('POST', data)),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', json('POST', { email, password })),
  me: () => request<{ user: User; company: Company }>('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/password', json('PUT', { current_password, new_password })),

  updateCompany: (data: Partial<Company>) => request<Company>('/company', json('PUT', data)),
  categories: () => request<string[]>('/company/categories'),
  parties: (kind?: Kind) => request<Party[]>(`/company/parties${qs({ kind })}`),

  users: () => request<User[]>('/users'),
  addUser: (data: { name: string; email: string; password: string; role: Role }) =>
    request<User>('/users', json('POST', data)),
  deleteUser: (id: number) => request<void>(`/users/${id}`, { method: 'DELETE' }),

  fields: () => request<CustomField[]>('/fields'),
  createField: (data: FieldInput) => request<CustomField>('/fields', json('POST', data)),
  updateField: (id: number, data: FieldInput) => request<CustomField>(`/fields/${id}`, json('PUT', data)),
  deleteField: (id: number) => request<void>(`/fields/${id}`, { method: 'DELETE' }),
  reorderFields: (ids: number[]) => request<CustomField[]>('/fields/order', json('PUT', { ids })),

  listDocuments: (params: DocQuery) =>
    request<{ items: Doc[]; total: number; sum_ttc: number }>(`/documents${qs({ ...params })}`),
  getDocument: (id: number) => request<Doc>(`/documents/${id}`),
  createDocument: (data: DocInput) => request<Doc>('/documents', json('POST', data)),
  updateDocument: (id: number, data: DocInput) => request<Doc>(`/documents/${id}`, json('PUT', data)),
  deleteDocument: (id: number) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  setStatus: (id: number, status: 'paid' | 'unpaid') => request<Doc>(`/documents/${id}/status`, json('PATCH', { status })),
  convertQuote: (id: number) => request<Doc>(`/documents/${id}/convert`, { method: 'POST' }),
  bulk: (ids: number[], action: 'paid' | 'unpaid' | 'category' | 'delete', category?: string) =>
    request<{ count: number }>('/documents/bulk', json('POST', { ids, action, category })),
  documentPdf: (id: number) => request<Blob>(`/documents/${id}/pdf`),
  // Un fichier par requête (l'hébergement limite la taille des envois), photos compressées avant envoi.
  uploadAttachments: async (id: number, files: File[]) => {
    let result: Attachment[] = [];
    for (const original of files) {
      const file = await compressImage(original);
      if (file.size > MAX_UPLOAD) {
        throw new ApiError(`« ${file.name} » est trop lourd (4 Mo maximum). Réduisez le PDF ou prenez une photo.`, 413);
      }
      const form = new FormData();
      form.append('files', file);
      result = await request<Attachment[]>(`/documents/${id}/attachments`, { method: 'POST', body: form });
    }
    return result;
  },
  attachments: () => request<AttachmentRow[]>('/documents/attachments'),
  attachment: (docId: number, attId: number) => request<Blob>(`/documents/${docId}/attachments/${attId}`),
  deleteAttachment: (docId: number, attId: number) =>
    request<void>(`/documents/${docId}/attachments/${attId}`, { method: 'DELETE' }),

  seedDemo: () => request<{ count: number }>('/demo/seed', { method: 'POST' }),
  resetDemo: () => request<void>('/demo/reset', { method: 'POST' }),

  stats: (from?: string, to?: string) => request<Stats>(`/reports/stats${qs({ from, to })}`),
  exportFormats: () => request<{ id: string; label: string }[]>('/reports/export/formats'),
  exportHistory: () => request<ExportRow[]>('/reports/export/history'),
  exportExcel: (params: { from?: string; to?: string; kind?: string; format: string }) =>
    request<Blob>(`/reports/export${qs(params)}`),
};

const MAX_UPLOAD = 4 * 1024 * 1024;

// Redimensionne les photos (2000 px max, JPEG) : plus léger à envoyer depuis un téléphone.
export async function compressImage(file: File, maxSide = 2000, quality = 0.82): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size < 600 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // format non décodable par ce navigateur : envoi tel quel
  }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) window.location.assign(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Partage natif (WhatsApp, email…) sur mobile ; sinon téléchargement.
export async function shareBlob(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  saveBlob(blob, filename);
}
