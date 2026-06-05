import { pool } from '../database/connection';
import { IHorarioBarberia, IHorarioExcepcion } from '../interfaces/horario.interface';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export class HorarioModel {

  // ─── Horario barbería ─────────────────────────────────────
  static async getHorarioBarberia(): Promise<IHorarioBarberia[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM horario_barberia ORDER BY dia_semana ASC'
    );
    return rows as IHorarioBarberia[];
  }

  static async updateDia(dia_semana: number, data: Partial<IHorarioBarberia>): Promise<boolean> {
    const campos: string[] = [];
    const valores: any[] = [];

    if (data.hora_inicio !== undefined) { campos.push('hora_inicio = ?'); valores.push(data.hora_inicio); }
    if (data.hora_fin !== undefined) { campos.push('hora_fin = ?'); valores.push(data.hora_fin); }
    if (data.activo !== undefined) { campos.push('activo = ?'); valores.push(data.activo); }

    if (campos.length === 0) return false;
    valores.push(dia_semana);

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE horario_barberia SET ${campos.join(', ')} WHERE dia_semana = ?`,
      valores
    );
    return result.affectedRows > 0;
  }

  // ─── Excepciones por barbero ──────────────────────────────
  static async getExcepcionesBarbero(id_usuario: number): Promise<IHorarioExcepcion[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM horario_excepcion WHERE id_usuario = ? ORDER BY dia_semana ASC, hora_inicio ASC',
      [id_usuario]
    );
    return rows as IHorarioExcepcion[];
  }

  static async createExcepcion(data: IHorarioExcepcion): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO horario_excepcion (id_usuario, dia_semana, hora_inicio, hora_fin, motivo)
       VALUES (?, ?, ?, ?, ?)`,
      [data.id_usuario, data.dia_semana, data.hora_inicio, data.hora_fin, data.motivo]
    );
    return result.insertId;
  }

  static async updateExcepcion(id_excepcion: number, id_usuario: number, data: Partial<IHorarioExcepcion>): Promise<boolean> {
    const campos: string[] = [];
    const valores: any[] = [];

    if (data.dia_semana  !== undefined) { campos.push('dia_semana = ?');  valores.push(data.dia_semana); }
    if (data.hora_inicio !== undefined) { campos.push('hora_inicio = ?'); valores.push(data.hora_inicio); }
    if (data.hora_fin    !== undefined) { campos.push('hora_fin = ?');    valores.push(data.hora_fin); }
    if (data.motivo      !== undefined) { campos.push('motivo = ?');      valores.push(data.motivo); }

    if (campos.length === 0) return false;
    valores.push(id_excepcion, id_usuario);

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE horario_excepcion SET ${campos.join(', ')} WHERE id_excepcion = ? AND id_usuario = ?`,
      valores
    );
    return result.affectedRows > 0;
  }

  static async deleteExcepcion(id_excepcion: number, id_usuario: number): Promise<boolean> {
    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM horario_excepcion WHERE id_excepcion = ? AND id_usuario = ?',
      [id_excepcion, id_usuario]
    );
    return result.affectedRows > 0;
  }

  static async getHorarioCompleto(id_usuario: number): Promise<any[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        h.dia_semana, h.hora_inicio, h.hora_fin, h.activo,
        JSON_ARRAYAGG(
          IF(e.id_excepcion IS NOT NULL,
            JSON_OBJECT(
              'id_excepcion', e.id_excepcion,
              'hora_inicio', e.hora_inicio,
              'hora_fin', e.hora_fin,
              'motivo', e.motivo
            ),
            NULL
          )
        ) as excepciones
       FROM horario_barberia h
       LEFT JOIN horario_excepcion e 
         ON e.id_usuario = ? AND e.dia_semana = h.dia_semana
       GROUP BY h.dia_semana, h.hora_inicio, h.hora_fin, h.activo
       ORDER BY h.dia_semana ASC`,
      [id_usuario]
    );
    return rows.map((r: any) => ({
      ...r,
      excepciones: JSON.parse(r.excepciones).filter((e: any) => e !== null)
    }));
  }
}