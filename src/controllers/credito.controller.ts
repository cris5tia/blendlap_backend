import { Request, Response } from 'express';
import { CreditoService } from '../services/credito.service';
import { CreditoModel } from '../models/credito.model';
export class CreditoController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { estado, busqueda } = req.query;
      const data = await CreditoService.getAll({
        estado:   estado   as string,
        busqueda: busqueda as string
      });
      res.status(200).json({ ok: true, data });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const data = await CreditoService.getById(parseInt(req.params.id));
      res.status(200).json({ ok: true, data });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  }

  // Admin crea en local → activo directo
  static async crearAdmin(req: Request, res: Response): Promise<void> {
    try {
      const id_admin = req.usuario!.id_usuario;
      const data = await CreditoService.crearAdmin(req.body, id_admin);
      res.status(201).json({ ok: true, data });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  // Cliente solicita desde home → pendiente
  static async solicitarCliente(req: Request, res: Response): Promise<void> {
    try {
      const id_cliente = req.usuario!.id_usuario;
      const data = await CreditoService.solicitarCliente(req.body, id_cliente);
      res.status(201).json({ ok: true, data });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async aprobar(req: Request, res: Response): Promise<void> {
    try {
      const data = await CreditoService.aprobar(parseInt(req.params.id));
      res.status(200).json({ ok: true, data });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async rechazar(req: Request, res: Response): Promise<void> {
    try {
      const result = await CreditoService.rechazar(parseInt(req.params.id));
      res.status(200).json({ ok: true, ...result });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async abonar(req: Request, res: Response): Promise<void> {
    try {
      const id_admin = req.usuario!.id_usuario;
      const data = await CreditoService.abonar(req.body, id_admin);
      res.status(200).json({ ok: true, data });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }
  static async getMisCreditos(req: Request, res: Response): Promise<void> {
  try {
    const id_cliente = req.usuario!.id_usuario;
    const creditos = await CreditoModel.findByCliente(id_cliente);
    res.json({ ok: true, data: creditos });
  } catch (error: any) {
    res.status(500).json({ ok: false, mensaje: error.message });
  }
}
}