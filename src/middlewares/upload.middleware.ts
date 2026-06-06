import multer from 'multer';
import path from 'path';

const fileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ok = /jpeg|jpg|png|webp/.test(path.extname(file.originalname).toLowerCase());
  ok ? cb(null, true) : cb(new Error('Solo imágenes jpg, jpeg, png, webp'));
};

const opciones = {
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
};

export const uploadBarbero = multer(opciones);
export const uploadCliente = multer(opciones);
