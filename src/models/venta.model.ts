import { pool } from '../database/connection';
import { IVenta, ICrearVenta } from '../interfaces/venta.interface';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export class VentaModel {

    static async findAll(): Promise<IVenta[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT v.*,
        CONCAT(u.nombre, ' ', u.apellido) AS nombre_cajero
       FROM venta v
       JOIN usuario_rol u ON v.id_cajero = u.id_usuario
       WHERE v.id_reserva IS NULL
       ORDER BY v.fecha DESC`
        );
        return rows as IVenta[];
    }

    static async findById(id: number): Promise<any | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT v.*,
        CONCAT(u.nombre, ' ', u.apellido) AS nombre_cajero
       FROM venta v
       JOIN usuario_rol u ON v.id_cajero = u.id_usuario
       WHERE v.id_venta = ?`,
            [id]
        );
        if (rows.length === 0) return null;

        const [detalles] = await pool.execute<RowDataPacket[]>(
            `SELECT dv.*, p.nombre_producto, p.codigo_producto, p.imagen
       FROM detalle_venta dv
       JOIN producto p ON dv.id_producto = p.id_producto
       WHERE dv.id_venta = ?`,
            [id]
        );

        return { ...rows[0], detalles };
    }

    static async create(id_cajero: number, data: ICrearVenta): Promise<number> {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Calcular total
            const total = data.detalles.reduce(
                (sum, d) => sum + d.cantidad * d.precio_unitario, 0
            );

            // 2. Insertar venta
            const [result] = await connection.execute<ResultSetHeader>(
                `INSERT INTO venta (id_reserva, id_cajero, metodo_pago, total)
         VALUES (?, ?, ?, ?)`,
                [data.id_reserva || null, id_cajero, data.metodo_pago, total]
            );
            const id_venta = result.insertId;

            // 3. Insertar detalles
            // 3. Insertar detalles
            for (const detalle of data.detalles) {
                const idProducto = detalle.id_producto || null;
                const subtotal = detalle.cantidad * detalle.precio_unitario;

                await connection.execute(
                    `INSERT INTO detalle_venta (id_venta, id_producto, cantidad, precio_unitario, subtotal, porcentaje_barbero)
         VALUES (?, ?, ?, ?, ?, ?)`,
                    [id_venta, idProducto, detalle.cantidad, detalle.precio_unitario, subtotal, detalle.porcentaje_barbero || null]
                );

                // 4. Solo registrar movimiento de inventario si es un producto físico
                if (idProducto) {
                    await connection.execute(
                        `INSERT INTO inventario_movimiento (id_producto, id_usuario, tipo_movimiento, cantidad)
             VALUES (?, ?, 'Salida', ?)`,
                        [idProducto, id_cajero, detalle.cantidad]
                    );
                }
            }

            await connection.commit();
            return id_venta;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Cierre de caja diario (RF21)
    static async cierreCaja(fecha: string) {
        // Ventas de productos
        const [porMetodo] = await pool.execute<RowDataPacket[]>(
            `SELECT metodo_pago, COUNT(*) AS cantidad, SUM(total) AS total
     FROM venta
     WHERE DATE(fecha) = ?
     GROUP BY metodo_pago`,
            [fecha]
        );

        const [totales] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) AS total_ventas, SUM(total) AS total_ingresos
     FROM venta
     WHERE DATE(fecha) = ?`,
            [fecha]
        );

        // Comisiones por barbero (60/40)
        const [comisiones] = await pool.execute<RowDataPacket[]>(
            `SELECT
      CONCAT(u.nombre, ' ', u.apellido) AS barbero,
      SUM(dv.subtotal) AS total_servicios,
      SUM(dv.subtotal * dv.porcentaje_barbero / 100) AS comision_barbero,
      SUM(dv.subtotal * (100 - dv.porcentaje_barbero) / 100) AS comision_barberia
     FROM detalle_venta dv
     JOIN venta v ON dv.id_venta = v.id_venta
     JOIN usuario_rol u ON v.id_cajero = u.id_usuario
     WHERE DATE(v.fecha) = ?
     AND dv.porcentaje_barbero IS NOT NULL
     GROUP BY v.id_cajero`,
            [fecha]
        );

        // Servicios completados del día
        const [servicios] = await pool.execute<RowDataPacket[]>(
            `SELECT
      CONCAT(u.nombre, ' ', u.apellido) AS barbero,
      s.nombre_servicio,
      COUNT(*) AS cantidad,
      SUM(rs.precio_cobrado) AS total
     FROM reserva r
     JOIN usuario_rol u ON r.id_barbero = u.id_usuario
     JOIN reserva_servicio rs ON r.id_reserva = rs.id_reserva
     JOIN servicio s ON rs.id_servicio = s.id_servicio
     WHERE r.fecha = ? AND r.estado = 'completada'
     GROUP BY r.id_barbero, rs.id_servicio`,
            [fecha]
        );

        // Abonos de créditos del día
        const [abonos] = await pool.execute<RowDataPacket[]>(
            `SELECT
        ca.id_abono,
        ca.monto          AS abono_monto,
        ca.metodo_pago    AS abono_metodo,
        ca.fecha          AS abono_fecha,
        c.nombre_cliente,
        c.monto_total,
        c.saldo_pendiente,
        c.estado          AS credito_estado,
        GROUP_CONCAT(p.nombre_producto SEPARATOR ', ') AS productos_nombres
       FROM credito_abono ca
       JOIN credito c ON ca.id_credito = c.id_credito
       LEFT JOIN credito_producto cp ON c.id_credito = cp.id_credito
       LEFT JOIN producto p ON cp.id_producto = p.id_producto
       WHERE DATE(ca.fecha) = ?
       GROUP BY ca.id_abono
       ORDER BY ca.fecha DESC`,
            [fecha]
        );

        const total_abonado_hoy = (abonos as any[]).reduce((s: number, a: any) => s + Number(a.abono_monto || 0), 0);

        return {
            fecha,
            total_ventas: totales[0].total_ventas,
            total_ingresos: totales[0].total_ingresos || 0,
            por_metodo_pago: porMetodo,
            comisiones_barberos: comisiones,
            servicios_del_dia: servicios,
            abonos_del_dia: abonos,
            total_abonado_hoy
        };
    }
}
