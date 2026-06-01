import { Request, Response } from 'express';
import { ServicioService } from '../services/servicio.service';

export class ServicioController {

  // GET /api/servicios
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const soloActivos = req.query.activos === 'true';
      const servicios = await ServicioService.getAll(soloActivos);
      res.status(200).json({ ok: true, data: servicios });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  // GET /api/servicios/:id
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const servicio = await ServicioService.getById(id);
      res.status(200).json({ ok: true, data: servicio });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  }

  // POST /api/servicios
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const servicio = await ServicioService.create(req.body);
      res.status(201).json({ ok: true, data: servicio });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  // PUT /api/servicios/:id
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const servicio = await ServicioService.update(id, req.body);
      res.status(200).json({ ok: true, data: servicio });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  // DELETE /api/servicios/:id
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const resultado = await ServicioService.delete(id);
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  }
}
