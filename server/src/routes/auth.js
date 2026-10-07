import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, signToken } from '../auth.js';
import { loginSchema, passwordSchema, registerSchema, parse } from '../validation.js';

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, company_id: u.company_id });

export function authRoutes(db) {
  const r = Router();

  // Inscription : crée l'entreprise et son propriétaire.
  r.post('/register', (req, res) => {
    const input = parse(registerSchema, req.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(input.email)) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }
    const hash = bcrypt.hashSync(input.password, 10);
    const user = db.transaction(() => {
      const company = db
        .prepare('INSERT INTO companies (name, currency, default_vat, accounting_plan, email) VALUES (?, ?, ?, ?, ?)')
        .run(
          input.company_name,
          input.currency || 'XOF',
          input.currency === 'EUR' ? 20 : 18,
          input.currency === 'EUR' ? 'pcg' : 'syscohada',
          input.email,
        );
      const { lastInsertRowid } = db
        .prepare("INSERT INTO users (company_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'owner')")
        .run(company.lastInsertRowid, input.email, input.name, hash);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
    })();
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  });

  r.post('/login', (req, res) => {
    const input = parse(loginSchema, req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(input.email);
    if (!user || !bcrypt.compareSync(input.password, user.password_hash)) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  r.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(user.company_id);
    res.json({ user: publicUser(user), company });
  });

  r.put('/password', requireAuth, (req, res) => {
    const input = parse(passwordSchema, req.body);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || !bcrypt.compareSync(input.current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(input.new_password, 10), user.id);
    res.status(204).end();
  });

  return r;
}
