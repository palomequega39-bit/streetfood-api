// src/controllers/pedidos.controller.js

const db = require('../lib/db')

// GET /api/pedidos — Lista pedidos del local activo
const listar = async (req, res, next) => {
  try {
    const { tenant_id, local_id } = req.usuario
    const { estado, tipo, fecha_desde, fecha_hasta, limit = 50 } = req.query

    let query = `
      SELECT p.id, p.tipo, p.canal, p.estado, p.subtotal, p.descuento_total, p.total,
             p.notas, p.creado_en,
             m.numero AS mesa_numero,
             c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
             u.nombre AS usuario_nombre
      FROM pedidos p
      LEFT JOIN mesas m ON m.id = p.mesa_id
      LEFT JOIN clientes c ON c.id = p.cliente_id
      LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.local_id = $1
    `
    const params = [local_id]
    let i = 2

    if (estado) { query += ` AND p.estado = $${i++}`; params.push(estado) }
    if (tipo)   { query += ` AND p.tipo = $${i++}`;   params.push(tipo) }
    if (fecha_desde) { query += ` AND p.creado_en >= $${i++}`; params.push(fecha_desde) }
    if (fecha_hasta) { query += ` AND p.creado_en <= $${i++}`; params.push(fecha_hasta) }

    query += ` ORDER BY p.creado_en DESC LIMIT $${i}`
    params.push(Number(limit))

    const { rows } = await db.query(query, params)
    res.json(rows)
  } catch (err) {
    next(err)
  }
}

// GET /api/pedidos/:id — Detalle completo de un pedido
const obtener = async (req, res, next) => {
  try {
    const { local_id } = req.usuario
    const { id } = req.params

    const { rows: pedidos } = await db.query(
      `SELECT p.*, m.numero AS mesa_numero,
              c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, c.direccion AS cliente_direccion
       FROM pedidos p
       LEFT JOIN mesas m ON m.id = p.mesa_id
       LEFT JOIN clientes c ON c.id = p.cliente_id
       WHERE p.id = $1 AND p.local_id = $2`,
      [id, local_id]
    )
    if (!pedidos.length) return res.status(404).json({ error: 'Pedido no encontrado' })

    // Items con modificadores y exclusiones
    const { rows: items } = await db.query(
      `SELECT pi.id, pi.cantidad, pi.precio_unit, pi.precio_promo, pi.nota, pi.estado,
              pr.nombre AS producto_nombre,
              v.nombre AS variante_nombre,
              (
                SELECT json_agg(json_build_object('nombre', om.nombre, 'precio', pim.precio_unit, 'cantidad', pim.cantidad))
                FROM pedido_item_modificadores pim
                JOIN opciones_modificador om ON om.id = pim.opcion_id
                WHERE pim.pedido_item_id = pi.id
              ) AS extras,
              (
                SELECT json_agg(ing.nombre)
                FROM pedido_item_exclusiones pie2
                JOIN ingredientes ing ON ing.id = pie2.ingrediente_id
                WHERE pie2.pedido_item_id = pi.id
              ) AS exclusiones
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
       LEFT JOIN variantes v ON v.id = pi.variante_id
       WHERE pi.pedido_id = $1
       ORDER BY pi.ctid`,
      [id]
    )

    // Pagos
    const { rows: pagos } = await db.query(
      `SELECT metodo, monto, estado, pagado_en FROM pagos WHERE pedido_id = $1`,
      [id]
    )

    // Envío si existe
    const { rows: envios } = await db.query(
      `SELECT e.*, r.nombre AS repartidor_nombre
       FROM envios e
       LEFT JOIN repartidores r ON r.id = e.repartidor_id
       WHERE e.pedido_id = $1`,
      [id]
    )

    res.json({
      ...pedidos[0],
      items,
      pagos,
      envio: envios[0] || null,
    })
  } catch (err) {
    next(err)
  }
}

