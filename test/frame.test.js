import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommand, checksum, FrameParser, parseTagData, hex } from '../lib/frame.js';

const H = (s) => Buffer.from(s.replace(/\s+/g, ''), 'hex');

test('las tramas coinciden con los ejemplos del manual', () => {
  const casos = [[0x22, [], '0A FF 02 22 D3'], [0x25, [0x1E, 0, 0, 0], '0A FF 06 25 1E 00 00 00 AE'], [0x80, [], '0A FF 02 80 75'],
    [0x41, [0x10], '0A FF 03 41 10 A3'], [0x43, [], '0A FF 02 43 B2'], [0x44, [], '0A FF 02 44 B1'], [0x2B, [], '0A FF 02 2B CA']];
  for (const [cmd, par, esperado] of casos) assert.equal(hex(buildCommand(cmd, par)), esperado);
});

test('el ejemplo de Set IP del manual', () => {
  const t = buildCommand(0x2C, [0x0A, 0x8D, 0xC2, 0xEC, 0xFF, 0xFF, 0xFF, 0x00, 0x0A, 0x8D, 0xC2, 0x01, 0x64, 0x00]);
  assert.equal(hex(t), '0A FF 10 2C 0A 8D C2 EC FF FF FF 00 0A 8D C2 01 64 00 BB');
});

test('las respuestas de ejemplo del manual se leen y su suma es correcta', () => {
  const p = new FrameParser();
  const [v] = p.push(H('0B FF 04 00 07 05 E6'));
  assert.equal(v.status, 0); assert.deepEqual([...v.data], [7, 5]);
  const [ip] = p.push(H('0B FF 10 00 C0 A8 01 FF FF FF FF 00 C0 A8 01 01 64 00 B3'));
  assert.equal(ip.data.length, 14);
  // OJO: el manual escribe el ejemplo de "Query ID Count" como 0B FF 03 00 00 01 F2 (un byte de más para esa longitud); con la longitud 03 la trama real es 0B FF 03 00 01 F2.
  const [cnt] = p.push(H('0B FF 03 00 01 F2'));
  assert.equal(cnt.data[0], 1);
});

test('lee una etiqueta de "Get Tag Data" del manual', () => {
  const [r] = new FrameParser().push(H('0B FF 11 00 01 0D 00 11 11 22 22 33 33 44 44 55 55 66 66 0D'));
  assert.equal(r.statusName, 'OK');
  assert.deepEqual(parseTagData(r.data), [{ ant: 0, epc: '111122223333444455556666' }]);
});

test('varias etiquetas y EPC de largo distinto en la misma respuesta', () => {
  const data = Buffer.from([2, 13, 1, ...Buffer.from('AABBCCDDEEFF001122334455', 'hex'), 9, 2, ...Buffer.from('0102030405060708', 'hex')]);
  assert.deepEqual(parseTagData(data), [{ ant: 1, epc: 'AABBCCDDEEFF001122334455' }, { ant: 2, epc: '0102030405060708' }]);
});

test('una unidad cortada no revienta: se ignora', () => {
  assert.deepEqual(parseTagData(Buffer.from([1, 13, 0, 1, 2, 3])), []);
  assert.deepEqual(parseTagData(Buffer.alloc(0)), []);
});

test('el parser junta trozos, ignora basura y detecta suma mala', () => {
  const p = new FrameParser();
  const a = H('0B FF 04 00 07 05 E6');
  assert.deepEqual(p.push(Buffer.concat([H('00 01'), a.subarray(0, 3)])), []);
  const out = p.push(a.subarray(3));
  assert.equal(out.length, 1); assert.equal(out[0].status, 0);
  const mala = Buffer.from(a); mala[mala.length - 1] ^= 0xFF;
  assert.equal(p.push(mala)[0].error, 'BAD_CHECKSUM');
  assert.equal(p.push(Buffer.concat([a, a])).length, 2);
});

test('checksum es el complemento a dos', () => { assert.equal(checksum([0x0A, 0xFF, 0x02, 0x22]), 0xD3); assert.equal(checksum([]), 0); });
