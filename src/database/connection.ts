import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import logger from '../utils/logger';

const poolOptions: PoolOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bdblendlap',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 10000,
  timezone: '+00:00',
};

export const pool: Pool = mysql.createPool(poolOptions);

export const testConnection = async (): Promise<void> => {
  try {
    // Calentar el pool con múltiples conexiones simultáneas
    const warmup = await Promise.all(
      Array.from({ length: 3 }, () => pool.getConnection())
    );
    warmup.forEach(c => c.release());
    logger.info('Conexión a MySQL establecida correctamente (pool calentado)');

    // Aplicar índices de rendimiento (el catch maneja duplicados silenciosamente)
    await applyIndexes();
  } catch (error) {
    logger.error(`Error al conectar con MySQL: ${error}`);
    process.exit(1);
  }
};

async function applyIndexes(): Promise<void> {
  const indexes: string[] = [
    'ALTER TABLE reserva ADD INDEX idx_reserva_cliente (id_cliente)',
    'ALTER TABLE reserva ADD INDEX idx_reserva_barbero_fecha (id_barbero, fecha)',
    'ALTER TABLE reserva ADD INDEX idx_reserva_barbero_estado (id_barbero, fecha, estado)',
    'ALTER TABLE reserva_servicio ADD INDEX idx_rs_reserva (id_reserva)',
    'ALTER TABLE resena ADD INDEX idx_resena_reserva (id_reserva)',
    'ALTER TABLE horario_excepcion ADD INDEX idx_excepcion_usuario_dia (id_usuario, dia_semana)',
  ];
  for (const sql of indexes) {
    try { await pool.execute(sql); } catch (_) { /* índice ya existe */ }
  }
  logger.info('Índices de rendimiento verificados');
}