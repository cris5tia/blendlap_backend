import { Request, Response } from 'express';
import { NotificacionService } from '../services/notificacion.service';

export class NotificacionController {
  static getPublicKey(_req: Request, res: Response): void {
    res.json({ ok: true, publicKey: NotificacionService.getPublicKey() });
  }

  static async guardarSuscripcion(req: Request, res: Response): Promise<void> {
    try {
      await NotificacionService.guardarSuscripcion(req.usuario!.id_usuario, req.body);
      res.status(201).json({ ok: true, mensaje: 'Suscripción guardada' });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async probar(req: Request, res: Response): Promise<void> {
    try {
      await NotificacionService.enviarAUsuario(req.usuario!.id_usuario, {
        title: 'Blendlap',
        body: 'Tus notificaciones están funcionando.',
        data: { url: '/' }
      });
      res.json({ ok: true, mensaje: 'Notificación enviada' });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }
}
