import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');
const optionalText = z.string().trim().max(500).optional().nullable();

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(120),
  email: z.email('Email invalide'),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum').max(200),
  company_name: z.string().trim().min(1, "Nom de l'entreprise requis").max(200),
  currency: z.string().trim().length(3).toUpperCase().optional(),
});

export const loginSchema = z.object({
  email: z.email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const companySchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: optionalText,
  phone: optionalText,
  email: optionalText,
  tax_id: optionalText,
  rccm: optionalText,
  currency: z.string().trim().length(3).toUpperCase(),
  default_vat: z.coerce.number().min(0).max(100),
  accounting_plan: z.enum(['syscohada', 'pcg']),
  invoice_footer: optionalText,
});

export const lineSchema = z.object({
  description: z.string().trim().min(1, 'Désignation requise').max(500),
  quantity: z.coerce.number().positive('Quantité > 0'),
  unit_price: z.coerce.number().min(0, 'Prix unitaire ≥ 0'),
  vat_rate: z.coerce.number().min(0).max(100).default(0),
});

export const documentSchema = z.object({
  kind: z.enum(['purchase', 'sale']),
  doc_type: z.enum(['invoice', 'receipt', 'quote']).default('invoice'),
  number: optionalText,
  date: isoDate,
  due_date: isoDate.optional().nullable(),
  party_name: z.string().trim().min(1, 'Fournisseur / client requis').max(200),
  party_address: optionalText,
  party_tax_id: optionalText,
  category: optionalText,
  payment_method: optionalText,
  status: z.enum(['paid', 'unpaid']).default('paid'),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1, 'Au moins une ligne est requise').max(200),
}).refine((d) => !(d.kind === 'purchase' && d.doc_type === 'quote'), {
  message: 'Un devis est forcément une vente',
});

export const statusSchema = z.object({ status: z.enum(['paid', 'unpaid']) });

export const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  action: z.enum(['paid', 'unpaid', 'category', 'delete']),
  category: z.string().trim().max(500).optional(),
});

export const memberSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(120),
  email: z.email('Email invalide'),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum').max(200),
  role: z.enum(['member', 'accountant']),
});

export const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Mot de passe : 8 caractères minimum').max(200),
});

export const periodSchema = z.object({
  from: z.union([isoDate, z.literal('')]).optional().transform((v) => v || undefined),
  to: z.union([isoDate, z.literal('')]).optional().transform((v) => v || undefined),
  kind: z.enum(['purchase', 'sale']).optional(),
});

export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const err = new Error(result.error.issues.map((i) => i.message).join(' · '));
    err.status = 400;
    err.details = result.error.issues;
    throw err;
  }
  return result.data;
}
