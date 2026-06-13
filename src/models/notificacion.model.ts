import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { PushSubscription } from 'web-push';
import { pool } from '../database/connection';

export interface PushSubscriptionRecord extends RowDataPacket {
  id_push_subscription: number;
  id_usuario: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
}

export class NotificacionModel {
  static async inicializarTabla(): Promise<void> {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS push_subscription (
        id_push_subscription INT AUTO_INCREMENT PRIMARY KEY,
        id_usuario INT NOT NULL,
        endpoint TEXT NOT NULL,
        endpoint_hash CHAR(64) NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        expiration_time BIGINT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_push_endpoint_hash (endpoint_hash),
        INDEX idx_push_usuario (id_usuario)
      )
    `);
  }

  static async upsert(id_usuario: number, subscription: PushSubscription): Promise<void> {
    const endpoint = subscription.endpoint;
    const endpointHash = NotificacionModel.hashEndpoint(endpoint);
    const p256dh = subscription.keys.p256dh;
    const auth = subscription.keys.auth;
    const expirationTime = subscription.expirationTime ?? null;

    await pool.execute<ResultSetHeader>(
      `INSERT INTO push_subscription
        (id_usuario, endpoint, endpoint_hash, p256dh, auth, expiration_time)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        id_usuario = VALUES(id_usuario),
        p256dh = VALUES(p256dh),
        auth = VALUES(auth),
        expiration_time = VALUES(expiration_time)`,
      [id_usuario, endpoint, endpointHash, p256dh, auth, expirationTime]
    );
  }

  static async findByUsuario(id_usuario: number): Promise<PushSubscriptionRecord[]> {
    const [rows] = await pool.execute<PushSubscriptionRecord[]>(
      `SELECT * FROM push_subscription WHERE id_usuario = ?`,
      [id_usuario]
    );
    return rows;
  }

  static async deleteById(id_push_subscription: number): Promise<void> {
    await pool.execute(
      `DELETE FROM push_subscription WHERE id_push_subscription = ?`,
      [id_push_subscription]
    );
  }

  private static hashEndpoint(endpoint: string): string {
    return crypto.createHash('sha256').update(endpoint).digest('hex');
  }
}
