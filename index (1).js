// src/middlewares/auth.js
// Verifica el token JWT y agrega el usuario al request

const jwt = require('jsonwebtoken')

// Verifica que el token sea válido
const autenticar = (req, res, next) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' })
  }

  const token = header.split(' ')[1]
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.usuario = payload // { id, tenant_id, local_id, rol, email }
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

// Verifica que el usuario tenga uno de los roles permitidos
const autorizar = (...roles) => (req, res, next) => {
  if (!roles.includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso para esta acción' })
  }
  next()
}

module.exports = { autenticar, autorizar }
