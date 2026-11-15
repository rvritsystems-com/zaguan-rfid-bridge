#!/usr/bin/env node
// Puente RFID → Zaguán. Lee el lector UHF por TCP, filtra repetidos y manda las lecturas nuevas al servidor, con un latido cada minuto que incluye el estado del lector.
//   node bridge.js --host 192.168.1.120 --url https://…/v1/device/rfid-reads --token <código> [--point entrada] [--dry-run]
// También acepta variables de entorno (las usa el servicio systemd): RFID_HOST, RFID_PORT, ZAGUAN_URL, ZAGUAN_DEVICE_TOKEN, RFID_POINT, RFID_POWER.
import { Reader } from './lib/reader.js';
import { Dedupe } from './lib/dedupe.js';
import { Sender } from './lib/sender.js';
import { Runner } from './lib/runner.js';

const env = process.env;
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); if (i < 0) return def; const v = process.argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const opts = {
  host: arg('host', env.RFID_HOST), port: +arg('port', env.RFID_PORT || 100), interval: +arg('interval', 150), window: +arg('window', 30) * 1000,
  hits: +arg('hits', 1), url: arg('url', env.ZAGUAN_URL), token: arg('token', env.ZAGUAN_DEVICE_TOKEN), point: arg('point', env.RFID_POINT), // opcional: el servidor toma el punto de la estación vinculada
  power: arg('power', env.RFID_POWER), heartbeat: +arg('heartbeat', 60) * 1000, dry: !!arg('dry-run', false),
};
if (!opts.host) { console.error('Falta --host (IP del lector). Ejemplo: node bridge.js --host 192.168.1.120 --dry-run'); process.exit(2); }
if (!opts.dry && (!opts.url || !opts.token)) { console.error('Faltan --url y --token (o usa --dry-run para solo ver las lecturas)'); process.exit(2); }

const log = (...a) => console.log(new Date().toISOString(), ...a);
const runner = new Runner({
  reader: new Reader({ host: opts.host, port: opts.port }),
  dedupe: new Dedupe({ windowMs: opts.window, minHits: opts.hits }),
  sender: new Sender({ url: opts.url, token: opts.token, point: opts.point, dryRun: opts.dry, log }),
  log, intervalMs: opts.interval, heartbeatMs: opts.heartbeat, power: opts.power ?? null,
});
const bye = () => { log('deteniendo…'); runner.stop(); };
process.on('SIGINT', bye); process.on('SIGTERM', bye);
await runner.run();
log('puente detenido');
