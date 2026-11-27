// Uploads go to the server's file store; the demo build keeps them in memory as data URLs.
import type { FileRef } from './model.ts';
import { DEMO } from './store.ts';

/** Downscale an image to at most `max` px on its longest side, as a JPEG. */
export function shrink(file: File, max = 1800, q = 0.82): Promise<Blob> {
  return new Promise((ok, fail) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      cv.toBlob(b => (b ? ok(b) : fail(new Error('Couldn’t read that image.'))), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('Couldn’t read that image.')); };
    img.src = url;
  });
}

const dataUrl = (b: Blob) => new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(b); });

/** Upload a file (images are resized first). Throws an Error with a message fit to show. */
export async function upload(file: File, maxPx = 1800): Promise<FileRef> {
  const isImg = /^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type);
  const body: Blob = isImg ? await shrink(file, maxPx) : file;
  const type = isImg ? 'image/jpeg' : file.type || 'application/octet-stream';
  const at = new Date().toISOString();
  if (DEMO) return { id: Math.random().toString(36).slice(2), name: file.name, type, size: body.size, src: await dataUrl(body), at };
  const r = await fetch('/api/files', { method: 'POST', headers: { 'content-type': type, 'x-file-name': encodeURIComponent(file.name) }, body, credentials: 'same-origin' }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!r?.ok) throw new Error(j.error || 'Couldn’t upload that file.');
  return j as FileRef;
}

export const fmtSize = (n: number) => (!n ? '' : n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
