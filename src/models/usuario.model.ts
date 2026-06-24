import { pool } from '../database/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import bcrypt from 'bcrypt';

export class UsuarioModel {

  // Buscar cliente por nombre, teléfono o correo
  static async buscarClientes(termino: string): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.correo_electronico, u.telefono, u.observaciones, u.estado,
        (SELECT s.nombre_servicio
         FROM reserva r
         JOIN reserva_servicio rs ON r.id_reserva = rs.id_reserva
         JOIN servicio s ON rs.id_servicio = s.id_servicio
         WHERE r.id_cliente = u.id_usuario AND r.estado = 'completada'
         GROUP BY s.id_servicio ORDER BY COUNT(*) DESC LIMIT 1
        ) AS servicio_frecuente
       FROM usuario_rol u
       WHERE u.rol = 'cliente'
       AND (
         u.nombre LIKE ? OR
         u.apellido LIKE ? OR
         u.telefono LIKE ? OR
         u.correo_electronico LIKE ?
       )`,
      [`%${termino}%`, `%${termino}%`, `%${termino}%`, `%${termino}%`]
    );
    return rows;
  }

  // Obtener todos los clientes
  static async findAllClientes(): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.correo_electronico, u.telefono, u.observaciones, u.estado, u.fecha_creacion,
        (SELECT s.nombre_servicio
         FROM reserva r
         JOIN reserva_servicio rs ON r.id_reserva = rs.id_reserva
         JOIN servicio s ON rs.id_servicio = s.id_servicio
         WHERE r.id_cliente = u.id_usuario AND r.estado = 'completada'
         GROUP BY s.id_servicio ORDER BY COUNT(*) DESC LIMIT 1
        ) AS servicio_frecuente
       FROM usuario_rol u
       WHERE u.rol = 'cliente'
       ORDER BY u.nombre ASC`
    );
    return rows;
  }

  // Actualizar datos del cliente
  static async updateCliente(id: number, data: any): Promise<boolean> {
    const campos: string[] = [];
    const valores: any[] = [];

    if (data.nombre !== undefined) { campos.push('nombre = ?'); valores.push(data.nombre); }
    if (data.apellido !== undefined) { campos.push('apellido = ?'); valores.push(data.apellido); }
    if (data.telefono !== undefined) { campos.push('telefono = ?'); valores.push(data.telefono); }
    if (data.observaciones !== undefined) { campos.push('observaciones = ?'); valores.push(data.observaciones); }

    if (campos.length === 0) return false;

    valores.push(id);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE usuario_rol SET ${campos.join(', ')} WHERE id_usuario = ? AND rol = 'cliente'`,
      valores
    );
    return result.affectedRows > 0;
  }

  // Contar cortes del cliente (reservas completadas + cortes presenciales)
  static async contarCortes(id_cliente: number): Promise<number> {
    const [reservas] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM reserva
       WHERE id_cliente = ? AND estado = 'completada'`,
      [id_cliente]
    );

    const [presenciales] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM corte_presencial
       WHERE id_cliente = ?`,
      [id_cliente]
    );

    return reservas[0].total + presenciales[0].total;
  }

  // Registrar corte presencial
  static async registrarCortePresencial(id_cliente: number, id_barbero: number, valor_cobrado: number, descuento: boolean): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO corte_presencial (id_cliente, id_barbero, valor_cobrado, descuento_aplicado)
       VALUES (?, ?, ?, ?)`,
      [id_cliente, id_barbero, valor_cobrado, descuento ? 1 : 0]
    );
    return result.insertId;
  }
  static async findByRol(rol: string): Promise<any[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
      u.id_usuario, u.nombre, u.apellido, u.foto, u.titulo, u.especialidades, u.descripcion, u.experiencia,u.comision,
      COALESCE(COUNT(DISTINCT r.id_reserva), 0) as total_agendamientos,
      COALESCE(AVG(res.calificacion), 0) as promedio_estrellas,
      COUNT(DISTINCT res.id_resena) as total_resenas
     FROM usuario_rol u
     LEFT JOIN reserva r ON r.id_barbero = u.id_usuario 
       AND r.estado NOT IN ('cancelada')
     LEFT JOIN resena res ON res.id_barbero = u.id_usuario
     WHERE u.rol = ? AND u.estado = 'activo'
     GROUP BY u.id_usuario, u.nombre, u.apellido, u.foto, u.titulo, u.especialidades, u.descripcion, u.experiencia`,
      [rol]
    );
    return rows as any[];
  }
  static async findById(id: number): Promise<any> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM usuario_rol WHERE id_usuario = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async crearBarbero(data: any): Promise<any> {
    if (!data.nombre || !data.apellido || !data.correo_electronico || !data.contrasena) {
      throw new Error('Nombre, apellido, correo y contraseña son obligatorios');
    }
    const [existe] = await pool.execute<RowDataPacket[]>(
      'SELECT id_usuario FROM usuario_rol WHERE correo_electronico = ?',
      [data.correo_electronico]
    );
    if ((existe as RowDataPacket[]).length > 0) {
      throw new Error('Ya existe un usuario con ese correo electrónico');
    }
    const hash = await bcrypt.hash(data.contrasena, 12);
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO usuario_rol (nombre, apellido, correo_electronico, contrasena, rol, titulo, descripcion, foto,experiencia,especialidades,comision)
     VALUES (?, ?, ?, ?, 'barbero', ?, ?, ?, ?, ?, ?)`,
      [data.nombre, data.apellido, data.correo_electronico, hash, data.titulo || null, data.descripcion || null, data.foto || null, data.experiencia ?? 0, data.especialidades || null, data.comision ?? null]
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM usuario_rol WHERE id_usuario = ?',
      [result.insertId]
    );
    return rows[0];
  }

  static async actualizarBarbero(id: number, data: any): Promise<any> {
    const campos: string[] = [];
    const valores: any[] = [];

    if (data.nombre !== undefined) { campos.push('nombre = ?'); valores.push(data.nombre); }
    if (data.apellido !== undefined) { campos.push('apellido = ?'); valores.push(data.apellido); }
    if (data.titulo !== undefined) { campos.push('titulo = ?'); valores.push(data.titulo); }
    if (data.descripcion !== undefined) { campos.push('descripcion = ?'); valores.push(data.descripcion); }
    if (data.foto !== undefined) { campos.push('foto = ?'); valores.push(data.foto); }
    if (data.estado !== undefined) { campos.push('estado = ?'); valores.push(data.estado); }
    if (data.experiencia !== undefined) { campos.push('experiencia = ?'); valores.push(data.experiencia); }
    if (data.especialidades !== undefined) { campos.push('especialidades = ?'); valores.push(data.especialidades); }
    if (data.comision !== undefined) { campos.push('comision = ?'); valores.push(data.comision); }

    if (campos.length === 0) throw new Error('No hay campos para actualizar');

    valores.push(id);
    await pool.execute(
      `UPDATE usuario_rol SET ${campos.join(', ')} WHERE id_usuario = ?`,
      valores
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM usuario_rol WHERE id_usuario = ?',
      [id]
    );
    return rows[0];
  }

  static async findAllBarberos(): Promise<any[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
      u.id_usuario, u.nombre, u.apellido, u.foto, u.titulo, u.descripcion, u.experiencia, u.estado,u.especialidades,u.comision,
      COALESCE(COUNT(DISTINCT r.id_reserva), 0) as total_agendamientos,
      COALESCE(AVG(res.calificacion), 0) as promedio_estrellas,
      COUNT(DISTINCT res.id_resena) as total_resenas
     FROM usuario_rol u
     LEFT JOIN reserva r ON r.id_barbero = u.id_usuario 
       AND r.estado NOT IN ('cancelada')
     LEFT JOIN resena res ON res.id_barbero = u.id_usuario
     WHERE u.rol = 'barbero'
     GROUP BY u.id_usuario
     ORDER BY u.estado ASC, u.nombre ASC`
    );
    return rows as any[];
  }
}