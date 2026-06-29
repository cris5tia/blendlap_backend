import { Router } from 'express';
import { ReservaController } from '../controllers/reserva.controller';
import { verificarToken, verificarRol } from '../middlewares/auth.middleware';

const router = Router();

// Rutas públicas
router.get('/disponibilidad', ReservaController.getDisponibilidad);

// Rutas barbero — ANTES de /:id
router.get('/barbero/hoy', verificarToken, verificarRol('barbero'), ReservaController.getCitasHoy);
router.get('/barbero/proximas', verificarToken, verificarRol('barbero'), ReservaController.getProximas);
router.get('/barbero/por-fecha', verificarToken, verificarRol('barbero'), ReservaController.getByFecha);
router.post('/barbero/registrar-presencial', verificarToken, verificarRol('barbero'), ReservaController.registrarPresencial);

// Rutas cliente
router.get('/mis-reservas', verificarToken, verificarRol('cliente'), ReservaController.getMisReservas);
router.get('/mis-servicios', verificarToken, verificarRol('barbero'), ReservaController.getMisServicios);

// Rutas admin
router.get('/', verificarToken, verificarRol('admin'), ReservaController.getAll);
router.get('/:id', verificarToken, verificarRol('admin', 'barbero'), ReservaController.getById);
router.post('/', verificarToken, verificarRol('admin', 'cliente'), ReservaController.create);
router.put('/:id', verificarToken, ReservaController.update);
router.delete('/:id', verificarToken, verificarRol('admin'), ReservaController.delete);

export default router;