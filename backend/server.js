import { database } from './database.js';
import { createApp } from './src/app.js';

const port = Number(process.env.PORT || 3001);
createApp(database()).listen(port, '127.0.0.1', () => console.log('Hogar Alerta API: http://localhost:' + port));
