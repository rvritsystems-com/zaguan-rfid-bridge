# Puente RFID → Zaguán

Programa en Node (sin dependencias, Node 18 o más nuevo) que corre en una mini PC o Raspberry Pi junto al lector UHF (PRO12RF / familia con el mismo protocolo V1.2).
Se conecta al lector por TCP (puerto 100), pide lecturas, filtra repetidos y manda las nuevas a Zaguán.

## Probar con el lector real
1. Alimenta el lector (12 V) y conéctalo por cable de red a tu equipo. Pon tu equipo en 192.168.1.x (p. ej. 192.168.1.10) e intenta `ping 192.168.1.120`.
2. `node probe.js 192.168.1.120` → muestra firmware, IP configurada, potencia, y lee 10 s: acerca una etiqueta y verás su EPC.
3. Si no responde por red, por serial (RS232, 115200 8N1) manda la trama que da `node frame-cli.js getip` (`0A FF 02 2B CA`).

## Vincular con Zaguán
1. En el panel: Estaciones → Agregar estación → tipo **Lector RFID**, elige el punto de escaneo de la puerta. Te da un código de 8 caracteres.
2. En la Raspberry: `node pair.js --api https://<api>/<stage> --code ABCD-EFGH`. Imprime `ZAGUAN_URL` y `ZAGUAN_DEVICE_TOKEN`; guárdalos en el archivo de entorno del servicio.
El punto de escaneo sale de la estación, por eso `--point` ya no hace falta. Si se regenera el código o se revoca la estación, el token deja de servir y hay que vincular otra vez.

## Correr el puente
```
node bridge.js --host 192.168.1.120 --dry-run                       # solo imprime lo que mandaría
node bridge.js --host 192.168.1.120 --url https://<api>/v1/device/rfid-reads --token <token de pair.js>
```
Variables de entorno equivalentes: `RFID_HOST`, `RFID_PORT`, `RFID_POINT`, `RFID_POWER`, `ZAGUAN_URL`, `ZAGUAN_DEVICE_TOKEN`.
Opciones: `--power <dBm>` (ajusta la potencia al conectar), `--window <seg>` (30; no repite una etiqueta mientras siga a la vista), `--hits <n>` (1; con 2 o 3 pide varias lecturas seguidas para descartar autos de otro carril), `--interval <ms>` (150), `--heartbeat <seg>` (60).

## Instalarlo como servicio
Ver `deploy/INSTALL.md` (systemd: arranca solo y se reinicia si se cae).

## Latido
Cada minuto manda `{reads:[], heartbeat:{bridge:{version,startedAt,uptimeSec}, reader:{host,connected,firmware,powerDbm,reconnects,lastPollOkAt,lastPollAgeSec,lastError,lastErrorAt}, reads:{raw,notified,queued,dropped,sent}}}`. Sale aunque el lector esté caído, para que el servidor distinga «lector sin conexión» de un silencio total (apagón o sin internet).

## Sin el lector
`node sim/simulator.js 10100` levanta un lector falso (cada 3 s «pasa» una etiqueta distinta); luego `node bridge.js --host 127.0.0.1 --port 10100 --dry-run`.

## Pruebas
`npm test` (las tramas se comprueban contra los ejemplos del manual del protocolo V1.2).

## Lo que falta / pendiente de confirmar con el equipo real
- El endpoint `/v1/device/rfid-reads` ya existe en Zaguán (ver el contrato OpenAPI); recibe `{reads:[{tag, at, ant}], heartbeat?}` y responde un resultado por lectura. Falta probarlo con el lector real y desplegarlo en dev.
- El manual V1.2 tiene erratas (p. ej. el ejemplo de «Query ID Count») y la hoja del PRO12RF habla de protocolo V2.0: confirmar contra el lector.
- No se sabe si «Get Tag Data» vacía el buffer por sí solo; el puente lo vacía después de cada lectura (comando 0x44).
- Modo de espera/disparo, filtro del lector y Wiegand se configuran por parámetros internos o la página web del lector; no están documentados en el SDK.
