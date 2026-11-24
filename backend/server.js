import { database } from './database.js';
import { createApp } from './src/app.js';



const port = Number(process.env.PORT || 3001);

createApp(database()).listen(port, '0.0.0.0', () => {
    console.log(`Hogar Alerta API escuchando en el puerto ${port}`);
});