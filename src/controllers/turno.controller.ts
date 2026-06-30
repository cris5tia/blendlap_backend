import { Request, Response } from 'express';
import { TurnoService } from '../services/turno.service';
import { emitirAdminEvento } from '../utils/socket';

export class TurnoController {

  // GET /api/turnos
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const turnos = await TurnoService.getAll();
      res.status(200).json({ ok: true, data: turnos });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  // GET /api/turnos/fecha?fecha=2025-05-10
  static async getByFecha(req: Request, res: Response): Promise<void> {
    try {
      const fecha = req.query.fecha as string;
      const turnos = await TurnoService.getByFecha(fecha);
      res.status(200).json({ ok: true, data: turnos });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  // GET /api/turnos/mis-turnos → barbero ve sus turnos
  static async getMisTurnos(req: Request, res: Response): Promise<void> {
    try {
      const id_usuario = req.usuario!.id_usuario;
      const turnos = await TurnoService.getByBarbero(id_usuario);
      res.status(200).json({ ok: true, data: turnos });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  // GET /api/turnos/:id
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const turno = await TurnoService.getById(id);
      res.status(200).json({ ok: true, data: turno });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  }

  // POST /api/turnos
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const turno = await TurnoService.create(req.body);
      emitirAdminEvento('turno:nuevo', {});
      res.status(201).json({ ok: true, data: turno });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  // PUT /api/turnos/:id
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const turno = await TurnoService.update(id, req.body);
      emitirAdminEvento('turno:actualizado', {});
      res.status(200).json({ ok: true, data: turno });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  // DELETE /api/turnos/:id
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const resultado = await TurnoService.delete(id);
      emitirAdminEvento('turno:eliminado', {});
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  }

  // GET /api/turnos/rendimiento?id_usuario=2&fechaInicio=2025-05-01&fechaFin=2025-05-31
  static async getRendimiento(req: Request, res: Response): Promise<void> {
    try {
      const id_usuario = parseInt(req.query.id_usuario as string);
      const fechaInicio = req.query.fechaInicio as string;
      const fechaFin = req.query.fechaFin as string;
      const rendimiento = await TurnoService.getRendimiento(id_usuario, fechaInicio, fechaFin);
      res.status(200).json({ ok: true, data: rendimiento });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }
}