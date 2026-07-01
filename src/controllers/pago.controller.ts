import { Request, Response } from 'express';
import { PagoService } from '../services/pago.service';
import { ICrearPago } from '../interfaces/pago.interface';

export class PagoController {

  // POST /api/pagos/iniciar  (requiere auth)
  static async iniciarPago(req: Request, res: Response): Promise<void> {
    try {
      const { items, total } = req.body as ICrearPago;
      const id_usuario = req.usuario!.id_usuario;

      if (!items || !Array.isArray(items) || items.length === 0 || !total) {
        res.status(400).json({ ok: false, mensaje: 'items y total son requeridos' });
        return;
      }
      if (total <= 0) {
        res.status(400).json({ ok: false, mensaje: 'El total debe ser mayor a 0' });
        return;
      }

      const resultado = await PagoService.iniciarPago({ items, total }, id_usuario);
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  // GET /api/pagos/mis-compras  (requiere auth)
  static async getMisCompras(req: Request, res: Response): Promise<void> {
    try {
      const id_usuario = req.usuario!.id_usuario;
      const compras = await PagoService.getMisCompras(id_usuario);
      res.status(200).json({ ok: true, data: compras });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  // GET /api/pagos/config-check  (diagnóstico — eliminar en producción estable)
  static async configCheck(_req: Request, res: Response): Promise<void> {
    const wompiApi   = process.env.WOMPI_API_URL   || 'https://sandbox.wompi.co/v1 (default)';
    const pubKey     = process.env.WOMPI_PUBLIC_KEY || '(no configurada)';
    const privKey    = process.env.WOMPI_PRIVATE_KEY;
    const redirect   = process.env.WOMPI_REDIRECT_URL || '(no configurada)';
    const integrity  = process.env.WOMPI_INTEGRITY_KEY;

    const ambiente = pubKey.startsWith('pub_prod') ? 'PRODUCCION' :
                     pubKey.startsWith('pub_test') ? 'SANDBOX'    : 'DESCONOCIDO';

    res.json({
      wompi_api_url:       wompiApi,
      public_key_tipo:     pubKey.substring(0, 12) + '...',
      ambiente,
      private_key_ok:      !!privKey,
      integrity_key_ok:    !!integrity,
      redirect_url:        redirect,
    });
  }

  // GET /api/pagos/verificar/:transactionId  (sin auth — el id_usuario viene del pago guardado)
  static async verificarPago(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;

      if (!transactionId) {
        res.status(400).json({ ok: false, mensaje: 'transactionId es requerido' });
        return;
      }

      const resultado = await PagoService.verificarPago(transactionId);
      res.status(200).json(resultado);
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }
}
