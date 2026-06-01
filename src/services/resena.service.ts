import { ResenaModel } from '../models/resena.model';
import { pool } from '../database/connection';
import { RowDataPacket } from 'mysql2';

export class ResenaService {

  static async getByBarbero(id_barbero: number) {
    return await ResenaModel.findByBarbero(id_barbero);
  }

  static async getAll() {
    return await ResenaModel.getAll();
  }

  static async create(data: {
    id_cliente: number;
    id_barbero: number;
    id_reserva: number;
    calificacion: number;
    comentario: string;
  }) {
    // Verificar que la reserva existe, pertenece al cliente, no esta cancelada y ya termino
    const [reservas] = await pool.execute<RowDataPacket[]>(
      `SELECT r.id_reserva
       FROM reserva r
       LEFT JOIN reserva_servicio rs ON rs.id_reserva = r.id_reserva
       LEFT JOIN servicio s ON s.id_servicio = rs.id_servicio
       WHERE r.id_reserva = ?
         AND r.id_cliente = ?
         AND r.estado != 'cancelada'
       GROUP BY r.id_reserva
       HAVING r.estado = 'completada'
          OR DATE_ADD(TIMESTAMP(r.fecha, r.hora), INTERVAL COALESCE(SUM(s.duracion), 30) MINUTE) <= NOW()`,
      [data.id_reserva, data.id_cliente]
    );

    if (reservas.length === 0) {
      throw new Error('Solo puedes reseñar citas que ya finalizaron');
    }

    // Verificar que no haya reseña previa
    const existe = await ResenaModel.findByReserva(data.id_reserva);
    if (existe) {
      throw new Error('Ya existe una reseña para esta reserva');
    }

    const id_resena = await ResenaModel.create(data);
    return { id_resena, mensaje: 'Reseña creada correctamente' };
  }
}
