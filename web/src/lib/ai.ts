// AI help on tasks: what gets sent, and the canned questions. The server holds the key and talks to the provider.
import type { CardForm } from './actions.ts';
import { type AiCfg, type Calc, COLNAME, SPEC_DEF, type SpecRow } from './model.ts';

export const AI_PROV: Record<AiCfg['provider'], { label: string; key?: boolean; base?: boolean; model: string; basePh?: string; hint: string }> = {
  anthropic: { label: 'Anthropic API', key: true, model: 'claude-opus-5-5', hint: 'Your own key from console.anthropic.com.' },
  openai: { label: 'OpenAI-compatible', key: true, base: true, model: 'gpt-4o-mini', basePh: 'https://api.openai.com/v1', hint: 'OpenAI, OpenRouter, Groq, LM Studio — anything that speaks the chat completions API.' },
  ollama: { label: 'Ollama (local)', base: true, model: 'llama3.1', basePh: 'http://localhost:11434', hint: 'A model running on your own network. Nothing leaves the house.' },
};
export const AI0: AiCfg = { enabled: false, provider: 'anthropic', model: '', baseUrl: '', shareSpecs: true, shareHistory: true, shareNotes: false, shareManual: true, hasKey: false };

export const AI_QUICK: [string, string][] = [
  ['Troubleshoot this', 'Help me troubleshoot this. What are the most likely causes, in order, and how do I test for each?'],
  ['Parts & tools', 'What parts, consumables and tools will I need for this job?'],
  ['Step-by-step', 'Give me a step-by-step guide for this job, with torque specs where they matter.'],
  ['Time & difficulty', 'How long will this take a competent home mechanic, how hard is it, and what usually goes wrong?'],
];

/** The car and task as plain lines. The task, its updates and parts, and the car's make, model and odometer always go; the rest per Admin settings. */
export function aiContext(calc: Calc, vid: string, f: CardForm): string {
  const g = calc.g, cfg = { ...AI0, ...g.ai }, v = g.vehicles.find(x => x.id === vid)!, u = calc.u, L: string[] = [];
  const st = calc.stats(v), cid = f.id || f.pid;
  L.push(`Car: ${v.year} ${v.make} ${v.model}${v.chassisCode ? ' (' + v.chassisCode + ')' : ''}`);
  if (cfg.shareSpecs) {
    ([['Engine', v.engine], ['Transmission', v.transmission], ['Fuel', v.fuelType]] as const).forEach(([k, x]) => x && L.push(`${k}: ${x}`));
    Object.entries(SPEC_DEF).forEach(([k, [title, , cols]]) => ((v.specs?.[k] || []) as SpecRow[]).forEach(r => L.push(`${title} · ${cols.map(([ck, cl], i) => (i ? cl + ' ' : '') + (r[ck] || '?')).join(', ')}`)));
  }
  L.push(`Odometer: ${st.odo.toLocaleString('en-AU')} ${u}`, `Use: ${v.usage || 'weekend'}`, '', `Task: ${f.title}`, `Type: ${f.type} · Priority: ${f.priority} · Status: ${COLNAME[f.col]}`);
  if (f.drive && f.drive !== 'N/A') L.push(`Drivability until fixed: ${f.drive}`);
  if (f.note) L.push(`Description: ${f.note}`);
  const ps = g.parts.filter(p => p.cardId === cid);
  if (ps.length) { L.push('Parts:'); ps.forEach(p => L.push(`- ${p.name}${p.partNo ? ' (' + p.partNo + ')' : ''} · ${p.status}`)); }
  const ns = f.activity.filter(a => a.kind === 'note').slice(-8);
  if (ns.length) { L.push('Updates so far:'); ns.forEach(a => L.push(`- ${a.at.slice(0, 10)}: ${a.text}`)); }
  if (cfg.shareHistory) {
    const h = st.recs.filter(r => r.type !== 'Fuel').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    if (h.length) { L.push('', 'Recent service history:'); h.forEach(r => L.push(`- ${r.date} · ${r.type} · ${r.title}${r.odo ? ' @ ' + Number(r.odo).toLocaleString('en-AU') + ' ' + u : ''}`)); }
  }
  if (cfg.shareNotes && (g.notes[vid] || '').trim()) L.push('', 'Owner notes:', g.notes[vid].trim());
  return L.join('\n');
}

export type AiMsg = { role: 'user' | 'ai'; text: string; saved?: boolean; refs?: string };
/** One request carries the context and the conversation so far; the server adds the mechanic instructions. */
export const aiPrompt = (ctx: string, thread: AiMsg[], q: string, manual: { name: string; page: number; text: string }[] = []) =>
  `--- CAR AND TASK ---\n${ctx}\n--- END ---\n\n${manual.length ? `--- WORKSHOP MANUAL EXCERPTS ---\nThe owner uploaded the workshop manual for this car. Base guides, specs and procedures on these excerpts first and cite them like (Manual p.12). Only fall back to general knowledge where they do not cover it, and say so.\n\n${manual.map(x => `[${x.name} p.${x.page}]\n${x.text}`).join('\n\n')}\n--- END MANUAL ---\n\n` : ''}${thread.map(m => (m.role === 'user' ? 'Owner: ' : 'You: ') + m.text).join('\n\n')}${thread.length ? '\n\n' : ''}Owner: ${q}\n\nYou:`;
