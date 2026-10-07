import { config } from './config.js';
import { openDatabase } from './db.js';
import { createApp } from './app.js';

const db = openDatabase(config.dbFile);
createApp(db).listen(config.port, () => {
  console.log(`Facturo API sur http://localhost:${config.port}`);
});
