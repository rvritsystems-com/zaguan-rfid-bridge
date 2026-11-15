#!/usr/bin/env node
// Vincula este puente con su estación «Lector RFID» de Zaguán y muestra las líneas para el archivo de entorno del servicio.
//   node pair.js --api https://<api>/<stage> --code ABCD-EFGH
// El código es el de la estación (Estaciones → Agregar estación → Lector RFID). Cada vinculación crea un dispositivo nuevo; si el administrador regenera el código o revoca la estación, hay que vincular de nuevo.
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const api = String(arg('api') || process.env.ZAGUAN_API || '').replace(/\/+$/, '');
const code = arg('code');
if (!api || !code) { console.error('Uso: node pair.js --api https://<api>/<stage> --code ABCD-EFGH'); process.exit(2); }
const res = await fetch(`${api}/v1/devices/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(10000) });
const data = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`No se pudo vincular (${res.status}): ${data?.error?.message || 'error desconocido'}`); process.exit(1); }
if (data.config?.kind && data.config.kind !== 'reader') console.error(`Aviso: la estación es de tipo «${data.config.kind}», no «reader»; el servidor rechazará las lecturas.`);
console.log('Vinculado. Pon esto en /etc/zaguan-rfid-bridge.env (o en tus variables de entorno):\n');
console.log(`ZAGUAN_URL=${api}/v1/device/rfid-reads`);
console.log(`ZAGUAN_DEVICE_TOKEN=${data.deviceToken}`);
