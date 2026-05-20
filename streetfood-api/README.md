# Streetfood API

Backend del sistema de gestión para restaurantes y bares estilo streetfood.

## Stack
- Node.js + Express
- PostgreSQL (Supabase)
- JWT para autenticación
- Deploy en Railway

## Estructura

```
src/
├── index.js                    # Punto de entrada
├── lib/
│   └── db.js                   # Conexión a PostgreSQL
├── middlewares/
│   ├── auth.js                 # JWT + roles
│   └── errores.js              # Manejo centralizado de errores
├── controllers/
│   ├── auth.controller.js      # Login y registro de tenants
│   ├── productos.controller.js # CRUD de productos y catálogo
│   ├── mesas.controller.js     # Gestión de mesas y QR
│   ├── pedidos.controller.js   # Pedidos (salón, delivery, mostrador)
│   └── finanzas.controller.js  # Caja, pagos y reportes
└── routes/
    └── index.js                # Todas las rutas de la API
```

## Variables de entorno

Copiá `.env.example` como `.env` y completá:

```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
JWT_SECRET=una_cadena_muy_larga_y_random
NODE_ENV=production
PORT=3000
```

## Endpoints principales

### Públicos (sin token)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/login | Login de usuario |
| POST | /api/auth/registro-tenant | Crear nuevo restaurante |
| GET | /api/catalogo/:tenant_slug | Catálogo público con carrito |
| GET | /api/mesas/qr/:token | Info de mesa por QR |

### Protegidos (requieren Bearer token)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/productos | Listar productos |
| POST | /api/productos | Crear producto |
| PATCH | /api/productos/:id | Actualizar producto |
| GET | /api/mesas | Listar mesas con estado |
| POST | /api/pedidos | Crear pedido |
| PATCH | /api/pedidos/:id/estado | Cambiar estado del pedido |
| POST | /api/caja/abrir | Abrir turno de caja |
| POST | /api/caja/cerrar | Cerrar turno de caja |
| POST | /api/caja/pago | Registrar pago |
| GET | /api/reportes/ventas | Reporte de ventas |

## Roles
- `superadmin` — acceso total al sistema
- `admin` — gestión completa del restaurante
- `gerente` — operación y reportes
- `cajero` — caja y pagos
- `mozo` — pedidos y mesas
- `cocina` — ver y actualizar estado de ítems
- `repartidor` — ver y actualizar envíos
