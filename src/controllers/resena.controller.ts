import { Request, Response } from 'express';
import { ResenaModel } from '../models/resena.model';
import { ReservaModel } from '../models/reserva.model';
import { pool } from '../database/connection';

export class ResenaController {

  static async getByBarbero(req: Request, res: Response): Promise<void> {
    try {
      const id_barbero = parseInt(req.params.id);
      const resenas = await ResenaModel.findByBarbero(id_barbero);
      res.status(200).json({ ok: true, data: resenas });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const id_cliente = req.usuario!.id_usuario;
      const { id_reserva, id_barbero, calificacion, comentario } = req.body;

      if (!id_reserva || !id_barbero || !calificacion) {
        res.status(400).json({ ok: false, mensaje: 'Faltan datos requeridos' });
        return;
      }

      if (calificacion < 1 || calificacion > 5) {
        res.status(400).json({ ok: false, mensaje: 'La calificación debe ser entre 1 y 5' });
        return;
      }

      // Verificar que la reserva existe, es del cliente y está completada
      const reserva = await ReservaModel.findById(id_reserva);
      if (!reserva) {
        res.status(404).json({ ok: false, mensaje: 'Reserva no encontrada' });
        return;
      }

      if (reserva.id_cliente !== id_cliente) {
        res.status(403).json({ ok: false, mensaje: 'No puedes reseñar una reserva que no es tuya' });
        return;
      }

      const [estadoRows] = await pool.execute<any[]>(
        `SELECT
          r.estado,
          DATE_ADD(
            TIMESTAMP(r.fecha, r.hora),
            INTERVAL COALESCE(SUM(s.duracion), 30) MINUTE
          ) <= NOW() AS ya_termino
         FROM reserva r
         LEFT JOIN reserva_servicio rs ON rs.id_reserva = r.id_reserva
         LEFT JOIN servicio s ON s.id_servicio = rs.id_servicio
         WHERE r.id_reserva = ?
         GROUP BY r.id_reserva`,
        [id_reserva]
      );
      const estadoReserva = estadoRows[0];
      const yaTermino = Number(estadoReserva?.ya_termino) === 1;

      if (reserva.estado === 'cancelada') {
        res.status(400).json({ ok: false, mensaje: 'No puedes reseñar citas canceladas' });
        return;
      }

      if (!yaTermino && reserva.estado !== 'completada') {
        res.status(400).json({ ok: false, mensaje: 'Solo puedes reseñar citas que ya finalizaron' });
        return;
      }

      // Verificar que no haya reseña previa
      const resenaExistente = await ResenaModel.findByReserva(id_reserva);
      if (resenaExistente) {
        res.status(400).json({ ok: false, mensaje: 'Ya dejaste una reseña para esta reserva' });
        return;
      }

      const id = await ResenaModel.create({ id_cliente, id_barbero, id_reserva, calificacion, comentario });
      res.status(201).json({ ok: true, id_resena: id, mensaje: 'Reseña creada correctamente' });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }
}
