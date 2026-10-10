import { Router } from 'express';
import { fieldOrderSchema, fieldSchema, parse } from '../validation.js';
import { createField, deleteField, listFields, reorderFields, updateField } from '../services/fields.js';

// Variables personnalisées : tout le monde les lit, seul le propriétaire les gère.
export function fieldRoutes(db) {
  const r = Router();
  const ownerOnly = (req, res, next) =>
    req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Réservé au propriétaire' });
  const notFound = (res) => res.status(404).json({ error: 'Variable introuvable' });

  r.param('id', (req, res, next, value) => (/^\d+$/.test(value) ? next() : notFound(res)));

  r.get('/', async (req, res) => {
    res.json(await listFields(db, req.user.company_id));
  });

  r.post('/', ownerOnly, async (req, res) => {
    res.status(201).json(await createField(db, req.user.company_id, parse(fieldSchema, req.body)));
  });

  r.put('/order', ownerOnly, async (req, res) => {
    res.json(await reorderFields(db, req.user.company_id, parse(fieldOrderSchema, req.body).ids));
  });

  r.put('/:id', ownerOnly, async (req, res) => {
    const field = await updateField(db, req.user.company_id, Number(req.params.id), parse(fieldSchema, req.body));
    return field ? res.json(field) : notFound(res);
  });

  r.delete('/:id', ownerOnly, async (req, res) => {
    if (!(await deleteField(db, req.user.company_id, Number(req.params.id)))) return notFound(res);
    res.status(204).end();
  });

  return r;
}
