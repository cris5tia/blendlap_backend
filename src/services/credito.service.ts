import { CreditoModel } from '../models/credito.model';
import { ICrearCredito, IRegistrarAbono } from '../interfaces/credito.interface';
import { EmailService } from './email.service';

export class CreditoService {

  static async getAll(filtros?: { estado?: string; busqueda?: string }) {
    return await CreditoModel.findAll(filtros);
  }

  static async getById(id: number) {
    const credito = await CreditoModel.findById(id);
    if (!credito) throw new Error('Crédito no encontrado');
    return credito;
  }

  static async crearAdmin(data: ICrearCredito, id_admin: number) {
    if (!data.nombre_cliente?.trim()) throw new Error('Nombre del cliente requerido');
    if (!data.telefono_cliente?.trim()) throw new Error('Teléfono requerido');
    if (!data.plazo) throw new Error('Selecciona un plazo');
    if (!data.productos?.length) throw new Error('Agrega al menos un producto');
    const id = await CreditoModel.crearAdmin(data, id_admin);
    return await CreditoModel.findById(id);
  }

  static async solicitarCliente(data: ICrearCredito, id_cliente: number) {
    if (!data.plazo) throw new Error('Selecciona un plazo');
    if (!data.productos?.length) throw new Error('El carrito está vacío');
    const id = await CreditoModel.solicitarCliente(data, id_cliente);
    return await CreditoModel.findById(id);
  }

  static async aprobar(id: number) {
    const credito = await CreditoModel.findById(id);
    if (!credito) throw new Error('Crédito no encontrado');
    if (credito.estado !== 'pendiente') throw new Error('Solo se pueden aprobar créditos pendientes');
    await CreditoModel.aprobar(id);
    return await CreditoModel.findById(id);
  }

  static async rechazar(id: number) {
    const credito = await CreditoModel.findById(id);
    if (!credito) throw new Error('Crédito no encontrado');
    if (credito.estado !== 'pendiente') throw new Error('Solo se pueden rechazar créditos pendientes');
    await CreditoModel.rechazar(id);

    if (credito.id_cliente) {
      const correo = await CreditoModel.getClienteEmail(credito.id_cliente);
      console.log('[rechazar] id_cliente:', credito.id_cliente, '| correo encontrado:', correo);
      if (correo) {
        console.log('[rechazar] Enviando email de rechazo a:', correo);
        EmailService.enviarCreditoRechazado(
          correo,
          credito.nombre_cliente,
          credito.productos ?? [],
          credito.monto_total,
          credito.plazo
        ).then(() => console.log('[rechazar] Email enviado OK'))
         .catch((err) => console.error('[rechazar] Error email:', err?.message));
      } else {
        console.log('[rechazar] No se encontró correo para el cliente');
      }
    } else {
      console.log('[rechazar] Crédito sin id_cliente (creado por admin)');
    }

    return { mensaje: 'Solicitud rechazada' };
  }

  static async abonar(data: IRegistrarAbono, id_admin: number) {
    if (!data.monto || data.monto <= 0) throw new Error('El monto debe ser mayor a 0');
    const credito = await CreditoModel.findById(data.id_credito);
    if (!credito) throw new Error('Crédito no encontrado');
    if (credito.estado !== 'activo' && credito.estado !== 'vencido') {
      throw new Error('Solo se pueden abonar créditos activos o vencidos');
    }
    if (data.monto > credito.saldo_pendiente) {
      throw new Error('El abono supera el saldo pendiente');
    }
    await CreditoModel.abonar(data, id_admin);
    return await CreditoModel.findById(data.id_credito);
  }

  static async actualizarVencidos() {
    await CreditoModel.actualizarVencidos();
  }
}