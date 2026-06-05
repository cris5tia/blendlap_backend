import cron from 'node-cron';
import { pool } from '../database/connection';
import { RowDataPacket } from 'mysql2';
import { ReservaService } from '../services/reserva.service';
import logger from './logger';
import { CreditoService } from '../services/credito.service';

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