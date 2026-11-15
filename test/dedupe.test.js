import test from 'node:test';
import assert from 'node:assert/strict';
import { Dedupe } from '../lib/dedupe.js';

test('avisa una vez y no repite mientras la etiqueta siga frente al lector', () => {
  let t = 0; const d = new Dedupe({ windowMs: 30000, now: () => t });
  assert.equal(d.see('A'), true);
  for (t = 5000; t <= 120000; t += 5000) assert.equal(d.see('A'), false);   // sigue viéndose: la ventana se renueva
  t += 31000; assert.equal(d.see('A'), true);                               // se fue y volvió
});

test('etiquetas distintas no se estorban', () => {
  const d = new Dedupe({ now: () => 0 }); assert.equal(d.see('A'), true); assert.equal(d.see('B'), true); assert.equal(d.see('A'), false);
});

test('minHits pide varias lecturas seguidas antes de avisar', () => {
  let t = 0; const d = new Dedupe({ minHits: 3, confirmMs: 2000, now: () => t });
  assert.equal(d.see('A'), false); t = 500; assert.equal(d.see('A'), false); t = 900; assert.equal(d.see('A'), true);
  t = 100000; assert.equal(d.see('B'), false); t = 105000; assert.equal(d.see('B'), false);   // lecturas sueltas, muy separadas: no cuentan
  t = 110000; assert.equal(d.see('B'), false);
});
