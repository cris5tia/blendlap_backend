import multer from 'multer';
import path from 'path';

const imageFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ok = /jpeg|jpg|png|webp/.test(path.extname(file.originalname).toLowerCase());
  ok ? cb(null, true) : cb(new Error('Solo imágenes jpg, jpeg, png, webp'));
};

const videoFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ok = /mp4|mov|webm|avi/.test(path.extname(file.originalname).toLowerCase());
  ok ? cb(null, true) : cb(new Error('Solo videos mp4, mov, webm, avi'));
};

export const uploadBarbero = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadCliente = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadVideo = multer({
  storage: multer.memoryStorage(),
  fileFilter: videoFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});
