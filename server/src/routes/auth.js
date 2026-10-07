import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, signToken } from '../auth.js';
import { loginSchema, passwordSchema, registerSchema, parse } from '../validation.js';

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, company_id: u.company_id });

export function authRoutes(db) {
  const r = Router();

  // Inscription : crée l'entreprise et son propriétaire.
  r.post('/register', async (req, res) => {
    const input = parse(registerSchema, req.body);
    if (await db.one('SELECT 1 FROM users WHERE email = $1', [input.email])) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }
    const hash = await bcrypt.hash(input.password, 10);
    const currency = input.currency || 'XOF';
    const user = await db.tx(async (q) => {
      const company = await q.one(
        `INSERT INTO companies (name, currency, default_vat, accounting_plan, email) VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [input.company_name, currency, currency === 'EUR' ? 20 : 18, currency === 'EUR' ? 'pcg' : 'syscohada', input.email],
      );
      return q.one(
        `INSERT INTO users (company_id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, 'owner')
         RETURNING *`,
        [company.id, input.email, input.name, hash],
      );
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  });

  r.post('/login', async (req, res) => {
    const input = parse(loginSchema, req.body);
    const user = await db.one('SELECT * FROM users WHERE email = $1', [input.email]);
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  r.get('/me', requireAuth, async (req, res) => {
    const user = await db.one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    const company = await db.one('SELECT * FROM companies WHERE id = $1', [user.company_id]);
    res.json({ user: publicUser(user), company });
  });

  r.put('/password', requireAuth, async (req, res) => {
    const input = parse(passwordSchema, req.body);
    const user = await db.one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user || !(await bcrypt.compare(input.current_password, user.password_hash))) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    }
    await db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(input.new_password, 10), user.id]);
    res.status(204).end();
  });

  return r;
}
