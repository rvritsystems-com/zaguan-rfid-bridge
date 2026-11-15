#!/usr/bin/env node
// Prueba rápida con el lector recién conectado: versión, IP configurada y potencia, y lee etiquetas unos segundos.
//   node probe.js 192.168.1.120 [puerto] [segundos]
import { Reader } from './lib/reader.js';
const [host, port = 100, secs = 10] = process.argv.slice(2);
if (!host) { console.error('Uso: node probe.js <ip> [puerto] [segundos]'); process.exit(2); }
const r = new Reader({ host, port: +port });
try {
  await r.open();
  console.log('conectado a', host + ':' + port);
  console.log('firmware      ', await r.version());
  console.log('red           ', JSON.stringify(await r.getIp()));
  console.log('potencia (dBm)', await r.getPower());
  const seen = new Map(), end = Date.now() + secs * 1000;
  console.log(`leyendo ${secs} s… acerca una etiqueta`);
  while (Date.now() < end) { for (const t of await r.poll()) seen.set(t.epc, (seen.get(t.epc) ?? 0) + 1); await new Promise((x) => setTimeout(x, 150)); }
  console.log(seen.size ? 'etiquetas (EPC: veces vista):' : 'no se leyó ninguna etiqueta'); for (const [k, v] of seen) console.log(' ', k, v);
} catch (e) { console.error('error:', e.message); process.exitCode = 1; } finally { r.close(); }