// POST /api/pedidos — Crear nuevo pedido
const crear = async (req, res, next) => {
  try {
    const { local_id, tenant_id, id: usuario_id } = req.usuario
    const { tipo = 'salon', canal = 'mostrador', mesa_id, cliente_id, notas, items } = req.body

    if (!items || !items.length) {
      return res.status(400).json({ error: 'El pedido debe tener al menos un ítem' })
    }

    // Calcular totales
    let subtotal = 0
    let descuento_total = 0

    // Obtener precios actuales de los productos
    const producto_ids = items.map(i => i.producto_id)
    const { rows: productos } = await db.query(
      `SELECT id, precio FROM productos WHERE id = ANY($1) AND tenant_id = $2`,
      [producto_ids, tenant_id]
    )
    const precioMap = Object.fromEntries(productos.map(p => [p.id, p.precio]))

    for (const item of items) {
      const precio_base = precioMap[item.producto_id]
      if (!precio_base) return res.status(400).json({ error: `Producto ${item.producto_id} no encontrado` })
      const precio_unit = item.precio_promo ?? precio_base
      subtotal += precio_base * item.cantidad
      descuento_total += (precio_base - precio_unit) * item.cantidad
    }

    const total = subtotal - descuento_total

    // Insertar pedido
    const { rows: pedidos } = await db.query(
      `INSERT INTO pedidos (local_id, mesa_id, cliente_id, usuario_id, tipo, canal, subtotal, descuento_total, total, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [local_id, mesa_id || null, cliente_id || null, usuario_id, tipo, canal, subtotal, descuento_total, total, notas || null]
    )
    const pedido = pedidos[0]

    // Insertar items
    for (const item of items) {
      const precio_unit = precioMap[item.producto_id]
      const { rows: pedido_items } = await db.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, variante_id, promocion_aplicada_id, cantidad, precio_unit, precio_promo, nota)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [pedido.id, item.producto_id, item.variante_id || null, item.promocion_id || null,
         item.cantidad, precio_unit, item.precio_promo || null, item.nota || null]
      )
      const pedido_item_id = pedido_items[0].id

      // Extras (modificadores)
      if (item.extras?.length) {
        for (const extra of item.extras) {
          await db.query(
            `INSERT INTO pedido_item_modificadores (pedido_item_id, opcion_id, cantidad, precio_unit)
             VALUES ($1, $2, $3, $4)`,
            [pedido_item_id, extra.opcion_id, extra.cantidad || 1, extra.precio_unit]
          )
        }
      }

      // Exclusiones (ingredientes a quitar)
      if (item.exclusiones?.length) {
        for (const ingrediente_id of item.exclusiones) {
          await db.query(
            `INSERT INTO pedido_item_exclusiones (pedido_item_id, ingrediente_id) VALUES ($1, $2)`,
            [pedido_item_id, ingrediente_id]
          )
        }
      }
    }

    // Si es salón, marcar mesa como ocupada
    if (tipo === 'salon' && mesa_id) {
      await db.query(`UPDATE mesas SET estado = 'ocupada' WHERE id = $1`, [mesa_id])
    }

    res.status(201).json({ message: 'Pedido creado', pedido_id: pedido.id, total })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/pedidos/:id/estado — Actualizar estado del pedido
const actualizarEstado = async (req, res, next) => {
  try {
    const { local_id } = req.usuario
    const { id } = req.params
    const { estado } = req.body

    const estadosValidos = ['pendiente','confirmado','en_preparacion','listo','en_camino','entregado','cancelado']
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' })
    }

    const { rows } = await db.query(
      `UPDATE pedidos SET estado = $1, actualizado_en = NOW()
       WHERE id = $2 AND local_id = $3 RETURNING id, estado, mesa_id, tipo`,
      [estado, id, local_id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })

    const pedido = rows[0]

    // Si el pedido se entregó o canceló y es de salón, liberar la mesa
    if (['entregado', 'cancelado'].includes(estado) && pedido.tipo === 'salon' && pedido.mesa_id) {
      await db.query(`UPDATE mesas SET estado = 'libre' WHERE id = $1`, [pedido.mesa_id])
    }

    res.json({ message: 'Estado actualizado', pedido_id: id, estado })
  } catch (err) {
    next(err)
  }
}

module.exports = { listar, obtener, crear, actualizarEstado }
