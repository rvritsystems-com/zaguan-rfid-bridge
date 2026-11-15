#!/usr/bin/env node
// Lector falso para probar el puente sin el equipo: habla el mismo protocolo (TCP, puerto 100 por defecto).
//   node sim/simulator.js [puerto] — cada 3 s "pasa" un auto distinto con su etiqueta.
import net from 'node:net';
import { checksum, HEAD_RES, CMD, FrameParser } from '../lib/frame.js';
import { pathToFileURL } from 'node:url';

const res = (addr, status, data = []) => { const body = [HEAD_RES, addr, data.length + 2, status, ...data]; return Buffer.from([...body, checksum(body)]); };

// `tags` es una función que devuelve las etiquetas visibles ahora: [{ant, epc:'hex'}].
export const createSimulator = ({ tags = () => [], ip = [192, 168, 1, 120], power = 30, firmware = [7, 5] } = {}) => {
  const server = net.createServer((sock) => {
    let buffer = []; let pwr = power;
    sock.on('error', () => {});
    let acc = Buffer.alloc(0);
    sock.on('data', (d) => {
      acc = Buffer.concat([acc, d]);
      while (acc.length >= 3 && acc.length >= 3 + acc[2]) {
        const f = acc.subarray(0, 3 + acc[2]); acc = acc.subarray(f.length);
        const addr = f[1], cmd = f[3], params = [...f.subarray(4, f.length - 1)];
        if (checksum(f.subarray(0, f.length - 1)) !== f[f.length - 1]) { sock.write(res(addr, 0xFE)); continue; }
        switch (cmd) {
          case CMD.VERSION: sock.write(res(addr, 0, firmware)); break;
          case CMD.GET_POWER: sock.write(res(addr, 0, [pwr, 0, 0, 0])); break;
          case CMD.SET_POWER: pwr = params[0]; sock.write(res(addr, 0)); break;
          case CMD.GET_IP: sock.write(res(addr, 0, [...ip, 255, 255, 255, 0, ...ip.slice(0, 3), 1, 0x64, 0x00])); break;   // igual que el ejemplo del manual: el puerto 100 va como 64 00
          case CMD.INVENTORY: buffer = tags(); sock.write(buffer.length ? res(addr, 0, [buffer.length >> 8, buffer.length & 255]) : res(addr, 0x04)); break;
          case CMD.COUNT: sock.write(res(addr, 0, [buffer.length >> 8, buffer.length & 255])); break;
          case CMD.GET_TAGS: {
            const n = Math.min(params[0], 16, buffer.length), take = buffer.splice(0, n), data = [n];
            for (const t of take) { const epc = Buffer.from(t.epc, 'hex'); data.push(epc.length + 1, t.ant ?? 0, ...epc); }
            sock.write(res(addr, 0, data)); break;
          }
          case CMD.CLEAR: buffer = []; sock.write(res(addr, 0)); break;
          case CMD.RESET: sock.write(res(addr, 0)); break;
          default: sock.write(res(addr, 0xFE));
        }
      }
    });
  });
  return server;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = +process.argv[2] || 100; let n = 0, current = null, until = 0;
  const server = createSimulator({ tags: () => { if (Date.now() > until) { n++; current = { ant: 1, epc: 'E2801160' + String(n % 7).padStart(2, '0').repeat(4) }; until = Date.now() + 3000; } return [current]; } });
  server.listen(port, () => console.log('lector simulado en el puerto', port));
}
