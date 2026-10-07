import { config } from './config.js';
import { createDb } from './db.js';
import { createStorage } from './storage.js';
import { createApp } from './app.js';

const db = createDb({ url: config.databaseUrl, pgliteDir: config.pgliteDir });
const storage = createStorage(config);
await db.ready;
createApp(db, storage).listen(config.port, () => {
  console.log(`Facturo API sur http://localhost:${config.port}`);
});
