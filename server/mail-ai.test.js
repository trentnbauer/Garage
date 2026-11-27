import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { sendMail } from './smtp.js';
import { askAI } from './ai.js';

// A fake SMTP server that records what it is sent. failAt: a command to reject.
function fakeSmtp(failAt) {
  const got = { cmds: [], data: '' };
  const srv = net.createServer(s => {
    let buf = '', inData = false;
    s.write('220 fake ESMTP\r\n');
    s.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\r\n')) > -1) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === '.') { inData = false; s.write('250 queued\r\n'); } else got.data += line + '\n'; continue; }
        got.cmds.push(line);
        const verb = line.split(/[ :]/)[0];
        if (failAt && verb === failAt) { s.write('535 5.7.8 Bad credentials\r\n'); continue; }
        if (verb === 'EHLO') s.write('250-fake\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n');
        else if (verb === 'AUTH') s.write('235 ok\r\n');
        else if (verb === 'DATA') { inData = true; s.write('354 go\r\n'); }
        else if (verb === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
        else s.write('250 ok\r\n');
      }
    });
  });
  return new Promise(r => srv.listen(0, () => r({ srv, got, port: srv.address().port })));
}

test('sends a message: auth, recipients, dot-stuffing, safe headers', async () => {
  const { srv, got, port } = await fakeSmtp();
  await sendMail({ host: '127.0.0.1', port, security: 'none', user: 'me@x.com', pass: 'pw' },
    { fromName: 'Garage', from: 'garage@x.com', to: ['a@x.com', 'b@x.com'], subject: 'Hi\r\nBcc: evil@x.com ✓', text: 'line one\n.leading dot\nend' });
  srv.close();
  assert.ok(got.cmds.includes('AUTH PLAIN ' + Buffer.from('\0me@x.com\0pw').toString('base64')));
  assert.deepEqual(got.cmds.filter(c => c.startsWith('RCPT')), ['RCPT TO:<a@x.com>', 'RCPT TO:<b@x.com>']);
  assert.match(got.data, /^\.\.leading dot$/m);
  assert.doesNotMatch(got.data, /^Bcc:/m);
  assert.match(got.data, /^Subject: =\?UTF-8\?B\?/m);
});

test('reports the server’s refusal and bad addresses', async () => {
  const { srv, port } = await fakeSmtp('AUTH');
  await assert.rejects(sendMail({ host: '127.0.0.1', port, security: 'none', user: 'u', pass: 'p' }, { from: 'g@x.com', to: ['a@x.com'], subject: 's', text: 't' }), /Bad credentials/);
  srv.close();
  await assert.rejects(sendMail({ host: 'h', port: 1, security: 'none' }, { from: 'not an address', to: ['a@x.com'], subject: 's', text: 't' }), /isn’t an email address/);
});

test('AI: Anthropic uses the default model with refusal fallback; refusals and text are handled', async () => {
  let sent;
  const anthropic = { beta: { messages: { create: async p => { sent = p; return { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: ' Check the fuse. ' }] }; } } } };
  assert.equal(await askAI({ provider: 'anthropic' }, 'k', 'Why no lights?', { anthropic }), 'Check the fuse.');
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.fallbacks, 'default');
  assert.deepEqual(sent.betas, ['server-side-fallback-2026-07-01']);
  const refuse = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } };
  await assert.rejects(askAI({ provider: 'anthropic' }, 'k', 'x', { anthropic: refuse }), /declined/);
  await assert.rejects(askAI({ provider: 'anthropic' }, '', 'x'), /Add an API key/);
});

test('AI: OpenAI-compatible and Ollama', async () => {
  const fetch = async (url, o) => ({ ok: true, json: async () => (url.endsWith('/api/chat') ? { message: { content: 'ollama says' } } : { choices: [{ message: { content: JSON.parse(o.body).model } }] }) });
  assert.equal(await askAI({ provider: 'openai', baseUrl: 'https://x/v1/' }, 'k', 'q', { fetch }), 'gpt-4o-mini');
  assert.equal(await askAI({ provider: 'ollama' }, '', 'q', { fetch }), 'ollama says');
});
