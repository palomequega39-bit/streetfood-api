// src/middlewares/errores.js
// Captura todos los errores y devuelve respuestas consistentes

const manejarErrores = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message)

  // Error de constraint de base de datos (ej: email duplicado)
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' })
  }

  // Error de foreign key (ej: tenant_id inexistente)
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referencia a un recurso inexistente' })
  }

  // Error de validación manual
  if (err.status) {
    return res.status(err.status).json({ error: err.message })
  }

  // Error genérico
  res.status(500).json({ error: 'Error interno del servidor' })
}

module.exports = manejarErrores
