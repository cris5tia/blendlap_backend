import { pool } from '../database/connection';
import { IUsuarioRol, IRegistroPayload } from '../interfaces/auth.interface';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export class AuthModel {

    // Buscar usuario por correo
    static async findByCorreo(correo: string): Promise<IUsuarioRol | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM usuario_rol WHERE correo_electronico = ? AND estado = "activo"',
            [correo]
        );
        return rows.length > 0 ? (rows[0] as IUsuarioRol) : null;
    }

    // Buscar usuario por ID
    static async findById(id: number): Promise<IUsuarioRol | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM usuario_rol WHERE id_usuario = ?',
            [id]
        );
        return rows.length > 0 ? (rows[0] as IUsuarioRol) : null;
    }

    // Crear nuevo usuario
    static async create(data: IRegistroPayload & { contrasena_hash: string }): Promise<number> {
        const [result] = await pool.execute<ResultSetHeader>(
            `INSERT INTO usuario_rol (nombre, apellido, correo_electronico, contrasena, rol, telefono, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [data.nombre, data.apellido, data.correo_electronico, data.contrasena_hash, data.rol, data.telefono || null, data.observaciones || null]
        );
        return result.insertId;
    }
    // Guardar código de recuperación
    static async guardarCodigo(id_usuario: number, codigo: string, expiracion: Date): Promise<void> {
        // Eliminar códigos anteriores del usuario
        await pool.execute(
            'DELETE FROM recuperacion_contrasena WHERE id_usuario = ?',
            [id_usuario]
        );
        // Insertar nuevo código
        await pool.execute(
            `INSERT INTO recuperacion_contrasena (id_usuario, codigo, expiracion)
     VALUES (?, ?, ?)`,
            [id_usuario, codigo, expiracion]
        );
    }

    // Verificar código
    static async verificarCodigo(correo: string, codigo: string): Promise<boolean> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT rc.* FROM recuperacion_contrasena rc
     JOIN usuario_rol u ON rc.id_usuario = u.id_usuario
     WHERE u.correo_electronico = ?
     AND rc.codigo = ?
     AND rc.usado = 0
     AND rc.expiracion > NOW()`,
            [correo, codigo]
        );
        return rows.length > 0;
    }

    // Marcar código como usado
    static async marcarCodigoUsado(correo: string, codigo: string): Promise<void> {
        await pool.execute(
            `UPDATE recuperacion_contrasena rc
     JOIN usuario_rol u ON rc.id_usuario = u.id_usuario
     SET rc.usado = 1
     WHERE u.correo_electronico = ? AND rc.codigo = ?`,
            [correo, codigo]
        );
    }
    // Cambiar rol de usuario
    static async cambiarRol(id_usuario: number, rol: string): Promise<boolean> {
        const [result] = await pool.execute<ResultSetHeader>(
            'UPDATE usuario_rol SET rol = ? WHERE id_usuario = ?',
            [rol, id_usuario]
        );
        return result.affectedRows > 0;
    }

    // Cambiar estado de usuario
    static async cambiarEstado(id_usuario: number, estado: string): Promise<boolean> {
        const [result] = await pool.execute<ResultSetHeader>(
            'UPDATE usuario_rol SET estado = ? WHERE id_usuario = ?',
            [estado, id_usuario]
        );
        return result.affectedRows > 0;
    }

  static async obtenerPerfil(id: number): Promise<any> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id_usuario, nombre, apellido, correo_electronico, telefono, foto, rol FROM usuario_rol WHERE id_usuario = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async actualizarPerfil(id: number, data: { nombre?: string; apellido?: string; telefono?: string; foto?: string | null }): Promise<boolean> {
    const campos: string[] = [];
    const valores: any[] = [];
    if (data.nombre !== undefined) { campos.push('nombre = ?'); valores.push(data.nombre); }
    if (data.apellido !== undefined) { campos.push('apellido = ?'); valores.push(data.apellido); }
    if (data.telefono !== undefined) { campos.push('telefono = ?'); valores.push(data.telefono); }
    if (data.foto !== undefined) { campos.push('foto = ?'); valores.push(data.foto); }
    if (campos.length === 0) return false;
    valores.push(id);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE usuario_rol SET ${campos.join(', ')} WHERE id_usuario = ?`,
      valores
    );
    return result.affectedRows > 0;
  }

    // Obtener todos los usuarios
    static async findAll(): Promise<IUsuarioRol[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT id_usuario, nombre, apellido, correo_electronico, rol, estado, fecha_creacion FROM usuario_rol'
        );
        return rows as IUsuarioRol[];
    }
    // Buscar por Google ID
static async findByGoogleId(google_id: string): Promise<IUsuarioRol | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM usuario_rol WHERE google_id = ? AND estado = "activo"',
    [google_id]
  );
  return rows.length > 0 ? (rows[0] as IUsuarioRol) : null;
}

// Crear usuario con Google
static async createConGoogle(data: any): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO usuario_rol (nombre, apellido, correo_electronico, contrasena, rol, google_id)
     VALUES (?, ?, ?, NULL, 'cliente', ?)`,
    [data.nombre, data.apellido, data.correo_electronico, data.google_id]
  );
  return result.insertId;
}
}