import multer from 'multer';
import path from 'path';
import fs from 'fs';

const crearStorage = (carpeta: string) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(process.cwd(), 'public', 'images', carpeta);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext    = path.extname(file.originalname).toLowerCase();
      const nombre = `${carpeta}_${Date.now()}_${Math.round(Math.random() * 1000)}${ext}`;
      cb(null, nombre);
    }
  });

const fileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ok = /jpeg|jpg|png|webp/.test(path.extname(file.originalname).toLowerCase());
  ok ? cb(null, true) : cb(new Error('Solo imágenes jpg, jpeg, png, webp'));
};

const opciones = { fileFilter, limits: { fileSize: 5 * 1024 * 1024 } };

export const uploadBarbero  = multer({ storage: crearStorage('barberos'),   ...opciones });
export const uploadCliente  = multer({ storage: crearStorage('clientes'),   ...opciones });
