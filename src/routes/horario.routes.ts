import { Router } from 'express';
import { HorarioController } from '../controllers/horario.controller';
import { verificarToken, verificarRol } from '../middlewares/auth.middleware';

const router = Router();

// Pública — para calcular disponibilidad
router.get('/', HorarioController.getHorarioBarberia);
router.get('/barbero/:id', HorarioController.getHorarioCompleto);

// Admin — modificar horario general
router.put('/dia/:dia', verificarToken, verificarRol('admin'), HorarioController.updateDia);

// Barbero — sus propias excepciones
router.post('/excepciones',       verificarToken, verificarRol('barbero'), HorarioController.createExcepcion);
router.put('/excepciones/:id',    verificarToken, verificarRol('barbero'), HorarioController.updateExcepcion);
router.delete('/excepciones/:id', verificarToken, verificarRol('barbero'), HorarioController.deleteExcepcion);
router.get('/mis-excepciones',    verificarToken, verificarRol('barbero'), HorarioController.getMisExcepciones);

export default router;