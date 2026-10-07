export type Kind = 'purchase' | 'sale';
export type DocType = 'invoice' | 'receipt';

export interface User { id: number; name: string; email: string; role: string; company_id: number }
export interface Company {
  id: number; name: string; address: string | null; phone: string | null; email: string | null;
  tax_id: string | null; currency: string; invoice_footer: string | null;
}
export interface Line {
  id?: number; description: string; quantity: number; unit_price: number; vat_rate: number;
  total_ht?: number; total_tva?: number;
}
export interface Attachment { id: number; original_name: string; mime_type: string; size: number; created_at: string }
export interface Doc {
  id: number; kind: Kind; doc_type: DocType; number: string | null; date: string; due_date: string | null;
  party_name: string; party_address: string | null; party_tax_id: string | null; category: string | null;
  payment_method: string | null; status: 'paid' | 'unpaid'; notes: string | null;
  total_ht: number; total_tva: number; total_ttc: number;
  lines?: Line[]; attachments?: Attachment[]; attachment_count?: number;
}
export type DocInput = Omit<Doc, 'id' | 'total_ht' | 'total_tva' | 'total_ttc' | 'attachments' | 'attachment_count'> & { lines: Line[] };

export interface Totals { count: number; total_ht: number; total_tva: number; total_ttc: number; unpaid: number }
export interface Stats {
  purchases: Totals; sales: Totals; balance: number; vat_due: number;
  monthly: { month: string; purchases: number; sales: number }[];
  by_category: { category: string; total: number; count: number }[];
  top_suppliers: { name: string; total: number; count: number }[];
}

const TOKEN_KEY = 'facturo.token';
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)),
};

const BASE = import.meta.env.VITE_API_URL || '/api';

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
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401 && token) {
    tokenStore.set(null);
    window.location.assign('/connexion');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Erreur ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') || '';
  return (type.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  register: (data: { name: string; email: string; password: string; company_name: string; currency: string }) =>
    request<{ token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: User; company: Company }>('/auth/me'),

  updateCompany: (data: Partial<Company>) => request<Company>('/company', { method: 'PUT', body: JSON.stringify(data) }),
  categories: () => request<string[]>('/company/categories'),

  listDocuments: (params: { kind?: string; from?: string; to?: string; q?: string; status?: string; offset?: number }) =>
    request<{ items: Doc[]; total: number }>(`/documents${qs(params)}`),
  getDocument: (id: number) => request<Doc>(`/documents/${id}`),
  createDocument: (data: DocInput) => request<Doc>('/documents', { method: 'POST', body: JSON.stringify(data) }),
  updateDocument: (id: number, data: DocInput) =>
    request<Doc>(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDocument: (id: number) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  documentPdf: (id: number) => request<Blob>(`/documents/${id}/pdf`),
  uploadAttachments: (id: number, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return request<Attachment[]>(`/documents/${id}/attachments`, { method: 'POST', body: form });
  },
  attachment: (docId: number, attId: number) => request<Blob>(`/documents/${docId}/attachments/${attId}`),
  deleteAttachment: (docId: number, attId: number) =>
    request<void>(`/documents/${docId}/attachments/${attId}`, { method: 'DELETE' }),

  stats: (from?: string, to?: string) => request<Stats>(`/reports/stats${qs({ from, to })}`),
  exportFormats: () => request<{ id: string; label: string }[]>('/reports/export/formats'),
  exportExcel: (params: { from?: string; to?: string; kind?: string; format: string }) =>
    request<Blob>(`/reports/export${qs(params)}`),
};

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
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
