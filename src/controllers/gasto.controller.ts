import { Request, Response } from 'express';
import { GastoService } from '../services/gasto.service';
import { emitirAdminEvento } from '../utils/socket';

export class GastoController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, categoria } = req.query;
      const gastos = await GastoService.getAll({ desde, hasta, categoria });
      res.status(200).json({ ok: true, data: gastos });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const resultado = await GastoService.create(req.body);
      emitirAdminEvento('gasto:nuevo', {});
      res.status(201).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const resultado = await GastoService.update(id, req.body);
      emitirAdminEvento('gasto:actualizado', {});
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const resultado = await GastoService.delete(id);
      emitirAdminEvento('gasto:eliminado', {});
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  }
  static async getEstadisticas(req: Request, res: Response): Promise<void> {
  try {
    const { desde, hasta } = req.query;
    const data = await GastoService.getEstadisticas({
      desde: desde as string,
      hasta: hasta as string
    });
    res.status(200).json({ ok: true, data });
  } catch (error: any) {
    res.status(500).json({ ok: false, mensaje: error.message });
  }
}
}