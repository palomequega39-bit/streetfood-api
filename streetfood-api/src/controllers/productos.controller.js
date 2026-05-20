// src/controllers/productos.controller.js

const db = require('../lib/db')

// GET /api/productos — Lista productos del tenant con categoría
const listar = async (req, res, next) => {
  try {
    const { tenant_id } = req.usuario
    const { categoria_id, disponible, buscar } = req.query

    let query = `
      SELECT p.id, p.nombre, p.descripcion, p.precio, p.disponible, p.imagen_url,
             c.id AS categoria_id, c.nombre AS categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.tenant_id = $1
    `
    const params = [tenant_id]
    let i = 2

    if (categoria_id) { query += ` AND p.categoria_id = $${i++}`; params.push(categoria_id) }
    if (disponible !== undefined) { query += ` AND p.disponible = $${i++}`; params.push(disponible === 'true') }
    if (buscar) { query += ` AND p.nombre ILIKE $${i++}`; params.push(`%${buscar}%`) }

    query += ` ORDER BY c.orden, p.nombre`

    const { rows } = await db.query(query, params)
    res.json(rows)
  } catch (err) {
    next(err)
  }
}

// GET /api/productos/:id — Detalle completo con modificadores e ingredientes
const obtener = async (req, res, next) => {
  try {
    const { tenant_id } = req.usuario
    const { id } = req.params

    const { rows: productos } = await db.query(
      `SELECT p.*, c.nombre AS categoria_nombre
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, tenant_id]
    )
    if (!productos.length) return res.status(404).json({ error: 'Producto no encontrado' })

    // Variantes
    const { rows: variantes } = await db.query(
      `SELECT * FROM variantes WHERE producto_id = $1 ORDER BY nombre`,
      [id]
    )

    // Grupos de modificadores con sus opciones
    const { rows: grupos } = await db.query(
      `SELECT gm.*, 
        json_agg(
          json_build_object(
            'id', om.id,
            'nombre', om.nombre,
            'precio_extra', om.precio_extra,
            'disponible', om.disponible,
            'orden', om.orden
          ) ORDER BY om.orden
        ) AS opciones
       FROM grupos_modificadores gm
       LEFT JOIN opciones_modificador om ON om.grupo_id = gm.id
       WHERE gm.producto_id = $1
       GROUP BY gm.id
       ORDER BY gm.orden`,
      [id]
    )

    // Ingredientes removibles
    const { rows: ingredientes } = await db.query(
      `SELECT * FROM ingredientes WHERE producto_id = $1 ORDER BY nombre`,
      [id]
    )

    res.json({
      ...productos[0],
      variantes,
      grupos_modificadores: grupos,
      ingredientes,
    })
  } catch (err) {
    next(err)
  }
}

// POST /api/productos — Crear producto
const crear = async (req, res, next) => {
  try {
    const { tenant_id } = req.usuario
    const { nombre, descripcion, precio, categoria_id, imagen_url } = req.body

    if (!nombre || precio === undefined) {
      return res.status(400).json({ error: 'nombre y precio son requeridos' })
    }

    const { rows } = await db.query(
      `INSERT INTO productos (tenant_id, categoria_id, nombre, descripcion, precio, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenant_id, categoria_id || null, nombre, descripcion || null, precio, imagen_url || null]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
}

// PATCH /api/productos/:id — Actualizar producto
const actualizar = async (req, res, next) => {
  try {
    const { tenant_id } = req.usuario
    const { id } = req.params
    const campos = req.body
    const permitidos = ['nombre', 'descripcion', 'precio', 'disponible', 'categoria_id', 'imagen_url']

    const sets = []
    const params = []
    let i = 1

    for (const campo of permitidos) {
      if (campos[campo] !== undefined) {
        sets.push(`${campo} = $${i++}`)
        params.push(campos[campo])
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' })

    params.push(id, tenant_id)
    const { rows } = await db.query(
      `UPDATE productos SET ${sets.join(', ')}
       WHERE id = $${i++} AND tenant_id = $${i} RETURNING *`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
}

// DELETE /api/productos/:id — Eliminar producto
const eliminar = async (req, res, next) => {
  try {
    const { tenant_id } = req.usuario
    const { id } = req.params
    const { rows } = await db.query(
      `DELETE FROM productos WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenant_id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json({ message: 'Producto eliminado' })
  } catch (err) {
    next(err)
  }
}

module.exports = { listar, obtener, crear, actualizar, eliminar }
