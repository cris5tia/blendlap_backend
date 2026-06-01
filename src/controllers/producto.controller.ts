import { Request, Response } from 'express';
import { ProductoService } from '../services/producto.service';

export class ProductoController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const productos = await ProductoService.getAll();
      res.status(200).json({ ok: true, data: productos });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async getStockActual(req: Request, res: Response): Promise<void> {
    try {
      const stock = await ProductoService.getStockActual();
      res.status(200).json({ ok: true, data: stock });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async getStockBajo(req: Request, res: Response): Promise<void> {
    try {
      const resultado = await ProductoService.getStockBajo();
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const producto = await ProductoService.getById(parseInt(req.params.id));
      res.status(200).json({ ok: true, data: producto });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const producto = await ProductoService.create({
        ...req.body,
        precio: Number(req.body.precio),
        stock:  Number(req.body.stock) || 0,
        imagen: req.body.imagen || null
      });
      res.status(201).json({ ok: true, data: producto });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const data: any = {
        ...req.body,
        precio: req.body.precio !== undefined ? Number(req.body.precio) : undefined,
        stock:  req.body.stock  !== undefined ? Number(req.body.stock)  : undefined,
      };
      const producto = await ProductoService.update(id, data);
      res.status(200).json({ ok: true, data: producto });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const resultado = await ProductoService.delete(parseInt(req.params.id));
      res.status(200).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  }

  static async registrarMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const id_usuario = req.usuario!.id_usuario;
      const resultado = await ProductoService.registrarMovimiento(id_usuario, req.body);
      res.status(201).json({ ok: true, ...resultado });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }

  static async getMovimientos(req: Request, res: Response): Promise<void> {
    try {
      const movimientos = await ProductoService.getMovimientos(parseInt(req.params.id));
      res.status(200).json({ ok: true, data: movimientos });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  }
}
