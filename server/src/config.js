import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onVercel = Boolean(process.env.VERCEL);

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Postgres (Neon via Vercel) ; sans URL, base PGlite locale dans data/pglite.
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || '',
  pgliteDir: process.env.PGLITE_DIR || path.join(root, 'data', 'pglite'),
  uploadDir: process.env.UPLOAD_DIR || path.join(root, 'data', 'uploads'),
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || '',
  // Vercel limite le corps des requêtes à 4,5 Mo : les photos sont compressées côté navigateur.
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || (onVercel ? 4 : 10)) * 1024 * 1024,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  webDist: process.env.WEB_DIST || path.join(root, '..', 'web', 'dist'),
  onVercel,
};

if ((process.env.NODE_ENV === 'production' || onVercel) && config.jwtSecret === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET doit être défini en production');
}
if (onVercel && !config.databaseUrl) {
  throw new Error('DATABASE_URL manquant : ajoutez une base Postgres (Neon) au projet Vercel');
}
if (onVercel && !config.blobToken) {
  throw new Error('BLOB_READ_WRITE_TOKEN manquant : ajoutez un stockage Vercel Blob au projet');
}
