// Point d'entrée Vercel : toute requête /api/* est servie par l'application Express.
import { config } from '../server/src/config.js';
import { createDb } from '../server/src/db.js';
import { createStorage } from '../server/src/storage.js';
import { createApp } from '../server/src/app.js';

const db = createDb({ url: config.databaseUrl });
const app = createApp(db, createStorage(config));

export default app;
