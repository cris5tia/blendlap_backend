import fs from 'fs';
import path from 'path';
import { eliminarImagenCloudinary } from './cloudinary';

export async function eliminarArchivo(carpeta: string, filename: string | null | undefined): Promise<void> {
    if (!filename) return;
    if (filename.startsWith('http')) {
        await eliminarImagenCloudinary(filename);
        return;
    }

    const filePath = path.join(__dirname, '../../public/images', carpeta, filename);
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* silent */ }
}
