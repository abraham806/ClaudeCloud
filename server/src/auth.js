import jwt from 'jsonwebtoken';
import { config } from './config.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, company_id: user.company_id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, company_id: payload.company_id, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
  }
}

// Le rôle "accountant" (comptable) est en lecture seule : il consulte et exporte.
export function requireWriter(req, res, next) {
  if (req.user.role === 'accountant') {
    return res.status(403).json({ error: 'Accès en lecture seule' });
  }
  next();
}
