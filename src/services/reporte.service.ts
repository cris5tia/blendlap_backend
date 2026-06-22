import { ReporteModel } from '../models/reporte.model';
import { IFiltroReporte } from '../interfaces/reporte.interface';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { Response } from 'express';

export class ReporteService {

  static async getReporteCompleto(filtro: IFiltroReporte, id_usuario: number) {
    const { fechaInicio, fechaFin, id_barbero } = filtro;

    const [kpis, ventasPorDia, ventasPorHora, metodosPago,
      topServicios, topProductos, barberos, serviciosPorBarbero,
      gastosCategoria, gastosDia, topClientes, reservasDia, creditos] =
      await Promise.all([
        ReporteModel.getKPIs(fechaInicio, fechaFin),
        ReporteModel.getVentasPorDia(fechaInicio, fechaFin),
        ReporteModel.getVentasPorHora(fechaInicio, fechaFin),
        ReporteModel.getMetodosPago(fechaInicio, fechaFin),
        ReporteModel.getTopServicios(fechaInicio, fechaFin),
        ReporteModel.getTopProductos(fechaInicio, fechaFin),
        ReporteModel.getBarberos(fechaInicio, fechaFin),
        ReporteModel.getServiciosPorBarbero(fechaInicio, fechaFin, id_barbero),
        ReporteModel.getGastosPorCategoria(fechaInicio, fechaFin),
        ReporteModel.getGastosPorDia(fechaInicio, fechaFin),
        ReporteModel.getTopClientes(fechaInicio, fechaFin),
        ReporteModel.getReservasPorDia(fechaInicio, fechaFin, id_barbero),
        ReporteModel.getCreditosAnalytics(),
      ]);

    await ReporteModel.registrarGeneracion(id_usuario, 'completo');

    return {
      periodo: { fechaInicio, fechaFin },
      kpis,
      ventas_por_dia: ventasPorDia,
      ventas_por_hora: ventasPorHora,
      metodos_pago: metodosPago,
      top_servicios: topServicios,
      top_productos: topProductos,
      barberos,
      servicios_por_barbero: serviciosPorBarbero,
      gastos_por_categoria: gastosCategoria,
      gastos_por_dia: gastosDia,
      top_clientes: topClientes,
      reservas_por_dia: reservasDia,
      creditos,
    };
  }

  static async getReporteDiario(fecha: string, id_usuario: number) {
    const [kpis, agenda, topServicios, topProductos, metodosPago] = await Promise.all([
      ReporteModel.getKPIs(fecha, fecha),
      ReporteModel.getAgendaDia(fecha),
      ReporteModel.getTopServicios(fecha, fecha),
      ReporteModel.getTopProductos(fecha, fecha),
      ReporteModel.getMetodosPago(fecha, fecha),
    ]);
    await ReporteModel.registrarGeneracion(id_usuario, 'diario');
    return { fecha, kpis, agenda, top_servicios: topServicios, top_productos: topProductos, metodos_pago: metodosPago };
  }

