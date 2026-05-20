// src/lib/db.js
// Conexión a Supabase/PostgreSQL usando pool de conexiones

const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // requerido por Supabase
  max: 10,          // máximo de conexiones simultáneas
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de base de datos:', err)
})

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
}
