import { Router } from 'express';
import { NotificacionController } from '../controllers/notificacion.controller';
import { verificarToken, verificarRol } from '../middlewares/auth.middleware';

const router = Router();

router.get('/vapid-key', NotificacionController.getVapidKey);
router.post('/suscribir',  verificarToken, verificarRol('cliente'), NotificacionController.suscribir);
router.delete('/suscribir', verificarToken, verificarRol('cliente'), NotificacionController.desuscribir);

export default router;
