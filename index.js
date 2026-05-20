// src/controllers/auth.controller.js

const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../lib/db')

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password, tenant_slug } = req.body
    if (!email || !password || !tenant_slug) {
      return res.status(400).json({ error: 'Email, password y tenant_slug son requeridos' })
    }

    // Buscar tenant por slug
    const { rows: tenants } = await db.query(
      `SELECT id FROM tenants WHERE slug = $1 AND estado = 'activo'`,
      [tenant_slug]
    )
    if (!tenants.length) {
      return res.status(404).json({ error: 'Restaurante no encontrado o inactivo' })
    }
    const tenant_id = tenants[0].id

    // Buscar usuario
    const { rows: usuarios } = await db.query(
      `SELECT id, nombre, email, rol, local_id, password_hash
       FROM usuarios
       WHERE email = $1 AND tenant_id = $2 AND activo = TRUE`,
      [email, tenant_id]
    )
    if (!usuarios.length) {
      return res.status(401).json({ error: 'Credenciales incorrectas' })
    }

    const usuario = usuarios[0]
    const passwordOk = await bcrypt.compare(password, usuario.password_hash)
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales incorrectas' })
    }

    // Generar token JWT (expira en 12 horas)
    const token = jwt.sign(
      {
        id: usuario.id,
        tenant_id,
        local_id: usuario.local_id,
        rol: usuario.rol,
        email: usuario.email,
        nombre: usuario.nombre,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        local_id: usuario.local_id,
      },
    })
  } catch (err) {
    next(err)
  }
}

// POST /api/auth/registro-tenant
// Solo para crear nuevos restaurantes en el sistema
const registrarTenant = async (req, res, next) => {
  try {
    const { tenant_nombre, tenant_slug, admin_nombre, admin_email, admin_password } = req.body
    if (!tenant_nombre || !tenant_slug || !admin_nombre || !admin_email || !admin_password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }

    // Crear tenant
    const { rows: tenants } = await db.query(
      `INSERT INTO tenants (nombre, slug) VALUES ($1, $2) RETURNING id`,
      [tenant_nombre, tenant_slug]
    )
    const tenant_id = tenants[0].id

    // Crear local principal por defecto
    const { rows: locales } = await db.query(
      `INSERT INTO locales (tenant_id, nombre) VALUES ($1, $2) RETURNING id`,
      [tenant_id, 'Local principal']
    )
    const local_id = locales[0].id

    // Crear usuario admin
    const hash = await bcrypt.hash(admin_password, 10)
    const { rows: usuarios } = await db.query(
      `INSERT INTO usuarios (tenant_id, local_id, nombre, email, rol, password_hash)
       VALUES ($1, $2, $3, $4, 'admin', $5) RETURNING id`,
      [tenant_id, local_id, admin_nombre, admin_email, hash]
    )

    res.status(201).json({
      message: 'Restaurante creado correctamente',
      tenant_id,
      local_id,
      usuario_id: usuarios[0].id,
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { login, registrarTenant }
