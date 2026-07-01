import crypto from 'crypto';
import { PagoModel } from '../models/pago.model';
import { VentaModel } from '../models/venta.model';
import { ICrearPago, IIniciarPagoResponse, IItemPago, IPagoOnline } from '../interfaces/pago.interface';

const WOMPI_API = process.env.WOMPI_API_URL || 'https://sandbox.wompi.co/v1';

function generarReferencia(): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `BL-${ts}-${rand}`;
}

function calcularIntegrity(referencia: string, amountInCents: number): string {
  const cadena = `${referencia}${amountInCents}COP${process.env.WOMPI_INTEGRITY_KEY}`;
  return crypto.createHash('sha256').update(cadena).digest('hex');
}

function obtenerRedirectUrl(): string {
  const redirectUrl = process.env.WOMPI_REDIRECT_URL || 'http://localhost:4200/pago/resultado';

  try {
    const url = new URL(redirectUrl);
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/pago/resultado';
    }
    return url.toString();
  } catch {
    return redirectUrl;
  }
}

export class PagoService {

  static async iniciarPago(
    payload: ICrearPago,
    id_usuario: number
  ): Promise<IIniciarPagoResponse> {
    const referencia    = generarReferencia();
    const amountInCents = Math.round(payload.total * 100);

    await PagoModel.crear(referencia, id_usuario, payload.items, payload.total);

    return {
      referencia,
      amountInCents,
      publicKey:     process.env.WOMPI_PUBLIC_KEY || '',
      integrityHash: calcularIntegrity(referencia, amountInCents),
      currency:      'COP',
      redirectUrl:   obtenerRedirectUrl(),
    };
  }

  static async verificarPago(
    transactionId: string
  ): Promise<{ ok: boolean; estado: string; referencia?: string; idVenta?: number; mensaje?: string }> {
    // 1. Verificar con Wompi API
    const res = await fetch(`${WOMPI_API}/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${process.env.WOMPI_PRIVATE_KEY}` },
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      console.error(`[Wompi] Error ${res.status} al verificar transacción ${transactionId}:`, errorBody);
      return { ok: false, estado: 'error', mensaje: `No se pudo consultar la transacción en Wompi (HTTP ${res.status})` };
    }

    const data: any = await res.json();
    const tx        = data.data;
    const referencia: string = tx.reference;
    const statusWompi: string = tx.status; // APPROVED | DECLINED | VOIDED | ERROR

    // 2. Buscar pago pendiente
    const pago = await PagoModel.findByReferencia(referencia);
    if (!pago) {
      return { ok: false, estado: 'error', mensaje: 'Referencia de pago no encontrada' };
    }

    // Ya fue procesado antes
    if (pago.estado !== 'pendiente') {
      return { ok: pago.estado === 'aprobado', estado: pago.estado, referencia, idVenta: pago.id_venta ?? undefined };
    }

    if (statusWompi !== 'APPROVED') {
      const estadoFinal = statusWompi === 'DECLINED' ? 'rechazado' : 'error';
      await PagoModel.actualizarEstado(referencia, estadoFinal as any, transactionId, statusWompi);
      return { ok: false, estado: estadoFinal, mensaje: 'Pago no aprobado por Wompi' };
    }

    // 3. Crear venta en BD
    const items: IItemPago[] = typeof pago.items === 'string'
      ? JSON.parse(pago.items)
      : (pago.items as unknown as IItemPago[]);

    const detalles = items.map(i => ({
      id_producto:     i.id_producto,
      cantidad:        i.cantidad,
      precio_unitario: i.precio_unitario,
    }));

    const idVenta = await VentaModel.create(pago.id_usuario, {
      metodo_pago: 'otro',
      detalles,
    });

    // 4. Marcar pago como aprobado
    await PagoModel.actualizarEstado(referencia, 'aprobado', transactionId, statusWompi, idVenta);

    return { ok: true, estado: 'aprobado', referencia, idVenta };
  }

  static async getMisCompras(id_usuario: number): Promise<IPagoOnline[]> {
    return PagoModel.getMisCompras(id_usuario);
  }
}
