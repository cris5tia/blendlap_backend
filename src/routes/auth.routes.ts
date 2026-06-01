import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { verificarToken } from '../middlewares/auth.middleware';
import { uploadCliente } from '../middlewares/upload.middleware';

const router = Router();

router.post('/login', AuthController.login);
router.post('/registro', AuthController.registro);
router.post('/solicitar-verificacion-registro', AuthController.solicitarVerificacionRegistro);
router.post('/completar-registro', AuthController.completarRegistro);
router.get('/perfil', verificarToken, AuthController.perfil);
router.put('/cambiar-password', AuthController.cambiarPassword);
router.post('/solicitar-recuperacion', AuthController.solicitarRecuperacion);
router.post('/resetear-password', AuthController.resetearPassword);
router.post('/logout', verificarToken, (req, res) => {
  res.status(200).json({ ok: true, mensaje: 'Sesión cerrada correctamente' });
});
router.post('/google', AuthController.loginConGoogle);
router.get('/mi-perfil', verificarToken, AuthController.obtenerMiPerfil);
router.put('/mi-perfil', verificarToken, uploadCliente.single('foto'), AuthController.actualizarMiPerfil);
export default router;