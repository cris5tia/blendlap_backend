import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { pool } from '../database/connection';
import { ResultSetHeader } from 'mysql2';
import logger from '../utils/logger';

const hashEndpoint = (endpoint: string) =>
  createHash('sha256').update(endpoint).digest('hex');

export class NotificacionController {

  static async getVapidKey(_req: Request, res: Response): Promise<void> {
    res.json({ ok: true, data: { publicKey: process.env.VAPID_PUBLIC_KEY || null } });
  }

  static async suscribir(req: Request, res: Response): Promise<void> {
    const { endpoint, expirationTime, keys } = req.body;
    const id_usuario = req.usuario!.id_usuario;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ ok: false, mensaje: 'Suscripción inválida' });
      return;
    }

    try {
      const hash = hashEndpoint(endpoint);
      await pool.execute<ResultSetHeader>(
        `INSERT INTO push_subscription (id_usuario, endpoint, endpoint_hash, p256dh, auth, expiration_time)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id_usuario = VALUES(id_usuario),
           p256dh     = VALUES(p256dh),
           auth       = VALUES(auth),
           expiration_time = VALUES(expiration_time)`,
        [id_usuario, endpoint, hash, keys.p256dh, keys.auth, expirationTime ?? null]
      );
      res.json({ ok: true });
    } catch (error) {
      logger.error('[Push] Error guardando suscripción:', error);
      res.status(500).json({ ok: false, mensaje: 'Error al guardar suscripción' });
    }
  }

  static async desuscribir(req: Request, res: Response): Promise<void> {
    const { endpoint } = req.body;
    const id_usuario = req.usuario!.id_usuario;

    try {
      const hash = hashEndpoint(endpoint);
      await pool.execute(
        'DELETE FROM push_subscription WHERE endpoint_hash = ? AND id_usuario = ?',
        [hash, id_usuario]
      );
      res.json({ ok: true });
    } catch (error) {
      logger.error('[Push] Error eliminando suscripción:', error);
      res.status(500).json({ ok: false });
    }
  }
}
