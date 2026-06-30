import { Request, Response } from 'express';
import { VentaService } from '../services/venta.service';
import { emitirAdminEvento } from '../utils/socket';

export class VentaController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const ventas = await VentaService.getAll();
      res.status(200).json({ ok: true, data: ventas });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const venta = await VentaService.getById(parseInt(req.params.id));
      res.status(200).json({ ok: true, data: venta });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const id_cajero = req.usuario!.id_usuario;
      const venta = await VentaService.create(id_cajero, req.body);
      emitirAdminEvento('venta:nueva', {});
      res.status(201).json({ ok: true, data: venta });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async cierreCaja(req: Request, res: Response): Promise<void> {
    try {
      const fecha = req.query.fecha as string;
      const cierre = await VentaService.cierreCaja(fecha);
      res.status(200).json({ ok: true, data: cierre });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }
}