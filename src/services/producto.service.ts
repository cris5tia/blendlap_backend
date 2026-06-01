import { ProductoModel } from '../models/producto.model';
import { ICrearProducto, IActualizarProducto, ICrearMovimiento } from '../interfaces/producto.interface';

export class ProductoService {

  static async getAll() {
    return await ProductoModel.findAll();
  }

  static async getStockActual() {
    return await ProductoModel.getStockActual();
  }

  static async getById(id: number) {
    const producto = await ProductoModel.findById(id);
    if (!producto) throw new Error('Producto no encontrado');
    return producto;
  }

  static async create(data: ICrearProducto) {
    if (!data.codigo_producto || !data.nombre_producto || !data.precio) {
      throw new Error('codigo_producto, nombre_producto y precio son requeridos');
    }
    if (data.precio < 0) throw new Error('El precio no puede ser negativo');

    const existe = await ProductoModel.findByCodigo(data.codigo_producto);
    if (existe) throw new Error('Ya existe un producto con ese código');

    const id_producto = await ProductoModel.create(data);
    return await ProductoModel.findById(id_producto);
  }

  static async update(id: number, data: IActualizarProducto) {
    const producto = await ProductoModel.findById(id);
    if (!producto) throw new Error('Producto no encontrado');
    if (data.precio !== undefined && data.precio < 0) {
      throw new Error('El precio no puede ser negativo');
    }
    await ProductoModel.update(id, data);
    return await ProductoModel.findById(id);
  }

  static async delete(id: number) {
    const producto = await ProductoModel.findById(id);
    if (!producto) throw new Error('Producto no encontrado');
    await ProductoModel.delete(id);
    return { mensaje: 'Producto eliminado correctamente' };
  }

  // El trigger maneja el stock, solo validamos antes de insertar
  static async registrarMovimiento(id_usuario: number, data: ICrearMovimiento) {
    if (!data.id_producto || !data.tipo_movimiento || !data.cantidad) {
      throw new Error('id_producto, tipo_movimiento y cantidad son requeridos');
    }
    if (data.cantidad <= 0) throw new Error('La cantidad debe ser mayor a 0');

    const producto = await ProductoModel.findById(data.id_producto);
    if (!producto) throw new Error('Producto no encontrado');

    // Validar stock antes de salida (el trigger también lo valida pero mejor validar antes)
    if (data.tipo_movimiento === 'Salida' && producto.stock < data.cantidad) {
      throw new Error(`Stock insuficiente. Stock actual: ${producto.stock}`);
    }

    await ProductoModel.registrarMovimiento(id_usuario, data);

    const productoActualizado = await ProductoModel.findById(data.id_producto);
    const alertaStock = productoActualizado!.stock <= 5;

    return {
      mensaje: `Movimiento de ${data.tipo_movimiento} registrado correctamente`,
      stock_actual: productoActualizado!.stock,
      alerta_stock_bajo: alertaStock
    };
  }

  static async getMovimientos(id_producto: number) {
    const producto = await ProductoModel.findById(id_producto);
    if (!producto) throw new Error('Producto no encontrado');
    return await ProductoModel.getMovimientos(id_producto);
  }

  static async getStockBajo() {
    const productos = await ProductoModel.getStockBajo();
    return {
      total: productos.length,
      productos,
      mensaje: productos.length > 0
        ? `⚠️ ${productos.length} producto(s) con stock bajo`
        : '✅ Todos los productos tienen stock suficiente'
    };
  }
}
