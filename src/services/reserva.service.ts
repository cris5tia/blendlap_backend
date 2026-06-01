import { ReservaModel } from '../models/reserva.model';
import { AuthModel } from '../models/auth.model';
import { ICrearReserva, IActualizarReserva } from '../interfaces/reserva.interface';
import { pool } from '../database/connection';
import { RowDataPacket } from 'mysql2';

export class ReservaService {

  static async getAll(filtros?: { fecha?: string; id_barbero?: string; estado?: string }) {
    return await ReservaModel.findAll(filtros);
  }

  static async getById(id: number) {
    const reserva = await ReservaModel.findById(id);
    if (!reserva) throw new Error('Reserva no encontrada');
    return reserva;
  }

  static async getMisReservas(id_cliente: number) {
    return await ReservaModel.findByCliente(id_cliente);
  }

  static async getMisServicios(id_barbero: number) {
    return await ReservaModel.findByBarbero(id_barbero);
  }

  static async create(data: ICrearReserva) {
    const cliente = await AuthModel.findById(data.id_cliente);
    if (!cliente || cliente.rol !== 'cliente') {
      throw new Error('El cliente no existe o no tiene rol de cliente');
    }

    const barbero = await AuthModel.findById(data.id_barbero);
    if (!barbero || barbero.rol !== 'barbero') {
      throw new Error('El barbero no existe o no tiene rol de barbero');
    }

    if (data.id_cliente === data.id_barbero) {
      throw new Error('El cliente y el barbero no pueden ser la misma persona');
    }

    const disponible = await ReservaModel.checkDisponibilidad(
      data.id_barbero, data.fecha, data.hora
    );
    if (!disponible) {
      throw new Error('El barbero no está disponible en esa fecha y hora');
    }

    // Diagnóstico: ver qué hay en la DB antes de insertar
    const [debugRows] = await pool.execute<any[]>(
      `SELECT id_reserva, id_cliente, estado FROM reserva
       WHERE id_barbero = ? AND fecha = ? AND hora = ?`,
      [data.id_barbero, data.fecha, data.hora]
    );
    if (debugRows.length > 0) {
      console.warn('[RESERVA] Hay filas bloqueando el slot:', JSON.stringify(debugRows));
    }

    try {
      const id_reserva = await ReservaModel.create(data);
      return await ReservaModel.findById(id_reserva);
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('El barbero ya tiene una reserva en esa fecha y hora');
      }
      throw error;
    }
  }

  static async update(id: number, data: IActualizarReserva, usuarioRol: string, usuarioId: number) {
    const reserva = await ReservaModel.findById(id);
    if (!reserva) throw new Error('Reserva no encontrada');

    if (usuarioRol === 'barbero' && reserva.id_barbero !== usuarioId) {
      throw new Error('No puedes modificar una reserva que no pertenece a tu agenda');
    }

    if (usuarioRol === 'cliente') {
      if (reserva.id_cliente !== usuarioId) {
        throw new Error('No puedes modificar una reserva que no es tuya');
      }
      if (data.estado && data.estado !== 'cancelada') {
        throw new Error('Solo puedes cancelar tu reserva');
      }
    }

    if (data.fecha || data.hora) {
      const nuevaFecha = data.fecha || reserva.fecha.toString();
      const nuevaHora = data.hora || reserva.hora;
      const disponible = await ReservaModel.checkDisponibilidad(
        reserva.id_barbero, nuevaFecha, nuevaHora, id
      );
      if (!disponible) {
        throw new Error('El barbero no está disponible en esa fecha y hora');
      }
    }

    await ReservaModel.update(id, data);

    if (data.estado === 'completada' && reserva.estado !== 'completada') {
      await ReservaService.crearVentaAutomatica(id, reserva.id_barbero);
    }

    return await ReservaModel.findById(id);
  }

  private static async crearVentaAutomatica(id_reserva: number, id_barbero: number) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [servicios] = await connection.execute<RowDataPacket[]>(
        `SELECT rs.id_servicio, rs.precio_cobrado, s.nombre_servicio
         FROM reserva_servicio rs
         JOIN servicio s ON rs.id_servicio = s.id_servicio
         WHERE rs.id_reserva = ?`,
        [id_reserva]
      );

      if (servicios.length === 0) {
        await connection.commit();
        return;
      }

      const [ventasExistentes] = await connection.execute<RowDataPacket[]>(
        `SELECT id_venta FROM venta WHERE id_reserva = ? LIMIT 1`,
        [id_reserva]
      );

      if (ventasExistentes.length > 0) {
        await connection.commit();
        return;
      }

      const total = servicios.reduce(
        (sum: number, s: any) => sum + parseFloat(s.precio_cobrado), 0
      );

      const [ventaResult] = await connection.execute<any>(
        `INSERT INTO venta (id_reserva, id_cajero, metodo_pago, total)
         VALUES (?, ?, 'efectivo', ?)`,
        [id_reserva, id_barbero, total]
      );
      const id_venta = ventaResult.insertId;

      for (const servicio of servicios) {
        const precio = parseFloat(servicio.precio_cobrado);
        await connection.execute(
          `INSERT INTO detalle_venta (id_venta, id_producto, cantidad, precio_unitario, subtotal, porcentaje_barbero)
           VALUES (?, NULL, 1, ?, ?, 60)`,
          [id_venta, precio, precio]
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

  static async delete(id: number) {
    const reserva = await ReservaModel.findById(id);
    if (!reserva) throw new Error('Reserva no encontrada');
    await ReservaModel.delete(id);
    return { mensaje: 'Reserva eliminada correctamente' };
  }

  static async getDisponibilidad(id_barbero: number, fecha: string, duracion_total: number = 30) {
    if (!id_barbero || !fecha) {
      throw new Error('id_barbero y fecha son requeridos');
    }

    // ─── Verificar día de semana en horario barbería ───────
    const diaSemana = new Date(fecha + 'T12:00:00').getDay();

    const [horarioBarberia] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM horario_barberia WHERE dia_semana = ?`,
      [diaSemana]
    );

    if (horarioBarberia.length === 0 || horarioBarberia[0].activo === 0) {
      return { id_barbero, fecha, disponible: false, slots: [], motivo: 'La barbería no atiende este día' };
    }

    const horario = horarioBarberia[0];
    const [hiH, hiM] = horario.hora_inicio.split(':').map(Number);
    const [hfH, hfM] = horario.hora_fin.split(':').map(Number);
    const inicio = hiH * 60 + hiM;
    const fin = hfH * 60 + hfM;

    // ─── Verificar turno bloqueado ─────────────────────────
    const [turnos] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM turno WHERE id_usuario = ? AND fecha = ?`,
      [id_barbero, fecha]
    );

    if (turnos.length > 0) {
      return { id_barbero, fecha, disponible: false, slots: [], motivo: 'Barbero no disponible este día' };
    }

    // ─── Reservas existentes ───────────────────────────────
    const [reservas] = await pool.execute<RowDataPacket[]>(
      `SELECT r.hora, COALESCE(SUM(s.duracion), 30) as duracion_reserva
       FROM reserva r
       LEFT JOIN reserva_servicio rs ON r.id_reserva = rs.id_reserva
       LEFT JOIN servicio s ON rs.id_servicio = s.id_servicio
       WHERE r.id_barbero = ? AND r.fecha = ? AND r.estado NOT IN ('cancelada')
       GROUP BY r.id_reserva, r.hora`,
      [id_barbero, fecha]
    );

    const minutosOcupados: Set<number> = new Set();
    for (const reserva of reservas) {
      const [hh, mm] = reserva.hora.split(':').map(Number);
      const inicioMin = hh * 60 + mm;
      const finMin = inicioMin + Number(reserva.duracion_reserva);
      for (let m = inicioMin; m < finMin; m++) {
        minutosOcupados.add(m);
      }
    }

    // ─── Excepciones barbero (almuerzo, descanso, etc) ────
    const [excepciones] = await pool.execute<RowDataPacket[]>(
      `SELECT hora_inicio, hora_fin FROM horario_excepcion
       WHERE id_usuario = ? AND dia_semana = ?`,
      [id_barbero, diaSemana]
    );

    for (const exc of excepciones) {
      const [eHH, eMM] = exc.hora_inicio.split(':').map(Number);
      const [eFH, eFM] = exc.hora_fin.split(':').map(Number);
      const excInicio = eHH * 60 + eMM;
      const excFin = eFH * 60 + eFM;
      for (let m = excInicio; m < excFin; m++) {
        minutosOcupados.add(m);
      }
    }

    // ─── Generar slots ─────────────────────────────────────
    const slots: { hora: string; disponible: boolean }[] = [];

    for (let m = inicio; m + duracion_total <= fin; m += duracion_total) {
      let ocupado = false;
      for (let i = m; i < m + duracion_total; i++) {
        if (minutosOcupados.has(i)) {
          ocupado = true;
          break;
        }
      }
      const h = Math.floor(m / 60).toString().padStart(2, '0');
      const min = (m % 60).toString().padStart(2, '0');
      slots.push({ hora: `${h}:${min}`, disponible: !ocupado });
    }

    return { id_barbero, fecha, disponible: true, slots };
  }
}