  static async exportarPDF(res: Response, filtro: IFiltroReporte, id_usuario: number) {
    const data = await ReporteService.getReporteCompleto(filtro, id_usuario);

    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename=reporte_${filtro.fechaInicio}_al_${filtro.fechaFin}.pdf`);
    doc.pipe(res);

    // ── Constantes ───────────────────────────────────────────────────────
    const PW  = doc.page.width;   // 595.28
    const PH  = doc.page.height;  // 841.89
    const ML  = 40;
    const CW  = PW - ML * 2;     // 515.28
    const ROW = 22;

    const CP  = '#1a1a2e';
    const CG  = '#fbc447';
    const CGR = '#6b7280';
    const CLG = '#f8f9fa';
    const CB  = '#e5e7eb';
    const CW2 = '#ffffff';
    const CGRN = '#059669';
    const CRED = '#dc2626';

    const fmt  = (v: any) => `$${Number(v || 0).toLocaleString('es-CO')}`;
    const cap  = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const pct  = (a: number, b: number) =>
      b > 0 ? Math.round((a / b) * 100) + '%' : '0%';

    const kpis     = data.kpis as any;
    const barberos = data.barberos as any[];
    const topS     = data.top_servicios as any[];
    const topP     = data.top_productos as any[];
    const metodos  = data.metodos_pago as any[];
    const gastos   = data.gastos_por_categoria as any[];

    const fechaGen = new Date().toLocaleString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    let cy = 0; // current Y tracker

    // ── Footer de página ─────────────────────────────────────────────────
    const drawFooter = () => {
      doc.rect(0, PH - 28, PW, 28).fill('#f1f5f9');
      doc.moveTo(0, PH - 28).lineTo(PW, PH - 28).strokeColor(CB).lineWidth(0.5).stroke();
      doc.fillColor(CGR).fontSize(7).font('Helvetica')
        .text(`Generado: ${fechaGen}`, ML, PH - 18, { width: CW * 0.6, align: 'left' })
        .text('Sistema de Gestión Barbería', ML, PH - 18, { width: CW, align: 'right' });
    };

    // ── Nueva página ──────────────────────────────────────────────────────
    const newPage = () => {
      drawFooter();
      doc.addPage();
      cy = 40;
    };

    const checkPage = (needed = 60) => { if (cy + needed > PH - 40) newPage(); };

    // ── Cabecera de sección ───────────────────────────────────────────────
    const sectionHead = (title: string) => {
      checkPage(80);
      doc.rect(ML, cy, CW, 24).fill(CP);
      doc.rect(ML, cy, 4, 24).fill(CG);
      doc.fillColor(CW2).fontSize(10).font('Helvetica-Bold')
        .text(title.toUpperCase(), ML + 14, cy + 7, { width: CW - 18 });
      cy += 30;
    };

    // ── Fila de datos ─────────────────────────────────────────────────────
    const dataRow = (
      label: string, value: string,
      opts: { bold?: boolean; idx?: number; valueColor?: string } = {}
    ) => {
      checkPage(ROW + 4);
      const bg = (opts.idx ?? 0) % 2 === 0 ? CW2 : CLG;
      doc.rect(ML, cy, CW, ROW).fill(bg);
      doc.fillColor(CP).fontSize(9)
        .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, ML + 8, cy + 6, { width: CW * 0.65, lineBreak: false });
      doc.fillColor(opts.valueColor ?? (opts.bold ? CP : CGR)).font('Helvetica-Bold')
        .text(value, ML + 2, cy + 6, { width: CW - 8, align: 'right', lineBreak: false });
      cy += ROW;
    };

    // ── Tabla: cabecera de columnas ───────────────────────────────────────
    const tableHead = (cols: { label: string; x: number; w: number; align?: 'left' | 'right' | 'center' }[]) => {
      doc.rect(ML, cy, CW, 20).fill('#e2e8f0');
      cols.forEach(c => {
        doc.fillColor(CP).fontSize(8).font('Helvetica-Bold')
          .text(c.label, c.x, cy + 5, { width: c.w, align: c.align ?? 'left', lineBreak: false });
      });
      cy += 20;
    };

    // ════════════════════════════════════════════════════════════════════
    // PÁGINA 1 — PORTADA
    // ════════════════════════════════════════════════════════════════════

    // Header band
    doc.rect(0, 0, PW, 95).fill(CP);
    doc.rect(0, 92, PW, 5).fill(CG);

    // Título
    doc.fillColor(CW2).fontSize(26).font('Helvetica-Bold')
      .text('REPORTE ANALÍTICO', 0, 24, { width: PW, align: 'center' });
    doc.fillColor(CG).fontSize(11).font('Helvetica')
      .text('Sistema de Gestión Barbería', 0, 58, { width: PW, align: 'center' });

    cy = 108;

    // Badge período
    doc.rect(ML, cy, CW, 32).fill(CLG);
    doc.moveTo(ML, cy).lineTo(ML + CW, cy).strokeColor(CB).lineWidth(0.5).stroke();
    doc.moveTo(ML, cy + 32).lineTo(ML + CW, cy + 32).strokeColor(CB).lineWidth(0.5).stroke();
    doc.fillColor(CP).fontSize(10).font('Helvetica-Bold')
      .text('Período analizado', ML + 12, cy + 5, { width: CW, lineBreak: false });
    doc.fillColor(CGR).fontSize(9.5).font('Helvetica')
      .text(`${filtro.fechaInicio}  →  ${filtro.fechaFin}`, ML + 12, cy + 18, { width: CW, lineBreak: false });
    cy += 44;

    // ── KPI Cards (3 × 2) ────────────────────────────────────────────────
    const CARD_W = (CW - 16) / 3;
    const CARD_H = 68;
    const CARD_GAP = 8;

    const cards = [
      { label: 'Ingresos totales',    value: fmt(kpis.ingresos_total),          bg: '#dbeafe', accent: '#1e40af' },
      { label: 'Ganancia neta',       value: fmt(kpis.ganancia_neta),            bg: '#d1fae5', accent: CGRN     },
      { label: 'Total gastos',        value: fmt(kpis.total_gastos),             bg: '#fee2e2', accent: CRED     },
      { label: 'Reservas completadas',value: String(kpis.reservas_completadas),  bg: '#ede9fe', accent: '#6d28d9'},
      { label: 'Comisiones staff',    value: fmt(kpis.total_comisiones_barbero), bg: '#fef9c3', accent: '#92400e'},
      { label: 'Clientes nuevos',     value: String(kpis.clientes_nuevos),       bg: '#fce7f3', accent: '#9d174d'},
    ];

    cards.forEach((c, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const cx2 = ML + col * (CARD_W + CARD_GAP);
      const cy2 = cy + row * (CARD_H + CARD_GAP);

      doc.roundedRect(cx2, cy2, CARD_W, CARD_H, 6).fill(c.bg);
      doc.rect(cx2, cy2, 4, CARD_H).fill(c.accent);
      doc.fillColor(c.accent).fontSize(7.5).font('Helvetica')
        .text(c.label.toUpperCase(), cx2 + 10, cy2 + 10, { width: CARD_W - 14, lineBreak: false });
      doc.fillColor(c.accent).fontSize(15).font('Helvetica-Bold')
        .text(c.value, cx2 + 8, cy2 + 26, { width: CARD_W - 14, lineBreak: false });

      // Margen si aplica
      if (idx === 0) {
        const mg = pct(kpis.ganancia_neta, kpis.ingresos_total);
        doc.fillColor(c.accent).fontSize(8).font('Helvetica')
          .text(`Margen neto: ${mg}`, cx2 + 8, cy2 + 50, { width: CARD_W - 14, lineBreak: false });
      }
      if (idx === 3) {
        const tc = pct(kpis.reservas_completadas, kpis.reservas_total);
        doc.fillColor(c.accent).fontSize(8).font('Helvetica')
          .text(`Tasa: ${tc}`, cx2 + 8, cy2 + 50, { width: CARD_W - 14, lineBreak: false });
      }
    });

    cy += 2 * (CARD_H + CARD_GAP) + 14;

    // ── Resumen financiero ────────────────────────────────────────────────
    sectionHead('Resumen Financiero');

    [
      { l: 'Ingresos totales',       v: fmt(kpis.ingresos_total),           bold: true  },
      { l: '  ↳ Por servicios',      v: fmt(kpis.ingresos_servicios),        bold: false },
      { l: '  ↳ Por productos',      v: fmt(kpis.ingresos_productos),        bold: false },
      { l: 'Total gastos (egresos)', v: fmt(kpis.total_gastos),             bold: true,  vc: CRED },
      { l: 'Comisiones barberos',    v: fmt(kpis.total_comisiones_barbero), bold: false },
      { l: 'Ganancia neta',          v: fmt(kpis.ganancia_neta),            bold: true,  vc: CGRN },
      { l: 'Margen neto',            v: pct(kpis.ganancia_neta, kpis.ingresos_total), bold: false },
    ].forEach((r, i) =>
      dataRow(r.l, r.v, { bold: r.bold, idx: i, valueColor: (r as any).vc })
    );
    cy += 10;

    // ── Reservas ──────────────────────────────────────────────────────────
    sectionHead('Reservas del Período');

    [
      { l: 'Total reservas',       v: String(kpis.reservas_total),       bold: true  },
      { l: 'Completadas',          v: String(kpis.reservas_completadas), bold: false, vc: CGRN },
      { l: 'Pendientes',           v: String(kpis.reservas_pendientes),  bold: false },
      { l: 'Canceladas',           v: String(kpis.reservas_canceladas),  bold: false, vc: CRED },
      { l: 'Tasa de completación', v: pct(kpis.reservas_completadas, kpis.reservas_total), bold: false },
      { l: 'Ventas registradas',   v: String(kpis.cantidad_ventas),      bold: false },
      { l: 'Clientes nuevos',      v: String(kpis.clientes_nuevos),      bold: false },
    ].forEach((r, i) =>
      dataRow(r.l, r.v, { bold: r.bold, idx: i, valueColor: (r as any).vc })
    );
    cy += 10;

    // ════════════════════════════════════════════════════════════════════
    // BARBEROS
    // ════════════════════════════════════════════════════════════════════
    if (barberos.length) {
      sectionHead('Barberos y Comisiones');

      // Cabecera de tabla
      const BC = [
        { label: 'Barbero',     x: ML + 4,   w: 130, align: 'left'  as const },
        { label: 'Comisión',    x: ML + 138, w: 55,  align: 'right' as const },
        { label: 'Reservas',    x: ML + 197, w: 55,  align: 'right' as const },
        { label: 'Generado',    x: ML + 256, w: 90,  align: 'right' as const },
        { label: 'Staff recibe',x: ML + 350, w: 80,  align: 'right' as const },
        { label: 'Barbería',    x: ML + 434, w: 77,  align: 'right' as const },
      ];
      tableHead(BC);

      barberos.forEach((b, i) => {
        checkPage(ROW);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW).fill(bg);
        doc.fillColor(CP).fontSize(9).font('Helvetica-Bold')
          .text(b.barbero, BC[0].x, cy + 6, { width: BC[0].w, lineBreak: false });
        doc.font('Helvetica').fillColor(CGR)
          .text(`${b.comision}%`, BC[1].x, cy + 6, { width: BC[1].w, align: 'right', lineBreak: false });
        doc.fillColor(CP)
          .text(String(b.total_reservas), BC[2].x, cy + 6, { width: BC[2].w, align: 'right', lineBreak: false })
          .text(fmt(b.total_servicios), BC[3].x, cy + 6, { width: BC[3].w, align: 'right', lineBreak: false });
        doc.fillColor('#d97706').font('Helvetica-Bold')
          .text(fmt(b.comision_barbero), BC[4].x, cy + 6, { width: BC[4].w, align: 'right', lineBreak: false });
        doc.fillColor(CGRN)
          .text(fmt(b.comision_barberia), BC[5].x, cy + 6, { width: BC[5].w, align: 'right', lineBreak: false });
        cy += ROW;
      });

      // Fila total barberos
      checkPage(ROW);
      doc.rect(ML, cy, CW, ROW).fill('#e2e8f0');
      doc.fillColor(CP).fontSize(9).font('Helvetica-Bold')
        .text('TOTALES', BC[0].x, cy + 6, { width: BC[0].w, lineBreak: false });
      const totalGen = barberos.reduce((a, b) => a + Number(b.total_servicios), 0);
      const totalCom = barberos.reduce((a, b) => a + Number(b.comision_barbero), 0);
      const totalBar = barberos.reduce((a, b) => a + Number(b.comision_barberia), 0);
      doc.text(fmt(totalGen), BC[3].x, cy + 6, { width: BC[3].w, align: 'right', lineBreak: false });
      doc.fillColor('#d97706').text(fmt(totalCom), BC[4].x, cy + 6, { width: BC[4].w, align: 'right', lineBreak: false });
      doc.fillColor(CGRN).text(fmt(totalBar), BC[5].x, cy + 6, { width: BC[5].w, align: 'right', lineBreak: false });
      cy += ROW + 12;
    }

    // ════════════════════════════════════════════════════════════════════
    // TOP SERVICIOS
    // ════════════════════════════════════════════════════════════════════
    if (topS.length) {
      sectionHead('Top Servicios');

      const SC = [
        { label: '#',          x: ML + 4,   w: 18,  align: 'center' as const },
        { label: 'Servicio',   x: ML + 26,  w: 250, align: 'left'   as const },
        { label: 'Veces',      x: ML + 280, w: 60,  align: 'right'  as const },
        { label: 'Generado',   x: ML + 344, w: 167, align: 'right'  as const },
      ];
      tableHead(SC);

      topS.slice(0, 8).forEach((s, i) => {
        checkPage(ROW);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW).fill(bg);
        doc.fillColor(CGR).fontSize(9).font('Helvetica-Bold')
          .text(String(i + 1), SC[0].x, cy + 6, { width: SC[0].w, align: 'center', lineBreak: false });
        doc.fillColor(CP).font('Helvetica')
          .text(s.nombre_servicio, SC[1].x, cy + 6, { width: SC[1].w, lineBreak: false });
        doc.fillColor(CGR).font('Helvetica-Bold')
          .text(`${s.veces_solicitado}×`, SC[2].x, cy + 6, { width: SC[2].w, align: 'right', lineBreak: false });
        doc.fillColor(CP)
          .text(fmt(s.total_generado), SC[3].x, cy + 6, { width: SC[3].w, align: 'right', lineBreak: false });
        cy += ROW;
      });
      cy += 12;
    }

    // ════════════════════════════════════════════════════════════════════
    // TOP PRODUCTOS
    // ════════════════════════════════════════════════════════════════════
    if (topP.length) {
      sectionHead('Top Productos');

      const PC = [
        { label: '#',          x: ML + 4,   w: 18,  align: 'center' as const },
        { label: 'Producto',   x: ML + 26,  w: 270, align: 'left'   as const },
        { label: 'Uds.',       x: ML + 300, w: 60,  align: 'right'  as const },
        { label: 'Generado',   x: ML + 364, w: 147, align: 'right'  as const },
      ];
      tableHead(PC);

      topP.forEach((p, i) => {
        checkPage(ROW);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW).fill(bg);
        doc.fillColor(CGR).fontSize(9).font('Helvetica-Bold')
          .text(String(i + 1), PC[0].x, cy + 6, { width: PC[0].w, align: 'center', lineBreak: false });
        doc.fillColor(CP).font('Helvetica')
          .text(p.nombre_producto, PC[1].x, cy + 6, { width: PC[1].w, lineBreak: false });
        doc.fillColor(CGR).font('Helvetica-Bold')
          .text(String(p.cantidad_vendida), PC[2].x, cy + 6, { width: PC[2].w, align: 'right', lineBreak: false });
        doc.fillColor(CP)
          .text(fmt(p.total_generado), PC[3].x, cy + 6, { width: PC[3].w, align: 'right', lineBreak: false });
        cy += ROW;
      });
      cy += 12;
    }

    // ════════════════════════════════════════════════════════════════════
    // MÉTODOS DE PAGO
    // ════════════════════════════════════════════════════════════════════
    if (metodos.length) {
      sectionHead('Métodos de Pago');

      const MC = [
        { label: 'Método',         x: ML + 4,   w: 200, align: 'left'  as const },
        { label: 'Transacciones',  x: ML + 208, w: 130, align: 'right' as const },
        { label: 'Total recaudado',x: ML + 342, w: 169, align: 'right' as const },
      ];
      tableHead(MC);

      metodos.forEach((m, i) => {
        checkPage(ROW);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW).fill(bg);
        doc.fillColor(CP).fontSize(9).font('Helvetica')
          .text(cap(m.metodo_pago), MC[0].x, cy + 6, { width: MC[0].w, lineBreak: false });
        doc.fillColor(CGR).font('Helvetica-Bold')
          .text(String(m.cantidad), MC[1].x, cy + 6, { width: MC[1].w, align: 'right', lineBreak: false });
        doc.fillColor(CP)
          .text(fmt(m.total), MC[2].x, cy + 6, { width: MC[2].w, align: 'right', lineBreak: false });
        cy += ROW;
      });
      cy += 12;
    }

    // ════════════════════════════════════════════════════════════════════
    // GASTOS POR CATEGORÍA
    // ════════════════════════════════════════════════════════════════════
    if (gastos.length) {
      sectionHead('Gastos por Categoría');

      const GC = [
        { label: 'Categoría',  x: ML + 4,   w: 240, align: 'left'  as const },
        { label: 'Cantidad',   x: ML + 248, w: 100, align: 'right' as const },
        { label: 'Total',      x: ML + 352, w: 159, align: 'right' as const },
      ];
      tableHead(GC);

      let totalGastos = 0;
      gastos.forEach((g, i) => {
        checkPage(ROW);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW).fill(bg);
        doc.fillColor(CP).fontSize(9).font('Helvetica')
          .text(g.categoria, GC[0].x, cy + 6, { width: GC[0].w, lineBreak: false });
        doc.fillColor(CGR).font('Helvetica-Bold')
          .text(String(g.cantidad), GC[1].x, cy + 6, { width: GC[1].w, align: 'right', lineBreak: false });
        doc.fillColor(CRED)
          .text(fmt(g.total), GC[2].x, cy + 6, { width: GC[2].w, align: 'right', lineBreak: false });
        totalGastos += Number(g.total);
        cy += ROW;
      });

      // Fila total gastos
      checkPage(ROW);
      doc.rect(ML, cy, CW, ROW + 2).fill('#fee2e2');
      doc.fillColor(CRED).fontSize(9).font('Helvetica-Bold')
        .text('TOTAL GASTOS', GC[0].x, cy + 7, { width: GC[0].w, lineBreak: false })
        .text(fmt(totalGastos), GC[2].x, cy + 7, { width: GC[2].w, align: 'right', lineBreak: false });
      cy += ROW + 14;
    }

    // ── Footer + numeración de páginas ────────────────────────────────────
    drawFooter();

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(CGR).fontSize(7).font('Helvetica')
        .text(`${i + 1} / ${range.count}`, PW - ML - 35, PH - 18, { width: 35, align: 'right', lineBreak: false });
    }

    doc.end();
  }

  static async exportarExcel(res: Response, filtro: IFiltroReporte, id_usuario: number) {
    const data = await ReporteService.getReporteCompleto(filtro, id_usuario);
    const kpis = data.kpis as any;

    const wb = XLSX.utils.book_new();

    // Hoja KPIs
    const kpiSheet = XLSX.utils.json_to_sheet([{
      'Ingresos Totales': kpis.ingresos_total,
      'Ingresos Servicios': kpis.ingresos_servicios,
      'Ingresos Productos': kpis.ingresos_productos,
      'Total Gastos': kpis.total_gastos,
      'Comisiones Barberos': kpis.total_comisiones_barbero,
      'Ganancia Neta': kpis.ganancia_neta,
      'Total Ventas': kpis.cantidad_ventas,
      'Total Reservas': kpis.reservas_total,
      'Reservas Completadas': kpis.reservas_completadas,
      'Reservas Canceladas': kpis.reservas_canceladas,
      'Clientes Nuevos': kpis.clientes_nuevos,
    }]);
    XLSX.utils.book_append_sheet(wb, kpiSheet, 'KPIs');

    // Hoja Ventas por día
    const ventasSheet = XLSX.utils.json_to_sheet(
      (data.ventas_por_dia as any[]).map(v => ({
        Día: String(v.dia), Ventas: v.cantidad, 'Total COP': v.total
      }))
    );
    XLSX.utils.book_append_sheet(wb, ventasSheet, 'Ventas por Día');

    // Hoja Barberos
    const barberosSheet = XLSX.utils.json_to_sheet(
      (data.barberos as any[]).map(b => ({
        Barbero: b.barbero, 'Comisión %': b.comision,
        Reservas: b.total_reservas, 'Total Servicios': b.total_servicios,
        'Comisión Barbero': b.comision_barbero, 'Aporte Barbería': b.comision_barberia
      }))
    );
    XLSX.utils.book_append_sheet(wb, barberosSheet, 'Barberos');

    // Hoja Top Servicios
    const serviciosSheet = XLSX.utils.json_to_sheet(
      (data.top_servicios as any[]).map(s => ({
        Servicio: s.nombre_servicio, 'Veces Solicitado': s.veces_solicitado,
        'Total Generado': s.total_generado
      }))
    );
    XLSX.utils.book_append_sheet(wb, serviciosSheet, 'Top Servicios');

    // Hoja Top Productos
    if ((data.top_productos as any[]).length) {
      const prodSheet = XLSX.utils.json_to_sheet(
        (data.top_productos as any[]).map(p => ({
          Producto: p.nombre_producto, 'Cantidad Vendida': p.cantidad_vendida,
          'Total Generado': p.total_generado
        }))
      );
      XLSX.utils.book_append_sheet(wb, prodSheet, 'Top Productos');
    }

    // Hoja Top Clientes
    if ((data.top_clientes as any[]).length) {
      const clientesSheet = XLSX.utils.json_to_sheet(
        (data.top_clientes as any[]).map(c => ({
          Cliente: c.cliente, Reservas: c.total_reservas, 'Total Gastado': c.total_gastado
        }))
      );
      XLSX.utils.book_append_sheet(wb, clientesSheet, 'Top Clientes');
    }

    // Hoja Gastos
    if ((data.gastos_por_categoria as any[]).length) {
      const gastosSheet = XLSX.utils.json_to_sheet(
        (data.gastos_por_categoria as any[]).map(g => ({
          Categoría: g.categoria, Cantidad: g.cantidad, 'Total': g.total
        }))
      );
      XLSX.utils.book_append_sheet(wb, gastosSheet, 'Gastos');
    }

    // Hoja Métodos de pago
    if ((data.metodos_pago as any[]).length) {
      const mpSheet = XLSX.utils.json_to_sheet(
        (data.metodos_pago as any[]).map(m => ({
          'Método': m.metodo_pago, Transacciones: m.cantidad, 'Total': m.total
        }))
      );
      XLSX.utils.book_append_sheet(wb, mpSheet, 'Métodos de Pago');
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename=reporte_${filtro.fechaInicio}_al_${filtro.fechaFin}.xlsx`);
    res.send(buffer);
  }
}
