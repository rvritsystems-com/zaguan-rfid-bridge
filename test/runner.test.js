import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Reader } from '../lib/reader.js';
import { Dedupe } from '../lib/dedupe.js';
import { Sender } from '../lib/sender.js';
import { Runner } from '../lib/runner.js';
import { createSimulator } from '../sim/simulator.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (cond()) return true; await sleep(15); } return false; };
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
// Simulador que además sabe cortar sus conexiones (como un lector que se apaga).
const startSim = async (port, tags) => {
  const server = createSimulator({ tags }); const socks = new Set();
  server.on('connection', (s) => { socks.add(s); s.on('close', () => socks.delete(s)); });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { stop: () => new Promise((r) => { for (const s of socks) s.destroy(); server.close(r); }) };
};
const make = (port) => {
  const posts = [];
  const fetchFn = async (_url, init) => { posts.push(JSON.parse(init.body)); return { ok: true, status: 200 }; };
  const runner = new Runner({ reader: new Reader({ host: '127.0.0.1', port, timeoutMs: 300 }), dedupe: new Dedupe({ windowMs: 60000 }),
    sender: new Sender({ url: 'http://x/y', token: 't', point: 'entrada', fetchFn }), intervalMs: 20, heartbeatMs: 60, flushMs: 40, backoffMs: 40, maxBackoffMs: 80 });
  return { runner, posts, beats: () => posts.filter((p) => p.heartbeat).map((p) => p.heartbeat), reads: () => posts.flatMap((p) => p.reads) };
};

test('con el lector caído el latido sigue saliendo y dice «sin conexión»', async () => {
  const port = await freePort(); const { runner, beats } = make(port); const done = runner.run();
  assert.ok(await until(() => beats().length >= 3));
  const b = beats().at(-1);
  assert.equal(b.reader.connected, false); assert.ok(b.reader.lastError); assert.equal(b.reader.lastPollOkAt, null); assert.equal(b.bridge.version, '0.1.0');
  runner.stop(); await done;
});

test('cuando el lector aparece, conecta solo, lee y el latido lo refleja', async () => {
  const port = await freePort(); const { runner, beats, reads } = make(port); const done = runner.run();
  assert.ok(await until(() => beats().length >= 2));
  const sim = await startSim(port, () => [{ ant: 1, epc: 'E28011600000000000000001' }]);
  assert.ok(await until(() => reads().length >= 1));
  assert.deepEqual(reads().map((r) => r.tag), ['E28011600000000000000001']);       // aunque la siga viendo, solo se avisa una vez
  await sleep(200); assert.equal(reads().length, 1);
  assert.ok(await until(() => beats().at(-1)?.reader.connected === true));
  const b = beats().at(-1); assert.equal(b.reader.firmware, '7.5'); assert.equal(b.reader.powerDbm, 30); assert.ok(b.reader.lastPollAgeSec <= 2); assert.equal(b.reads.notified, 1);
  runner.stop(); await done; await sim.stop();
});

test('si el lector se apaga a media operación, el latido lo avisa y al volver reconecta', async () => {
  const port = await freePort(); let n = 0;
  const { runner, beats, reads } = make(port);
  let sim = await startSim(port, () => [{ ant: 1, epc: 'AA' + String(++n).padStart(22, '0') }]); const done = runner.run();
  assert.ok(await until(() => reads().length >= 1));
  const antes = beats().length; await sim.stop();
  // un latido NUEVO (posterior al corte) que diga «sin conexión» y traiga el error
  assert.ok(await until(() => beats().slice(antes).some((b) => b.reader.connected === false && b.reader.lastError)));
  sim = await startSim(port, () => [{ ant: 1, epc: 'BB' + String(++n).padStart(22, '0') }]);
  assert.ok(await until(() => { const b = beats().at(-1); return b?.reader.connected === true && b.reader.reconnects >= 1; }));
  runner.stop(); await done; await sim.stop();
});

test('con internet caído las lecturas se guardan y se mandan al volver', async () => {
  const port = await freePort(); let online = false; const posts = [];
  const fetchFn = async (_u, init) => { if (!online) throw new Error('sin red'); posts.push(JSON.parse(init.body)); return { ok: true, status: 200 }; };
  const sender = new Sender({ url: 'http://x', token: 't', point: 'entrada', fetchFn });
  const runner = new Runner({ reader: new Reader({ host: '127.0.0.1', port, timeoutMs: 300 }), dedupe: new Dedupe(), sender, intervalMs: 20, heartbeatMs: 5000, flushMs: 30, backoffMs: 40 });
  let n = 0; const sim = await startSim(port, () => (n++ < 3 ? [{ ant: 1, epc: 'CC' + String(n).padStart(22, '0') }] : []));
  const done = runner.run();
  assert.ok(await until(() => runner.status().reads.queued === 3));
  online = true; sender.nextTry = 0;
  assert.ok(await until(() => posts.flatMap((p) => p.reads).length === 3));
  assert.equal(runner.status().reads.queued, 0);
  runner.stop(); await done; await sim.stop();
});

test('stop() corta incluso en medio de la espera de reconexión', async () => {
  const port = await freePort(); const { runner } = make(port); runner.maxBackoffMs = 60000; runner.backoffMs = 60000;
  const done = runner.run(); await sleep(100); const t = Date.now(); runner.stop(); await done; assert.ok(Date.now() - t < 500);
});
