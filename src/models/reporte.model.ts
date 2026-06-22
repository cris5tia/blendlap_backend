import { pool } from '../database/connection';
import { RowDataPacket } from 'mysql2';

export class ReporteModel {

  // ── KPIs generales ───────────────────────────────────────────────────────
  static async getKPIs(fechaInicio: string, fechaFin: string) {
    const [[totalVentas], [servicios], [productos], [gastos], [comisiones],
      reservasRaw, [clientesNuevos], creditosRaw] = await Promise.all([

      pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(total), 0) AS ingresos_total, COUNT(*) AS cantidad_ventas
         FROM venta WHERE DATE(fecha) BETWEEN ? AND ?`,
        [fechaInicio, fechaFin]
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(total), 0) AS total
         FROM venta WHERE DATE(fecha) BETWEEN ? AND ? AND id_reserva IS NOT NULL`,
        [fechaInicio, fechaFin]
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(total), 0) AS total
         FROM venta WHERE DATE(fecha) BETWEEN ? AND ? AND id_reserva IS NULL`,
        [fechaInicio, fechaFin]
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(monto), 0) AS total FROM gasto WHERE fecha BETWEEN ? AND ?`,
        [fechaInicio, fechaFin]
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(rs.precio_cobrado * u.comision / 100), 0) AS total_comisiones_barbero,
                COALESCE(SUM(rs.precio_cobrado * (100 - u.comision) / 100), 0) AS total_barberia
         FROM reserva r
         JOIN reserva_servicio rs ON rs.id_reserva = r.id_reserva
         JOIN usuario_rol u ON u.id_usuario = r.id_barbero
         WHERE r.fecha BETWEEN ? AND ? AND r.estado = 'completada'`,
        [fechaInicio, fechaFin]
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT estado, COUNT(*) AS cantidad FROM reserva
         WHERE fecha BETWEEN ? AND ? GROUP BY estado`,
        [fechaInicio, fechaFin]
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM usuario_rol
         WHERE rol = 'cliente' AND DATE(fecha_creacion) BETWEEN ? AND ?`,
        [fechaInicio, fechaFin]
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(monto_total), 0) AS monto
         FROM credito GROUP BY estado`
      ),
    ]);

    const reservaMap: Record<string, number> = {};
    for (const r of reservasRaw[0]) reservaMap[r.estado] = Number(r.cantidad);

    const creditoMap: Record<string, any> = {};
    for (const c of creditosRaw[0]) creditoMap[c.estado] = { cantidad: Number(c.cantidad), monto: Number(c.monto) };

    const ingresos_total = Number(totalVentas[0].ingresos_total);
    const total_gastos = Number(gastos[0].total);
    const total_comisiones_barbero = Number(comisiones[0].total_comisiones_barbero);
    const ganancia_neta = ingresos_total - total_gastos - total_comisiones_barbero;

    return {
      ingresos_total,
      ingresos_servicios: Number(servicios[0].total),
      ingresos_productos: Number(productos[0].total),
      total_gastos,
      total_comisiones_barbero,
      ganancia_neta,
      cantidad_ventas: Number(totalVentas[0].cantidad_ventas),
      reservas_total: Object.values(reservaMap).reduce((s: number, v: any) => s + Number(v), 0),
      reservas_completadas: reservaMap['completada'] || 0,
      reservas_pendientes: reservaMap['pendiente'] || 0,
      reservas_canceladas: reservaMap['cancelada'] || 0,
      clientes_nuevos: Number(clientesNuevos[0].total),
      creditos_pendientes: creditoMap['pendiente']?.cantidad || 0,
      creditos_activos: creditoMap['activo']?.cantidad || 0,
      monto_creditos_pendiente: creditoMap['pendiente']?.monto || 0,
      monto_creditos_activos: creditoMap['activo']?.monto || 0,
    };
  }

  // ── Ventas por día ───────────────────────────────────────────────────────
  static async getVentasPorDia(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DATE(fecha) AS dia, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
       FROM venta WHERE DATE(fecha) BETWEEN ? AND ?
       GROUP BY DATE(fecha) ORDER BY dia ASC`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  // ── Ventas por hora ──────────────────────────────────────────────────────
  static async getVentasPorHora(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT HOUR(fecha) AS hora, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
       FROM venta WHERE DATE(fecha) BETWEEN ? AND ?
       GROUP BY HOUR(fecha) ORDER BY hora ASC`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  // ── Ventas por método de pago ────────────────────────────────────────────
  static async getMetodosPago(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT metodo_pago, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
       FROM venta WHERE DATE(fecha) BETWEEN ? AND ?
       GROUP BY metodo_pago ORDER BY total DESC`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  // ── Top servicios ────────────────────────────────────────────────────────
  static async getTopServicios(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.nombre_servicio, COUNT(*) AS veces_solicitado,
              COALESCE(SUM(rs.precio_cobrado), 0) AS total_generado
       FROM reserva_servicio rs
       JOIN servicio s ON rs.id_servicio = s.id_servicio
       JOIN reserva r ON rs.id_reserva = r.id_reserva
       WHERE r.fecha BETWEEN ? AND ? AND r.estado = 'completada'
       GROUP BY rs.id_servicio ORDER BY veces_solicitado DESC LIMIT 10`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  // ── Top productos ────────────────────────────────────────────────────────
  static async getTopProductos(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.nombre_producto, SUM(dv.cantidad) AS cantidad_vendida,
              COALESCE(SUM(dv.subtotal), 0) AS total_generado
       FROM detalle_venta dv
       JOIN producto p ON dv.id_producto = p.id_producto
       JOIN venta v ON dv.id_venta = v.id_venta
       WHERE DATE(v.fecha) BETWEEN ? AND ?
       GROUP BY dv.id_producto ORDER BY cantidad_vendida DESC LIMIT 10`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  // ── Barberos con comisión dinámica ───────────────────────────────────────
  static async getBarberos(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id_usuario, CONCAT(u.nombre, ' ', u.apellido) AS barbero,
              u.foto, u.titulo, u.comision,
              COUNT(DISTINCT r.id_reserva) AS total_reservas,
              COALESCE(SUM(rs.precio_cobrado), 0) AS total_servicios,
              COALESCE(SUM(rs.precio_cobrado * u.comision / 100), 0) AS comision_barbero,
              COALESCE(SUM(rs.precio_cobrado * (100 - u.comision) / 100), 0) AS comision_barberia
       FROM usuario_rol u
       LEFT JOIN reserva r ON r.id_barbero = u.id_usuario
         AND r.fecha BETWEEN ? AND ? AND r.estado = 'completada'
       LEFT JOIN reserva_servicio rs ON rs.id_reserva = r.id_reserva
       WHERE u.rol = 'barbero' AND u.estado = 'activo'
       GROUP BY u.id_usuario ORDER BY total_servicios DESC`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  // ── Servicios por barbero ────────────────────────────────────────────────
  static async getServiciosPorBarbero(fechaInicio: string, fechaFin: string, id_barbero?: number) {
    let query = `
      SELECT CONCAT(u.nombre, ' ', u.apellido) AS barbero,
             s.nombre_servicio, COUNT(*) AS cantidad,
             COALESCE(SUM(rs.precio_cobrado), 0) AS total_servicios,
             COALESCE(SUM(rs.precio_cobrado * u.comision / 100), 0) AS comision_barbero,
             COALESCE(SUM(rs.precio_cobrado * (100 - u.comision) / 100), 0) AS comision_barberia
      FROM reserva r
      JOIN usuario_rol u ON r.id_barbero = u.id_usuario
      JOIN reserva_servicio rs ON r.id_reserva = rs.id_reserva
      JOIN servicio s ON rs.id_servicio = s.id_servicio
      WHERE r.fecha BETWEEN ? AND ? AND r.estado = 'completada'`;
    const params: any[] = [fechaInicio, fechaFin];
    if (id_barbero) { query += ' AND r.id_barbero = ?'; params.push(id_barbero); }
    query += ' GROUP BY r.id_barbero, rs.id_servicio ORDER BY barbero, total_servicios DESC';
    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows;
  }

  // ── Créditos analytics ───────────────────────────────────────────────────
  static async getCreditosAnalytics() {
    const [[estadisticas], abonosRaw] = await Promise.all([
      pool.execute<RowDataPacket[]>(
        `SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(monto_total), 0) AS monto_total,
                COALESCE(SUM(saldo_pendiente), 0) AS saldo_pendiente
         FROM credito GROUP BY estado`
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT DATE(fecha) AS dia, COALESCE(SUM(monto), 0) AS total
         FROM credito_abono
         WHERE DATE(fecha) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY DATE(fecha) ORDER BY dia ASC`
      ),
    ]);
    return { estadisticas, abonos_recientes: abonosRaw[0] };
  }

  // ── Top clientes ─────────────────────────────────────────────────────────
  static async getTopClientes(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT CONCAT(u.nombre, ' ', u.apellido) AS cliente, u.foto,
              COUNT(DISTINCT r.id_reserva) AS total_reservas,
              COALESCE(SUM(rs.precio_cobrado), 0) AS total_gastado
       FROM usuario_rol u
       JOIN reserva r ON r.id_cliente = u.id_usuario
         AND r.fecha BETWEEN ? AND ? AND r.estado = 'completada'
       JOIN reserva_servicio rs ON rs.id_reserva = r.id_reserva
       WHERE u.rol = 'cliente'
       GROUP BY u.id_usuario ORDER BY total_gastado DESC LIMIT 10`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  // ── Gastos por categoría ─────────────────────────────────────────────────
  static async getGastosPorCategoria(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT categoria, COUNT(*) AS cantidad, COALESCE(SUM(monto), 0) AS total
       FROM gasto WHERE fecha BETWEEN ? AND ?
       GROUP BY categoria ORDER BY total DESC`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  // ── Gastos por día ───────────────────────────────────────────────────────
  static async getGastosPorDia(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DATE(fecha) AS dia, COALESCE(SUM(monto), 0) AS total
       FROM gasto WHERE fecha BETWEEN ? AND ?
       GROUP BY DATE(fecha) ORDER BY dia ASC`,
      [fechaInicio, fechaFin]
    );
    return rows;
  }

  // ── Resumen reservas por estado y día ────────────────────────────────────
  static async getReservasPorDia(fechaInicio: string, fechaFin: string, id_barbero?: number) {
    let query = `SELECT DATE(fecha) AS dia, estado, COUNT(*) AS cantidad
       FROM reserva WHERE fecha BETWEEN ? AND ?`;
    const params: any[] = [fechaInicio, fechaFin];
    if (id_barbero) { query += ' AND id_barbero = ?'; params.push(id_barbero); }
    query += ' GROUP BY DATE(fecha), estado ORDER BY dia ASC';
    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows;
  }

  static async registrarGeneracion(id_usuario: number, tipo: string) {
    await pool.execute(
      'INSERT INTO reporte (id_usuario, tipo) VALUES (?, ?)',
      [id_usuario, tipo]
    );
  }

  // ── Kept for backwards compatibility ─────────────────────────────────────
  static async getTotalIngresos(fechaInicio: string, fechaFin: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_ventas, COALESCE(SUM(total), 0) AS total_ingresos
       FROM venta WHERE DATE(fecha) BETWEEN ? AND ?`,
      [fechaInicio, fechaFin]
    );
    return rows[0];
  }

  static async getAgendaDia(fecha: string) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM v_agenda_dia WHERE fecha = ?',
      [fecha]
    );
    return rows;
  }
}
