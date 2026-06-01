import { ServicioModel } from '../models/servicio.model';
import { ICrearServicio, IActualizarServicio } from '../interfaces/servicio.interface';

export class ServicioService {

  // Obtener todos
  static async getAll(soloActivos = false) {
  return await ServicioModel.findAll(soloActivos);
}

  // Obtener por ID
  static async getById(id: number) {
    const servicio = await ServicioModel.findById(id);
    if (!servicio) {
      throw new Error('Servicio no encontrado');
    }
    return servicio;
  }

  // Crear
  static async create(data: ICrearServicio) {
    if (!data.nombre_servicio || !data.precio || !data.duracion) {
      throw new Error('nombre_servicio, precio y duracion son requeridos');
    }
    if (data.precio < 0) {
      throw new Error('El precio no puede ser negativo');
    }
    if (data.duracion <= 0) {
      throw new Error('La duración debe ser mayor a 0');
    }

    const id_servicio = await ServicioModel.create(data);
    return await ServicioModel.findById(id_servicio);
  }

  // Actualizar
  static async update(id: number, data: IActualizarServicio) {
    const existe = await ServicioModel.findById(id);
    if (!existe) {
      throw new Error('Servicio no encontrado');
    }
    if (data.precio !== undefined && data.precio < 0) {
      throw new Error('El precio no puede ser negativo');
    }
    if (data.duracion !== undefined && data.duracion <= 0) {
      throw new Error('La duración debe ser mayor a 0');
    }

    await ServicioModel.update(id, data);
    return await ServicioModel.findById(id);
  }

  // Eliminar
  static async delete(id: number) {
    const existe = await ServicioModel.findById(id);
    if (!existe) {
      throw new Error('Servicio no encontrado');
    }

    await ServicioModel.delete(id);
    return { mensaje: 'Servicio eliminado correctamente' };
  }
}
