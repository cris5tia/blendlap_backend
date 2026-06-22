import { Router } from 'express';
import { verificarToken, verificarRol } from '../middlewares/auth.middleware';
import { ChatController } from '../controllers/chat.controller';

const router = Router();

// Visitantes (sin cuenta): productos, servicios, barberos, FAQ
router.post('/public', ChatController.chatPublic);

// Cliente logueado: incluye agendar citas y ver reservas
router.post('/', verificarToken, verificarRol('cliente'), ChatController.chat);

export default router;
