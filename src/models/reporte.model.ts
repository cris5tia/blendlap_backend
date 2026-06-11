import { pool } from '../database/connection';
import { RowDataPacket } from 'mysql2';

export class ReporteModel {

  static async getTotalIngresos(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        COUNT(*) AS total_ventas,
        COALESCE(SUM(total), 0) AS total_ingresos
       FROM venta
       WHERE DATE(fecha) BETWEEN ? AND ?`,
      [fechaInicio, fechaFin]
    );
    return rows[0];
  }

  static async getVentas(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        metodo_pago,
        COUNT(*) AS cantidad,
        SUM(total) AS total
       FROM venta
       WHERE DATE(fecha) BETWEEN ? AND ?
       GROUP BY metodo_pago`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  static async getServiciosPorBarbero(fechaInicio: string, fechaFin: string, id_barbero?: number) {
    let query = `
      SELECT
        CONCAT(u.nombre, ' ', u.apellido) AS barbero,
        s.nombre_servicio,
        COUNT(*) AS cantidad,
        SUM(rs.precio_cobrado) AS total_servicios,
        SUM(rs.precio_cobrado) * 0.60 AS comision_barbero,
        SUM(rs.precio_cobrado) * 0.40 AS comision_barberia
       FROM reserva r
       JOIN usuario_rol u ON r.id_barbero = u.id_usuario
       JOIN reserva_servicio rs ON r.id_reserva = rs.id_reserva
       JOIN servicio s ON rs.id_servicio = s.id_servicio
       WHERE r.fecha BETWEEN ? AND ?
       AND r.estado = 'completada'`;

    const params: any[] = [fechaInicio, fechaFin];

    if (id_barbero) {
      query += ' AND r.id_barbero = ?';
      params.push(id_barbero);
    }

    query += ' GROUP BY r.id_barbero, rs.id_servicio ORDER BY barbero, total_servicios DESC';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows;
  }

  static async getComisionesPorBarbero(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        CONCAT(u.nombre, ' ', u.apellido) AS barbero,
        COUNT(DISTINCT r.id_reserva) AS total_reservas,
        SUM(rs.precio_cobrado) AS total_servicios,
        SUM(rs.precio_cobrado) * 0.60 AS comision_barbero,
        SUM(rs.precio_cobrado) * 0.40 AS comision_barberia
       FROM reserva r
       JOIN usuario_rol u ON r.id_barbero = u.id_usuario
       JOIN reserva_servicio rs ON r.id_reserva = rs.id_reserva
       WHERE r.fecha BETWEEN ? AND ?
       AND r.estado = 'completada'
       GROUP BY r.id_barbero
       ORDER BY total_servicios DESC`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  static async getProductosVendidos(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        p.nombre_producto,
        SUM(dv.cantidad) AS cantidad_vendida,
        SUM(dv.subtotal) AS total_vendido
       FROM detalle_venta dv
       JOIN venta v ON dv.id_venta = v.id_venta
       JOIN producto p ON dv.id_producto = p.id_producto
       WHERE DATE(v.fecha) BETWEEN ? AND ?
       AND dv.porcentaje_barbero IS NULL
       GROUP BY dv.id_producto
       ORDER BY cantidad_vendida DESC`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  static async getTopServicios(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        s.nombre_servicio,
        COUNT(*) AS veces_solicitado,
        SUM(rs.precio_cobrado) AS total_generado
       FROM reserva_servicio rs
       JOIN servicio s ON rs.id_servicio = s.id_servicio
       JOIN reserva r ON rs.id_reserva = r.id_reserva
       WHERE r.fecha BETWEEN ? AND ?
       AND r.estado = 'completada'
       GROUP BY rs.id_servicio
       ORDER BY veces_solicitado DESC
       LIMIT 5`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  static async getTopProductos(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        p.nombre_producto,
        SUM(dv.cantidad) AS cantidad_vendida,
        SUM(dv.subtotal) AS total_generado
       FROM detalle_venta dv
       JOIN producto p ON dv.id_producto = p.id_producto
       JOIN venta v ON dv.id_venta = v.id_venta
       WHERE DATE(v.fecha) BETWEEN ? AND ?
       GROUP BY dv.id_producto
       ORDER BY cantidad_vendida DESC
       LIMIT 5`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  static async getVentasPorDia(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        DATE(fecha) AS dia,
        COUNT(*) AS total_ventas,
        SUM(total) AS total_ingresos
       FROM venta
       WHERE DATE(fecha) BETWEEN ? AND ?
       GROUP BY DATE(fecha)
       ORDER BY dia ASC`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  static async getAgendaDia(fecha: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM v_agenda_dia WHERE fecha = ?',
      [fecha]
    );
    return rows;
  }

  static async registrarGeneracion(id_usuario: number, tipo: string) {
    await pool.execute(
      'INSERT INTO reporte (id_usuario, tipo) VALUES (?, ?)',
      [id_usuario, tipo]
    );
  }
}
