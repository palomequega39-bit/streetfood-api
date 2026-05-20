// src/routes/index.js
// Punto central de todas las rutas

const express = require('express')
const router = express.Router()

const { autenticar, autorizar } = require('../middlewares/auth')

const authCtrl      = require('../controllers/auth.controller')
const productosCtrl = require('../controllers/productos.controller')
const mesasCtrl     = require('../controllers/mesas.controller')
const pedidosCtrl   = require('../controllers/pedidos.controller')
const finanzasCtrl  = require('../controllers/finanzas.controller')

// ---------------------------------------------------------------
//  AUTH — públicas
// ---------------------------------------------------------------
router.post('/auth/login',            authCtrl.login)
router.post('/auth/registro-tenant',  authCtrl.registrarTenant)

// ---------------------------------------------------------------
//  CATÁLOGO PÚBLICO — sin autenticación (para el carrito online)
// ---------------------------------------------------------------
// El catálogo público usa tenant_slug como parámetro de URL
// El frontend lo llama sin token
const db = require('../lib/db')

router.get('/catalogo/:tenant_slug', async (req, res, next) => {
  try {
    const { tenant_slug } = req.params
    const { rows: tenants } = await db.query(
      `SELECT id FROM tenants WHERE slug = $1 AND estado = 'activo'`, [tenant_slug]
    )
    if (!tenants.length) return res.status(404).json({ error: 'Restaurante no encontrado' })
    const tenant_id = tenants[0].id

    // Grupos del catálogo activos y vigentes
    const { rows: grupos } = await db.query(
      `SELECT gc.id, gc.nombre, gc.descripcion, gc.tipo, gc.orden,
        json_agg(
          json_build_object(
            'id', p.id, 'nombre', p.nombre, 'descripcion', p.descripcion,
            'precio', p.precio, 'imagen_url', p.imagen_url, 'etiqueta', gcp.etiqueta
          ) ORDER BY gcp.orden
        ) AS productos
       FROM grupos_catalogo gc
       JOIN grupos_catalogo_productos gcp ON gcp.grupo_id = gc.id
       JOIN productos p ON p.id = gcp.producto_id AND p.disponible = TRUE
       WHERE gc.tenant_id = $1 AND gc.activo = TRUE
         AND (gc.vigencia_desde IS NULL OR gc.vigencia_desde <= CURRENT_DATE)
         AND (gc.vigencia_hasta IS NULL OR gc.vigencia_hasta >= CURRENT_DATE)
       GROUP BY gc.id ORDER BY gc.orden`,
      [tenant_id]
    )

    // Categorías con sus productos
    const { rows: categorias } = await db.query(
      `SELECT c.id, c.nombre, c.orden,
        json_agg(
          json_build_object(
            'id', p.id, 'nombre', p.nombre, 'descripcion', p.descripcion,
            'precio', p.precio, 'imagen_url', p.imagen_url
          ) ORDER BY p.nombre
        ) AS productos
       FROM categorias c
       JOIN productos p ON p.categoria_id = c.id AND p.disponible = TRUE
       WHERE c.tenant_id = $1 AND c.visible = TRUE
       GROUP BY c.id ORDER BY c.orden`,
      [tenant_id]
    )

    res.json({ grupos_destacados: grupos, categorias })
  } catch (err) {
    next(err)
  }
})

// QR de mesa — público
router.get('/mesas/qr/:token', mesasCtrl.obtenerPorQR)

// ---------------------------------------------------------------
//  RUTAS PROTEGIDAS — requieren token
// ---------------------------------------------------------------
router.use(autenticar)

// Productos
router.get('/productos',       productosCtrl.listar)
router.get('/productos/:id',   productosCtrl.obtener)
router.post('/productos',      autorizar('admin','gerente'), productosCtrl.crear)
router.patch('/productos/:id', autorizar('admin','gerente'), productosCtrl.actualizar)
router.delete('/productos/:id',autorizar('admin'),           productosCtrl.eliminar)

// Mesas
router.get('/mesas',                    mesasCtrl.listar)
router.post('/mesas',                   autorizar('admin','gerente'), mesasCtrl.crear)
router.patch('/mesas/:id/estado',       autorizar('admin','gerente','mozo'), mesasCtrl.actualizarEstado)

// Pedidos
router.get('/pedidos',                  pedidosCtrl.listar)
router.get('/pedidos/:id',              pedidosCtrl.obtener)
router.post('/pedidos',                 pedidosCtrl.crear)
router.patch('/pedidos/:id/estado',     autorizar('admin','gerente','cajero','mozo','cocina'), pedidosCtrl.actualizarEstado)

// Finanzas y caja
router.get('/caja/actual',              autorizar('admin','gerente','cajero'), finanzasCtrl.cajaActual)
router.post('/caja/abrir',              autorizar('admin','gerente','cajero'), finanzasCtrl.abrirCaja)
router.post('/caja/cerrar',             autorizar('admin','gerente','cajero'), finanzasCtrl.cerrarCaja)
router.post('/caja/pago',               autorizar('admin','gerente','cajero'), finanzasCtrl.registrarPago)
router.get('/reportes/ventas',          autorizar('admin','gerente'),          finanzasCtrl.reporteVentas)

module.exports = router
