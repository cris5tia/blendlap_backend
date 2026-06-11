export interface IFiltroReporte {
  fechaInicio: string;
  fechaFin: string;
  id_barbero?: number;
}

export interface IReporteVentas {
  periodo: { fechaInicio: string; fechaFin: string };
  resumen: any;
  por_metodo_pago: any[];
  servicios_por_barbero: any[];
  comisiones: any[];
  productos_vendidos: any[];
  top_servicios: any[];
  top_productos: any[];
  ventas_por_dia: any[];
}
