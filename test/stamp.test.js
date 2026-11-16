import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// La zona horaria se fija por proceso (TZ), así que se prueba en un hijo.
const run = (tz) => spawnSync(process.execPath, ['--input-type=module', '-e',
  "import { stamp } from './lib/stamp.js'; console.log(stamp(new Date('2026-11-16T20:28:05.123Z')));"], { env: { ...process.env, TZ: tz }, encoding: 'utf8', cwd: new URL('..', import.meta.url) }).stdout.trim();

test('stamp: hora local con desfase', () => {
  assert.equal(run('America/Mexico_City'), '2026-11-16 14:28:05.123 -06:00');
  assert.equal(run('UTC'), '2026-11-16 20:28:05.123 +00:00');
  assert.equal(run('Asia/Kolkata'), '2026-11-17 01:58:05.123 +05:30');
});
