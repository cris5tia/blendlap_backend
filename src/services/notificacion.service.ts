import webPush, { PushSubscription } from 'web-push';
import logger from '../utils/logger';
import { NotificacionModel, PushSubscriptionRecord } from '../models/notificacion.model';

export interface PushPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

export class NotificacionService {
  static configurar(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:soporte@blendlap.com';

    if (!publicKey || !privateKey) {
      logger.warn('Web Push no configurado: faltan VAPID_PUBLIC_KEY y/o VAPID_PRIVATE_KEY');
      return;
    }

    webPush.setVapidDetails(subject, publicKey, privateKey);
  }

  static getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY || '';
  }

  static async guardarSuscripcion(id_usuario: number, subscription: PushSubscription): Promise<void> {
    await NotificacionModel.upsert(id_usuario, subscription);
  }

  static async enviarAUsuario(id_usuario: number, payload: PushPayload): Promise<void> {
    const subscriptions = await NotificacionModel.findByUsuario(id_usuario);
    await Promise.all(subscriptions.map(subscription => NotificacionService.enviar(subscription, payload)));
  }

  static async enviarReservaCreada(reserva: any): Promise<void> {
    if (!reserva) return;

    const fecha = reserva.fecha ? new Date(reserva.fecha).toLocaleDateString('es-CO') : '';
    const hora = reserva.hora || '';
    const cliente = [reserva.cliente_nombre, reserva.cliente_apellido].filter(Boolean).join(' ') || 'un cliente';
    const barbero = [reserva.barbero_nombre, reserva.barbero_apellido].filter(Boolean).join(' ') || 'tu barbero';

    if (reserva.id_barbero) {
      await NotificacionService.enviarAUsuario(reserva.id_barbero, {
        title: 'Nueva cita en Blendlap',
        body: `${cliente} agendó para ${fecha} a las ${hora}.`,
        data: { url: '/barbero/agenda', id_reserva: reserva.id_reserva }
      });
    }

    if (reserva.id_cliente) {
      await NotificacionService.enviarAUsuario(reserva.id_cliente, {
        title: 'Cita confirmada',
        body: `Tu cita con ${barbero} quedó para ${fecha} a las ${hora}.`,
        data: { url: '/cliente/dashboard', id_reserva: reserva.id_reserva }
      });
    }
  }

  private static async enviar(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<void> {
    if (!NotificacionService.getPublicKey() || !process.env.VAPID_PRIVATE_KEY) return;

    const pushSubscription: PushSubscription = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expiration_time,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };

    try {
      await webPush.sendNotification(pushSubscription, JSON.stringify({
        notification: {
          title: payload.title,
          body: payload.body,
          icon: payload.icon || '/assets/icons/icon-192x192.png',
          badge: payload.badge || '/assets/icons/icon-72x72.png',
          data: payload.data || {}
        }
      }));
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await NotificacionModel.deleteById(subscription.id_push_subscription);
        return;
      }

      logger.warn(`No se pudo enviar push: ${error?.message || error}`);
    }
  }
}
