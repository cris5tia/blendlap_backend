import { ReporteModel } from '../models/reporte.model';
import { IFiltroReporte } from '../interfaces/reporte.interface';
import PDFDocument from 'pdfkit';
import { Response } from 'express';

export class ReporteService {

  static async getReporteDiario(fecha: string, id_usuario: number) {
    const [
      totales,
      ventas,
      servicios,
      comisiones,
      productos,
      topServicios,
      topProductos,
      agenda
    ] = await Promise.all([
      ReporteModel.getTotalIngresos(fecha, fecha),
      ReporteModel.getVentas(fecha, fecha),
      ReporteModel.getServiciosPorBarbero(fecha, fecha),
      ReporteModel.getComisionesPorBarbero(fecha, fecha),
      ReporteModel.getProductosVendidos(fecha, fecha),
      ReporteModel.getTopServicios(fecha, fecha),
      ReporteModel.getTopProductos(fecha, fecha),
      ReporteModel.getAgendaDia(fecha)
    ]);

    await ReporteModel.registrarGeneracion(id_usuario, 'diario');

    return {
      fecha,
      resumen: totales,
      por_metodo_pago: ventas,
      servicios_por_barbero: servicios,
      comisiones,
      productos_vendidos: productos,
      top_servicios: topServicios,
      top_productos: topProductos,
      agenda
    };
  }

  static async getReportePeriodo(filtro: IFiltroReporte, id_usuario: number) {
    const { fechaInicio, fechaFin, id_barbero } = filtro;

    const [
      totales,
      ventas,
      servicios,
      comisiones,
      productos,
      topServicios,
      topProductos,
      ventasPorDia
    ] = await Promise.all([
      ReporteModel.getTotalIngresos(fechaInicio, fechaFin),
      ReporteModel.getVentas(fechaInicio, fechaFin),
      ReporteModel.getServiciosPorBarbero(fechaInicio, fechaFin, id_barbero),
      ReporteModel.getComisionesPorBarbero(fechaInicio, fechaFin),
      ReporteModel.getProductosVendidos(fechaInicio, fechaFin),
      ReporteModel.getTopServicios(fechaInicio, fechaFin),
      ReporteModel.getTopProductos(fechaInicio, fechaFin),
      ReporteModel.getVentasPorDia(fechaInicio, fechaFin)
    ]);

    await ReporteModel.registrarGeneracion(id_usuario, 'periodo');

    return {
      periodo: { fechaInicio, fechaFin },
      resumen: totales,
      por_metodo_pago: ventas,
      servicios_por_barbero: servicios,
      comisiones,
      productos_vendidos: productos,
      top_servicios: topServicios,
      top_productos: topProductos,
      ventas_por_dia: ventasPorDia
    };
  }

  static async exportarPDF(res: Response, filtro: IFiltroReporte, id_usuario: number) {
    const data = await ReporteService.getReportePeriodo(filtro, id_usuario);
    const doc = new PDFDocument({ margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename=reporte_${filtro.fechaInicio}_${filtro.fechaFin}.pdf`
    );

    doc.pipe(res);

    // Encabezado
    doc.fontSize(20).font('Helvetica-Bold')
      .text('BRASILIOS BARBERÍA', { align: 'center' });
    doc.fontSize(12).font('Helvetica')
      .text(`Reporte del ${filtro.fechaInicio} al ${filtro.fechaFin}`, { align: 'center' });
    doc.moveDown();

    // Resumen general
    doc.fontSize(14).font('Helvetica-Bold').text('RESUMEN GENERAL');
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica')
      .text(`Total ventas: ${data.resumen.total_ventas}`)
      .text(`Total ingresos: $${Number(data.resumen.total_ingresos).toLocaleString('es-CO')}`);
    doc.moveDown();

    // Comisiones por barbero
    doc.fontSize(14).font('Helvetica-Bold').text('COMISIONES POR BARBERO');
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');

    if (data.comisiones.length === 0) {
      doc.text('No hay comisiones en este periodo');
    } else {
      for (const c of data.comisiones) {
        doc.font('Helvetica-Bold').text(c.barbero)
          .font('Helvetica')
          .text(`  Reservas completadas: ${c.total_reservas}`)
          .text(`  Total servicios: $${Number(c.total_servicios).toLocaleString('es-CO')}`)
          .text(`  Comisión barbero (60%): $${Number(c.comision_barbero).toLocaleString('es-CO')}`)
          .text(`  Comisión barbería (40%): $${Number(c.comision_barberia).toLocaleString('es-CO')}`);
        doc.moveDown(0.5);
      }
    }
    doc.moveDown();

    // Top servicios
    doc.fontSize(14).font('Helvetica-Bold').text('TOP SERVICIOS');
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');

    if (data.top_servicios.length === 0) {
      doc.text('No hay servicios en este periodo');
    } else {
      for (const s of data.top_servicios) {
        doc.text(`${s.nombre_servicio} → ${s.veces_solicitado} veces → $${Number(s.total_generado).toLocaleString('es-CO')}`);
      }
    }
    doc.moveDown();

    // Top productos
    doc.fontSize(14).font('Helvetica-Bold').text('TOP PRODUCTOS');
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');

    if (data.top_productos.length === 0) {
      doc.text('No hay productos vendidos en este periodo');
    } else {
      for (const p of data.top_productos) {
        doc.text(`${p.nombre_producto} → ${p.cantidad_vendida} unidades → $${Number(p.total_generado).toLocaleString('es-CO')}`);
      }
    }
    doc.moveDown();

    // Métodos de pago
    doc.fontSize(14).font('Helvetica-Bold').text('POR MÉTODO DE PAGO');
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');

    if (data.por_metodo_pago.length === 0) {
      doc.text('No hay ventas en este periodo');
    } else {
      for (const m of data.por_metodo_pago) {
        doc.text(`${m.metodo_pago}: ${m.cantidad} ventas → $${Number(m.total).toLocaleString('es-CO')}`);
      }
    }

    // Pie de página
    doc.moveDown(2);
    doc.fontSize(9).font('Helvetica')
      .text(`Generado el ${new Date().toLocaleString('es-CO')}`, { align: 'center' });

    await ReporteModel.registrarGeneracion(id_usuario, 'pdf');
    doc.end();
  }
}
