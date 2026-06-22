export interface IReserva {
  id_reserva: number;
  id_cliente: number;
  id_barbero: number;
  fecha: Date;
  hora: string;
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'completada';
  servicios?: number[]; // ids de servicios
}

export interface ICrearReserva {
  id_cliente: number;
  id_barbero: number;
  fecha: string;
  hora: string;
  servicios: number[]; // ids de servicios requerido
}

export interface IActualizarReserva {
  fecha?: string;
  hora?: string;
  estado?: 'pendiente' | 'confirmada' | 'cancelada' | 'completada';
  servicios?: number[];
}