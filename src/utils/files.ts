import fs from 'fs';
import path from 'path';

export function eliminarArchivo(carpeta: string, filename: string | null | undefined): void {
    if (!filename) return;
    const filePath = path.join(__dirname, '../../public/images', carpeta, filename);
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* silent */ }
}
