import { AuthModel } from '../models/auth.model';
import { UsuarioModel } from '../models/usuario.model';
import { eliminarArchivo } from '../utils/files';

export class UsuarioService {

  static async getAll() {
    return await AuthModel.findAll();
  }

  static async cambiarRol(id_usuario: number, rol: string) {
    const rolesValidos = ['admin', 'barbero', 'cliente'];
    if (!rolesValidos.includes(rol)) throw new Error('Rol inválido');
    const usuario = await AuthModel.findById(id_usuario);
    if (!usuario) throw new Error('Usuario no encontrado');
    await AuthModel.cambiarRol(id_usuario, rol);
    return { mensaje: `Rol actualizado a ${rol} correctamente` };
  }

  static async cambiarEstado(id_usuario: number, estado: string) {
    const estadosValidos = ['activo', 'inactivo'];
    if (!estadosValidos.includes(estado)) throw new Error('Estado inválido');
    const usuario = await AuthModel.findById(id_usuario);
    if (!usuario) throw new Error('Usuario no encontrado');
    await AuthModel.cambiarEstado(id_usuario, estado);
    return { mensaje: `Estado actualizado a ${estado} correctamente` };
  }

  static async getBarberos() {
    return await UsuarioModel.findByRol('barbero');
  }

  static async crearBarbero(data: {
    nombre: string;
    apellido: string;
    correo_electronico: string;
    contrasena: string;
    titulo: string;
    descripcion: string;
    foto: string;
  }) {
    return await UsuarioModel.crearBarbero(data);
  }

  static async actualizarBarbero(id: number, data: {
    nombre?: string;
    apellido?: string;
    titulo?: string;
    descripcion?: string;
    foto?: string;
  }) {
    if (data.foto) {
      const barberoActual = await UsuarioModel.findById(id);
      if (barberoActual?.foto) eliminarArchivo('barberos', barberoActual.foto);
    }
    return await UsuarioModel.actualizarBarbero(id, data);
  }

  static async eliminarBarbero(id: number) {
    const existe = await UsuarioModel.findById(id);
    if (!existe) throw new Error('Barbero no encontrado');
    await UsuarioModel.actualizarBarbero(id, { estado: 'inactivo' } as any);
    return { mensaje: 'Barbero desactivado correctamente' };
  }
  static async getAllBarberos() {
    return await UsuarioModel.findAllBarberos();
  }

  static async reactivarBarbero(id: number) {
    const existe = await UsuarioModel.findById(id);
    if (!existe) throw new Error('Barbero no encontrado');
    await UsuarioModel.actualizarBarbero(id, { estado: 'activo' } as any);
    return { mensaje: 'Barbero reactivado correctamente' };
  }
}