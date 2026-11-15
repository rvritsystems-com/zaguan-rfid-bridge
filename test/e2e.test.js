import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Reader } from '../lib/reader.js';
import { Sender } from '../lib/sender.js';
import { createSimulator } from '../sim/simulator.js';

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const withReader = async (tags, fn) => {
  const sim = createSimulator({ tags }); const port = await listen(sim);
  const reader = new Reader({ host: '127.0.0.1', port, timeoutMs: 800 }); await reader.open();
  try { await fn(reader, port); } finally { reader.close(); sim.close(); }
};

test('versión, IP y potencia contra el lector simulado', async () => {
  await withReader(() => [], async (r) => {
    assert.equal(await r.version(), '7.5');
    assert.deepEqual(await r.getIp(), { ip: '192.168.1.120', mask: '255.255.255.0', gateway: '192.168.1.1', port: 100 });
    assert.equal(await r.getPower(), 30);
    await r.setPower(22); assert.equal(await r.getPower(), 22);
  });
});

test('poll devuelve las etiquetas, también más de 16', async () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ ant: 1, epc: 'E280' + i.toString(16).padStart(20, '0') }));
  await withReader(() => many.map((t) => ({ ...t })), async (r) => {
    const got = await r.poll();
    assert.equal(got.length, 40); assert.equal(new Set(got.map((t) => t.epc)).size, 40);
  });
});

test('sin etiquetas: lista vacía, sin error', async () => { await withReader(() => [], async (r) => assert.deepEqual(await r.poll(), [])); });

test('comandos seguidos sin esperar no se mezclan', async () => {
  await withReader(() => [], async (r) => { const [a, b, c] = await Promise.all([r.version(), r.getPower(), r.getIp()]); assert.equal(a, '7.5'); assert.equal(b, 30); assert.equal(c.ip, '192.168.1.120'); });
});

test('si el lector se cae, el error es claro y se puede reconectar', async () => {
  const sim = createSimulator({}); const port = await listen(sim);
  const r = new Reader({ host: '127.0.0.1', port, timeoutMs: 500 }); await r.open();
  r.sock.destroy();
  await assert.rejects(() => r.version(), /sin conexión|cerrada/i);
  await r.open(); assert.equal(await r.version(), '7.5'); r.close(); sim.close();
});

test('no conecta: error rápido', async () => {
  await assert.rejects(() => new Reader({ host: '127.0.0.1', port: 1 }).open());
});

test('el sender manda lotes con token y punto, y reintenta tras un fallo', async () => {
  const got = [], logs = []; let fail = true;
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { if (fail) { res.statusCode = 503; return res.end(); } got.push({ auth: req.headers.authorization, body: JSON.parse(b) }); res.end('{"results":[{"tag":"A","status":"queued","students":["Sofía"]}],"invalid":0}'); }); });
  const port = await listen(srv);
  const s = new Sender({ url: `http://127.0.0.1:${port}/x`, token: 'abc', point: 'entrada', batch: 2, log: (...a) => logs.push(a.join(' ')) });
  for (const t of ['A', 'B', 'C']) s.add({ tag: t, at: 'x' });
  assert.equal(await s.flush(0), 0); assert.equal(s.queue.length, 3);
  assert.equal(await s.flush(500), 0);                       // todavía en espera
  fail = false;
  assert.equal(await s.flush(100000), 3);
  assert.deepEqual(got.map((g) => g.body.reads.length), [2, 1]);
  assert.equal(got[0].auth, 'Bearer abc'); assert.equal(got[0].body.point, 'entrada');
  assert.ok(logs.some((l) => l.includes('A → en cola (Sofía)')), logs.join('|'));
  assert.equal(await s.heartbeat({ queued: 0 }), true); assert.deepEqual(got.at(-1).body.reads, []);
  srv.close();
});

test('la cola del sender tiene tope: descarta lo más viejo', () => {
  const s = new Sender({ maxQueue: 3 }); for (const t of 'ABCDE') s.add({ tag: t });
  assert.deepEqual(s.queue.map((r) => r.tag), ['C', 'D', 'E']); assert.equal(s.dropped, 2);
});

test('dry-run no hace llamadas de red', async () => {
  const logs = []; const s = new Sender({ dryRun: true, log: (...a) => logs.push(a.join(' ')), fetchFn: () => { throw new Error('no debe llamarse'); } });
  s.add({ tag: 'A', at: 'x' }); assert.equal(await s.flush(), 1); assert.match(logs[0], /dry-run/);
});
