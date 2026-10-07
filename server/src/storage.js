import fs from 'node:fs/promises';
import path from 'node:path';

// Stockage des justificatifs.
// - Vercel : Vercel Blob (BLOB_READ_WRITE_TOKEN est fourni par l'intégration Blob).
//   Les fichiers ont des noms aléatoires et ne sont servis qu'au travers de l'API,
//   après vérification des droits.
// - Ailleurs : un dossier local (UPLOAD_DIR).
export function createStorage({ uploadDir, blobToken }) {
  if (blobToken) {
    return {
      async put(key, buffer, contentType) {
        const { put } = await import('@vercel/blob');
        const blob = await put(`justificatifs/${key}`, buffer, {
          access: 'public', contentType, token: blobToken, addRandomSuffix: true,
        });
        return blob.url;
      },
      async get(stored) {
        const res = await fetch(stored);
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
      },
      async remove(stored) {
        const { del } = await import('@vercel/blob');
        await del(stored, { token: blobToken }).catch(() => {});
      },
    };
  }
  return {
    async put(key, buffer) {
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(path.join(uploadDir, key), buffer);
      return key;
    },
    async get(stored) {
      return fs.readFile(path.join(uploadDir, path.basename(stored))).catch(() => null);
    },
    async remove(stored) {
      await fs.rm(path.join(uploadDir, path.basename(stored)), { force: true });
    },
  };
}
