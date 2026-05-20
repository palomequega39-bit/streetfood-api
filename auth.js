// src/controllers/finanzas.controller.js

const db = require('../lib/db')

// POST /api/caja/abrir — Abrir turno de caja
const abrirCaja = async (req, res, next) => {
  try {
    const { local_id, id: usuario_id } = req.usuario
    const { apertura = 0 } = req.body

    // Verificar que no haya una caja abierta
    const { rows: abiertas } = await db.query(
      `SELECT id FROM cajas WHERE local_id = $1 AND cerrada_en IS NULL`,
      [local_id]
    )
    if (abiertas.length) {
      return res.status(409).json({ error: 'Ya hay una caja abierta en este local' })
    }

    const { rows } = await db.query(
      `INSERT INTO cajas (local_id, usuario_id, apertura) VALUES ($1, $2, $3) RETURNING *`,
      [local_id, usuario_id, apertura]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
}

// POST /api/caja/cerrar — Cerrar turno de caja
const cerrarCaja = async (req, res, next) => {
  try {
    const { local_id } = req.usuario
    const { efectivo_real, notas } = req.body

    // Obtener caja abierta
    const { rows: cajas } = await db.query(
      `SELECT id FROM cajas WHERE local_id = $1 AND cerrada_en IS NULL`,
      [local_id]
    )
    if (!cajas.length) return res.status(404).json({ error: 'No hay caja abierta' })
    const caja_id = cajas[0].id

    // Calcular cierre sumando movimientos
    const { rows: totales } = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto
                               WHEN tipo IN ('egreso','devolucion') THEN -monto
                               ELSE 0 END), 0) AS cierre
       FROM movimientos_caja WHERE caja_id = $1`,
      [caja_id]
    )
    const cierre = totales[0].cierre

    const { rows } = await db.query(
      `UPDATE cajas SET cierre = $1, efectivo_real = $2, notas = $3, cerrada_en = NOW()
       WHERE id = $4 RETURNING *`,
      [cierre, efectivo_real || null, notas || null, caja_id]
    )
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
}

// GET /api/caja/actual — Estado de la caja abierta
const cajaActual = async (req, res, next) => {
  try {
    const { local_id } = req.usuario
    const { rows: cajas } = await db.query(
      `SELECT c.*, u.nombre AS cajero
       FROM cajas c JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.local_id = $1 AND c.cerrada_en IS NULL`,
      [local_id]
    )
    if (!cajas.length) return res.json({ caja: null })

    const caja = cajas[0]

    // Resumen de movimientos
    const { rows: resumen } = await db.query(
      `SELECT tipo, COUNT(*) AS cantidad, SUM(monto) AS total
       FROM movimientos_caja WHERE caja_id = $1 GROUP BY tipo`,
      [caja.id]
    )

    res.json({ caja, resumen })
  } catch (err) {
    next(err)
  }
}

// POST /api/caja/pago — Registrar pago de un pedido
const registrarPago = async (req, res, next) => {
  try {
    const { local_id } = req.usuario
    const { pedido_id, metodo, monto, referencia } = req.body

    if (!pedido_id || !metodo || !monto) {
      return res.status(400).json({ error: 'pedido_id, metodo y monto son requeridos' })
    }

    // Verificar que el pedido pertenece al local
    const { rows: pedidos } = await db.query(
      `SELECT id FROM pedidos WHERE id = $1 AND local_id = $2`,
      [pedido_id, local_id]
    )
    if (!pedidos.length) return res.status(404).json({ error: 'Pedido no encontrado' })

    // Registrar pago
    const { rows: pagos } = await db.query(
      `INSERT INTO pagos (pedido_id, metodo, monto, estado, referencia, pagado_en)
       VALUES ($1, $2, $3, 'aprobado', $4, NOW()) RETURNING *`,
      [pedido_id, metodo, monto, referencia || null]
    )

    // Registrar movimiento en caja si hay una abierta
    const { rows: cajas } = await db.query(
      `SELECT id FROM cajas WHERE local_id = $1 AND cerrada_en IS NULL`,
      [local_id]
    )
    if (cajas.length) {
      await db.query(
        `INSERT INTO movimientos_caja (caja_id, pedido_id, tipo, monto, descripcion)
         VALUES ($1, $2, 'ingreso', $3, $4)`,
        [cajas[0].id, pedido_id, monto, `Pago ${metodo} - Pedido ${pedido_id.slice(0,8)}`]
      )
    }

    res.status(201).json(pagos[0])
  } catch (err) {
    next(err)
  }
}

// GET /api/reportes/ventas — Reporte de ventas por período
const reporteVentas = async (req, res, next) => {
  try {
    const { local_id } = req.usuario
    const { desde, hasta } = req.query

    const fechaDesde = desde || new Date(new Date().setHours(0,0,0,0)).toISOString()
    const fechaHasta = hasta || new Date().toISOString()

    const { rows } = await db.query(
      `SELECT
         COUNT(*)                                              AS total_pedidos,
         SUM(total)                                           AS facturacion_total,
         SUM(descuento_total)                                 AS descuentos_total,
         AVG(total)                                           AS ticket_promedio,
         COUNT(*) FILTER (WHERE tipo = 'salon')               AS pedidos_salon,
         COUNT(*) FILTER (WHERE tipo = 'delivery')            AS pedidos_delivery,
         COUNT(*) FILTER (WHERE tipo = 'mostrador')           AS pedidos_mostrador,
         COUNT(*) FILTER (WHERE estado = 'cancelado')         AS pedidos_cancelados
       FROM pedidos
       WHERE local_id = $1
         AND creado_en BETWEEN $2 AND $3
         AND estado != 'cancelado'`,
      [local_id, fechaDesde, fechaHasta]
    )

    // Ventas por método de pago
    const { rows: porMetodo } = await db.query(
      `SELECT pa.metodo, COUNT(*) AS cantidad, SUM(pa.monto) AS total
       FROM pagos pa
       JOIN pedidos pe ON pe.id = pa.pedido_id
       WHERE pe.local_id = $1 AND pe.creado_en BETWEEN $2 AND $3
         AND pa.estado = 'aprobado'
       GROUP BY pa.metodo ORDER BY total DESC`,
      [local_id, fechaDesde, fechaHasta]
    )

    // Top 5 productos más vendidos
    const { rows: topProductos } = await db.query(
      `SELECT pr.nombre, SUM(pi.cantidad) AS unidades, SUM(pi.cantidad * pi.precio_unit) AS total
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
       JOIN pedidos pe ON pe.id = pi.pedido_id
       WHERE pe.local_id = $1 AND pe.creado_en BETWEEN $2 AND $3
         AND pe.estado != 'cancelado'
       GROUP BY pr.nombre ORDER BY unidades DESC LIMIT 5`,
      [local_id, fechaDesde, fechaHasta]
    )

    res.json({
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      resumen: rows[0],
      por_metodo_pago: porMetodo,
      top_productos: topProductos,
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { abrirCaja, cerrarCaja, cajaActual, registrarPago, reporteVentas }
