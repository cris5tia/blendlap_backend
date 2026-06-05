import { Request, Response } from 'express';
import { HorarioModel } from '../models/horario.model';

export class HorarioController {

  static async getHorarioBarberia(req: Request, res: Response): Promise<void> {
    try {
        const horario = await HorarioModel.getHorarioBarberia();
        res.status(200).json({ ok: true, data: horario });
    } catch (error: any) {
        res.status(500).json({ ok: false, mensaje: error.message });
    }
}

  static async updateDia(req: Request, res: Response): Promise<void> {
    try {
      const dia = parseInt(req.params.dia);
      await HorarioModel.updateDia(dia, req.body);
      res.status(200).json({ ok: true, mensaje: 'Horario actualizado' });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async getHorarioCompleto(req: Request, res: Response): Promise<void> {
    try {
      const id_usuario = parseInt(req.params.id);
      const horario = await HorarioModel.getHorarioCompleto(id_usuario);
      res.status(200).json({ ok: true, data: horario });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async createExcepcion(req: Request, res: Response): Promise<void> {
    try {
      const id_usuario = req.usuario!.id_usuario;
      const id = await HorarioModel.createExcepcion({ ...req.body, id_usuario });
      res.status(201).json({ ok: true, id_excepcion: id });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async updateExcepcion(req: Request, res: Response): Promise<void> {
    try {
      const id_usuario   = req.usuario!.id_usuario;
      const id_excepcion = parseInt(req.params.id);
      const actualizado  = await HorarioModel.updateExcepcion(id_excepcion, id_usuario, req.body);
      if (!actualizado) {
        res.status(404).json({ ok: false, mensaje: 'Excepción no encontrada' });
        return;
      }
      res.status(200).json({ ok: true, mensaje: 'Excepción actualizada' });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async deleteExcepcion(req: Request, res: Response): Promise<void> {
    try {
      const id_usuario = req.usuario!.id_usuario;
      const id_excepcion = parseInt(req.params.id);
      await HorarioModel.deleteExcepcion(id_excepcion, id_usuario);
      res.status(200).json({ ok: true, mensaje: 'Excepción eliminada' });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }
  static async getMisExcepciones(req: Request, res: Response): Promise<void> {
    try {
      const id_usuario = req.usuario!.id_usuario;
      const excepciones = await HorarioModel.getExcepcionesBarbero(id_usuario);
      res.status(200).json({ ok: true, data: excepciones });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }
}