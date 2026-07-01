import cron from 'node-cron';
import { pool } from '../database/connection';
import { RowDataPacket } from 'mysql2';
import { ReservaService } from '../services/reserva.service';
import logger from './logger';
import { CreditoService } from '../services/credito.service';
import { enviarPush, eliminarSuscripcionExpirada } from './webpush';
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

  // Recordatorios push — cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try {
      await enviarRecordatorios(60, 'recordatorio_enviado_2h',  '1 hora');
      await enviarRecordatorios(30, 'recordatorio_enviado_30m', '30 minutos');
    } catch (error) {
      logger.error(`[CRON Push] Error: ${error}`);
    }
  });

  logger.info('Cron jobs iniciados');
};

async function enviarRecordatorios(
  minutosAntes: number,
  columnaFlag: 'recordatorio_enviado_2h' | 'recordatorio_enviado_30m',
  textoTiempo: string
): Promise<void> {
  // Ventana de ±4 min para cubrir el intervalo de 5 min del cron.
  // Los tiempos en DB están en hora colombiana (UTC-5), por eso se suma INTERVAL 5 HOUR.
  const [reservas] = await pool.execute<RowDataPacket[]>(
    `SELECT r.id_reserva, r.id_cliente,
            u.nombre,
            ps.endpoint, ps.p256dh, ps.auth, ps.expiration_time
     FROM reserva r
     JOIN usuario_rol u  ON u.id_usuario  = r.id_cliente
     JOIN push_subscription ps ON ps.id_usuario = r.id_cliente
     WHERE r.estado IN ('pendiente', 'confirmada')
       AND r.\`${columnaFlag}\` = 0
       AND TIMESTAMPDIFF(MINUTE, NOW(),
             TIMESTAMP(r.fecha, r.hora) + INTERVAL 5 HOUR
           ) BETWEEN ? AND ?`,
    [minutosAntes - 4, minutosAntes + 4]
  );

  for (const r of reservas) {
    try {
      await enviarPush(r as any, {
        notification: {
          title: '🪒 Blendlap — Recordatorio de cita',
          body: `Hola ${r.nombre}, recuerda que tienes una cita en ${textoTiempo}.`,
          icon:  '/assets/icons/icon-192x192.png',
          badge: '/assets/icons/icon-72x72.png',
          data: {
            onActionClick: {
              default: { operation: 'navigateLastFocusedOrOpen', url: '/cliente/mis-citas' }
            }
          }
        }
      });

      await pool.execute(
        `UPDATE reserva SET \`${columnaFlag}\` = 1 WHERE id_reserva = ?`,
        [r.id_reserva]
      );

      logger.info(`[Push] Recordatorio ${textoTiempo} → cliente ${r.id_cliente}, reserva ${r.id_reserva}`);
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await eliminarSuscripcionExpirada(r.endpoint);
      } else {
        logger.error(`[Push] Error enviando a cliente ${r.id_cliente}: ${err?.message}`);
      }
    }
  }
}