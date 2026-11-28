// Workshop manuals: text page by page for search and AI help, and the PDF for reading. pdf.js loads only when needed.
import type { Manual, Vehicle } from './model.ts';

const STOP = new Set('the and for with from this that what how should does into your have has are was not but can will its out off any all fix check replace install help need needs about when then than them they there their which would could just only also more most some very'.split(' '));
export type Excerpt = { name: string; page: number; score: number; text: string };

/** The pages that best match a question: each term counts, repeats a little more, top 5, about 2,600 characters each. */
export function bestPages(books: { name: string; pages: string[] }[], query: string): Excerpt[] {
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || [])].filter(t => !STOP.has(t));
  if (!terms.length) return [];
  return books.flatMap(b => b.pages.map((txt, i) => {
    const low = txt.toLowerCase(); let sc = 0, first = -1;
    for (const t of terms) { let n = 0, at = low.indexOf(t); if (at > -1 && (first < 0 || at < first)) first = at; while (at > -1 && n < 6) { n++; at = low.indexOf(t, at + t.length); } sc += n ? 2 + n : 0; }
    const st = Math.max(0, first - 600);
    return { name: b.name.replace(/\.[a-z0-9]+$/i, ''), page: i + 1, score: sc, text: (st ? '…' : '') + txt.slice(st, st + 2600) + (txt.length > st + 2600 ? '…' : '') };
  })).filter(x => x.score > 3).sort((a, b) => b.score - a.score).slice(0, 5);
}

/** "From the manual: Haynes p.12, 40" for the pages an answer used. */
export const refsLine = (ex: Excerpt[]) => (ex.length ? 'From the manual: ' + [...new Set(ex.map(x => x.name))].map(n => n + ' p.' + ex.filter(x => x.name === n).map(x => x.page).sort((a, b) => a - b).join(', ')).join(' · ') : '');

const cache = new Map<string, Promise<string[]>>();
/** A manual's text, page by page (fetched once). */
export const pagesOf = (m: Manual) => { if (!cache.has(m.id)) cache.set(m.id, fetch(m.text, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : [])).catch(() => [])); return cache.get(m.id)!; };
export async function excerpts(v: Vehicle, query: string) { const ms = v.manuals || []; return bestPages(await Promise.all(ms.map(async m => ({ name: m.name, pages: await pagesOf(m) }))), query); }

const pdfjs = async () => {
  const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return lib;
};
const docs = new Map<string, Promise<import('pdfjs-dist').PDFDocumentProxy>>();
/** The manual's PDF, ready to render (loaded once). */
export const pdfOf = (m: Manual) => { if (!docs.has(m.id)) docs.set(m.id, pdfjs().then(lib => lib.getDocument({ url: m.src, withCredentials: true }).promise)); return docs.get(m.id)!; };

/** Text of every page of an uploaded file. Scanned PDFs have none, which is an error worth explaining. */
export async function readPages(file: File, progress: (msg: string) => void): Promise<string[]> {
  let pages: string[] = [];
  if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    const lib = await pdfjs(), doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      pages.push(tc.items.map(x => ('str' in x ? x.str : '')).join(' ').replace(/\s+/g, ' ').trim());
      if (i % 10 === 0 || i === doc.numPages) progress(`Reading page ${i} of ${doc.numPages}…`);
    }
  } else { const t = (await file.text()).replace(/\r/g, ''); for (let i = 0; i < t.length; i += 3000) pages.push(t.slice(i, i + 3000)); }
  if (pages.reduce((a, p) => a + p.length, 0) < 200) throw new Error('No readable text found — this looks like a scanned PDF. Run it through OCR (e.g. “Make searchable” in Acrobat, or ocrmypdf) and upload it again.');
  return pages;
}

/** Words that find spec pages: torque, capacities, pressures, tune, alignment, brakes, electrics, dimensions. */
export const SPEC_QUERY = 'specification torque nm ft-lb tightening capacity litres quarts oil coolant transmission differential brake fluid tyre tire pressure kpa psi spark plug gap ignition timing idle speed rpm valve clearance camber caster toe alignment ride height brake pad rotor disc minimum thickness battery alternator fuse weight wheelbase dimensions filter bulb';

/** The instruction for "Fill with AI": extract only what the excerpts state, as JSON shaped like the Specs tab. */
export function specPrompt(car: string, def: Record<string, [string, string, [string, string, string, number][], boolean, string, string[]?]>, ex: Excerpt[]) {
  const shape = Object.entries(def).map(([k, d]) => `"${k}": [{${d[2].map(c => `"${c[0]}": "${c[1]}"`).join(', ')}, "page": "manual page"}]  // ${d[0]}`).join('\n');
  return `You extract specifications for a ${car} from its workshop manual. Use ONLY values stated in the excerpts below — never guess or use general knowledge. Keep units exactly as written. Reply with JSON only, no prose, in this shape (omit groups with nothing found, keep each value short):\n{\n${shape}\n}\n\n--- WORKSHOP MANUAL EXCERPTS ---\n` + ex.map(x => `[${x.name} p.${x.page}]\n${x.text}`).join('\n\n') + '\n--- END ---';
}

/** Merge the AI's specs in: new rows are added, blank values in matching rows are filled, nothing entered is changed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergeSpecs(specs: Record<string, any>, reply: string, def: Record<string, [string, string, [string, string, string, number][], boolean, string, string[]?]>) {
  const m = String(reply || '').match(/\{[\s\S]*\}/);
  let data: Record<string, unknown>;
  try { data = JSON.parse(m ? m[0] : ''); } catch { throw new Error('The AI reply wasn’t in a format Garage could read. Try again.'); }
  const sp = structuredClone(specs || {}), pages = new Set<number>(); let added = 0, filled = 0;
  for (const [k, d] of Object.entries(def)) {
    const rows = Array.isArray(data[k]) ? (data[k] as Record<string, unknown>[]) : []; if (!rows.length) continue;
    const f0 = d[2][0][0], fields = d[2].map(c => c[0]); sp[k] = sp[k] || [];
    for (const r of rows) {
      if (!r || !r[f0]) continue;
      const pg = parseInt(String(r.page ?? '').replace(/\D/g, ''), 10); if (pg) pages.add(pg);
      const same = sp[k].find((x: Record<string, string>) => (x[f0] || '').trim().toLowerCase() === String(r[f0]).trim().toLowerCase());
      if (same) { for (const f of fields.slice(1)) if (!same[f] && r[f]) { same[f] = String(r[f]); filled++; } continue; }
      const row = Object.fromEntries(fields.map(f => [f, r[f] ? String(r[f]) : ''])), blank = sp[k].findIndex((x: Record<string, string>) => !Object.values(x || {}).some(Boolean));
      if (blank > -1) sp[k][blank] = row; else sp[k].push(row); added++;
    }
    if (!d[3]) sp._shown = [...new Set([...(sp._shown || []), k])];
  }
  return { specs: sp, added, filled, pages: [...pages].sort((a, b) => a - b) };
}
