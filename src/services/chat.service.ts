import axios from 'axios';
import { ReservaService } from './reserva.service';
import { ServicioModel } from '../models/servicio.model';
import { UsuarioModel } from '../models/usuario.model';
import { ProductoModel } from '../models/producto.model';
import logger from '../utils/logger';

type ChatIntent = 'info' | 'create_reservation' | 'list_reservations';
type MenuOption = { label: string; value: string };
type ChatProductCard = {
  nombre: string;
  precio: string;
  imagen: string | null;
  disponible: boolean;
};

type ChatCatalogCard = {
  nombre: string;
  subtitulo?: string;
  imagen: string | null;
  mediaFolder: 'productos' | 'barberos' | 'servicios';
  badge?: string;
};

type ChatMeta = {
  options?: MenuOption[];
  step?: string;
  slots?: string[];
  products?: ChatProductCard[];
  catalogCards?: ChatCatalogCard[];
  requiresAuth?: boolean;
  freshStart?: boolean;
  [key: string]: unknown;
};

type LlmResponse = {
  intent: ChatIntent;
  message: string;
  data?: {
    fecha?: string;
    hora?: string;
    barbero_nombre?: string;
    servicios_nombres?: string[];
  };
};

type ProcessArgs = {
  sessionKey: string;
  id_cliente?: number;
  message: string;
  isGuest: boolean;
};

type BookingStep = 'servicio' | 'barbero' | 'fecha' | 'hora';

type PendingBooking = {
  step: BookingStep;
  servicios_nombres: string[];
  servicios_ids: number[];
  barbero_nombre?: string;
  id_barbero?: number;
  fecha?: string;
};

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 20000);
const CHAT_MEMORY_MAX_TURNS = Number(process.env.CHAT_MEMORY_MAX_TURNS || 6);

type ChatRole = 'user' | 'assistant';
type MemoryItem = { role: ChatRole; content: string };
const memoryBySession = new Map<string, MemoryItem[]>();
const pendingBookingBySession = new Map<string, PendingBooking>();
const awaitingServiceCategoryBySession = new Map<string, boolean>();
const awaitingProductCategoryBySession = new Map<string, boolean>();

const PRODUCT_CATEGORY_KEYS = ['barberia', 'ropa', 'accesorios', 'cuidado'] as const;
type ProductCategoryKey = (typeof PRODUCT_CATEGORY_KEYS)[number];

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function normalizeText(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const SMALL_WORDS_ES = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'para', 'con', 'sin']);

