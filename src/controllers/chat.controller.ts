import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';

export class ChatController {
  static async chat(req: Request, res: Response): Promise<void> {
    try {
      const { message } = req.body as { message?: string };
      if (!message || typeof message !== 'string') {
        res.status(400).json({ ok: false, mensaje: 'message es requerido' });
        return;
      }

      const id_cliente = req.usuario!.id_usuario;
      const result = await ChatService.processMessage({
        sessionKey: `user:${id_cliente}`,
        id_cliente,
        message,
        isGuest: false,
      });

      res.status(200).json({ ok: true, data: result });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message || 'Error interno' });
    }
  }

  static async chatPublic(req: Request, res: Response): Promise<void> {
    try {
      const { message, sessionId } = req.body as { message?: string; sessionId?: string };
      if (!message || typeof message !== 'string') {
        res.status(400).json({ ok: false, mensaje: 'message es requerido' });
        return;
      }
      if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length < 8) {
        res.status(400).json({ ok: false, mensaje: 'sessionId es requerido' });
        return;
      }

      const safeSession = sessionId.trim().slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '');
      if (safeSession.length < 8) {
        res.status(400).json({ ok: false, mensaje: 'sessionId inválido' });
        return;
      }

      const result = await ChatService.processMessage({
        sessionKey: `guest:${safeSession}`,
        message,
        isGuest: true,
      });

      res.status(200).json({ ok: true, data: result });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message || 'Error interno' });
    }
  }
}
