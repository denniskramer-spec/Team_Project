import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { badRequest } from './httpError.js';

// Image attachments (screenshots, receipts) live on disk in server/uploads
// and are served, behind login, from /api/files/<name>. Names are generated
// here, so a stored name never comes from the client.
export const uploadsDir = fileURLToPath(new URL('../../uploads/', import.meta.url));
await fs.mkdir(uploadsDir, { recursive: true });

const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 5;

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}.${TYPES[file.mimetype]}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES },
  fileFilter: (req, file, cb) => (TYPES[file.mimetype] ? cb(null, true) : cb(badRequest('Only PNG, JPEG, GIF or WebP images can be attached'))),
});

// Express middleware: accepts up to MAX_IMAGES files in the `images` field.
export function imageUpload(req, res, next) {
  upload.array('images', MAX_IMAGES)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(badRequest('Each image can be at most 5 MB'));
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return next(badRequest(`At most ${MAX_IMAGES} images per record`));
    next(err.status ? err : badRequest(err.message));
  });
}

export const describeUpload = (f) => ({ file: f.filename, name: f.originalname.slice(0, 120), type: f.mimetype, size: f.size });

const SAFE_NAME = /^[0-9]+-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

// Image references sent back with a record: only names we generated, and
// only files that exist.
export async function checkImages(list) {
  if (list === undefined) return undefined;
  if (!Array.isArray(list)) throw badRequest('Images must be a list');
  if (list.length > MAX_IMAGES) throw badRequest(`At most ${MAX_IMAGES} images per record`);
  const images = [];
  for (const img of list) {
    const file = String(img?.file ?? '');
    if (!SAFE_NAME.test(file)) throw badRequest('Unknown image');
    await fs.access(path.join(uploadsDir, file)).catch(() => { throw badRequest('An attached image is missing, upload it again'); });
    images.push({ file, name: String(img.name ?? file).slice(0, 120), type: String(img.type ?? ''), size: Number(img.size) || 0 });
  }
  return images;
}

// Deletes files no record references any more (`stillUsed(file)` says).
export async function removeUnusedFiles(files, stillUsed) {
  for (const file of new Set(files)) {
    if (!SAFE_NAME.test(file) || await stillUsed(file)) continue;
    await fs.unlink(path.join(uploadsDir, file)).catch(() => {});
  }
}

// Uploads happen before their record is saved, so a cancelled or failed form
// leaves files nothing points to. Removes those once they are older than
// `graceMs` (names start with their upload time), leaving time to finish a form.
export async function sweepOrphans(stillUsed, graceMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - graceMs;
  const old = (await fs.readdir(uploadsDir)).filter((f) => SAFE_NAME.test(f) && Number(f.split('-')[0]) < cutoff);
  await removeUnusedFiles(old, stillUsed);
}