function toTitleCaseEs(text: string): string {
  return text
    .split(' ')
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS_ES.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function formatCatalogName(raw: string): string {
  let s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return 'Sin nombre';

  const typoFixes: [RegExp, string][] = [
    [/\bbarveria\b/gi, 'barbería'],
    [/\bbareria\b/gi, 'barbería'],
    [/\bbarberia\b/gi, 'barbería'],
    [/\baccesorios\b/gi, 'accesorios'],
    [/\baccesorio\b/gi, 'accesorio'],
    [/\bshampoo\b/gi, 'shampoo'],
    [/\bachampu\b/gi, 'champú'],
    [/\bchampu\b/gi, 'champú'],
    [/\bacondicionador\b/gi, 'acondicionador'],
    [/\bgel fijadr\b/gi, 'gel fijador'],
    [/\bpomada fijadr\b/gi, 'pomada fijadora'],
    [/\bcrema hidratante\b/gi, 'crema hidratante'],
    [/\bgorrs\b/gi, 'gorras'],
    [/\bgorra\b/gi, 'gorra'],
    [/\bnavajas\b/gi, 'navajas'],
    [/\bpeine\b/gi, 'peine'],
    [/\bpeines\b/gi, 'peines'],
  ];

  for (const [pattern, replacement] of typoFixes) {
    s = s.replace(pattern, replacement);
  }

  return toTitleCaseEs(s);
}

function formatPersonName(nombre?: string, apellido?: string): string {
  const full = `${nombre ?? ''} ${apellido ?? ''}`.trim();
  return toTitleCaseEs(full || 'Barbero');
}

function normalizeProductCategoryKey(raw: string): ProductCategoryKey | null {
  const n = normalizeText(raw);
  const map: Record<string, ProductCategoryKey> = {
    barberia: 'barberia',
    barbería: 'barberia',
    barveria: 'barberia',
    bareria: 'barberia',
    ropa: 'ropa',
    ropas: 'ropa',
    vestimenta: 'ropa',
    accesorio: 'accesorios',
    accesorios: 'accesorios',
    accesorioss: 'accesorios',
    cuidado: 'cuidado',
    cuidados: 'cuidado',
    capilar: 'cuidado',
    shampoo: 'cuidado',
    champu: 'cuidado',
  };
  return map[n] || (PRODUCT_CATEGORY_KEYS.includes(n as ProductCategoryKey) ? (n as ProductCategoryKey) : null);
}

function productMatchesCategory(producto: any, cat: ProductCategoryKey): boolean {
  return normalizeProductCategoryKey(String(producto?.categoria || '')) === cat;
}

function isResetIntent(msgNorm: string): boolean {
  if (/(cancelar cita|cancelar reserva|cancelar mi cita|cancelar una cita)/.test(msgNorm)) {
    return false;
  }
  return /(reiniciar|reset chat|borrar chat|limpiar chat|resetear|olvida|menu principal|^menu$|inicio|desde cero|empezar de nuevo|volver al inicio|^volver$|^cancelar$|cancelar proceso|no quiero|salir|regresar|atras|volver a empezar|comenzar de nuevo|otra vez desde cero)/.test(msgNorm);
}

function welcomeMessage(isGuest: boolean): string {
  if (isGuest) {
    return [
      '¡Hola! Soy BARBUX, tu asistente de Blendlap.',
      '',
      'Puedo ayudarte con servicios, productos y barberos.',
      '',
      '¿En qué te ayudo?',
    ].join('\n');
  }
  return [
    '¡Hola! Soy BARBUX, tu asistente de Blendlap.',
    '',
    'Puedo ayudarte a agendar citas, ver tus reservas, consultar servicios y productos.',
    '',
    'Usa los botones de abajo o escríbeme lo que necesites.',
  ].join('\n');
}

function resetChatToStart(sessionKey: string, isGuest: boolean, forceWelcome = false) {
  const pending = pendingBookingBySession.get(sessionKey);
  let msg = welcomeMessage(isGuest);

  if (pending && !forceWelcome) {
    let cancelDetail = 'El agendamiento fue cancelado.';
    if (pending.servicios_nombres && pending.servicios_nombres.length > 0) {
      const serv = pending.servicios_nombres.join(', ');
      if (pending.barbero_nombre) {
        if (pending.fecha) {
          cancelDetail = `El agendamiento para el servicio ${serv} con el barbero ${pending.barbero_nombre} el día ${formatFechaLegible(pending.fecha)} fue cancelado.`;
        } else {
          cancelDetail = `El agendamiento para el servicio ${serv} con el barbero ${pending.barbero_nombre} fue cancelado.`;
        }
      } else {
        cancelDetail = `El agendamiento para el servicio ${serv} fue cancelado.`;
      }
    } else if (pending.barbero_nombre) {
      cancelDetail = `El agendamiento con el barbero ${pending.barbero_nombre} fue cancelado.`;
    }
    msg = `${cancelDetail}\n\n¿En qué más te puedo ayudar?`;
  }

  memoryBySession.delete(sessionKey);
  pendingBookingBySession.delete(sessionKey);
  awaitingServiceCategoryBySession.delete(sessionKey);
  awaitingProductCategoryBySession.delete(sessionKey);

  return {
    reply: msg,
    intent: 'info' as ChatIntent,
    meta: {
      options: mainMenuOptions(isGuest),
      freshStart: true,
    },
  };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatFechaLegible(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  if (!y || !m || !d) return fecha;
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

function formatHoraLegible(hora: string): string {
  const [h, m] = (hora || '00:00').split(':').map(Number);
  const sufijo = h >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
}

function formatEstadoReserva(estado: string): string {
  const map: Record<string, string> = {
    pendiente: 'Pendiente de confirmación',
    confirmada: 'Confirmada',
    completada: 'Completada',
    cancelada: 'Cancelada',
  };
  return map[estado] || estado;
}

function formatPrecio(valor: unknown): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return '';
  return `$${n.toLocaleString('es-CO')}`;
}

function safeJsonParse(content: string): any | null {
  const trimmed = content
    .trim()
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function looksLikeReservationData(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  return Boolean(
    obj.fecha ||
    obj.hora ||
    obj.barbero_nombre ||
    (Array.isArray(obj.servicios_nombres) && obj.servicios_nombres.length > 0)
  );
}

function pushMemory(sessionKey: string, item: MemoryItem): void {
  const list = memoryBySession.get(sessionKey) || [];
  list.push(item);
  const maxItems = Math.max(2, CHAT_MEMORY_MAX_TURNS * 2);
  if (list.length > maxItems) list.splice(0, list.length - maxItems);
  memoryBySession.set(sessionKey, list);
}

function readMemory(sessionKey: string): MemoryItem[] {
  return memoryBySession.get(sessionKey) || [];
}

function reply(
  sessionKey: string,
  text: string,
  intent: ChatIntent,
  meta?: ChatMeta
): { reply: string; intent: ChatIntent; meta?: unknown } {
  pushMemory(sessionKey, { role: 'assistant', content: text });
  return { reply: text, intent, meta };
}

function guestMenuOptions(): MenuOption[] {
  return [
    { label: 'Ver servicios', value: 'Ver servicios' },
    { label: 'Ver productos', value: 'Ver productos' },
    { label: 'Ver barberos disponibles', value: 'Ver barberos disponibles' },
    { label: '¿Cómo hago una reserva?', value: '¿Cómo hago una reserva?' },
    { label: 'Volver al inicio', value: 'Volver al inicio' },
  ];
}

function filterGuestOptions(options: MenuOption[], isGuest: boolean): MenuOption[] {
  if (!isGuest) return options;
  return options.filter((o) => {
    const v = normalizeText(o.value);
    return v !== 'agendar cita' && v !== 'mis citas';
  });
}

function mainMenuOptions(isGuest = false): MenuOption[] {
  if (isGuest) return guestMenuOptions();
  return [
    { label: 'Agendar cita', value: 'Agendar cita' },
    { label: 'Mis citas', value: 'Mis citas' },
    { label: 'Ver servicios', value: 'Ver servicios' },
    { label: 'Ver productos', value: 'Ver productos' },
    { label: 'Ver barberos disponibles', value: 'Ver barberos disponibles' },
    { label: '¿Cómo hago una reserva?', value: '¿Cómo hago una reserva?' },
    { label: 'Volver al inicio', value: 'Volver al inicio' },
  ];
}

function isReservationHowToQuestion(msgNorm: string): boolean {
  return /(como (hago|se hace|reservo|agendo|reserv)|pasos para reservar|como funciona (la )?reserva|que necesito para reservar)/.test(msgNorm);
}

function wantsToBook(msgNorm: string): boolean {
  if (isReservationHowToQuestion(msgNorm)) return false;
  return /(agendar|agenda cita|reserv|hacer cita|quiero cita|necesito cita|programar cita|solicitar cita|pedir cita|quiero una cita|hacer una reserva|hacer reservas)/.test(msgNorm);
}

function wantsToViewBookings(msgNorm: string): boolean {
  return /(mis reservas|mis citas|que citas tengo|ver reservas|ver citas|ver mis reservas|consultar (mis )?citas|consultar (mis )?reservas|proxima cita|siguiente cita)/.test(msgNorm);
}

function requiresAuthAction(msgNorm: string): { required: boolean; accion?: string } {
  if (wantsToViewBookings(msgNorm)) {
    return { required: true, accion: 'ver tus reservas' };
  }
  if (wantsToBook(msgNorm)) {
    return { required: true, accion: 'hacer una reserva' };
  }
  return { required: false };
}

function authRequiredReply(sessionKey: string, accion: string, isGuest: boolean) {
  return reply(
    sessionKey,
    [
      'No tienes permisos para hacer o ver reservas sin iniciar sesión.',
      '',
      `Para ${accion}, inicia sesión o regístrate como cliente en Blendlap.`,
      '',
      'Mientras tanto, puedo mostrarte servicios, productos y barberos disponibles.',
    ].join('\n'),
    'info',
    { requiresAuth: true, options: mainMenuOptions(isGuest) }
  );
}

function productCategoryLabel(cat: string): string {
  const map: Record<string, string> = {
    barberia: 'Barbería',
    ropa: 'Ropa',
    accesorios: 'Accesorios',
    cuidado: 'Cuidado',
  };
  return map[cat] || cat;
}

function productCategoryOptions(): MenuOption[] {
  return [
    { label: 'Barbería', value: 'Barbería' },
    { label: 'Ropa', value: 'Ropa' },
    { label: 'Accesorios', value: 'Accesorios' },
    { label: 'Cuidado', value: 'Cuidado' },
    { label: 'Ver todas las categorías', value: 'Ver productos' },
    { label: 'Volver al inicio', value: 'Volver al inicio' },
  ];
}

function matchProductCategory(msgNorm: string): ProductCategoryKey | null {
  if (msgNorm.startsWith('cat:')) {
    const key = msgNorm.slice(4).trim() as ProductCategoryKey;
    if (PRODUCT_CATEGORY_KEYS.includes(key)) return key;
  }

  if (/(barberia|barbería|productos de barberia)/.test(msgNorm)) return 'barberia';
  if (/(ropa|prendas|vestimenta)/.test(msgNorm) && !/accesorio/.test(msgNorm)) return 'ropa';
  if (/(accesorios|accesorio)/.test(msgNorm)) return 'accesorios';
  if (/(cuidado|capilar|shampoo|acondicionador)/.test(msgNorm)) return 'cuidado';

  return null;
}

function simplifyProductName(fullName: string): string {
  let word = fullName.trim().split(/[\s\-_]+/)[0].toLowerCase();
  if (word === 'jean') return 'jeans';
  if (word === 'balsamo') return 'bálsamos';
  if (word === 'pantalon') return 'pantalones';
  if (word === 'camisa') return 'camisas';
  if (word === 'camiseta') return 'camisetas';
  if (word === 'aceite') return 'aceites';
  if (word === 'cera') return 'ceras';
  if (word === 'shampoo') return 'shampoos';
  if (word === 'acondicionador') return 'acondicionadores';
  if (word === 'gorra') return 'gorras';
  if (word === 'peine') return 'peines';
  if (word === 'navaja') return 'navajas';

  if (word.endsWith('s')) return word;
  if (/[aeiouáéíóú]$/.test(word)) {
    return word + 's';
  }
  return word + 'es';
}

function formatProductosPorCategoria(productos: any[]): string {
  const activos = productos.filter((p) => String(p?.estado || 'activo') === 'activo');
  const bloques: string[] = ['En la tienda de Blendlap tenemos estas categorías de productos:\n'];

  for (const cat of PRODUCT_CATEGORY_KEYS) {
    const items = activos.filter((p) => productMatchesCategory(p, cat));
    let listaTerminos: string[] = [];
    if (items.length > 0) {
      listaTerminos = [...new Set(items.map((p) => simplifyProductName(String(p.nombre_producto || ''))))];
    }

    let descripcion = '';
    if (cat === 'barberia') {
      const terminos = listaTerminos.length > 0 ? listaTerminos.join(', ') : 'ceras, aceites, bálsamos';
      descripcion = `Tenemos: ${terminos}.`;
    } else if (cat === 'ropa') {
      const terminos = listaTerminos.length > 0 ? listaTerminos.join(', ') : 'camisas, pantalones, jeans';
      descripcion = `Prendas con estilo en Blendlap como: ${terminos}.`;
    } else if (cat === 'accesorios') {
      const terminos = listaTerminos.length > 0 ? listaTerminos.join(', ') : 'gorras, peines, navajas';
      descripcion = `Accesorios con estilo en Blendlap como: ${terminos}.`;
    } else if (cat === 'cuidado') {
      const terminos = listaTerminos.length > 0 ? listaTerminos.join(', ') : 'shampoos, acondicionadores';
      descripcion = `Productos para tu cuidado personal en Blendlap como: ${terminos}.`;
    } else {
      const terminos = listaTerminos.length > 0 ? listaTerminos.join(', ') : 'artículos varios';
      descripcion = `Tenemos: ${terminos}.`;
    }

    bloques.push(
      `\n${productCategoryLabel(cat)}:`,
      descripcion
    );
  }

  bloques.push('\n\n¿Qué categoría quieres ver? Elige una opción.');
  return bloques.join('\n');
}

function buildProductCards(productos: any[]): ChatProductCard[] {
  return productos
    .filter((p) => String(p?.estado || 'activo') === 'activo')
    .slice(0, 12)
    .map((p) => {
      const catLabel = productCategoryLabel(String(p.categoria || ''));
      const precio = formatPrecio(p.precio);
      const precioConCat = catLabel ? `${catLabel} · ${precio}` : precio;
      return {
        nombre: formatCatalogName(String(p.nombre_producto || 'Producto')),
        precio: precioConCat,
        imagen: p.imagen ? String(p.imagen) : null,
        disponible: Number(p.stock) > 0,
      };
    });
}

function buildProductCatalogCards(productos: any[]): ChatCatalogCard[] {
  return buildProductCards(productos).map((p) => ({
    nombre: p.nombre,
    subtitulo: p.precio,
    imagen: p.imagen,
    mediaFolder: 'productos' as const,
    badge: p.disponible ? 'Disponible' : 'Agotado',
  }));
}

function buildServiceCatalogCards(servicios: any[]): ChatCatalogCard[] {
  const sorted = [...servicios].sort((a, b) => {
    const catA = classifyServiceCategory(a);
    const catB = classifyServiceCategory(b);
    if (catA === 'premium' && catB === 'clasico') return -1;
    if (catA === 'clasico' && catB === 'premium') return 1;
    return 0;
  });

  return sorted
    .filter((s) => String(s?.estado || 'activo') === 'activo')
    .slice(0, 12)
    .map((s) => {
      const esPremium = classifyServiceCategory(s) === 'premium';
      const partes = [formatPrecio(s.precio), s.duracion ? `${s.duracion} min` : ''].filter(Boolean);
      return {
        nombre: formatCatalogName(String(s.nombre_servicio || 'Servicio')),
        subtitulo: partes.join(' · ') || undefined,
        imagen: s.imagen ? String(s.imagen) : null,
        mediaFolder: 'servicios' as const,
        badge: esPremium ? 'Premium' : 'Clásico',
      };
    });
}

function buildBarberCatalogCards(barberos: any[]): ChatCatalogCard[] {
  return barberos
    .filter((b) => String(b?.estado || '').toLowerCase() === 'activo')
    .slice(0, 12)
    .map((b) => {
      const subtitulo = [b.titulo, b.especialidades].filter(Boolean).join(' · ');
      return {
        nombre: formatPersonName(b.nombre, b.apellido),
        subtitulo: subtitulo || 'Barbero profesional',
        imagen: b.foto ? String(b.foto) : null,
        mediaFolder: 'barberos' as const,
        badge: 'Disponible',
      };
    });
}

function classifyServiceCategory(servicio: any): 'clasico' | 'premium' {
  const catNorm = normalizeText(String(servicio?.categoria ?? ''));
  if (catNorm.includes('premium')) return 'premium';
  return 'clasico';
}

function formatServiciosPorCategoria(servicios: any[]): {
  clasicos: any[];
  premium: any[];
  text: string;
} {
  const clasicos = servicios.filter((s) => classifyServiceCategory(s) === 'clasico');
  const premium = servicios.filter((s) => classifyServiceCategory(s) === 'premium');

  const text = [
    'Tenemos dos categorías de servicios: Clásicos y Premium.',
    '',
    '¿Qué categoría te interesa? Elige Clásicos o Premium.',
  ].join('\n');

  return { clasicos, premium, text };
}

function isPrivateRequest(msgNorm: string): boolean {
  return /(contrase|password|clave de otro|datos de otro|otro cliente|panel admin|ventas totales|cuanto gana|informacion interna|base de datos|usuarios registrados|correo de otro|telefono de otro)/.test(msgNorm);
}

function isBarberiaTopic(msgNorm: string): boolean {
  return /(barber|blendlap|cita|reserv|agendar|servicio|premium|clasico|barbero|estilista|producto|tienda|corte|barba|peinado|horario|ubicacion|direccion|promoc|descuento|precio|pago|metodo de pago|cliente|reserva)/.test(msgNorm);
}

function parseFechaInput(text: string): string | null {
  const raw = text.trim();
  const t = normalizeText(raw);
  const today = new Date();

  if (t === 'hoy') return toIsoDate(today);

  if (t === 'manana') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return toIsoDate(d);
  }

  if (t === 'pasado manana') {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return toIsoDate(d);
  }

  const DIAS_MAP: Record<string, number> = {
    domingo: 0, dom: 0,
    lunes: 1, lun: 1,
    martes: 2, mar: 2,
    miercoles: 3, mie: 3,
    jueves: 4, jue: 4,
    viernes: 5, vie: 5,
    sabado: 6, sab: 6
  };

  for (const dayName of Object.keys(DIAS_MAP)) {
    if (new RegExp(`\\b${dayName}\\b`, 'i').test(t)) {
      const targetDay = DIAS_MAP[dayName];
      let daysToAdd = targetDay - today.getDay();
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }
      const d = new Date(today);
      d.setDate(today.getDate() + daysToAdd);
      return toIsoDate(d);
    }
  }

  const MESES_MAP: Record<string, number> = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
  };

  const regexSpan = /\b(\d{1,2})\b\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de\s+)?(\d{4})?/i;
  const matchSpan = t.match(regexSpan);
  if (matchSpan) {
    const day = parseInt(matchSpan[1]);
    const monthName = matchSpan[2];
    const monthIndex = MESES_MAP[monthName];
    const yearPart = matchSpan[3];
    let year = yearPart ? parseInt(yearPart) : today.getFullYear();

    let computedDate = new Date(year, monthIndex, day);
    if (!yearPart && computedDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      year += 1;
      computedDate = new Date(year, monthIndex, day);
    }

    const y = computedDate.getFullYear();
    const m = String(computedDate.getMonth() + 1).padStart(2, '0');
    const d = String(computedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  const dmy = raw.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mm}-${dd}`;
  }

  return null;
}

function parseHoraInput(text: string): string | null {
  const t = normalizeText(text);

  const hm = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  const hOnly = t.match(/\b(\d{1,2})\s*(am|pm|a\.m|p\.m)\b/);
  if (hOnly) {
    let h = Number(hOnly[1]);
    const pm = hOnly[2].startsWith('p');
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:00`;
  }

  const tarde = /tarde|noches?/i.test(t);
  const aLas = t.match(/\ba\s+las\s+(\d{1,2})\b/);
  if (aLas) {
    let h = Number(aLas[1]);
    if (tarde && h < 12) h += 12;
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  const numOnly = t.match(/\b(\d{1,2})\b/);
  if (numOnly) {
    let h = Number(numOnly[1]);
    if (h >= 7 && h <= 20) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  return null;
}

function matchServicios(text: string, servicios: any[]): { ids: number[]; nombres: string[] } {
  const t = normalizeText(text);
  const matches: { id: number; nombre: string; score: number }[] = [];

  for (const s of servicios) {
    const nombre = String(s?.nombre_servicio || '');
    const n = normalizeText(nombre);
    if (!n) continue;
    if (t === n || t.includes(n) || n.includes(t)) {
      matches.push({ id: Number(s.id_servicio), nombre, score: n.length });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  const top = matches.slice(0, 3);
  return {
    ids: top.map((m) => m.id),
    nombres: top.map((m) => m.nombre),
  };
}

function matchBarbero(text: string, barberos: any[]): any | null {
  const t = normalizeText(text);
  return barberos.find((b) => {
    const full = normalizeText(`${b?.nombre ?? ''} ${b?.apellido ?? ''}`.trim());
    const first = normalizeText(String(b?.nombre || ''));
    return full === t || full.includes(t) || t.includes(full) || (first && t.includes(first));
  }) || null;
}

function formatServicios(servicios: any[]): string {
  const items = servicios.slice(0, 20).map((s) => {
    const precio = s.precio != null ? ` — ${formatPrecio(s.precio)}` : '';
    const dur = s.duracion != null ? ` (${s.duracion} min)` : '';
    const catRaw = String(s?.categoria ?? '').trim();
    const catNorm = normalizeText(catRaw);
    const etiqueta =
      catNorm.includes('premium') ? 'Premium' :
      catNorm.includes('clas') ? 'Clásico' :
      (catRaw ? catRaw : 'Clásico');
    return `• ${formatCatalogName(String(s.nombre_servicio || 'Servicio'))} — ${etiqueta}${precio}${dur}`;
  });
  return items.join('\n');
}

function formatBarberos(barberos: any[]): string {
  return barberos
    .slice(0, 15)
    .map((b) => `• ${formatPersonName(b?.nombre, b?.apellido)}`)
    .filter((l) => l.length > 2)
    .join('\n');
}

function showProductCategoryOverview(sessionKey: string, productos: any[]) {
  awaitingProductCategoryBySession.set(sessionKey, true);
  const activos = productos.filter((p) => String(p?.estado || 'activo') === 'activo');
  const catalogCards = buildProductCatalogCards(activos.slice(0, 4));
  return reply(sessionKey, formatProductosPorCategoria(productos), 'info', {
    catalogCards,
    options: productCategoryOptions(),
  });
}

function showProductsInCategory(sessionKey: string, productos: any[], cat: ProductCategoryKey) {
  awaitingProductCategoryBySession.set(sessionKey, true);
  const subset = productos.filter(
    (p) => productMatchesCategory(p, cat) && String(p?.estado || 'activo') === 'activo'
  );
  const label = productCategoryLabel(cat);

  if (subset.length === 0) {
    return reply(
      sessionKey,
      `No hay productos activos en la categoría ${label} por ahora.\n\n¿Quieres ver otra categoría?`,
      'info',
      { options: productCategoryOptions() }
    );
  }

  const cards = buildProductCards(subset);
  const catalogCards = buildProductCatalogCards(subset);

  return reply(
    sessionKey,
    `Productos en ${label}:\n\nPuedes comprarlos en la sección Productos del sitio.`,
    'info',
    {
      products: cards,
      catalogCards,
      options: productCategoryOptions(),
    }
  );
}

function formatReservas(rows: any[]): string {
  if (!rows || rows.length === 0) {
    return 'No tienes citas registradas.\n\n¿Quieres que te ayude a agendar una? Solo dime "Agendar cita".';
  }

  const hoy = toIsoDate(new Date());
  const activas = rows.filter((r) => r.estado !== 'cancelada');
  const proximas = activas.filter((r) => {
    const fecha = typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : toIsoDate(new Date(r.fecha));
    return fecha >= hoy;
  });
  const pasadas = activas.filter((r) => {
    const fecha = typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : toIsoDate(new Date(r.fecha));
    return fecha < hoy;
  });

  const formatOne = (r: any, idx: number): string => {
    const fechaRaw = typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : toIsoDate(new Date(r.fecha));
    const dateObj = new Date(`${fechaRaw}T12:00:00`);
    const dia = DIAS[dateObj.getDay()];
    const servicios = r.nombre_servicio || 'Servicio no especificado';
    const barbero = r.nombre_barbero ? `Barbero: <strong>${r.nombre_barbero}</strong>` : '';
    const estado = formatEstadoReserva(String(r.estado || ''));
    const total = r.precio_total ? `Total estimado: <strong>${formatPrecio(r.precio_total)}</strong>` : '';

    let statusStyle = 'color: #999;';
    if (r.estado === 'confirmada') statusStyle = 'color: #2e7d32; font-weight: bold;';
    if (r.estado === 'pendiente') statusStyle = 'color: #f57c00; font-weight: bold;';
    if (r.estado === 'cancelada') statusStyle = 'color: #d32f2f; font-weight: bold;';

    return `
<div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; background-color: #ffffff; margin-bottom: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f3f4f6; padding-bottom: 4px; margin-bottom: 6px;">
    <span style="font-weight: 700; color: #1a1a1a;">#${r.id_reserva} - ${servicios}</span>
    <span style="${statusStyle}">${estado}</span>
  </div>
  <div style="font-size: 0.82rem; color: #4b5563; line-height: 1.4;">
    <div>📅 <strong>${dia.toUpperCase()}, ${formatFechaLegible(fechaRaw)}</strong></div>
    <div>⏰ Hora: <strong>${formatHoraLegible(r.hora)}</strong></div>
    ${barbero ? `<div>✂️ ${barbero}</div>` : ''}
    ${total ? `<div style="margin-top: 4px; border-top: 1px dashed #f3f4f6; padding-top: 4px; color: #1a1a1a;">💰 ${total}</div>` : ''}
  </div>
</div>
`.replace(/\r?\n\s*/g, '').trim();
  };

  const partes: string[] = ['<div style="font-weight: 700; margin-bottom: 8px; font-size: 0.95rem;">📅 Tus citas en Blendlap</div>'];

  if (proximas.length > 0) {
    partes.push('<div style="font-weight: 600; color: #4b5563; margin-top: 8px; margin-bottom: 6px;">Próximas citas:</div>');
    partes.push(proximas.slice(0, 10).map((r, i) => formatOne(r, i + 1)).join(''));
  } else {
    partes.push('<div style="color: #6b7280; font-style: italic; margin-bottom: 8px;">No tienes citas próximas.</div>');
  }

  if (pasadas.length > 0) {
    partes.push('<div style="font-weight: 600; color: #4b5563; margin-top: 12px; margin-bottom: 6px;">Historial reciente:</div>');
    partes.push(pasadas.slice(0, 5).map((r, i) => formatOne(r, i + 1)).join(''));
  }

  partes.push('<div style="margin-top: 12px; font-size: 0.8rem; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px;">¿Quieres agendar otra cita? Escríbeme "Agendar cita".</div>');
  return partes.join('');
}

function getFaqAnswer(msgNorm: string, isGuest = false): string | null {
  if (/(como (hago|se hace|reservo|agendo)|como funciona (la )?reserva|pasos para reservar)/.test(msgNorm)) {
    if (isGuest) {
      return [
        'Así puedes reservar en Blendlap:',
        '',
        '1. Regístrate o inicia sesión como cliente.',
        '2. Usa la página "Agendar" del sitio o escríbeme "Agendar cita" aquí en el chat.',
        '3. Elige servicio, barbero, fecha y hora.',
        '4. Recibes la confirmación al instante.',
      ].join('\n');
    }
    return [
      'Así puedes reservar en Blendlap:',
      '',
      '1. Escríbeme "Agendar cita" y te guiaré paso a paso.',
      '2. Elige el servicio (corte, barba, etc.).',
      '3. Elige barbero, fecha y hora disponible.',
      '4. Confirmo tu cita al instante.',
      '',
      'También puedes reservar desde la página "Agendar" del sitio.',
      '',
      'Solo uso la información necesaria para tu cita. No comparto datos de otros clientes.',
    ].join('\n');
  }

  if (/(que puedes hacer|que sabes hacer|ayuda|comandos|menu|opciones)/.test(msgNorm)) {
    if (isGuest) {
      return [
        'Puedo ayudarte con:',
        '',
        '• Servicios y precios — "Ver servicios"',
        '• Productos de la tienda — "Ver productos"',
        '• Barberos disponibles — "Ver barberos disponibles"',
        '• Cómo reservar — "¿Cómo hago una reserva?"',
        '',
        'Para agendar o ver tus citas necesitas iniciar sesión como cliente.',
      ].join('\n');
    }
    return [
      'Puedo ayudarte con:',
      '',
      '• Agendar citas — escribe "Agendar cita"',
      '• Ver tus citas — escribe "Mis citas"',
      '• Servicios y precios — escribe "Ver servicios"',
      '• Productos de la tienda — escribe "Ver productos"',
      '• Cómo reservar — escribe "¿Cómo hago una reserva?"',
      '',
      'Por privacidad, solo veo y gestiono la información de tu cuenta.',
    ].join('\n');
  }

  if (/(horario|a que hora abren|cuando abren|donde estan|ubicacion|direccion)/.test(msgNorm)) {
    return 'Para horarios y ubicación, revisa la sección "Nosotros" del sitio o pregúntame por servicios y te ayudo a agendar en un horario disponible.';
  }

  if (/(cancelar cita|cancelar reserva)/.test(msgNorm)) {
    return 'Para cancelar una cita, entra a tu panel de cliente en el sitio o contacta directamente a la barbería. Por aquí puedo mostrarte tus citas y ayudarte a agendar nuevas.';
  }

  return null;
}

function startBooking(): PendingBooking {
  return { step: 'servicio', servicios_nombres: [], servicios_ids: [] };
}

function bookingIntro(servicios: any[]): string {
  return [
    '¡Perfecto! Vamos a agendar tu cita paso a paso.',
    '',
    'Paso 1: Por favor, selecciona el servicio que deseas a continuación (puedes verlos divididos por Clásicos y Premium):',
  ].join('\n');
}

export class ChatService {
  static async processMessage(args: ProcessArgs): Promise<{ reply: string; intent: ChatIntent; meta?: any }> {
    const servicios = await ServicioModel.findAll(true);
    const barberos = await UsuarioModel.findAllBarberos();
    const msgNorm = normalizeText(args.message);
    const sk = args.sessionKey;
    const isGuest = args.isGuest;

    if (isGuest) {
      const authAction = requiresAuthAction(msgNorm);
      if (authAction.required && authAction.accion) {
        return authRequiredReply(sk, authAction.accion, isGuest);
      }
    }

    if (isPrivateRequest(msgNorm)) {
      const privMsg = isGuest
        ? 'Solo puedo compartir información pública de la barbería: servicios, productos y barberos. Para datos de tu cuenta, inicia sesión como cliente.'
        : 'Por privacidad, solo puedo ayudarte con la información de tu cuenta (tus citas, servicios públicos y productos). No comparto datos de otros clientes ni información interna.';
      return reply(sk, privMsg, 'info', { options: mainMenuOptions(isGuest) });
    }

    const pending = pendingBookingBySession.get(sk);

    if (pending && (msgNorm === 'regresar' || msgNorm === 'volver atras' || msgNorm === 'atras')) {
      if (pending.step === 'servicio' && pending.id_barbero) {
        pendingBookingBySession.delete(sk);
        const activosB = barberos.filter((b: any) => String(b?.estado || '').toLowerCase() === 'activo');
        const catalogCards = buildBarberCatalogCards(activosB);
        return reply(
          sk,
          `Barberos disponibles ahora:\n\n¿Quieres agendar con alguno?`,
          'info',
          {
            catalogCards,
            options: [
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      } else if (pending.step === 'barbero') {
        pending.servicios_ids = [];
        pending.servicios_nombres = [];
        pending.step = 'servicio';
        const activos = servicios.filter((s: any) => String(s?.estado || 'activo') === 'activo');
        const sortedActivos = [...activos].sort((a, b) => {
          const catA = classifyServiceCategory(a);
          const catB = classifyServiceCategory(b);
          if (catA === 'premium' && catB === 'clasico') return -1;
          if (catA === 'clasico' && catB === 'premium') return 1;
          return 0;
        });
        return reply(sk, bookingIntro(sortedActivos), 'create_reservation', {
          step: 'servicio',
          catalogCards: buildServiceCatalogCards(sortedActivos),
          options: [
            { label: 'Volver al inicio', value: 'volver al inicio' },
            { label: 'Cancelar', value: 'cancelar' }
          ]
        });
      } else if (pending.step === 'fecha') {
        pending.id_barbero = undefined;
        pending.barbero_nombre = undefined;
        pending.step = 'barbero';
        const barberosActivos = barberos.filter((b: any) => String(b?.estado || '').toLowerCase() === 'activo');
        return reply(
          sk,
          `Servicio: ${pending.servicios_nombres[0]}\n\n¿Con qué barbero quieres la cita?`,
          'create_reservation',
          {
            step: 'barbero',
            catalogCards: buildBarberCatalogCards(barberosActivos),
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      } else if (pending.step === 'hora') {
        pending.fecha = undefined;
        pending.step = 'fecha';
        return reply(
          sk,
          `Barbero: ${pending.barbero_nombre}\n\n¿Qué fecha prefieres?\nPor favor, selecciona una fecha en el calendario:`,
          'create_reservation',
          {
            step: 'fecha',
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }
    }

    if (msgNorm === 'volver al inicio' || msgNorm === 'volver a inicio') {
      return resetChatToStart(sk, isGuest, true);
    }

    if (isResetIntent(msgNorm)) {
      return resetChatToStart(sk, isGuest, false);
    }

    if (pending && args.id_cliente) {
      const bookingReply = await ChatService.handleBookingStep(
        sk,
        args.id_cliente,
        args.message,
        pending,
        servicios,
        barberos
      );
      if (bookingReply) return bookingReply;
    }

    const awaitingCategory = awaitingServiceCategoryBySession.get(sk) === true;
    const chooseClasicos = /(clasico|clasicos)/.test(msgNorm);
    const choosePremium = /(premium)/.test(msgNorm);
    const isDirectCategorySelection = msgNorm === 'clasicos' || msgNorm === 'premium' || msgNorm === 'clasico' ||
      ((chooseClasicos || choosePremium) && /(servicio|precios|mostrar|ver)/.test(msgNorm));

    if ((awaitingCategory && (chooseClasicos || choosePremium)) || isDirectCategorySelection) {
      const categoria = choosePremium ? 'premium' : 'clasico';
      const titulo = choosePremium ? 'Servicios Premium' : 'Servicios Clásicos';
      const subset = servicios.filter((s) => classifyServiceCategory(s) === categoria);
      const ctaAgendar = isGuest
        ? '¿Te interesa alguno? Puedes preguntarme más detalles.'
        : '¿Quieres que te agende una cita con alguno?';
      const catalogCards = buildServiceCatalogCards(subset);
      awaitingServiceCategoryBySession.delete(sk);
      return reply(
        sk,
        `${titulo}:\n\n${ctaAgendar}`,
        'info',
        {
          catalogCards,
          options: filterGuestOptions(
            [
              { label: 'Agendar cita', value: 'Agendar cita' },
              { label: 'Clásicos', value: 'Clásicos' },
              { label: 'Premium', value: 'Premium' },
              { label: 'Volver al inicio', value: 'Volver al inicio' },
            ],
            isGuest
          ),
        }
      );
    }

    const faq = getFaqAnswer(msgNorm, isGuest);
    if (faq) return reply(sk, faq, 'info', { options: mainMenuOptions(isGuest) });

    const awaitingProductCat = awaitingProductCategoryBySession.get(sk) === true;
    const productCat = matchProductCategory(msgNorm);
    const wantsProducts = /(producto|productos|tienda|comprar|catalogo)/.test(msgNorm);

    if (wantsProducts || productCat) {
      const productos = await ProductoModel.findAll();

      if (productCat && (msgNorm.startsWith('cat:') || awaitingProductCat)) {
        return showProductsInCategory(sk, productos, productCat);
      }

      if (productCat && !/(ver productos|^productos$|tienda|comprar|catalogo)/.test(msgNorm)) {
        return showProductsInCategory(sk, productos, productCat);
      }

      return showProductCategoryOverview(sk, productos);
    }

    if ((/(servicio|servicios|precio|precios|costo|cuanto vale|tarifa)/.test(msgNorm) && !/(producto|productos)/.test(msgNorm))) {
      awaitingServiceCategoryBySession.set(sk, true);
      const grouped = formatServiciosPorCategoria(servicios);
      const catalogCards = buildServiceCatalogCards(servicios);
      return reply(sk, grouped.text, 'info', {
        catalogCards,
        options: [
          { label: 'Cancelar', value: 'cancelar' }
        ]
      });
    }

    if (wantsToViewBookings(msgNorm)) {
      const rows = await ReservaService.getMisReservas(args.id_cliente!);
      return reply(sk, formatReservas(rows as any[]), 'list_reservations', { options: mainMenuOptions(false) });
    }

    if (/(barbero|barberos|estilistas?)/.test(msgNorm) && !/(agendar|reserv)/.test(msgNorm)) {
      const activos = barberos.filter((b: any) => String(b?.estado || '').toLowerCase() === 'activo');
      const ctaBarbero = isGuest
        ? '¿Quieres saber más sobre alguno?'
        : '¿Quieres agendar con alguno? Dime "Agendar cita".';
      const catalogCards = buildBarberCatalogCards(activos);
      const text = activos.length > 0
        ? `Barberos disponibles ahora:\n\n${ctaBarbero}`
        : 'En este momento no hay barberos activos/disponibles.';
      return reply(sk, text, 'info', {
        catalogCards: activos.length > 0 ? catalogCards : undefined,
        options: [
          { label: 'Cancelar', value: 'cancelar' }
        ]
      });
    }

    if (wantsToBook(msgNorm)) {
      const booking = startBooking();
      awaitingServiceCategoryBySession.delete(sk);
      awaitingProductCategoryBySession.delete(sk);
      pendingBookingBySession.set(sk, booking);

      const matchedB = matchBarbero(args.message, barberos);
      if (matchedB?.id_usuario) {
        booking.id_barbero = Number(matchedB.id_usuario);
        booking.barbero_nombre = `${matchedB.nombre} ${matchedB.apellido}`.trim();
        booking.step = 'servicio';

        const activosS = servicios.filter((s: any) => String(s?.estado || 'activo') === 'activo');
        const sortedActivosS = [...activosS].sort((a, b) => {
          const catA = classifyServiceCategory(a);
          const catB = classifyServiceCategory(b);
          if (catA === 'premium' && catB === 'clasico') return -1;
          if (catA === 'clasico' && catB === 'premium') return 1;
          return 0;
        });

        return reply(
          sk,
          `Barbero: ${booking.barbero_nombre}\n\nPor favor, selecciona el servicio que deseas a continuación:`,
          'create_reservation',
          {
            step: 'servicio',
            catalogCards: buildServiceCatalogCards(sortedActivosS),
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }

      const matchedS = matchServicios(args.message, servicios);
      if (matchedS.ids.length > 0) {
        booking.servicios_ids = matchedS.ids.slice(0, 1);
        booking.servicios_nombres = matchedS.nombres.slice(0, 1);
        booking.step = 'barbero';

        const barberosActivos = barberos.filter((b: any) => String(b?.estado || '').toLowerCase() === 'activo');
        return reply(
          sk,
          `Servicio: ${booking.servicios_nombres[0]}\n\n¿Con qué barbero quieres la cita?`,
          'create_reservation',
          {
            step: 'barbero',
            catalogCards: buildBarberCatalogCards(barberosActivos),
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }

      const activos = servicios.filter((s: any) => String(s?.estado || 'activo') === 'activo');
      const sortedActivos = [...activos].sort((a, b) => {
        const catA = classifyServiceCategory(a);
        const catB = classifyServiceCategory(b);
        if (catA === 'premium' && catB === 'clasico') return -1;
        if (catA === 'clasico' && catB === 'premium') return 1;
        return 0;
      });

      return reply(sk, bookingIntro(sortedActivos), 'create_reservation', {
        step: 'servicio',
        catalogCards: buildServiceCatalogCards(sortedActivos),
        options: [
          { label: 'Volver al inicio', value: 'volver al inicio' },
          { label: 'Cancelar', value: 'cancelar' }
        ]
      });
    }

    if (/(promoc|promo|descuento|oferta)/.test(msgNorm)) {
      const promoExtra = isGuest
        ? 'te muestro servicios y productos.'
        : 'te muestro servicios, productos o te ayudo a agendar una cita.';
      return reply(sk, `Por ahora no tenemos promociones activas. Si quieres, ${promoExtra}`, 'info', {
        options: mainMenuOptions(isGuest),
      });
    }

    if (/(hola|buenas|hey|saludos|barbux|blend-?x)/.test(msgNorm)) {
      const intro = isGuest
        ? [
            '¡Hola! Soy BARBUX, tu asistente de Blendlap.',
            '',
            'Puedo ayudarte con:',
            '• Servicios y precios',
            '• Productos de la tienda',
            '• Barberos disponibles',
            '• Cómo hacer una reserva',
          ]
        : [
            '¡Hola! Soy BARBUX, tu asistente de Blendlap.',
            '',
            'Puedo ayudarte a:',
            '• Agendar citas',
            '• Ver tus citas',
            '• Consultar servicios y productos',
            '• Explicarte cómo reservar',
            '',
            'Prueba con: "Agendar cita", "Mis citas" o "Ver productos".',
          ];
      return reply(sk, intro.join('\n'), 'info', { options: mainMenuOptions(isGuest) });
    }

    if (!isBarberiaTopic(msgNorm)) {
      const fueraTema = isGuest
        ? 'No tengo conocimiento sobre ese tema, pero sí puedo ayudarte con servicios, productos y barberos de Blendlap.'
        : 'No tengo conocimiento sobre ese tema, pero sí te puedo ayudar con cosas en base a la barbería: qué productos hay, qué barberos hay, servicios (Clásicos/Premium), agendar citas y ver tus reservas.';
      return reply(sk, fueraTema, 'info', { options: mainMenuOptions(isGuest) });
    }

    if (isGuest) {
      const lateAuth = requiresAuthAction(msgNorm);
      if (lateAuth.required && lateAuth.accion) {
        return authRequiredReply(sk, lateAuth.accion, isGuest);
      }

      return reply(
        sk,
        [
          'No estoy seguro de entender eso.',
          '',
          'Prueba con:',
          '• "Ver servicios"',
          '• "Ver productos"',
          '• "Ver barberos disponibles"',
          '• "¿Cómo hago una reserva?"',
        ].join('\n'),
        'info',
        { options: mainMenuOptions(true) }
      );
    }

    pushMemory(sk, { role: 'user', content: args.message });
    const llm = await ChatService.callOllamaChat({
      system: ChatService.buildSystemPrompt(),
      user: args.message,
      memory: readMemory(sk),
    });

    if (llm.intent === 'list_reservations') {
      const rows = await ReservaService.getMisReservas(args.id_cliente!);
      return reply(sk, formatReservas(rows as any[]), 'list_reservations', { options: mainMenuOptions(false) });
    }

    if (llm.intent === 'create_reservation') {
      const booking = startBooking();
      pendingBookingBySession.set(sk, booking);
      ChatService.mergeBookingData(booking, llm.data, servicios, barberos);
      const stepReply = await ChatService.handleBookingStep(
        sk,
        args.id_cliente!,
        args.message,
        booking,
        servicios,
        barberos
      );
      if (stepReply) return stepReply;
      const activos = servicios.filter((s: any) => String(s?.estado || 'activo') === 'activo');

      const sortedActivos = [...activos].sort((a, b) => {
        const catA = classifyServiceCategory(a);
        const catB = classifyServiceCategory(b);
        if (catA === 'premium' && catB === 'clasico') return -1;
        if (catA === 'clasico' && catB === 'premium') return 1;
        return 0;
      });

      const opts = booking.step === 'servicio'
        ? (booking.id_barbero
           ? [{ label: 'Regresar', value: 'regresar' }, { label: 'Cancelar', value: 'cancelar' }]
           : [{ label: 'Volver al inicio', value: 'volver al inicio' }, { label: 'Cancelar', value: 'cancelar' }])
        : booking.step === 'barbero' || booking.step === 'fecha' || booking.step === 'hora'
          ? [{ label: 'Regresar', value: 'regresar' }, { label: 'Cancelar', value: 'cancelar' }]
          : undefined;

      const catalogCards = booking.step === 'servicio'
        ? buildServiceCatalogCards(sortedActivos)
        : booking.step === 'barbero'
          ? buildBarberCatalogCards(barberos.filter((b: any) => String(b?.estado || '').toLowerCase() === 'activo'))
          : undefined;

      return reply(sk, bookingIntro(sortedActivos), 'create_reservation', {
        step: booking.step,
        catalogCards,
        options: opts
      });
    }

    const fallback = (llm.message || '').trim() || [
      'No estoy seguro de entender eso.',
      '',
      'Prueba con:',
      '• "Agendar cita"',
      '• "Mis citas"',
      '• "Ver servicios"',
      '• "Ver productos"',
      '• "¿Cómo hago una reserva?"',
    ].join('\n');

    return reply(sk, fallback, 'info', { options: mainMenuOptions(false) });
  }

  private static mergeBookingData(
    pending: PendingBooking,
    data: LlmResponse['data'] | undefined,
    servicios: any[],
    barberos: any[]
  ): void {
    if (!data) return;

    if (data.servicios_nombres?.length) {
      const matched = matchServicios(data.servicios_nombres.join(' '), servicios);
      if (matched.ids.length > 0) {
        pending.servicios_ids = matched.ids;
        pending.servicios_nombres = matched.nombres;
        pending.step = 'barbero';
      }
    }

    if (data.barbero_nombre) {
      const barbero = matchBarbero(data.barbero_nombre, barberos);
      if (barbero?.id_usuario) {
        pending.barbero_nombre = `${barbero.nombre} ${barbero.apellido}`.trim();
        pending.id_barbero = Number(barbero.id_usuario);
        pending.step = 'fecha';
      }
    }

    if (data.fecha) {
      const fecha = parseFechaInput(data.fecha) || data.fecha;
      if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        pending.fecha = fecha;
        pending.step = 'hora';
      }
    }
  }

  private static async handleBookingStep(
    sessionKey: string,
    id_cliente: number,
    message: string,
    pending: PendingBooking,
    servicios: any[],
    barberos: any[]
  ): Promise<{ reply: string; intent: ChatIntent; meta?: any } | null> {
    const barberosActivos = barberos.filter((b: any) => String(b?.estado || '').toLowerCase() === 'activo');
    const serviciosActivos = servicios.filter((s: any) => String(s?.estado || 'activo') === 'activo');

    if (pending.step === 'servicio') {
      const matched = matchServicios(message, servicios);
      if (matched.ids.length === 0) {
        const sortedActivos = [...serviciosActivos].sort((a, b) => {
          const catA = classifyServiceCategory(a);
          const catB = classifyServiceCategory(b);
          if (catA === 'premium' && catB === 'clasico') return -1;
          if (catA === 'clasico' && catB === 'premium') return 1;
          return 0;
        });

        return reply(
          sessionKey,
          `No identifiqué ese servicio. Por favor, selecciona uno de los servicios a continuación (divididos por Clásicos y Premium):`,
          'create_reservation',
          {
            step: 'servicio',
            catalogCards: buildServiceCatalogCards(sortedActivos),
            options: pending.id_barbero
              ? [
                  { label: 'Regresar', value: 'regresar' },
                  { label: 'Cancelar', value: 'cancelar' }
                ]
              : [
                  { label: 'Volver al inicio', value: 'volver al inicio' },
                  { label: 'Cancelar', value: 'cancelar' }
                ]
          }
        );
      }

      pending.servicios_ids = matched.ids.slice(0, 1);
      pending.servicios_nombres = matched.nombres.slice(0, 1);
      pending.step = 'barbero';

      return reply(
        sessionKey,
        `Servicio: ${pending.servicios_nombres[0]}\n\n¿Con qué barbero quieres la cita?`,
        'create_reservation',
        {
          step: 'barbero',
          catalogCards: buildBarberCatalogCards(barberosActivos),
          options: [
            { label: 'Regresar', value: 'regresar' },
            { label: 'Cancelar', value: 'cancelar' }
          ]
        }
      );
    }

    if (pending.step === 'barbero') {
      const barbero = matchBarbero(message, barberosActivos);
      if (!barbero?.id_usuario) {
        return reply(
          sessionKey,
          `No encontré ese barbero. Escoge uno:`,
          'create_reservation',
          {
            step: 'barbero',
            catalogCards: buildBarberCatalogCards(barberosActivos),
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }

      pending.barbero_nombre = `${barbero.nombre} ${barbero.apellido}`.trim();
      pending.id_barbero = Number(barbero.id_usuario);
      pending.step = 'fecha';

      return reply(
        sessionKey,
        `Barbero: ${pending.barbero_nombre}\n\n¿Qué fecha prefieres?\nPor favor, dime primero el día, luego el mes y el año (ejemplo: 28 de mayo, 28/05/2026, escribe 'mañana' o selecciona una opción abajo).`,
        'create_reservation',
        {
          step: 'fecha',
          options: [
            { label: 'Regresar', value: 'regresar' },
            { label: 'Cancelar', value: 'cancelar' }
          ]
        }
      );
    }

    if (pending.step === 'fecha') {
      const fecha = parseFechaInput(message);
      if (!fecha) {
        return reply(
          sessionKey,
          'No entendí la fecha. Dime primero el día, luego el mes y el año (ejemplo: 28 de mayo, 28/05/2026, escribe \'mañana\' o selecciona una opción abajo).',
          'create_reservation',
          {
            step: 'fecha',
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }

      const hoy = toIsoDate(new Date());
      if (fecha < hoy) {
        return reply(
          sessionKey,
          'Esa fecha ya pasó. Elige una fecha de hoy en adelante.',
          'create_reservation',
          {
            step: 'fecha',
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }

      pending.fecha = fecha;
      pending.step = 'hora';

      const servicio = servicios.find((s) => Number(s.id_servicio) === pending.servicios_ids[0]);
      const duracion = Number(servicio?.duracion) || 30;
      const disp = await ReservaService.getDisponibilidad(pending.id_barbero!, fecha, duracion);

      if (!disp.disponible || !disp.slots?.length) {
        pending.step = 'fecha';
        const motivo = (disp as any).motivo || 'No hay horarios disponibles ese día.';
        return reply(
          sessionKey,
          `<span style="color:#ef5350;font-weight:600;">Ese día está ocupado o no disponible (${motivo}).</span>\n\nPrueba con otra fecha.`,
          'create_reservation',
          {
            step: 'fecha',
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }

      const libres = disp.slots.filter((s: any) => s.disponible).slice(0, 12);
      if (libres.length === 0) {
        pending.step = 'fecha';
        return reply(
          sessionKey,
          '<span style="color:#ef5350;font-weight:600;">Ese día está ocupado (no quedan horarios libres para el barbero).</span>\n\nPrueba con otra fecha.',
          'create_reservation',
          {
            step: 'fecha',
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }

      return reply(
        sessionKey,
        `Fecha: ${formatFechaLegible(fecha)}\n\n¿A qué hora quieres la cita? Por favor, selecciona un botón de abajo:`,
        'create_reservation',
        {
          step: 'hora',
          slots: libres.map((s: any) => s.hora),
          options: [
            { label: 'Regresar', value: 'regresar' },
            { label: 'Cancelar', value: 'cancelar' }
          ]
        }
      );
    }

    if (pending.step === 'hora') {
      const hora = parseHoraInput(message);
      if (!hora || !pending.id_barbero || !pending.fecha) {
        return reply(
          sessionKey,
          'Por favor, dime primero la hora y luego los minutos (ejemplo: 10:30, 3:00 p.m. o selecciona un botón de abajo).',
          'create_reservation',
          {
            step: 'hora',
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }

      const servicio = servicios.find((s) => Number(s.id_servicio) === pending.servicios_ids[0]);
      const duracion = Number(servicio?.duracion) || 30;
      const disp = await ReservaService.getDisponibilidad(pending.id_barbero, pending.fecha, duracion);
      const slot = disp.slots?.find((s: any) => s.hora === hora);

      if (!slot?.disponible) {
        const libres = (disp.slots || []).filter((s: any) => s.disponible).slice(0, 12);
        const opciones = libres.map((s: any) => `• ${s.hora}`).join('\n');
        return reply(
          sessionKey,
          `<span style="color:#ef5350;font-weight:600;">Esa hora está ocupada o no disponible.</span>\n\nHorarios libres:\n${opciones || 'Ninguno — prueba otra fecha.'}`,
          'create_reservation',
          {
            step: 'hora',
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }

      try {
        const created = await ReservaService.create({
          id_cliente,
          id_barbero: pending.id_barbero,
          fecha: pending.fecha,
          hora,
          servicios: pending.servicios_ids,
        });

        pendingBookingBySession.delete(sessionKey);

        const confirmacion = [
          '✅ ¡Cita agendada con éxito!',
          '',
          `Servicio: ${pending.servicios_nombres.join(', ')}`,
          `Barbero: ${pending.barbero_nombre}`,
          `Fecha: ${formatFechaLegible(pending.fecha)}`,
          `Hora: ${formatHoraLegible(hora)}`,
          `Número de reserva: #${(created as any).id_reserva}`,
          '',
          'Te esperamos en Blendlap. Si necesitas ver tus citas, escribe "Mis citas".',
        ].join('\n');

        return reply(sessionKey, confirmacion, 'create_reservation', {
          id_reserva: (created as any).id_reserva,
          options: mainMenuOptions(false)
        });
      } catch (err: any) {
        return reply(
          sessionKey,
          err?.message || 'No pude crear la reserva. Intenta con otra hora o fecha.',
          'create_reservation',
          {
            step: 'hora',
            options: [
              { label: 'Regresar', value: 'regresar' },
              { label: 'Cancelar', value: 'cancelar' }
            ]
          }
        );
      }
    }

    return null;
  }

  private static buildSystemPrompt(): string {
    return `Eres BARBUX, asistente de Blendlap Barbería para CLIENTES.
Responde SOLO JSON válido:
{"intent":"info"|"create_reservation"|"list_reservations","message":"texto breve","data":{"fecha":"","hora":"","barbero_nombre":"","servicios_nombres":[]}}

Reglas de privacidad:
- NUNCA pidas ni reveles datos de otros clientes, contraseñas, ventas internas o información administrativa.
- Solo ayuda con reservas del usuario, servicios públicos, productos de tienda y preguntas generales.

Intents:
- list_reservations: ver sus citas
- create_reservation: quiere agendar/reservar
- info: todo lo demás`.trim();
  }

  private static async callOllamaChat(args: { system: string; user: string; memory: MemoryItem[] }): Promise<LlmResponse> {
    try {
      const history = (args.memory || []).slice(-Math.max(0, (CHAT_MEMORY_MAX_TURNS - 1) * 2));
      const resp = await axios.post(
        `${OLLAMA_BASE_URL}/api/chat`,
        {
          model: OLLAMA_MODEL,
          stream: false,
          messages: [
            { role: 'system', content: args.system },
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: args.user },
          ],
          options: { temperature: 0.1, num_predict: 120, top_p: 0.85 },
        },
        { timeout: OLLAMA_TIMEOUT_MS }
      );

      const content: string = resp.data?.message?.content ?? '';
      const parsed = safeJsonParse(content);
      if (!parsed) {
        return { intent: 'info', message: content || '' };
      }

      if (looksLikeReservationData(parsed) && !parsed.intent) {
        return {
          intent: 'create_reservation',
          message: 'Perfecto, con esos datos continúo el agendamiento.',
          data: parsed,
        };
      }

      if (parsed?.data && looksLikeReservationData(parsed.data) && !parsed.intent) {
        return {
          intent: 'create_reservation',
          message: 'Perfecto, con esos datos continúo el agendamiento.',
          data: parsed.data,
        };
      }

      const intent = parsed.intent as ChatIntent;
      if (intent !== 'info' && intent !== 'create_reservation' && intent !== 'list_reservations') {
        return { intent: 'info', message: parsed.message || '' };
      }

      return {
        intent,
        message: typeof parsed.message === 'string' ? parsed.message : '',
        data: parsed.data && typeof parsed.data === 'object' ? parsed.data : undefined,
      };
    } catch (err: any) {
      logger.error(`Error llamando a Ollama: ${err?.message || err}`);
      return {
        intent: 'info',
        message:
          'La IA no está disponible ahora mismo. Si estás usando Docker, levanta Ollama con `docker compose up -d ollama` ' +
          'y descarga el modelo con `docker compose exec ollama ollama pull llama3.2:1b`.',
      };
    }
  }
}
