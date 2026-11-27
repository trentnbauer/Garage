// A small SMTP client: plain, STARTTLS or implicit TLS, AUTH PLAIN, one message per connection.
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

const clean = s => String(s || '').replace(/[\r\n]+/g, ' ').trim(); // no header injection
const addr = s => { const a = clean(s); if (!/^[^\s@<>]+@[^\s@<>]+$/.test(a)) throw new Error(`“${a}” isn’t an email address.`); return a; };
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const word = s => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`); // non-ASCII names and subjects

/**
 * cfg: { host, port, security: 'starttls'|'ssl'|'none', user, pass }
 * msg: { fromName, from, to: string[], replyTo?, subject, text }
 */
export function sendMail(cfg, msg, { timeout = 20000, rejectUnauthorized = true } = {}) {
  const host = clean(cfg.host), port = +cfg.port || (cfg.security === 'ssl' ? 465 : 587);
  if (!host) return Promise.reject(new Error('Set the SMTP host first.'));
  let from, to;
  try { from = addr(msg.from); to = msg.to.map(addr); } catch (e) { return Promise.reject(e); }
  if (!to.length) return Promise.reject(new Error('Add someone to send to.'));

  return new Promise((resolve, reject) => {
    let sock = cfg.security === 'ssl' ? tls.connect({ host, port, servername: host, rejectUnauthorized }) : net.connect({ host, port });
    let buf = '', waiter = null, done = false;
    const replies = [];
    const fail = e => { if (done) return; done = true; sock.destroy(); reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => fail(new Error(`The mail server at ${host}:${port} didn’t answer in time.`)), timeout);
    // A reply is zero or more "NNN-text" lines then one "NNN text" line.
    const onData = d => {
      buf += d.toString('utf8');
      let m;
      while ((m = buf.match(/^(?:\d{3}-[^\r\n]*\r\n)*\d{3}(?: [^\r\n]*)?\r\n/))) { replies.push(m[0]); buf = buf.slice(m[0].length); }
      if (waiter && replies.length) { const w = waiter; waiter = null; w(replies.shift()); }
    };
    const listen = s => { s.on('data', onData); s.on('error', e => fail(new Error(`Couldn’t talk to ${host}:${port} (${e.code || e.message}).`))); };
    listen(sock);
    const read = () => new Promise(r => (replies.length ? r(replies.shift()) : (waiter = r)));
    const cmd = async (line, ok) => {
      if (line != null) sock.write(line + '\r\n');
      const reply = await read(), code = +reply.slice(0, 3);
      if (!ok.includes(code)) throw new Error(`The mail server said: ${reply.trim().split('\r\n').pop()}`);
      return reply;
    };
    (async () => {
      await cmd(null, [220]);
      let ehlo = await cmd('EHLO garage.local', [250]);
      if (cfg.security === 'starttls') {
        if (!/STARTTLS/i.test(ehlo)) throw new Error(`${host} doesn’t offer STARTTLS. Try SSL / TLS or another port.`);
        await cmd('STARTTLS', [220]);
        sock.removeAllListeners('data'); sock.removeAllListeners('error');
        sock = tls.connect({ socket: sock, servername: host, rejectUnauthorized });
        listen(sock);
        await new Promise((ok, no) => { sock.once('secureConnect', ok); sock.once('error', no); });
        ehlo = await cmd('EHLO garage.local', [250]);
      }
      if (cfg.user) await cmd('AUTH PLAIN ' + b64(`\0${cfg.user}\0${cfg.pass || ''}`), [235]);
      await cmd(`MAIL FROM:<${from}>`, [250]);
      for (const r of to) await cmd(`RCPT TO:<${r}>`, [250, 251]);
      await cmd('DATA', [354]);
      const body = String(msg.text || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'); // dot-stuffing
      const head = [`From: ${word(clean(msg.fromName || 'Garage'))} <${from}>`, `To: ${to.join(', ')}`, ...(msg.replyTo ? [`Reply-To: ${addr(msg.replyTo)}`] : []),
        `Subject: ${word(clean(msg.subject))}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${randomBytes(12).toString('hex')}@garage.local>`,
        'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit'];
      await cmd(head.join('\r\n') + '\r\n\r\n' + body + '\r\n.', [250]);
      sock.write('QUIT\r\n'); done = true; clearTimeout(timer); sock.end(); resolve();
    })().catch(e => { clearTimeout(timer); fail(e); });
  });
}
