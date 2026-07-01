import { Router } from 'express';
import { PagoController } from '../controllers/pago.controller';
import { verificarToken } from '../middlewares/auth.middleware';

const router = Router();

router.post('/iniciar',                  verificarToken, PagoController.iniciarPago);
router.get('/mis-compras',               verificarToken, PagoController.getMisCompras);
router.get('/verificar/:transactionId',  PagoController.verificarPago);

export default router;
