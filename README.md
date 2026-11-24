# Hogar Alerta

Panel Astro y API Node.js con acceso por cuenta y datos compartidos en MySQL. Los escenarios iniciales contienen lecturas de demostración. Los archivos Arduino están pendientes de implementación.

## Preparar MySQL

Requiere Node.js 22 o superior y MySQL 8.0.16 o superior. Crea una base de datos vacía con el juego de caracteres UTF-8. Desde una cuenta con permisos de administración en MySQL:

```sql
CREATE DATABASE hogar_alerta CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

Instala dependencias y prepara la configuración local. En Windows, usa `npm.cmd` si PowerShell bloquea `npm.ps1`.

```powershell
npm.cmd ci --prefix backend
npm.cmd ci --prefix frontend
Copy-Item backend/.env.example backend/.env
```

En `backend/.env`, configura un usuario MySQL autorizado a conectarse y su contraseña. Para inicializar se requieren permisos de creación de tablas, referencias, consulta e inserción/actualización de los datos iniciales. Para operar con un usuario MySQL separado, la API requiere `SELECT` sobre las tablas, `INSERT` sobre `users` y `INSERT, DELETE` sobre `sessions`.

```powershell
npm.cmd --prefix backend run db:init
```

El comando aplica `schema.sql` y carga datos de ejemplo mediante `seed.sql`. Se puede volver a ejecutar y conserva las filas ya existentes.

## Crear la primera cuenta y entrar

Crea la primera cuenta desde la terminal. La contraseña debe tener de 12 a 128 caracteres.

```powershell
$env:INITIAL_USER_NAME = 'Alexis'
$env:INITIAL_USER_EMAIL = 'alexis@example.com'
$env:INITIAL_USER_PASSWORD = Read-Host 'Contraseña' -MaskInput
npm.cmd --prefix backend run db:user
Remove-Item Env:INITIAL_USER_PASSWORD, Env:INITIAL_USER_NAME, Env:INITIAL_USER_EMAIL
npm.cmd run dev
```

Abre http://localhost:4321. Entra con la primera cuenta y usa **Usuarios → Crear usuario** para agregar otras. Todas las cuentas acceden a los mismos sensores e historial y pueden crear usuarios. Crear una cuenta conserva la sesión de quien la creó. Las sesiones duran 24 horas y **Cerrar sesión** invalida la sesión activa.

## Esquema de la base de datos

| Tabla | Clave principal | Datos y relaciones |
| --- | --- | --- |
| `users` | `id` | Nombre, correo único, hash scrypt de la contraseña y fecha de creación. |
| `sessions` | `token_hash` | Hash del token, caducidad y referencia a `users.id`. Un usuario puede tener varias sesiones. |
| `sensors` | `id` | Nombre, descripción, ubicación, unidad, umbrales de precaución y riesgo alto, y orden de presentación. |
| `scenarios` | `id` | Nombre y orden de los escenarios de demostración. |
| `readings` | `(scenario_id, measured_at, sensor_id)` | Valor medido y fecha en UTC. Vincula cada lectura con un escenario y un sensor. |

La API lee de MySQL las tarjetas, los umbrales, los escenarios y las últimas 24 marcas de tiempo del historial seleccionado. La vista de actividad muestra transiciones de estado calculadas a partir de esas lecturas y de los umbrales actuales. El selector de escenario cambia la vista del navegador. El panel consulta la API cada tres segundos y muestra la fecha original de la última medición almacenada.

## API y despliegue

- `GET /api/health` comprueba la conexión con MySQL.
- `POST /api/login` recibe correo y contraseña y establece una cookie de sesión.
- `GET /api/me` devuelve la cuenta activa.
- `POST /api/logout` invalida la sesión.
- `POST /api/users` crea una cuenta con nombre, correo y contraseña. Requiere sesión.
- `GET /api/sensors?scenario=normal` devuelve el panel. Requiere sesión. Si se omite el escenario, usa el primero configurado en MySQL.

Astro reenvía `/api` al backend en desarrollo. Si cambias el puerto de la API, configura `API_PROXY_TARGET` en `frontend/.env`. Para desplegar el contenido de `frontend/dist`, configura el servidor web para enviar `/api` al backend desde el mismo origen HTTPS. Configura `APP_ORIGIN` con ese origen y `COOKIE_SECURE=true`. La API local escucha en `127.0.0.1`.

## Validación

```powershell
npm.cmd test
npm.cmd run build
```

Los umbrales y las lecturas iniciales son demostrativos. Usa un sistema certificado para la detección real de gases o incendios.
