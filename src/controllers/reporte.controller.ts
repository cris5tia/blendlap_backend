import { Request, Response } from 'express';
import { ReporteService } from '../services/reporte.service';

export class ReporteController {

  // GET /api/reportes/completo?fechaInicio=&fechaFin=&id_barbero=
  static async getCompleto(req: Request, res: Response): Promise<void> {
    try {
      const { fechaInicio, fechaFin, id_barbero } = req.query;
      if (!fechaInicio || !fechaFin) {
        res.status(400).json({ ok: false, mensaje: 'fechaInicio y fechaFin son requeridos' });
        return;
      }
      const data = await ReporteService.getReporteCompleto({
        fechaInicio: fechaInicio as string,
        fechaFin: fechaFin as string,
        id_barbero: id_barbero ? parseInt(id_barbero as string) : undefined
      }, req.usuario!.id_usuario);
      res.status(200).json({ ok: true, data });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  // GET /api/reportes/diario?fecha=2026-06-19
  static async getDiario(req: Request, res: Response): Promise<void> {
    try {
      const fecha = req.query.fecha as string || new Date().toISOString().split('T')[0];
      const data = await ReporteService.getReporteDiario(fecha, req.usuario!.id_usuario);
      res.status(200).json({ ok: true, data });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  // GET /api/reportes/pdf?fechaInicio=&fechaFin=
  static async exportarPDF(req: Request, res: Response): Promise<void> {
    try {
      const { fechaInicio, fechaFin, id_barbero } = req.query;
      if (!fechaInicio || !fechaFin) {
        res.status(400).json({ ok: false, mensaje: 'fechaInicio y fechaFin son requeridos' });
        return;
      }
      await ReporteService.exportarPDF(res, {
        fechaInicio: fechaInicio as string,
        fechaFin: fechaFin as string,
        id_barbero: id_barbero ? parseInt(id_barbero as string) : undefined
      }, req.usuario!.id_usuario);
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  // GET /api/reportes/excel?fechaInicio=&fechaFin=
  static async exportarExcel(req: Request, res: Response): Promise<void> {
    try {
      const { fechaInicio, fechaFin, id_barbero } = req.query;
      if (!fechaInicio || !fechaFin) {
        res.status(400).json({ ok: false, mensaje: 'fechaInicio y fechaFin son requeridos' });
        return;
      }
      await ReporteService.exportarExcel(res, {
        fechaInicio: fechaInicio as string,
        fechaFin: fechaFin as string,
        id_barbero: id_barbero ? parseInt(id_barbero as string) : undefined
      }, req.usuario!.id_usuario);
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }
}
