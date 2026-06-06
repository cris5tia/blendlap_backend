import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function asegurarConfig(): void {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Faltan variables de Cloudinary en el backend');
  }
}

function extraerPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
  return match ? match[1] : null;
}

export async function subirArchivoCloudinary(file: Express.Multer.File, carpeta: string): Promise<string> {
  asegurarConfig();

  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const resultado = await cloudinary.uploader.upload(dataUri, {
    folder: `blendlap/${carpeta}`,
    resource_type: 'image',
    overwrite: false,
  });

  return resultado.secure_url;
}

export async function subirDataUrlCloudinary(valor: string | null | undefined, carpeta: string): Promise<string | null | undefined> {
  if (!valor || !valor.startsWith('data:image/')) return valor;
  asegurarConfig();

  const resultado = await cloudinary.uploader.upload(valor, {
    folder: `blendlap/${carpeta}`,
    resource_type: 'image',
    overwrite: false,
  });

  return resultado.secure_url;
}

export async function eliminarImagenCloudinary(valor: string | null | undefined): Promise<void> {
  if (!valor || !valor.startsWith('http')) return;
  const publicId = extraerPublicId(valor);
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // No bloquear la actualizacion si Cloudinary no pudo borrar la imagen anterior.
  }
}
