import { pool } from '../database/connection';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { ICrearCredito, IRegistrarAbono, PlazoCredito, ICredito } from '../interfaces/credito.interface';


export class CreditoModel {

  static calcularFechaVencimiento(plazo: PlazoCredito): string {
    const fecha = new Date();
    switch (plazo) {
      case '1_semana':    fecha.setDate(fecha.getDate() + 7);   break;
      case '1_quincena':  fecha.setDate(fecha.getDate() + 15);  break;
      case '2_quincenas': fecha.setDate(fecha.getDate() + 30);  break;
      case '1_mes':       fecha.setMonth(fecha.getMonth() + 1); break;
    }
    return fecha.toISOString().split('T')[0];
  }

  // ─── Crear desde ADMIN → activo directo ──────────────────
  static async crearAdmin(data: ICrearCredito, id_admin: number): Promise<number> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const monto_total = data.productos.reduce((sum, p) => sum + p.subtotal, 0);
      const fecha_vencimiento = CreditoModel.calcularFechaVencimiento(data.plazo);

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO credito
          (id_cliente, nombre_cliente, telefono_cliente,
           monto_total, saldo_pendiente, plazo,
           fecha_vencimiento, estado, id_admin, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?)`,
        [
          data.id_cliente || null,
          data.nombre_cliente,
          data.telefono_cliente,
          monto_total, monto_total,
          data.plazo, fecha_vencimiento,
          id_admin,
          data.observaciones || null
        ]
      );

      const id_credito = result.insertId;

      for (const p of data.productos) {
        await connection.execute(
          `INSERT INTO credito_producto
            (id_credito, id_producto, cantidad, precio_unitario, subtotal)
           VALUES (?, ?, ?, ?, ?)`,
          [id_credito, p.id_producto, p.cantidad, p.precio_unitario, p.subtotal]
        );
        // Descontar stock inmediatamente
        await connection.execute(
          `UPDATE producto SET stock = stock - ? WHERE id_producto = ?`,
          [p.cantidad, p.id_producto]
        );
      }

      await connection.commit();
      return id_credito;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ─── Solicitar desde HOME → pendiente ────────────────────
  static async solicitarCliente(data: ICrearCredito, id_cliente: number): Promise<number> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const monto_total = data.productos.reduce((sum, p) => sum + p.subtotal, 0);
      const fecha_vencimiento = CreditoModel.calcularFechaVencimiento(data.plazo);

      // Buscar nombre y teléfono del cliente
      const [cliente] = await connection.execute<RowDataPacket[]>(
        `SELECT nombre, apellido, telefono FROM usuario_rol WHERE id_usuario = ?`,
        [id_cliente]
      );
      if (!cliente.length) throw new Error('Cliente no encontrado');

      const nombre_cliente   = `${cliente[0].nombre} ${cliente[0].apellido}`;
      const telefono_cliente = cliente[0].telefono || data.telefono_cliente || '';

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO credito
          (id_cliente, nombre_cliente, telefono_cliente,
           monto_total, saldo_pendiente, plazo,
           fecha_vencimiento, estado, id_admin, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', 1, ?)`,
        [
          id_cliente,
          nombre_cliente,
          telefono_cliente,
          monto_total, monto_total,
          data.plazo, fecha_vencimiento,
          data.observaciones || null
        ]
      );

      const id_credito = result.insertId;

      // Guardar productos SIN descontar stock todavía
      for (const p of data.productos) {
        await connection.execute(
          `INSERT INTO credito_producto
            (id_credito, id_producto, cantidad, precio_unitario, subtotal)
           VALUES (?, ?, ?, ?, ?)`,
          [id_credito, p.id_producto, p.cantidad, p.precio_unitario, p.subtotal]
        );
      }

      await connection.commit();
      return id_credito;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ─── Aprobar → descuenta stock ────────────────────────────
  static async aprobar(id_credito: number): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE credito SET estado = 'activo' WHERE id_credito = ? AND estado = 'pendiente'`,
        [id_credito]
      );

      const [productos] = await connection.execute<RowDataPacket[]>(
        `SELECT id_producto, cantidad FROM credito_producto WHERE id_credito = ?`,
        [id_credito]
      );

      for (const p of productos) {
        await connection.execute(
          `UPDATE producto SET stock = stock - ? WHERE id_producto = ?`,
          [p.cantidad, p.id_producto]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ─── Rechazar → marca como rechazado ─────────────────────
  static async rechazar(id_credito: number): Promise<void> {
    await pool.execute(
      `UPDATE credito SET estado = 'rechazado' WHERE id_credito = ? AND estado = 'pendiente'`,
      [id_credito]
    );
  }

  // ─── Abonar ───────────────────────────────────────────────
  static async abonar(data: IRegistrarAbono, id_admin: number): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `INSERT INTO credito_abono (id_credito, monto, metodo_pago, id_admin, observacion)
         VALUES (?, ?, ?, ?, ?)`,
        [data.id_credito, data.monto, data.metodo_pago, id_admin, data.observacion || null]
      );

      await connection.execute(
        `UPDATE credito SET saldo_pendiente = saldo_pendiente - ? WHERE id_credito = ?`,
        [data.monto, data.id_credito]
      );

      await connection.execute(
        `UPDATE credito SET estado = 'pagado', saldo_pendiente = 0
         WHERE id_credito = ? AND saldo_pendiente <= 0`,
        [data.id_credito]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ─── Listar ───────────────────────────────────────────────
  static async findAll(filtros?: { estado?: string; busqueda?: string }): Promise<any[]> {
    let query = `
      SELECT c.*,
        GROUP_CONCAT(p.nombre_producto SEPARATOR ', ') AS productos_nombres,
        GROUP_CONCAT(cp.cantidad SEPARATOR ',')         AS productos_cantidades
      FROM credito c
      LEFT JOIN credito_producto cp ON c.id_credito = cp.id_credito
      LEFT JOIN producto p ON cp.id_producto = p.id_producto
      WHERE 1=1`;

    const params: any[] = [];

    if (filtros?.estado) {
      query += ' AND c.estado = ?';
      params.push(filtros.estado);
    }
    if (filtros?.busqueda) {
      query += ' AND (c.nombre_cliente LIKE ? OR c.telefono_cliente LIKE ?)';
      params.push(`%${filtros.busqueda}%`, `%${filtros.busqueda}%`);
    }

    query += ' GROUP BY c.id_credito ORDER BY c.fecha_creacion DESC';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows;
  }

  // ─── Detalle ──────────────────────────────────────────────
  static async findById(id: number): Promise<any> {
    const [credito] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM credito WHERE id_credito = ?`,
      [id]
    );
    if (!credito.length) return null;

    const [productos] = await pool.execute<RowDataPacket[]>(
      `SELECT cp.*, p.nombre_producto, p.imagen, p.codigo_producto
       FROM credito_producto cp
       JOIN producto p ON cp.id_producto = p.id_producto
       WHERE cp.id_credito = ?`,
      [id]
    );

    const [abonos] = await pool.execute<RowDataPacket[]>(
      `SELECT ca.*, u.nombre AS nombre_admin
       FROM credito_abono ca
       JOIN usuario_rol u ON ca.id_admin = u.id_usuario
       WHERE ca.id_credito = ?
       ORDER BY ca.fecha DESC`,
      [id]
    );

    return { ...credito[0], productos, abonos };
  }

  // ─── Email del cliente ────────────────────────────────────
  static async getClienteEmail(id_cliente: number): Promise<string | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT correo_electronico FROM usuario_rol WHERE id_usuario = ?`,
      [id_cliente]
    );
    return (rows as any)[0]?.correo_electronico ?? null;
  }

  // ─── Vencidos (cron) ──────────────────────────────────────
  static async actualizarVencidos(): Promise<void> {
    await pool.execute(
      `UPDATE credito SET estado = 'vencido'
       WHERE estado = 'activo'
       AND fecha_vencimiento < CURDATE()
       AND saldo_pendiente > 0`
    );
  }
  static async findByCliente(id_cliente: number): Promise<any[]> {
    const [creditos] = await pool.execute<RowDataPacket[]>(
      `SELECT c.*,
         GROUP_CONCAT(p.nombre_producto SEPARATOR ', ') AS productos_nombres
       FROM credito c
       LEFT JOIN credito_producto cp ON c.id_credito = cp.id_credito
       LEFT JOIN producto p ON cp.id_producto = p.id_producto
       WHERE c.id_cliente = ?
       GROUP BY c.id_credito
       ORDER BY c.fecha_creacion DESC`,
      [id_cliente]
    );

    const result = [];
    for (const credito of creditos) {
      const [productos] = await pool.execute<RowDataPacket[]>(
        `SELECT cp.id_producto, cp.cantidad, cp.precio_unitario, cp.subtotal,
                p.nombre_producto, p.imagen, p.codigo_producto
         FROM credito_producto cp
         JOIN producto p ON cp.id_producto = p.id_producto
         WHERE cp.id_credito = ?`,
        [credito.id_credito]
      );
      result.push({ ...credito, productos });
    }
    return result;
  }
}