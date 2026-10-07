import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { memberSchema, parse } from '../validation.js';

// Équipe : le propriétaire peut ajouter un collaborateur (saisie) ou son comptable (lecture seule).
export function userRoutes(db) {
  const r = Router();
  const ownerOnly = (req, res, next) =>
    req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Réservé au propriétaire' });

  r.get('/', (req, res) => {
    res.json(
      db
        .prepare('SELECT id, name, email, role, created_at FROM users WHERE company_id = ? ORDER BY id')
        .all(req.user.company_id),
    );
  });

  r.post('/', ownerOnly, (req, res) => {
    const input = parse(memberSchema, req.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(input.email)) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (company_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.company_id, input.email, input.name, bcrypt.hashSync(input.password, 10), input.role);
    res
      .status(201)
      .json(db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(lastInsertRowid));
  });

  r.delete('/:id', ownerOnly, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    const { changes } = db
      .prepare("DELETE FROM users WHERE id = ? AND company_id = ? AND role != 'owner'")
      .run(id, req.user.company_id);
    if (!changes) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.status(204).end();
  });

  return r;
}
