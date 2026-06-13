import { Router } from 'express';
import { NotificacionController } from '../controllers/notificacion.controller';
import { verificarToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/vapid-public-key', NotificacionController.getPublicKey);
router.post('/suscripciones', verificarToken, NotificacionController.guardarSuscripcion);
router.post('/probar', verificarToken, NotificacionController.probar);

export default router;
