import nodemailer from 'nodemailer';

// Las App Passwords de Gmail se muestran con espacios (xxxx xxxx xxxx xxxx)
// pero deben usarse sin ellos
const EMAIL_PASS = (process.env.EMAIL_PASS || '').replace(/\s/g, '');
const EMAIL_USER = process.env.EMAIL_USER || '';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Verifica la conexión SMTP al arrancar el servidor
transporter.verify((error) => {
  if (error) {
    console.error('[EmailService] Conexión SMTP fallida:', error.message);
  } else {
    console.log('[EmailService] SMTP listo para enviar correos ✓');
  }
});

const FROM = `"Blendlap Barbería" <${EMAIL_USER}>`;

// Cada dígito va en su propio <td> dentro de un <tr> — nunca se parte en móvil
function buildDigitCells(codigo: string, size: 'sm' | 'lg'): string {
  const w   = size === 'lg' ? '62'  : '40';
  const h   = size === 'lg' ? '70'  : '50';
  const lh  = size === 'lg' ? '70'  : '50';
  const fs  = size === 'lg' ? '34'  : '24';
  const pad = size === 'lg' ? '6'   : '4';

  return codigo.split('').map(d => `
    <td style="padding:0 ${pad}px;">
      <div style="
        width:${w}px;height:${h}px;line-height:${lh}px;
        font-size:${fs}px;font-weight:900;
        text-align:center;display:block;
        color:#1a1a1a;background:#f5f5f5;
        border-radius:12px;
        font-family:'Courier New',Courier,monospace;
      ">${d}</div>
    </td>`).join('');
}

