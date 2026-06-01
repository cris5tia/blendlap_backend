import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';


export class AuthController {

    // POST /api/auth/login
    static async login(req: Request, res: Response): Promise<void> {
        try {
            const { correo_electronico, contrasena } = req.body;

            if (!correo_electronico || !contrasena) {
                res.status(400).json({ ok: false, mensaje: 'Correo y contraseña son requeridos' });
                return;
            }

            const resultado = await AuthService.login({ correo_electronico, contrasena });
            res.status(200).json({ ok: true, ...resultado });

        } catch (error: any) {
            res.status(401).json({ ok: false, mensaje: error.message });
        }
    }

    // POST /api/auth/registro
    static async registro(req: Request, res: Response): Promise<void> {
        try {
            const { nombre, apellido, correo_electronico, contrasena, rol } = req.body;

            if (!nombre || !apellido || !correo_electronico || !contrasena || !rol) {
                res.status(400).json({ ok: false, mensaje: 'Todos los campos son requeridos' });
                return;
            }

            const rolesValidos = ['admin', 'barbero', 'cliente'];
            if (!rolesValidos.includes(rol)) {
                res.status(400).json({ ok: false, mensaje: 'Rol inválido' });
                return;
            }

            const resultado = await AuthService.registro({ nombre, apellido, correo_electronico, contrasena, rol });
            res.status(201).json({ ok: true, ...resultado });

        } catch (error: any) {
            res.status(400).json({ ok: false, mensaje: error.message });
        }
    }

    // GET /api/auth/perfil  ← ruta protegida de prueba
    static async perfil(req: Request, res: Response): Promise<void> {
        try {
            res.status(200).json({ ok: true, usuario: req.usuario });
        } catch (error: any) {
            res.status(500).json({ ok: false, mensaje: error.message });
        }
    }
    static async cambiarPassword(req: Request, res: Response): Promise<void> {
        try {
            const { correo_electronico, nueva_contrasena } = req.body;

            if (!correo_electronico || !nueva_contrasena) {
                res.status(400).json({ ok: false, mensaje: 'Correo y nueva contraseña son requeridos' });
                return;
            }

            const resultado = await AuthService.cambiarPassword(correo_electronico, nueva_contrasena);
            res.status(200).json({ ok: true, ...resultado });

        } catch (error: any) {
            res.status(500).json({ ok: false, mensaje: error.message });
        }
    }
    // POST /api/auth/solicitar-recuperacion
    static async solicitarRecuperacion(req: Request, res: Response): Promise<void> {
        try {
            const { correo_electronico } = req.body;
            if (!correo_electronico) {
                res.status(400).json({ ok: false, mensaje: 'El correo es requerido' });
                return;
            }
            const resultado = await AuthService.solicitarRecuperacion(correo_electronico);
            res.status(200).json({ ok: true, ...resultado });
        } catch (error: any) {
            res.status(400).json({ ok: false, mensaje: error.message });
        }
    }

    // POST /api/auth/resetear-password
    static async resetearPassword(req: Request, res: Response): Promise<void> {
        try {
            const { correo_electronico, codigo, nueva_contrasena } = req.body;
            if (!correo_electronico || !codigo || !nueva_contrasena) {
                res.status(400).json({ ok: false, mensaje: 'Todos los campos son requeridos' });
                return;
            }
            const resultado = await AuthService.resetearPassword(correo_electronico, codigo, nueva_contrasena);
            res.status(200).json({ ok: true, ...resultado });
        } catch (error: any) {
            res.status(400).json({ ok: false, mensaje: error.message });
        }
    }
    // POST /api/auth/solicitar-verificacion-registro
    static async solicitarVerificacionRegistro(req: Request, res: Response): Promise<void> {
        try {
            const { nombre, apellido, correo_electronico, contrasena, telefono, rol } = req.body;

            if (!nombre || !apellido || !correo_electronico || !contrasena) {
                res.status(400).json({ ok: false, mensaje: 'Todos los campos son requeridos' });
                return;
            }

            const rolesValidos = ['admin', 'barbero', 'cliente'];
            const rolFinal = rolesValidos.includes(rol) ? rol : 'cliente';

            const resultado = await AuthService.solicitarVerificacionRegistro({
                nombre, apellido, correo_electronico, contrasena, rol: rolFinal, telefono
            });
            res.status(200).json({ ok: true, ...resultado });
        } catch (error: any) {
            res.status(400).json({ ok: false, mensaje: error.message });
        }
    }

    // POST /api/auth/completar-registro
    static async completarRegistro(req: Request, res: Response): Promise<void> {
        try {
            const { correo_electronico, codigo } = req.body;

            if (!correo_electronico || !codigo) {
                res.status(400).json({ ok: false, mensaje: 'Correo y código son requeridos' });
                return;
            }

            const resultado = await AuthService.completarRegistro(correo_electronico, codigo);
            res.status(201).json({ ok: true, ...resultado });
        } catch (error: any) {
            res.status(400).json({ ok: false, mensaje: error.message });
        }
    }

    static async loginConGoogle(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ ok: false, mensaje: 'Token de Google requerido' });
      return;
    }
    const resultado = await AuthService.loginConGoogle(token);
    res.status(200).json({ ok: true, ...resultado });
  } catch (error: any) {
    res.status(401).json({ ok: false, mensaje: error.message });
  }
}

    // GET /api/auth/mi-perfil
    static async obtenerMiPerfil(req: Request, res: Response): Promise<void> {
        try {
            const id_usuario = req.usuario!.id_usuario;
            const perfil = await AuthService.obtenerPerfil(id_usuario);
            res.status(200).json({ ok: true, data: perfil });
        } catch (error: any) {
            res.status(404).json({ ok: false, mensaje: error.message });
        }
    }

    // PUT /api/auth/mi-perfil
    static async actualizarMiPerfil(req: Request, res: Response): Promise<void> {
        try {
            const id_usuario = req.usuario!.id_usuario;
            const body = req.body || {};
            const data: any = {};
            if (body.nombre?.trim()) data.nombre = body.nombre.trim();
            if (body.apellido?.trim()) data.apellido = body.apellido.trim();
            if (body.telefono !== undefined) data.telefono = (body.telefono || '').trim();
            if (body.eliminarFoto === 'true') data.foto = null;
            else if (req.file) data.foto = req.file.filename;
            const perfil = await AuthService.actualizarPerfil(id_usuario, data);
            res.status(200).json({ ok: true, data: perfil });
        } catch (error: any) {
            res.status(500).json({ ok: false, mensaje: error.message });
        }
    }
}