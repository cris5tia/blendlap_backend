import { Request, Response } from 'express';
import { pool } from '../database/connection';
import { RowDataPacket } from 'mysql2';

export class StatsController {

  static async getStatsBarbero(req: Request, res: Response): Promise<void> {
    try {
      const id_barbero = req.usuario!.id_usuario;
      const ahora = new Date();
      const mes = ahora.getMonth() + 1;
      const año = ahora.getFullYear();

      const [citasMes] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT r.id_reserva) as total, COALESCE(SUM(rs.precio_cobrado),0) as ingresos
         FROM reserva r
         LEFT JOIN reserva_servicio rs ON rs.id_reserva = r.id_reserva
         WHERE r.id_barbero = ? AND r.estado = 'completada'
         AND MONTH(r.fecha) = ? AND YEAR(r.fecha) = ?`,
        [id_barbero, mes, año]
      );

      const [citasTotal] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT id_reserva) as total
         FROM reserva WHERE id_barbero = ? AND estado = 'completada'`,
        [id_barbero]
      );

      const [clientes] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT id_cliente) as total
         FROM reserva WHERE id_barbero = ? AND estado = 'completada'`,
        [id_barbero]
      );

      const [recurrentes] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM (
          SELECT id_cliente FROM reserva
          WHERE id_barbero = ? AND estado = 'completada'
          GROUP BY id_cliente HAVING COUNT(*) > 1
        ) t`,
        [id_barbero]
      );

      const [cancelaciones] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM reserva
         WHERE id_barbero = ? AND estado = 'cancelada'
         AND MONTH(fecha) = ? AND YEAR(fecha) = ?`,
        [id_barbero, mes, año]
      );

      const [rating] = await pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(AVG(calificacion),0) as promedio, COUNT(*) as total
         FROM resena WHERE id_barbero = ?`,
        [id_barbero]
      );

      const [topServicio] = await pool.execute<RowDataPacket[]>(
        `SELECT s.nombre_servicio, COUNT(*) as total
         FROM reserva_servicio rs
         JOIN servicio s ON s.id_servicio = rs.id_servicio
         JOIN reserva r ON r.id_reserva = rs.id_reserva
         WHERE r.id_barbero = ? AND r.estado = 'completada'
         GROUP BY rs.id_servicio ORDER BY total DESC LIMIT 1`,
        [id_barbero]
      );

      const [barbero] = await pool.execute<RowDataPacket[]>(
        `SELECT experiencia, comision FROM usuario_rol WHERE id_usuario = ?`,
        [id_barbero]
      );

      const [distribucionServicios] = await pool.execute<RowDataPacket[]>(
        `SELECT s.nombre_servicio, COUNT(*) as total
         FROM reserva_servicio rs
         JOIN servicio s ON s.id_servicio = rs.id_servicio
         JOIN reserva r ON r.id_reserva = rs.id_reserva
         WHERE r.id_barbero = ? AND r.estado = 'completada'
           AND MONTH(r.fecha) = ? AND YEAR(r.fecha) = ?
         GROUP BY rs.id_servicio
         ORDER BY total DESC LIMIT 8`,
        [id_barbero, mes, año]
      );

      const [topClientes] = await pool.execute<RowDataPacket[]>(
        `SELECT u.nombre, u.apellido,
           COUNT(DISTINCT r.id_reserva) as citas,
           COALESCE(SUM(rs.precio_cobrado), 0) as ingresos
         FROM reserva r
         JOIN usuario_rol u ON u.id_usuario = r.id_cliente
         LEFT JOIN reserva_servicio rs ON rs.id_reserva = r.id_reserva
         WHERE r.id_barbero = ? AND r.estado = 'completada'
         GROUP BY r.id_cliente, u.nombre, u.apellido
         ORDER BY citas DESC LIMIT 5`,
        [id_barbero]
      );

      // Desglose diario del mes actual
      const [citasPorDiaMes] = await pool.execute<RowDataPacket[]>(
        `SELECT
           DAY(r.fecha) as dia,
           COUNT(DISTINCT r.id_reserva) as citas,
           COALESCE(SUM(rs.precio_cobrado), 0) as ingresos
         FROM reserva r
         LEFT JOIN reserva_servicio rs ON rs.id_reserva = r.id_reserva
         WHERE r.id_barbero = ? AND r.estado = 'completada'
           AND MONTH(r.fecha) = ? AND YEAR(r.fecha) = ?
         GROUP BY DAY(r.fecha)
         ORDER BY dia ASC`,
        [id_barbero, mes, año]
      );

      const comision = barbero[0]?.comision || 40;
      const ingresosMes = parseFloat(citasMes[0]?.ingresos || 0);
      const comisionMes = ingresosMes * (comision / 100);

      res.json({
        ok: true,
        data: {
          citasMes: citasMes[0]?.total || 0,
          ingresosMes,
          comisionMes,
          citasTotal: citasTotal[0]?.total || 0,
          clientesAtendidos: clientes[0]?.total || 0,
          clientesRecurrentes: recurrentes[0]?.total || 0,
          cancelacionesMes: cancelaciones[0]?.total || 0,
          promedio_estrellas: parseFloat(rating[0]?.promedio || 0).toFixed(1),
          total_resenas: rating[0]?.total || 0,
          topServicio: topServicio[0]?.nombre_servicio || '—',
          experiencia: barbero[0]?.experiencia || 0,
          comision,
          topClientes: (topClientes as RowDataPacket[]).map(r => ({
            nombre_cliente: `${r.nombre} ${r.apellido}`,
            citas: +r.citas,
            ingresos: +r.ingresos
          })),
          distribucionServicios: (distribucionServicios as RowDataPacket[]).map(r => ({
            nombre_servicio: r.nombre_servicio,
            total: +r.total
          })),
          citasPorDiaMes: (citasPorDiaMes as RowDataPacket[]).map(r => ({
            dia: +r.dia,
            citas: +r.citas,
            ingresos: +r.ingresos
          }))
        }
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }
}