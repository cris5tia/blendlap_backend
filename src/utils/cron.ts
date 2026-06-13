import cron from 'node-cron';
import { pool } from '../database/connection';
import { RowDataPacket } from 'mysql2';
import { ReservaService } from '../services/reserva.service';
import logger from './logger';
import { CreditoService } from '../services/credito.service';
import { NotificacionService } from '../services/notificacion.service';

export const iniciarCronJobs = () => {

  cron.schedule('*/5 * * * *', async () => {
    try {
      const [reservas] = await pool.execute<RowDataPacket[]>(
        `SELECT r.id_reserva, r.id_barbero
         FROM reserva r
         LEFT JOIN reserva_servicio rs ON rs.id_reserva = r.id_reserva
         LEFT JOIN servicio s ON s.id_servicio = rs.id_servicio
         WHERE r.estado IN ('pendiente', 'confirmada')
         GROUP BY r.id_reserva, r.id_barbero, r.fecha, r.hora
         HAVING TIMESTAMP(r.fecha, r.hora) + INTERVAL COALESCE(SUM(s.duracion), 60) MINUTE + INTERVAL 5 HOUR < NOW()`
      );

      for (const reserva of reservas) {
        await ReservaService.update(
          reserva.id_reserva,
          { estado: 'completada' },
          'admin',
          0
        );
        logger.info(`Reserva ${reserva.id_reserva} marcada como completada automáticamente`);
      }

    } catch (error) {
      logger.error(`Error en cron job: ${error}`);
    }
  });

  // Recordatorios de cita: 2 horas y 30 minutos antes
  cron.schedule('*/5 * * * *', async () => {
    try {
      // Asegurar columnas para evitar fallos si la BD no las tiene
      try {
        await pool.execute(`ALTER TABLE reserva ADD COLUMN recordatorio_enviado_2h TINYINT(1) DEFAULT 0`);
      } catch (e) {
        // ignorar (posible que ya exista)
      }
      try {
        await pool.execute(`ALTER TABLE reserva ADD COLUMN recordatorio_enviado_30m TINYINT(1) DEFAULT 0`);
      } catch (e) {
        // ignorar
      }

      const offsets = [
        { minutes: 120, column: 'recordatorio_enviado_2h' },
        { minutes: 30, column: 'recordatorio_enviado_30m' }
      ];

      for (const off of offsets) {
        const [rows] = await pool.execute<any[]>(
          `SELECT id_reserva, id_cliente, fecha, hora
           FROM reserva
           WHERE recordatorio = 1
             AND estado IN ('pendiente', 'confirmada')
             AND COALESCE(${off.column}, 0) = 0
             AND TIMESTAMP(fecha, hora) BETWEEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
                                          AND DATE_ADD(NOW(), INTERVAL ? MINUTE)`,
          [off.minutes, off.minutes + 5]
        );

        for (const r of rows) {
          // Enviar notificación al cliente
          try {
            await NotificacionService.enviarAUsuario(r.id_cliente, {
              title: 'Recordatorio de cita',
              body: `Tu cita es el ${r.fecha} a las ${r.hora} (en ${off.minutes} minutos).`,
              data: { url: '/cliente/dashboard', id_reserva: r.id_reserva }
            });

            // Marcar como enviado
            await pool.execute(
              `UPDATE reserva SET ${off.column} = 1 WHERE id_reserva = ?`,
              [r.id_reserva]
            );
            logger.info(`Recordatorio ${off.minutes}min enviado para reserva ${r.id_reserva}`);
          } catch (err) {
            logger.warn(`No se pudo enviar recordatorio para reserva ${r.id_reserva}: ${err}`);
          }
        }
      }
    } catch (error) {
      logger.error(`[CRON] Error recordatorios: ${error}`);
    }
  });


  // Créditos vencidos — cada día a las 8am (corre aunque el admin no esté en la app)
  cron.schedule('0 8 * * *', async () => {
    try {
      await CreditoService.actualizarVencidos();
      logger.info('[CRON] Créditos vencidos actualizados');
    } catch (error) {
      logger.error(`[CRON] Error actualizando vencidos: ${error}`);
    }
  });

  logger.info('Cron jobs iniciados');
};