import dotenv from 'dotenv';
import express, { Application } from 'express';
import cors from 'cors';
import { testConnection } from './database/connection';
import { iniciarCronJobs } from './utils/cron';
import logger from './utils/logger';
import authRoutes from './routes/auth.routes';
import servicioRoutes from './routes/servicio.routes';
import reservaRoutes from './routes/reserva.routes';
import usuarioRoutes from './routes/usuario.routes';
import clienteRoutes from './routes/cliente.routes';
import turnoRoutes from './routes/turno.routes';
import productoRoutes from './routes/producto.routes';
import ventaRoutes from './routes/venta.routes';
import reporteRoutes from './routes/reporte.routes';
import path from 'path';
import resenaRoutes from './routes/resena.routes';
import dashboardRoutes from './routes/dashboard.routes';
import gastoRoutes from './routes/gasto.routes';
import horarioRoutes from './routes/horario.routes';
import statsRoutes from './routes/stats.routes';
import creditoRoutes from './routes/credito.routes';
import pagoRoutes from './routes/pago.routes';
import { PagoModel } from './models/pago.model';

dotenv.config();

const app: Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/servicios', servicioRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/turnos', turnoRoutes);
app.use('/api/productos', productoRoutes);
app.use('/api/ventas', ventaRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/images', express.static(path.join(__dirname, '../public/images')));
app.use('/api/resenas', resenaRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/gastos', gastoRoutes);
app.use('/api/horarios', horarioRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/creditos', creditoRoutes);
app.use('/api/pagos', pagoRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    message: 'Servidor funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  await testConnection();
  await PagoModel.inicializarTabla();
  iniciarCronJobs();
  logger.info(`Servidor corriendo en http://localhost:${PORT}`);
  logger.info(`Ambiente: ${process.env.NODE_ENV}`);
});

export default app;
