import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { requireAuth } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { companyRoutes } from './routes/company.js';
import { documentRoutes } from './routes/documents.js';
import { reportRoutes } from './routes/reports.js';

export function createApp(db) {
  const app = express();
  app.use(cors({ origin: config.corsOrigin, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes(db));
  app.use('/api/company', requireAuth, companyRoutes(db));
  app.use('/api/documents', requireAuth, documentRoutes(db));
  app.use('/api/reports', requireAuth, reportRoutes(db));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Erreur interne du serveur' : err.message, details: err.details });
  });

  return app;
}
