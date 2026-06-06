import { Request, Response } from 'express';
import { UsuarioService } from '../services/usuario.service';
import { subirArchivoCloudinary } from '../utils/cloudinary';

export class UsuarioController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const usuarios = await UsuarioService.getAll();
      res.status(200).json({ ok: true, data: usuarios });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async cambiarRol(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { rol } = req.body;
      if (!rol) {
        res.status(400).json({ ok: false, mensaje: 'El rol es requerido' });
        return;
      }
      const resultado = await UsuarioService.cambiarRol(id, rol);
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async cambiarEstado(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { estado } = req.body;
      if (!estado) {
        res.status(400).json({ ok: false, mensaje: 'El estado es requerido' });
        return;
      }
      const resultado = await UsuarioService.cambiarEstado(id, estado);
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async getBarberos(req: Request, res: Response): Promise<void> {
    try {
      const barberos = await UsuarioService.getBarberos();
      res.status(200).json({ ok: true, data: barberos });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async uploadFotoBarbero(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ ok: false, mensaje: 'No se envió ninguna imagen' });
        return;
      }
      const url = await subirArchivoCloudinary(req.file, 'barberos');
      res.status(200).json({ ok: true, nombreArchivo: url });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async crearBarbero(req: Request, res: Response): Promise<void> {
    try {
      const barbero = await UsuarioService.crearBarbero(req.body);
      res.status(201).json({ ok: true, data: barbero });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async actualizarBarbero(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const barbero = await UsuarioService.actualizarBarbero(id, req.body);
      res.status(200).json({ ok: true, data: barbero });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async eliminarBarbero(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const resultado = await UsuarioService.eliminarBarbero(id);
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  }
  static async getAllBarberos(req: Request, res: Response): Promise<void> {
    try {
      const barberos = await UsuarioService.getAllBarberos();
      res.status(200).json({ ok: true, data: barberos });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async reactivarBarbero(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const resultado = await UsuarioService.reactivarBarbero(id);
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }
}
