import { Router } from 'express';
import { ReporteController } from '../controllers/reporte.controller';
import { verificarToken, verificarRol } from '../middlewares/auth.middleware';

const router = Router();

router.get('/completo',  verificarToken, verificarRol('admin'), ReporteController.getCompleto);
router.get('/diario',    verificarToken, verificarRol('admin'), ReporteController.getDiario);
router.get('/pdf',       verificarToken, verificarRol('admin'), ReporteController.exportarPDF);
router.get('/excel',     verificarToken, verificarRol('admin'), ReporteController.exportarExcel);

export default router;
