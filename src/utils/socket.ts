import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import logger from './logger';

let io: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  const allowedOrigins = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL]
    : ['http://localhost:4200'];

  io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    transports: ['websocket', 'polling'],
  });

  // Validar token JWT en cada conexión
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Sin token'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
      socket.data.usuario = decoded;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const { rol, id_usuario } = socket.data.usuario || {};
    if (rol === 'admin')    socket.join('admin');
    if (rol === 'barbero')  socket.join(`barbero-${id_usuario}`);
    if (rol === 'cliente')  socket.join(`cliente-${id_usuario}`);
    logger.info(`Socket conectado: rol=${rol} id=${id_usuario}`);

    socket.on('disconnect', () => {
      logger.info(`Socket desconectado: rol=${rol} id=${id_usuario}`);
    });
  });

  return io;
}

export function emitirReservaEvento(evento: string, data: {
  id_reserva?: number;
  id_barbero?: number;
  id_cliente?: number;
  estado?: string;
}): void {
  if (!io) return;
  io.to('admin').emit(evento, data);
  if (data.id_barbero) io.to(`barbero-${data.id_barbero}`).emit(evento, data);
  if (data.id_cliente) io.to(`cliente-${data.id_cliente}`).emit(evento, data);
}

export function emitirAdminEvento(evento: string, data: Record<string, unknown> = {}): void {
  if (!io) return;
  io.to('admin').emit(evento, data);
}
