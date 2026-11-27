// AI help: one question in, plain text out. The provider and key are set in Admin settings → AI help.
import Anthropic from '@anthropic-ai/sdk';

export const PROVIDERS = {
  anthropic: { label: 'Anthropic API', key: true, model: 'claude-opus-5-5' },
  openai: { label: 'OpenAI-compatible', key: true, base: true, model: 'gpt-4o-mini', basePh: 'https://api.openai.com/v1' },
  ollama: { label: 'Ollama (local)', base: true, model: 'llama3.1', basePh: 'http://localhost:11434' },
};
// Models that take effort and the server-side refusal fallback.
const CURRENT = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const SYSTEM = 'You are an experienced mechanic helping the owner of a project car work on it at home. Use the car and task details you are given. Reply in plain text — no markdown headings, tables or bold. Be practical and concise, use numbered steps for procedures, give specs where you are confident and say when they should be checked in a workshop manual, and call out anything safety-critical.';

/** Ask the configured provider. Throws an Error whose message is fit to show the user. */
export async function askAI(cfg, key, prompt, deps = {}) {
  const pv = PROVIDERS[cfg.provider];
  if (!pv) throw new Error('Pick an AI provider in Admin settings → AI help.');
  if (pv.key && !key) throw new Error(`Add an API key for ${pv.label} in Admin settings → AI help.`);
  const model = (cfg.model || pv.model).trim();

  if (cfg.provider === 'anthropic') {
    const client = deps.anthropic || new Anthropic({ apiKey: key });
    const params = { model, max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] };
    let res;
    try {
      res = CURRENT.has(model)
        ? await client.beta.messages.create({ ...params, output_config: { effort: 'medium' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await client.messages.create(params);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error('Anthropic rejected the API key. Check it in Admin settings → AI help.');
      if (e instanceof Anthropic.NotFoundError) throw new Error(`Anthropic doesn’t know the model “${model}”.`);
      if (e instanceof Anthropic.RateLimitError) throw new Error('Anthropic is rate-limiting requests. Try again in a minute.');
      if (e instanceof Anthropic.APIConnectionError) throw new Error('Couldn’t reach Anthropic. Check this server’s internet connection.');
      if (e instanceof Anthropic.APIError) throw new Error(`Anthropic returned an error (${e.status ?? 'unknown'}): ${e.message}`);
      throw e;
    }
    if (res.stop_reason === 'refusal') throw new Error('The AI declined to answer that. Try asking it a different way.');
    return res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  }

  // Ollama and OpenAI-compatible servers speak their own HTTP APIs.
  const base = (cfg.baseUrl || pv.basePh).replace(/\/+$/, '');
  const doFetch = deps.fetch || fetch;
  let r, j;
  try {
    r = cfg.provider === 'ollama'
      ? await doFetch(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, stream: false, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }) })
      : await doFetch(base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }) });
    j = await r.json();
  } catch { throw new Error(`Couldn’t reach ${pv.label} at ${base}. Check the address.`); }
  if (!r.ok) throw new Error(`${pv.label} returned an error (${r.status}): ${j?.error?.message || j?.error || 'no details'}`);
  return String(cfg.provider === 'ollama' ? j.message?.content || '' : j.choices?.[0]?.message?.content || '').trim();
}
