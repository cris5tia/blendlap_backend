import webpush from 'web-push';
import { pool } from '../database/connection';
import logger from './logger';

export function initWebPush(): void {
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT || 'mailto:soporte@blendlap.com';

  if (!publicKey || !privateKey) {
    logger.warn('[WebPush] VAPID keys no configuradas — notificaciones push desactivadas');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  logger.info('[WebPush] Inicializado correctamente');
}

interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
}

export async function enviarPush(sub: PushSub, payload: object): Promise<void> {
  await webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      expirationTime: sub.expiration_time ?? null,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    },
    JSON.stringify(payload)
  );
}

export async function eliminarSuscripcionExpirada(endpoint: string): Promise<void> {
  try {
    await pool.execute('DELETE FROM push_subscription WHERE endpoint = ?', [endpoint]);
    logger.info('[WebPush] Suscripción expirada eliminada');
  } catch (e) {
    logger.error('[WebPush] Error eliminando suscripción expirada:', e);
  }
}
