#!/usr/bin/env node
// Imprime la trama en hexadecimal de un comando, para mandarla por serial (RS232, 115200 8N1) con cualquier terminal.
//   node frame-cli.js getip | version | getpower | inventory | setpower 30
import { buildCommand, CMD, hex } from './lib/frame.js';
const [name, val] = process.argv.slice(2);
const map = { version: [CMD.VERSION], getip: [CMD.GET_IP], getpower: [CMD.GET_POWER], inventory: [CMD.INVENTORY], reset: [CMD.RESET], setpower: [CMD.SET_POWER, [+val || 30, 0, 0, 0]] };
if (!map[name]) { console.error('Comandos:', Object.keys(map).join(', ')); process.exit(2); }
console.log(hex(buildCommand(...map[name])));
