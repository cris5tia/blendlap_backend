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

    // ── Constantes de diseño ─────────────────────────────────────────────
    const PW   = doc.page.width;   // 595.28
    const PH   = doc.page.height;  // 841.89
    const ML   = 36;
    const CW   = PW - ML * 2;
    const ROW  = 22;
    const ROW2 = 24;

    const CP   = '#1a1a2e';
    const CG   = '#fbc447';
    const CGR  = '#6b7280';
    const CLG  = '#f8fafc';
    const CLG2 = '#f1f5f9';
    const CB   = '#e2e8f0';
    const CW2  = '#ffffff';
    const CGRN = '#059669';
    const CRED = '#dc2626';
    const CBLU = '#2563eb';

    const fmt = (v: any) => {
      const n = Number(v || 0);
      return '$' + n.toLocaleString('es-CO');
    };
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) + '%' : '0%';

    const kpis     = data.kpis as any;
    const barberos = data.barberos as any[];
    const topS     = data.top_servicios as any[];
    const topP     = data.top_productos as any[];
    const metodos  = data.metodos_pago as any[];
    const gastos   = data.gastos_por_categoria as any[];
    const topC     = data.top_clientes as any[];
    const credEst  = (data.creditos?.estadisticas || []) as any[];

    const fechaGen = new Date().toLocaleString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    let cy = 0;

    // ── Footer ───────────────────────────────────────────────────────────
    const drawFooter = () => {
      doc.rect(0, PH - 26, PW, 26).fill(CP);
      doc.rect(0, PH - 26, PW, 2).fill(CG);
      doc.fillColor('rgba(255,255,255,0.45)').fontSize(7).font('Helvetica')
        .text(`Generado el ${fechaGen}`, ML, PH - 16, { width: CW * 0.55, align: 'left', lineBreak: false });
      doc.fillColor('rgba(255,255,255,0.45)')
        .text('BLENDLAP BARBERÍA — Reporte Analítico', ML, PH - 16, { width: CW, align: 'right', lineBreak: false });
    };

    const newPage = () => {
      drawFooter();
      doc.addPage();
      cy = 38;
    };

    const checkPage = (needed = 60) => { if (cy + needed > PH - 40) newPage(); };

    // ── Cabecera de sección ───────────────────────────────────────────────
    const sectionHead = (title: string, icon = '') => {
      checkPage(80);
      doc.rect(ML, cy, CW, 26).fill(CP);
      doc.rect(ML, cy, 5, 26).fill(CG);
      doc.fillColor(CW2).fontSize(10).font('Helvetica-Bold')
        .text((icon ? icon + '  ' : '') + title.toUpperCase(), ML + 14, cy + 8, { width: CW - 20, lineBreak: false });
      cy += 32;
    };

    // ── Fila clave-valor ──────────────────────────────────────────────────
    const dataRow = (label: string, value: string, opts: { bold?: boolean; idx?: number; valueColor?: string } = {}) => {
      checkPage(ROW + 4);
      const bg = (opts.idx ?? 0) % 2 === 0 ? CW2 : CLG;
      doc.rect(ML, cy, CW, ROW).fill(bg);
      doc.moveTo(ML, cy + ROW).lineTo(ML + CW, cy + ROW).strokeColor(CB).lineWidth(0.3).stroke();
      doc.fillColor(CP).fontSize(9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, ML + 10, cy + 6, { width: CW * 0.66, lineBreak: false });
      doc.fillColor(opts.valueColor ?? (opts.bold ? CP : CGR)).font('Helvetica-Bold')
        .text(value, ML + 4, cy + 6, { width: CW - 10, align: 'right', lineBreak: false });
      cy += ROW;
    };

    // ── Cabecera de tabla ─────────────────────────────────────────────────
    const tableHead = (cols: { label: string; x: number; w: number; align?: 'left' | 'right' | 'center' }[]) => {
      doc.rect(ML, cy, CW, 22).fill(CP);
      cols.forEach(c => {
        doc.fillColor(CG).fontSize(7.5).font('Helvetica-Bold')
          .text(c.label.toUpperCase(), c.x, cy + 7, { width: c.w, align: c.align ?? 'left', lineBreak: false });
      });
      cy += 22;
    };

    // ── Barra de progreso simple ──────────────────────────────────────────
    const progressBar = (x: number, y: number, w: number, pct2: number, color: string) => {
      doc.rect(x, y, w, 6).fill('#e5e7eb');
      doc.rect(x, y, Math.max(w * pct2, 0), 6).fill(color);
    };

    // ════════════════════════════════════════════════════════════════════
    // PORTADA
    // ════════════════════════════════════════════════════════════════════

    // Fondo negro completo
    doc.rect(0, 0, PW, PH).fill(CP);
    // Franja dorada inferior portada
    doc.rect(0, PH - 60, PW, 60).fill(CG);
    // Franja decorativa
    doc.rect(0, 200, PW, 4).fill(CG);
    doc.rect(0, 208, PW, 1).fill('rgba(251,196,71,0.3)');

    // Logo / marca
    doc.fillColor(CG).fontSize(38).font('Helvetica-Bold')
      .text('BLENDLAP', 0, 90, { width: PW, align: 'center' });
    doc.fillColor('rgba(251,196,71,0.55)').fontSize(11).font('Helvetica')
      .text('B  A  R  B  E  R  Í  A', 0, 138, { width: PW, align: 'center' });

    // Título del reporte
    doc.fillColor(CW2).fontSize(20).font('Helvetica-Bold')
      .text('REPORTE ANALÍTICO', 0, 222, { width: PW, align: 'center' });
    doc.fillColor('rgba(255,255,255,0.5)').fontSize(10).font('Helvetica')
      .text('Informe completo de desempeño y finanzas', 0, 250, { width: PW, align: 'center' });

    // Caja del período
    doc.roundedRect(ML + 60, 290, CW - 120, 76, 8).fill('rgba(255,255,255,0.06)');
    doc.moveTo(ML + 60, 290).lineTo(ML + 60 + CW - 120, 290).strokeColor(CG).lineWidth(1).stroke();
    doc.fillColor('rgba(251,196,71,0.7)').fontSize(8).font('Helvetica')
      .text('PERÍODO ANALIZADO', 0, 304, { width: PW, align: 'center' });
    doc.fillColor(CW2).fontSize(16).font('Helvetica-Bold')
      .text(`${filtro.fechaInicio}  →  ${filtro.fechaFin}`, 0, 322, { width: PW, align: 'center' });
    doc.fillColor('rgba(255,255,255,0.4)').fontSize(9).font('Helvetica')
      .text(`Generado el ${fechaGen}`, 0, 348, { width: PW, align: 'center' });

    // KPI highlights en portada (2 × 2)
    const pCards = [
      { l: 'Ingresos', v: fmt(kpis.ingresos_total), c: '#3b82f6' },
      { l: 'Ganancia neta', v: fmt(kpis.ganancia_neta), c: CGRN },
      { l: 'Reservas', v: String(kpis.reservas_completadas) + ' completadas', c: '#8b5cf6' },
      { l: 'Ventas registradas', v: String(kpis.cantidad_ventas), c: '#f59e0b' },
    ];
    const PC_W = (CW - 12) / 2;
    const PC_H = 62;
    pCards.forEach((c, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const px = ML + col * (PC_W + 12);
      const py = 400 + row * (PC_H + 10);
      doc.roundedRect(px, py, PC_W, PC_H, 6).fill('rgba(255,255,255,0.07)');
      doc.rect(px, py, 4, PC_H).fill(c.c);
      doc.fillColor('rgba(255,255,255,0.5)').fontSize(7.5).font('Helvetica')
        .text(c.l.toUpperCase(), px + 12, py + 12, { width: PC_W - 16, lineBreak: false });
      doc.fillColor(CW2).fontSize(16).font('Helvetica-Bold')
        .text(c.v, px + 10, py + 28, { width: PC_W - 14, lineBreak: false });
    });

    // Texto inferior portada (sobre franja dorada)
    doc.fillColor(CP).fontSize(9).font('Helvetica-Bold')
      .text('Sistema de Gestión · Confidencial', 0, PH - 38, { width: PW, align: 'center', lineBreak: false });

    // ════════════════════════════════════════════════════════════════════
    // PÁGINA 2 — RESUMEN EJECUTIVO
    // ════════════════════════════════════════════════════════════════════
    newPage();

    // Mini header de página
    doc.rect(0, 0, PW, 30).fill(CP);
    doc.rect(0, 28, PW, 2).fill(CG);
    doc.fillColor(CW2).fontSize(8.5).font('Helvetica-Bold')
      .text('BLENDLAP BARBERÍA', ML, 10, { width: CW * 0.5, lineBreak: false });
    doc.fillColor('rgba(255,255,255,0.5)').font('Helvetica')
      .text(`Período: ${filtro.fechaInicio} → ${filtro.fechaFin}`, ML, 10, { width: CW, align: 'right', lineBreak: false });
    cy = 44;

    // ── KPI Cards (3 × 2) ─────────────────────────────────────────────
    const CARD_W  = (CW - 16) / 3;
    const CARD_H  = 72;
    const CARD_G  = 8;

    const kCards = [
      { l: 'Ingresos totales',     v: fmt(kpis.ingresos_total),          sub: `Margen: ${pct(kpis.ganancia_neta, kpis.ingresos_total)}`, bg: '#dbeafe', ac: CBLU    },
      { l: 'Ganancia neta',        v: fmt(kpis.ganancia_neta),            sub: 'Ingresos − Gastos',                                        bg: '#d1fae5', ac: CGRN    },
      { l: 'Total gastos',         v: fmt(kpis.total_gastos),             sub: 'Egresos del período',                                      bg: '#fee2e2', ac: CRED    },
      { l: 'Reservas completadas', v: String(kpis.reservas_completadas),  sub: `Tasa: ${pct(kpis.reservas_completadas, kpis.reservas_total)}`, bg: '#ede9fe', ac: '#6d28d9' },
      { l: 'Comisiones staff',     v: fmt(kpis.total_comisiones_barbero), sub: 'Pagos a barberos',                                         bg: '#fef9c3', ac: '#92400e' },
      { l: 'Clientes nuevos',      v: String(kpis.clientes_nuevos),       sub: `${kpis.cantidad_ventas} ventas registradas`,               bg: '#fce7f3', ac: '#9d174d' },
    ];

    kCards.forEach((c, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const cx2 = ML + col * (CARD_W + CARD_G);
      const cy2 = cy + row * (CARD_H + CARD_G);
      doc.roundedRect(cx2, cy2, CARD_W, CARD_H, 7).fill(c.bg);
      doc.rect(cx2, cy2, 4, CARD_H).fill(c.ac);
      doc.fillColor(c.ac).fontSize(7).font('Helvetica')
        .text(c.l.toUpperCase(), cx2 + 10, cy2 + 11, { width: CARD_W - 14, lineBreak: false });
      doc.fillColor(c.ac).fontSize(15).font('Helvetica-Bold')
        .text(c.v, cx2 + 8, cy2 + 26, { width: CARD_W - 14, lineBreak: false });
      doc.fillColor(c.ac).fontSize(7.5).font('Helvetica')
        .text(c.sub, cx2 + 8, cy2 + 53, { width: CARD_W - 14, lineBreak: false });
    });
    cy += 2 * (CARD_H + CARD_G) + 18;

    // ── Resumen financiero ─────────────────────────────────────────────
    sectionHead('Resumen Financiero');
    [
      { l: 'Ingresos totales',        v: fmt(kpis.ingresos_total),           bold: true            },
      { l: '   Por servicios',         v: fmt(kpis.ingresos_servicios),        bold: false           },
      { l: '   Por productos',         v: fmt(kpis.ingresos_productos),        bold: false           },
      { l: 'Total gastos (egresos)',   v: fmt(kpis.total_gastos),             bold: true, vc: CRED  },
      { l: 'Comisiones barberos',      v: fmt(kpis.total_comisiones_barbero), bold: false, vc: '#d97706' },
      { l: 'Ganancia neta',            v: fmt(kpis.ganancia_neta),            bold: true, vc: CGRN  },
      { l: 'Margen neto',              v: pct(kpis.ganancia_neta, kpis.ingresos_total), bold: false },
    ].forEach((r, i) => dataRow(r.l, r.v, { bold: r.bold, idx: i, valueColor: (r as any).vc }));
    cy += 14;

    // ── Reservas ──────────────────────────────────────────────────────
    sectionHead('Reservas del Período');
    [
      { l: 'Total reservas',        v: String(kpis.reservas_total),       bold: true            },
      { l: 'Completadas',           v: String(kpis.reservas_completadas), bold: false, vc: CGRN },
      { l: 'Pendientes',            v: String(kpis.reservas_pendientes),  bold: false           },
      { l: 'Canceladas',            v: String(kpis.reservas_canceladas),  bold: false, vc: CRED },
      { l: 'Tasa de completación',  v: pct(kpis.reservas_completadas, kpis.reservas_total), bold: false },
      { l: 'Ventas registradas',    v: String(kpis.cantidad_ventas),      bold: false           },
      { l: 'Clientes nuevos',       v: String(kpis.clientes_nuevos),      bold: false           },
    ].forEach((r, i) => dataRow(r.l, r.v, { bold: r.bold, idx: i, valueColor: (r as any).vc }));

    // ════════════════════════════════════════════════════════════════════
    // BARBEROS Y COMISIONES
    // ════════════════════════════════════════════════════════════════════
    if (barberos.length) {
      checkPage(80);
      sectionHead('Barberos y Comisiones');

      const BC = [
        { label: 'Barbero',       x: ML + 5,   w: 128, align: 'left'  as const },
        { label: 'Com. %',        x: ML + 137, w: 45,  align: 'right' as const },
        { label: 'Reservas',      x: ML + 186, w: 55,  align: 'right' as const },
        { label: 'Servicios',     x: ML + 245, w: 85,  align: 'right' as const },
        { label: 'Staff recibe',  x: ML + 334, w: 85,  align: 'right' as const },
        { label: 'Barbería',      x: ML + 423, w: 88,  align: 'right' as const },
      ];
      tableHead(BC);

      const maxIng = Math.max(...barberos.map((b: any) => Number(b.total_servicios)), 1);
      barberos.forEach((b, i) => {
        checkPage(ROW2 + 2);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW2).fill(bg);
        doc.fillColor(CP).fontSize(9).font('Helvetica-Bold')
          .text(b.barbero, BC[0].x, cy + 4, { width: BC[0].w, lineBreak: false });
        progressBar(BC[0].x, cy + 15, BC[0].w, Number(b.total_servicios) / maxIng, CG);
        doc.fillColor(CGR).fontSize(8.5).font('Helvetica')
          .text(`${b.comision}%`, BC[1].x, cy + 8, { width: BC[1].w, align: 'right', lineBreak: false });
        doc.fillColor(CP)
          .text(String(b.total_reservas), BC[2].x, cy + 8, { width: BC[2].w, align: 'right', lineBreak: false })
          .text(fmt(b.total_servicios), BC[3].x, cy + 8, { width: BC[3].w, align: 'right', lineBreak: false });
        doc.fillColor('#d97706').font('Helvetica-Bold')
          .text(fmt(b.comision_barbero), BC[4].x, cy + 8, { width: BC[4].w, align: 'right', lineBreak: false });
        doc.fillColor(CGRN)
          .text(fmt(b.comision_barberia), BC[5].x, cy + 8, { width: BC[5].w, align: 'right', lineBreak: false });
        cy += ROW2;
      });

      checkPage(ROW + 2);
      doc.rect(ML, cy, CW, ROW + 2).fill(CP);
      const tGen = barberos.reduce((a: number, b: any) => a + Number(b.total_servicios), 0);
      const tCom = barberos.reduce((a: number, b: any) => a + Number(b.comision_barbero), 0);
      const tBar = barberos.reduce((a: number, b: any) => a + Number(b.comision_barberia), 0);
      doc.fillColor(CW2).fontSize(9).font('Helvetica-Bold')
        .text('TOTALES', BC[0].x, cy + 7, { width: BC[0].w, lineBreak: false })
        .text(fmt(tGen), BC[3].x, cy + 7, { width: BC[3].w, align: 'right', lineBreak: false });
      doc.fillColor(CG).text(fmt(tCom), BC[4].x, cy + 7, { width: BC[4].w, align: 'right', lineBreak: false });
      doc.fillColor(CGRN).text(fmt(tBar), BC[5].x, cy + 7, { width: BC[5].w, align: 'right', lineBreak: false });
      cy += ROW + 14;
    }

    // ════════════════════════════════════════════════════════════════════
    // TOP SERVICIOS
    // ════════════════════════════════════════════════════════════════════
    if (topS.length) {
      checkPage(80);
      sectionHead('Top Servicios');

      const SC = [
        { label: '#',        x: ML + 5,   w: 18,  align: 'center' as const },
        { label: 'Servicio', x: ML + 28,  w: 210, align: 'left'   as const },
        { label: 'Veces',    x: ML + 242, w: 60,  align: 'right'  as const },
        { label: '% del total', x: ML + 306, w: 80, align: 'right' as const },
        { label: 'Generado', x: ML + 390, w: 121, align: 'right'  as const },
      ];
      tableHead(SC);

      const totalVeces = topS.reduce((a: number, s: any) => a + Number(s.veces_solicitado), 0);
      topS.slice(0, 10).forEach((s, i) => {
        checkPage(ROW + 2);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW).fill(bg);
        doc.fillColor(CG).fontSize(8.5).font('Helvetica-Bold')
          .text(String(i + 1), SC[0].x, cy + 6, { width: SC[0].w, align: 'center', lineBreak: false });
        doc.fillColor(CP).font('Helvetica')
          .text(s.nombre_servicio, SC[1].x, cy + 6, { width: SC[1].w, lineBreak: false });
        doc.fillColor(CGR).font('Helvetica-Bold')
          .text(`${s.veces_solicitado}×`, SC[2].x, cy + 6, { width: SC[2].w, align: 'right', lineBreak: false });
        doc.fillColor(CBLU)
          .text(pct(s.veces_solicitado, totalVeces), SC[3].x, cy + 6, { width: SC[3].w, align: 'right', lineBreak: false });
        doc.fillColor(CP)
          .text(fmt(s.total_generado), SC[4].x, cy + 6, { width: SC[4].w, align: 'right', lineBreak: false });
        cy += ROW;
      });
      cy += 14;
    }

    // ════════════════════════════════════════════════════════════════════
    // TOP CLIENTES
    // ════════════════════════════════════════════════════════════════════
    if (topC.length) {
      checkPage(80);
      sectionHead('Top Clientes');

      const CC = [
        { label: '#',             x: ML + 5,   w: 18,  align: 'center' as const },
        { label: 'Cliente',       x: ML + 28,  w: 220, align: 'left'   as const },
        { label: 'Reservas',      x: ML + 252, w: 80,  align: 'right'  as const },
        { label: 'Total gastado', x: ML + 336, w: 175, align: 'right'  as const },
      ];
      tableHead(CC);

      const maxGastado = Math.max(...topC.map((c: any) => Number(c.total_gastado)), 1);
      topC.slice(0, 10).forEach((c, i) => {
        checkPage(ROW + 2);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW + 2).fill(bg);
        const rankColor = i === 0 ? '#d97706' : i === 1 ? '#6b7280' : i === 2 ? '#b45309' : CGR;
        doc.fillColor(rankColor).fontSize(8.5).font('Helvetica-Bold')
          .text(String(i + 1), CC[0].x, cy + 8, { width: CC[0].w, align: 'center', lineBreak: false });
        doc.fillColor(CP).font(i < 3 ? 'Helvetica-Bold' : 'Helvetica')
          .text(c.cliente, CC[1].x, cy + 8, { width: CC[1].w, lineBreak: false });
        doc.fillColor(CGR).font('Helvetica-Bold')
          .text(String(c.total_reservas), CC[2].x, cy + 8, { width: CC[2].w, align: 'right', lineBreak: false });
        // barra visual
        progressBar(CC[2].x, cy + 18, CC[2].w, Number(c.total_gastado) / maxGastado, '#8b5cf6');
        doc.fillColor(CP).font('Helvetica-Bold')
          .text(fmt(c.total_gastado), CC[3].x, cy + 8, { width: CC[3].w, align: 'right', lineBreak: false });
        cy += ROW + 4;
      });
      cy += 10;
    }

    // ════════════════════════════════════════════════════════════════════
    // TOP PRODUCTOS
    // ════════════════════════════════════════════════════════════════════
    if (topP.length) {
      checkPage(80);
      sectionHead('Top Productos Vendidos');

      const PCols = [
        { label: '#',        x: ML + 5,   w: 18,  align: 'center' as const },
        { label: 'Producto', x: ML + 28,  w: 270, align: 'left'   as const },
        { label: 'Uds.',     x: ML + 302, w: 60,  align: 'right'  as const },
        { label: 'Generado', x: ML + 366, w: 145, align: 'right'  as const },
      ];
      tableHead(PCols);

      topP.slice(0, 10).forEach((p, i) => {
        checkPage(ROW + 2);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW).fill(bg);
        doc.fillColor(CGR).fontSize(8.5).font('Helvetica-Bold')
          .text(String(i + 1), PCols[0].x, cy + 6, { width: PCols[0].w, align: 'center', lineBreak: false });
        doc.fillColor(CP).font('Helvetica')
          .text(p.nombre_producto, PCols[1].x, cy + 6, { width: PCols[1].w, lineBreak: false });
        doc.fillColor('#f59e0b').font('Helvetica-Bold')
          .text(String(p.cantidad_vendida), PCols[2].x, cy + 6, { width: PCols[2].w, align: 'right', lineBreak: false });
        doc.fillColor(CP)
          .text(fmt(p.total_generado), PCols[3].x, cy + 6, { width: PCols[3].w, align: 'right', lineBreak: false });
        cy += ROW;
      });
      cy += 14;
    }

    // ════════════════════════════════════════════════════════════════════
    // MÉTODOS DE PAGO
    // ════════════════════════════════════════════════════════════════════
    if (metodos.length) {
      checkPage(80);
      sectionHead('Métodos de Pago');

      const MC = [
        { label: 'Método',          x: ML + 5,   w: 180, align: 'left'  as const },
        { label: 'Transacciones',   x: ML + 189, w: 100, align: 'right' as const },
        { label: '% Transacciones', x: ML + 293, w: 90,  align: 'right' as const },
        { label: 'Total recaudado', x: ML + 387, w: 124, align: 'right' as const },
      ];
      tableHead(MC);

      const totalTx = metodos.reduce((a: number, m: any) => a + Number(m.cantidad), 0);
      const totalRec = metodos.reduce((a: number, m: any) => a + Number(m.total), 0);
      metodos.forEach((m, i) => {
        checkPage(ROW + 2);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW).fill(bg);
        doc.fillColor(CP).fontSize(9).font('Helvetica')
          .text(cap(m.metodo_pago), MC[0].x, cy + 6, { width: MC[0].w, lineBreak: false });
        doc.fillColor(CGR).font('Helvetica-Bold')
          .text(String(m.cantidad), MC[1].x, cy + 6, { width: MC[1].w, align: 'right', lineBreak: false });
        doc.fillColor(CBLU)
          .text(pct(m.cantidad, totalTx), MC[2].x, cy + 6, { width: MC[2].w, align: 'right', lineBreak: false });
        doc.fillColor(CP)
          .text(fmt(m.total), MC[3].x, cy + 6, { width: MC[3].w, align: 'right', lineBreak: false });
        cy += ROW;
      });
      checkPage(ROW + 2);
      doc.rect(ML, cy, CW, ROW).fill(CLG2);
      doc.fillColor(CP).fontSize(9).font('Helvetica-Bold')
        .text('TOTAL', MC[0].x, cy + 6, { width: MC[0].w, lineBreak: false })
        .text(String(totalTx), MC[1].x, cy + 6, { width: MC[1].w, align: 'right', lineBreak: false })
        .text(fmt(totalRec), MC[3].x, cy + 6, { width: MC[3].w, align: 'right', lineBreak: false });
      cy += ROW + 14;
    }

    // ════════════════════════════════════════════════════════════════════
    // GASTOS POR CATEGORÍA
    // ════════════════════════════════════════════════════════════════════
    if (gastos.length) {
      checkPage(80);
      sectionHead('Gastos por Categoría');

      const GC = [
        { label: 'Categoría', x: ML + 5,   w: 230, align: 'left'  as const },
        { label: 'Registros', x: ML + 239, w: 80,  align: 'right' as const },
        { label: '% del total', x: ML + 323, w: 70, align: 'right' as const },
        { label: 'Total',     x: ML + 397, w: 114, align: 'right' as const },
      ];
      tableHead(GC);

      const totalGastos = gastos.reduce((a: number, g: any) => a + Number(g.total), 0);
      gastos.forEach((g, i) => {
        checkPage(ROW + 2);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW).fill(bg);
        doc.fillColor(CP).fontSize(9).font('Helvetica')
          .text(g.categoria, GC[0].x, cy + 6, { width: GC[0].w, lineBreak: false });
        doc.fillColor(CGR).font('Helvetica-Bold')
          .text(String(g.cantidad), GC[1].x, cy + 6, { width: GC[1].w, align: 'right', lineBreak: false });
        doc.fillColor(CBLU)
          .text(pct(g.total, totalGastos), GC[2].x, cy + 6, { width: GC[2].w, align: 'right', lineBreak: false });
        doc.fillColor(CRED)
          .text(fmt(g.total), GC[3].x, cy + 6, { width: GC[3].w, align: 'right', lineBreak: false });
        cy += ROW;
      });
      checkPage(ROW + 2);
      doc.rect(ML, cy, CW, ROW + 2).fill('#fee2e2');
      doc.fillColor(CRED).fontSize(9).font('Helvetica-Bold')
        .text('TOTAL GASTOS', GC[0].x, cy + 7, { width: GC[0].w, lineBreak: false })
        .text(fmt(totalGastos), GC[3].x, cy + 7, { width: GC[3].w, align: 'right', lineBreak: false });
      cy += ROW + 14;
    }

    // ════════════════════════════════════════════════════════════════════
    // CRÉDITOS
    // ════════════════════════════════════════════════════════════════════
    if (credEst.length) {
      checkPage(80);
      sectionHead('Estado de Créditos');

      const XC = [
        { label: 'Estado',           x: ML + 5,   w: 150, align: 'left'  as const },
        { label: 'Cantidad',         x: ML + 159, w: 70,  align: 'right' as const },
        { label: 'Monto total',      x: ML + 233, w: 120, align: 'right' as const },
        { label: 'Saldo pendiente',  x: ML + 357, w: 154, align: 'right' as const },
      ];
      tableHead(XC);

      const estadoColors: Record<string, string> = { pendiente: '#d97706', activo: CBLU, pagado: CGRN, vencido: CRED, rechazado: '#7c3aed' };
      credEst.forEach((c, i) => {
        checkPage(ROW + 2);
        const bg = i % 2 === 0 ? CW2 : CLG;
        doc.rect(ML, cy, CW, ROW).fill(bg);
        const ec = estadoColors[c.estado] || CGR;
        doc.roundedRect(XC[0].x, cy + 5, 60, 12, 3).fill(ec + '22');
        doc.fillColor(ec).fontSize(8).font('Helvetica-Bold')
          .text(cap(c.estado), XC[0].x + 4, cy + 8, { width: 52, lineBreak: false });
        doc.fillColor(CP).fontSize(9)
          .text(String(c.cantidad), XC[1].x, cy + 6, { width: XC[1].w, align: 'right', lineBreak: false });
        doc.fillColor(CP)
          .text(fmt(c.monto_total), XC[2].x, cy + 6, { width: XC[2].w, align: 'right', lineBreak: false });
        doc.fillColor(Number(c.saldo_pendiente) > 0 ? CRED : CGRN).font('Helvetica-Bold')
          .text(fmt(c.saldo_pendiente), XC[3].x, cy + 6, { width: XC[3].w, align: 'right', lineBreak: false });
        cy += ROW;
      });
      cy += 14;
    }

    // ── Footer + paginación ───────────────────────────────────────────────
    drawFooter();

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      if (i === 0) continue; // portada sin número
      doc.fillColor('rgba(255,255,255,0.4)').fontSize(7).font('Helvetica')
        .text(`${i} / ${range.count - 1}`, PW - ML - 30, PH - 16, { width: 30, align: 'right', lineBreak: false });
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
