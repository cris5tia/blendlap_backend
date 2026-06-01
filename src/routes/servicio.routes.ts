import { Router } from 'express';
import { ServicioController } from '../controllers/servicio.controller';
import { verificarToken, verificarRol } from '../middlewares/auth.middleware';

const router = Router();

// Rutas públicas
router.get('/', ServicioController.getAll);
router.get('/:id', ServicioController.getById);

// Rutas solo admin
router.post('/', verificarToken, verificarRol('admin'), ServicioController.create);
router.put('/:id', verificarToken, verificarRol('admin'), ServicioController.update);
router.delete('/:id', verificarToken, verificarRol('admin'), ServicioController.delete);

export default router;
