// src/controllers/mesas.controller.js

const db = require('../lib/db')

// GET /api/mesas — Lista mesas del local con estado actual
const listar = async (req, res, next) => {
  try {
    const { local_id } = req.usuario
    const { rows } = await db.query(
      `SELECT m.id, m.numero, m.capacidad, m.estado, m.qr_token,
              p.id AS pedido_id, p.total AS pedido_total, p.creado_en AS pedido_inicio
       FROM mesas m
       LEFT JOIN pedidos p ON p.mesa_id = m.id
         AND p.estado NOT IN ('entregado', 'cancelado')
       WHERE m.local_id = $1
       ORDER BY m.numero::int`,
      [local_id]
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
}

// POST /api/mesas — Crear mesa
const crear = async (req, res, next) => {
  try {
    const { local_id } = req.usuario
    const { numero, capacidad } = req.body
    if (!numero) return res.status(400).json({ error: 'numero es requerido' })
    const { rows } = await db.query(
      `INSERT INTO mesas (local_id, numero, capacidad) VALUES ($1, $2, $3) RETURNING *`,
      [local_id, numero, capacidad || 4]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
}

// PATCH /api/mesas/:id/estado — Cambiar estado de una mesa manualmente
const actualizarEstado = async (req, res, next) => {
  try {
    const { local_id } = req.usuario
    const { id } = req.params
    const { estado } = req.body
    const estadosValidos = ['libre', 'ocupada', 'reservada', 'cerrada']
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' })
    }
    const { rows } = await db.query(
      `UPDATE mesas SET estado = $1 WHERE id = $2 AND local_id = $3 RETURNING *`,
      [estado, id, local_id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Mesa no encontrada' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
}

// GET /api/mesas/qr/:token — Endpoint público para cuando el cliente escanea el QR
const obtenerPorQR = async (req, res, next) => {
  try {
    const { token } = req.params
    const { rows } = await db.query(
      `SELECT m.id, m.numero, m.capacidad, l.id AS local_id, l.nombre AS local_nombre, t.slug AS tenant_slug
       FROM mesas m
       JOIN locales l ON l.id = m.local_id
       JOIN tenants t ON t.id = l.tenant_id
       WHERE m.qr_token = $1`,
      [token]
    )
    if (!rows.length) return res.status(404).json({ error: 'Mesa no encontrada' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
}

module.exports = { listar, crear, actualizarEstado, obtenerPorQR }
