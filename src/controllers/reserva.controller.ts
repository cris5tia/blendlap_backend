import { Request, Response } from 'express';
import { ReservaService } from '../services/reserva.service';
import { ReservaModel } from '../models/reserva.model';
import { pool } from '../database/connection';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import bcrypt from 'bcrypt';
import { NotificacionService } from '../services/notificacion.service';

const getFechaColombia = (): string => {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
};

export class ReservaController {

    // GET /api/reservas → solo admin
    static async getAll(req: Request, res: Response): Promise<void> {
        try {
            const { fecha, id_barbero, estado } = req.query;
            const reservas = await ReservaService.getAll({
                fecha: fecha as string,
                id_barbero: id_barbero as string,
                estado: estado as string
            });
            res.status(200).json({ ok: true, data: reservas });
        } catch (error: any) {
            res.status(500).json({ ok: false, mensaje: error.message });
        }
    }

    // GET /api/reservas/:id
    static async getById(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const reserva = await ReservaService.getById(id);
            res.status(200).json({ ok: true, data: reserva });
        } catch (error: any) {
            res.status(404).json({ ok: false, mensaje: error.message });
        }
    }

    // GET /api/reservas/mis-reservas → cliente ve sus reservas
    static async getMisReservas(req: Request, res: Response): Promise<void> {
        try {
            const id_cliente = req.usuario!.id_usuario;
            const reservas = await ReservaService.getMisReservas(id_cliente);
            res.status(200).json({ ok: true, data: reservas });
        } catch (error: any) {
            res.status(500).json({ ok: false, mensaje: error.message });
        }
    }

    // GET /api/reservas/mis-servicios → barbero ve sus reservas
    static async getMisServicios(req: Request, res: Response): Promise<void> {
        try {
            const id_barbero = req.usuario!.id_usuario;
            const reservas = await ReservaService.getMisServicios(id_barbero);
            res.status(200).json({ ok: true, data: reservas });
        } catch (error: any) {
            res.status(500).json({ ok: false, mensaje: error.message });
        }
    }

    // POST /api/reservas
    static async create(req: Request, res: Response): Promise<void> {
        try {
            const reserva = await ReservaService.create(req.body);
            void NotificacionService.enviarReservaCreada(reserva);
            res.status(201).json({ ok: true, data: reserva });
        } catch (error: any) {
            res.status(400).json({ ok: false, mensaje: error.message });
        }
    }

    // PUT /api/reservas/:id
    static async update(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const { rol, id_usuario } = req.usuario!;
            const reserva = await ReservaService.update(id, req.body, rol, id_usuario);
            res.status(200).json({ ok: true, data: reserva });
        } catch (error: any) {
            res.status(400).json({ ok: false, mensaje: error.message });
        }
    }

    // DELETE /api/reservas/:id → solo admin
    static async delete(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const resultado = await ReservaService.delete(id);
            res.status(200).json({ ok: true, ...resultado });
        } catch (error: any) {
            res.status(404).json({ ok: false, mensaje: error.message });
        }
    }
    // GET /api/reservas/disponibilidad?id_barbero=2&fecha=2025-06-01
    static async getDisponibilidad(req: Request, res: Response): Promise<void> {
        try {
            const id_barbero = parseInt(req.query.id_barbero as string);
            const fecha = req.query.fecha as string;
            const duracion_total = parseInt(req.query.duracion_total as string) || 30;
            const resultado = await ReservaService.getDisponibilidad(id_barbero, fecha, duracion_total);
            res.status(200).json({ ok: true, data: resultado });
        } catch (error: any) {
            res.status(400).json({ ok: false, mensaje: error.message });
        }
    }
    static async getCitasHoy(req: Request, res: Response): Promise<void> {
        try {
            const id_barbero = req.usuario!.id_usuario;
            const hoy = getFechaColombia();
            const reservas = await ReservaModel.findByBarberoFecha(id_barbero, hoy);
            res.status(200).json({ ok: true, data: reservas });
        } catch (error: any) {
            res.status(500).json({ ok: false, mensaje: error.message });
        }
    }

    static async getProximas(req: Request, res: Response): Promise<void> {
        try {
            const id_barbero = req.usuario!.id_usuario;
            const hoy = getFechaColombia();
            const reservas = await ReservaModel.findProximasBarbero(id_barbero, hoy);
            res.status(200).json({ ok: true, data: reservas });
        } catch (error: any) {
            res.status(500).json({ ok: false, mensaje: error.message });
        }
    }

    static async registrarPresencial(req: Request, res: Response): Promise<void> {
        try {
            const id_barbero = req.usuario!.id_usuario;
            const { nombre, apellido, id_servicio, fecha, hora } = req.body;

            if (!nombre || !apellido || !id_servicio || !fecha || !hora) {
                res.status(400).json({ ok: false, mensaje: 'Todos los campos son requeridos' });
                return;
            }

            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();

                // 1. Crear cliente temporal
                const correo = `presencial_${Date.now()}@blendlap.local`;
                const hash = await bcrypt.hash('temporal123', 10);

                const [clienteResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO usuario_rol (nombre, apellido, correo_electronico, contrasena, rol, estado)
         VALUES (?, ?, ?, ?, 'cliente', 'activo')`,
                    [nombre, apellido, correo, hash]
                );
                const id_cliente = clienteResult.insertId;

                // 2. Crear reserva
                const [reservaResult] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO reserva (id_cliente, id_barbero, fecha, hora, estado)
         VALUES (?, ?, ?, ?, 'completada')`,
                    [id_cliente, id_barbero, fecha, hora]
                );
                const id_reserva = reservaResult.insertId;

                // 3. Obtener precio del servicio
                const [servicios] = await connection.execute<RowDataPacket[]>(
                    `SELECT precio FROM servicio WHERE id_servicio = ?`,
                    [id_servicio]
                );
                const precio = servicios[0]?.precio || 0;

                // 4. Crear reserva_servicio
                await connection.execute(
                    `INSERT INTO reserva_servicio (id_reserva, id_servicio, precio_cobrado)
         VALUES (?, ?, ?)`,
                    [id_reserva, id_servicio, precio]
                );

                await connection.commit();

                res.status(201).json({
                    ok: true,
                    mensaje: 'Cita registrada correctamente',
                    data: { id_reserva, id_cliente }
                });

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

        } catch (error: any) {
            res.status(500).json({ ok: false, mensaje: error.message });
        }
    }
}