function buildEmail(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#111111;
             font-family:'Segoe UI',Helvetica,Arial,sans-serif;
             -webkit-text-size-adjust:100%;">

<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#111111;padding:32px 12px;">
  <tr><td align="center">

    <table cellpadding="0" cellspacing="0" border="0"
           style="width:100%;max-width:520px;">

      <!-- Gold accent bar -->
      <tr>
        <td style="height:4px;background:#fbc447;
                   border-radius:12px 12px 0 0;"></td>
      </tr>

      <!-- Header -->
      <tr>
        <td style="background:#1a1a1a;padding:32px 32px 24px;
                   text-align:center;">
          <div style="color:#fbc447;font-size:26px;font-weight:900;
                      letter-spacing:5px;">BLENDLAP</div>
          <div style="color:rgba(255,255,255,0.3);font-size:10px;
                      letter-spacing:6px;margin-top:4px;">BARBERÍA</div>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="background:#1e1e1e;padding:36px 32px 40px;">
          ${content}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#161616;padding:18px 32px;
                   text-align:center;border-radius:0 0 12px 12px;">
          <p style="color:rgba(255,255,255,0.18);font-size:11px;
                    margin:0;line-height:1.6;">
            © ${new Date().getFullYear()} Blendlap Barbería &nbsp;·&nbsp;
            Correo automático — no respondas a este mensaje.
          </p>
        </td>
      </tr>

    </table>

  </td></tr>
</table>

</body>
</html>`;
}

export class EmailService {

  // ── Registro — 4 dígitos ───────────────────────────────────────────────────
  static async enviarCodigoRegistro(
    correo: string,
    nombre: string,
    codigo: string
  ): Promise<void> {
    const cells = buildDigitCells(codigo, 'lg');

    const content = `
      <!-- Icon circle -->
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
        <tr>
          <td align="center" style="
            width:60px;height:60px;line-height:60px;
            background:rgba(251,196,71,0.12);
            border:2px solid rgba(251,196,71,0.3);
            border-radius:50%;font-size:24px;
            text-align:center;">
            ✉️
          </td>
        </tr>
      </table>

      <h2 style="color:#ffffff;font-size:20px;font-weight:800;
                 margin:0 0 8px;text-align:center;">
        Verifica tu correo electrónico
      </h2>
      <p style="color:rgba(255,255,255,0.45);font-size:13px;
                margin:0 0 28px;line-height:1.7;text-align:center;">
        Hola <strong style="color:#fbc447;">${nombre}</strong>,
        usa este código para completar tu registro en Blendlap Barbería.
      </p>

      <div style="border-top:1px solid rgba(255,255,255,0.07);margin-bottom:26px;"></div>

      <p style="color:rgba(255,255,255,0.3);font-size:10px;font-weight:700;
                margin:0 0 16px;text-align:center;text-transform:uppercase;
                letter-spacing:2.5px;">
        Tu código de verificación
      </p>

      <!-- Dígitos — tabla garantiza que nunca se parten -->
      <table cellpadding="0" cellspacing="0" border="0"
             align="center" style="margin:0 auto 10px;">
        <tr>${cells}</tr>
      </table>

      <p style="color:rgba(255,255,255,0.3);font-size:12px;
                text-align:center;margin:14px 0 28px;">
        ⏱&nbsp; Este código expira en
        <strong style="color:rgba(255,255,255,0.55);">15 minutos</strong>
      </p>

      <div style="border-top:1px solid rgba(255,255,255,0.07);margin-bottom:20px;"></div>

      <p style="color:rgba(255,255,255,0.35);font-size:12px;
                line-height:1.8;margin:0 0 10px;text-align:center;">
        Por tu seguridad,
        <strong style="color:rgba(255,255,255,0.6);">
          nunca compartas este código
        </strong>
        con nadie.
      </p>
      <p style="color:rgba(255,255,255,0.2);font-size:11px;
                line-height:1.6;margin:0;text-align:center;">
        Si no intentaste registrarte, ignora este correo.
      </p>
    `;

    await transporter.sendMail({
      from: FROM,
      to: correo,
      subject: '🔐 Tu código de verificación — Blendlap Barbería',
      html: buildEmail(content),
    });
  }

  // ── Recuperación — 6 dígitos ───────────────────────────────────────────────
  static async enviarCodigoRecuperacion(
    correo: string,
    nombre: string,
    codigo: string
  ): Promise<void> {
    const cells = buildDigitCells(codigo, 'sm');

    const content = `
      <!-- Icon circle -->
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
        <tr>
          <td align="center" style="
            width:60px;height:60px;line-height:60px;
            background:rgba(251,196,71,0.12);
            border:2px solid rgba(251,196,71,0.3);
            border-radius:50%;font-size:24px;
            text-align:center;">
            🔑
          </td>
        </tr>
      </table>

      <h2 style="color:#ffffff;font-size:20px;font-weight:800;
                 margin:0 0 8px;text-align:center;">
        Recuperación de contraseña
      </h2>
      <p style="color:rgba(255,255,255,0.45);font-size:13px;
                margin:0 0 28px;line-height:1.7;text-align:center;">
        Hola <strong style="color:#fbc447;">${nombre}</strong>,
        recibimos una solicitud para restablecer tu contraseña.
      </p>

      <div style="border-top:1px solid rgba(255,255,255,0.07);margin-bottom:26px;"></div>

      <p style="color:rgba(255,255,255,0.3);font-size:10px;font-weight:700;
                margin:0 0 16px;text-align:center;text-transform:uppercase;
                letter-spacing:2.5px;">
        Tu código de verificación
      </p>

      <!-- Dígitos — tabla garantiza que nunca se parten -->
      <table cellpadding="0" cellspacing="0" border="0"
             align="center" style="margin:0 auto 10px;">
        <tr>${cells}</tr>
      </table>

      <p style="color:rgba(255,255,255,0.3);font-size:12px;
                text-align:center;margin:14px 0 28px;">
        ⏱&nbsp; Este código expira en
        <strong style="color:rgba(255,255,255,0.55);">15 minutos</strong>
      </p>

      <div style="border-top:1px solid rgba(255,255,255,0.07);margin-bottom:20px;"></div>

      <p style="color:rgba(255,255,255,0.35);font-size:12px;
                line-height:1.8;margin:0 0 10px;text-align:center;">
        Por tu seguridad,
        <strong style="color:rgba(255,255,255,0.6);">
          nunca compartas este código
        </strong>
        con nadie, ni con nuestro equipo.
      </p>
      <p style="color:rgba(255,255,255,0.2);font-size:11px;
                line-height:1.6;margin:0;text-align:center;">
        Si no solicitaste recuperar tu contraseña, ignora este correo.
        Tu cuenta permanece segura.
      </p>
    `;

    await transporter.sendMail({
      from: FROM,
      to: correo,
      subject: '🔑 Tu código de recuperación — Blendlap Barbería',
      html: buildEmail(content),
    });
  }

  // ── Crédito rechazado ──────────────────────────────────────────────────────
  static async enviarCreditoRechazado(
    correo: string,
    nombre: string,
    productos: Array<{ nombre_producto: string; cantidad: number; precio_unitario: number; subtotal: number }>,
    monto_total: number,
    plazo: string
  ): Promise<void> {
    const plazoLabel: Record<string, string> = {
      '1_semana':    '1 Semana (7 días)',
      '1_quincena':  '1 Quincena (15 días)',
      '2_quincenas': '2 Quincenas (30 días)',
      '1_mes':       '1 Mes',
    };

    const formatCOP = (v: number) =>
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);

    const filaProductos = productos.map(p => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);
                   color:rgba(255,255,255,0.75);font-size:13px;">
          ${p.nombre_producto}
          <span style="color:rgba(255,255,255,0.35);font-size:11px;"> x${p.cantidad}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);
                   color:#fbc447;font-size:13px;font-weight:700;text-align:right;">
          ${formatCOP(p.subtotal)}
        </td>
      </tr>`).join('');

    const content = `
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
        <tr>
          <td align="center" style="
            width:60px;height:60px;line-height:60px;
            background:rgba(239,68,68,0.12);
            border:2px solid rgba(239,68,68,0.3);
            border-radius:50%;font-size:24px;
            text-align:center;">
            ✕
          </td>
        </tr>
      </table>

      <h2 style="color:#ffffff;font-size:20px;font-weight:800;
                 margin:0 0 8px;text-align:center;">
        Tu solicitud de crédito no fue aprobada
      </h2>
      <p style="color:rgba(255,255,255,0.45);font-size:13px;
                margin:0 0 28px;line-height:1.7;text-align:center;">
        Hola <strong style="color:#fbc447;">${nombre}</strong>,
        lamentablemente tu solicitud de crédito fue revisada y no pudo ser aprobada en esta ocasión.
        Puedes visitar nuestra barbería para más información o intentarlo nuevamente más adelante.
      </p>

      <div style="border-top:1px solid rgba(255,255,255,0.07);margin-bottom:24px;"></div>

      <p style="color:rgba(255,255,255,0.3);font-size:10px;font-weight:700;
                margin:0 0 14px;text-transform:uppercase;letter-spacing:2.5px;">
        Detalle de tu solicitud
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin-bottom:16px;">
        ${filaProductos}
        <tr>
          <td style="padding:12px 0 0;color:rgba(255,255,255,0.5);
                     font-size:12px;font-weight:700;text-transform:uppercase;
                     letter-spacing:1px;">
            Total solicitado
          </td>
          <td style="padding:12px 0 0;color:#fbc447;font-size:18px;
                     font-weight:900;text-align:right;">
            ${formatCOP(monto_total)}
          </td>
        </tr>
      </table>

      <div style="background:rgba(255,255,255,0.04);border-radius:8px;
                  padding:12px 16px;margin-bottom:24px;">
        <span style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;
                     letter-spacing:1px;">Plazo solicitado:</span>
        <span style="color:rgba(255,255,255,0.7);font-size:13px;font-weight:600;
                     margin-left:8px;">${plazoLabel[plazo] ?? plazo}</span>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,0.07);margin-bottom:20px;"></div>

      <p style="color:rgba(255,255,255,0.3);font-size:12px;
                line-height:1.8;margin:0;text-align:center;">
        Si tienes preguntas, visítanos o escríbenos.
        Estaremos encantados de ayudarte a encontrar la mejor opción.
      </p>
    `;

    await transporter.sendMail({
      from: FROM,
      to: correo,
      subject: 'Tu solicitud de crédito en Blendlap — Respuesta',
      html: buildEmail(content),
    });
  }
}
