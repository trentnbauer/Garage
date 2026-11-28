// Email from Garage: reminder digests, overdue and blocker alerts, the monthly report and sign-in alerts.
// Uses the app's own reminder logic (web/src/lib/model.ts), so emails say what the Garage screen says.
import { createHash } from 'node:crypto';
import { Calc, DRIVE, liso } from '../web/src/lib/model.ts';

const HOUR = 7; // digests and the monthly report go out from 7am server time (set TZ)

/** Where Garage's email goes: the Send to list, else every admin with an email address. */
export const recipients = (smtp, users) => {
  const list = String(smtp.to || '').split(/[\s,;]+/).filter(Boolean);
  return list.length ? list : users.filter(u => u.role === 'admin' && !u.removed && u.email).map(u => u.email);
};

/** Overdue and due-soon reminders, and blockers, across every car still in the garage, as plain text. '' if nothing. */
export function digestText(g, today) {
  const c = new Calc(g, today), cars = g.vehicles.filter(v => !v.sold), blocks = [];
  for (const v of cars) {
    const items = c.dueFor([v], false); if (!items.length) continue;
    blocks.push([(v.nickname || `${v.year} ${v.make} ${v.model}`).trim(), ...items.map(it => it.kind === 'rem' ? `  • ${it.i.status}: ${it.r.title} (${it.i.due})` : `  • ${it.status}: ${it.c.title} (${it.due})`)].join('\n'));
  }
  return blocks.join('\n\n');
}

/**
 * The once-every-15-minutes check. read(key, default) and write(patch) are the database;
 * garage() is the current garage; send(to[], subject, text) sends one email.
 */
export function createMailer({ read, write, garage, send, smtp, users, log = () => {} }) {
  const seen = key => new Set(read(key, null) || []);
  const mail = async (subject, text) => {
    const to = recipients(smtp(), users());
    if (!to.length) { log('Email is on but there is nobody to send it to. Add addresses to Send to in Admin settings → Email.'); return false; }
    try { await send(to, subject, text); return true; } catch (e) { log(`Couldn’t send “${subject}”: ${e.message}`); return false; }
  };
  // Overdue reminders and new blockers: each is sent once. The first check after turning email on only records what's
  // already there; the digest covers that.
  const fresh = (key, keys) => { const now = [...keys], old = read(key, null); write({ [key]: now }); return old ? now.filter(k => !old.includes(k)) : []; };

  async function tick(at = new Date()) {
    const s = smtp(); if (!s.enabled || !s.host) return;
    const g = garage(), today = liso(at), c = new Calc(g, today), cars = g.vehicles.filter(v => !v.sold);
    const name = v => (v.nickname || `${v.year} ${v.make} ${v.model}`).trim();
    const sent = [];
    if (s.overdue) {
      const over = new Map();
      for (const v of cars) for (const { r, i } of c.activeRems(v)) if (i.rank === 0) over.set(`${r.id}|${r.dueDate || r.lastDone || ''}|${r.dueOdo ?? ''}`, `${name(v)}: ${r.title} (${i.due})`);
      const n = fresh('mail:overdue', over.keys());
      if (n.length && await mail(n.length === 1 ? `Overdue: ${over.get(n[0]).split(': ')[1].replace(/ \(.*/, '')}` : `${n.length} reminders are overdue`, n.map(k => '• ' + over.get(k)).join('\n'))) sent.push('overdue');
    }
    if (s.blockers) {
      const blk = new Map();
      for (const v of cars) for (const k of ['backlog', 'parts', 'progress']) for (const t of g.boards[v.id]?.[k] || []) if (DRIVE[t.drive]?.rank > 0) blk.set(`${t.id}|${t.drive}`, `${name(v)}: ${t.title} — ${t.drive} until fixed`);
      const n = fresh('mail:blockers', blk.keys());
      if (n.length && await mail(n.length === 1 ? `New blocker: ${blk.get(n[0]).split(': ').slice(1).join(': ')}` : `${n.length} new blockers`, n.map(k => '• ' + blk.get(k)).join('\n'))) sent.push('blockers');
    }
    if (at.getHours() >= HOUR) {
      const weekly = s.digest === 'weekly', due = s.digest === 'daily' || (weekly && at.getDay() === 1);
      if (due && read('mail:digest', '') !== today) {
        write({ 'mail:digest': today });
        const text = digestText(g, today);
        if (text && await mail(`Garage: what’s due ${weekly ? 'this week' : 'today'}`, text + '\n\nOpen Garage to log the work.')) sent.push('digest');
      }
      const month = today.slice(0, 7);
      if (s.summary && at.getDate() === 1 && read('mail:summary', '') !== month) {
        write({ 'mail:summary': month });
        const last = liso(new Date(at.getFullYear(), at.getMonth() - 1, 1)).slice(0, 7);
        const recs = g.records.filter(r => r.date.startsWith(last));
        const lines = cars.map(v => { const rs = recs.filter(r => r.vid === v.id); return rs.length ? `${name(v)}: ${rs.length} entr${rs.length === 1 ? 'y' : 'ies'}, ${c.money(rs.reduce((a, r) => a + (+r.cost || 0), 0), true)}` : ''; }).filter(Boolean);
        const total = c.money(recs.reduce((a, r) => a + (+r.cost || 0), 0), true);
        if (await mail(`Garage: ${new Date(last + '-01T00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })} report`, lines.length ? `Spent ${total} across ${recs.length} entries.\n\n${lines.join('\n')}` : 'Nothing was logged last month.')) sent.push('summary');
      }
    }
    return sent;
  }

  /** After a sign-in: email if this person hasn't signed in from this browser before. Their first device is just recorded. */
  async function signedIn(user, userAgent) {
    const s = smtp(), key = 'devices:' + user.id, dev = createHash('sha256').update(String(userAgent || '')).digest('hex').slice(0, 16);
    const known = seen(key); if (known.has(dev)) return false;
    write({ [key]: [...known, dev].slice(-50) });
    if (!known.size || !s.enabled || !s.signin || !s.host) return false;
    return mail(`New sign-in for ${user.name}`, `${user.name} signed in to Garage from a browser it hasn’t seen before:\n\n${String(userAgent || 'unknown browser').slice(0, 300)}\n${new Date().toLocaleString('en-AU')}\n\nIf this wasn’t them, an admin can reset their sign-in in Admin settings → People & roles.`);
  }

  return { tick, signedIn };
}
