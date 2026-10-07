import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { memberSchema, parse } from '../validation.js';

// Équipe : le propriétaire peut ajouter un collaborateur (saisie) ou son comptable (lecture seule).
export function userRoutes(db) {
  const r = Router();
  const ownerOnly = (req, res, next) =>
    req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Réservé au propriétaire' });

  r.get('/', async (req, res) => {
    res.json(
      await db.query('SELECT id, name, email, role, created_at FROM users WHERE company_id = $1 ORDER BY id', [
        req.user.company_id,
      ]),
    );
  });

  r.post('/', ownerOnly, async (req, res) => {
    const input = parse(memberSchema, req.body);
    if (await db.one('SELECT 1 FROM users WHERE email = $1', [input.email])) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }
    const user = await db.one(
      `INSERT INTO users (company_id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, created_at`,
      [req.user.company_id, input.email, input.name, await bcrypt.hash(input.password, 10), input.role],
    );
    res.status(201).json(user);
  });

  r.delete('/:id', ownerOnly, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    const { count } = await db.run("DELETE FROM users WHERE id = $1 AND company_id = $2 AND role != 'owner'", [
      id, req.user.company_id,
    ]);
    if (!count) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.status(204).end();
  });

  return r;
}
