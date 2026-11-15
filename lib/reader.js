import net from 'node:net';
import { buildCommand, FrameParser, CMD, parseTagData, STATUS } from './frame.js';

// El manual dice «byte alto primero» pero su ejemplo manda el puerto 100 como 64 00; se acepta cualquiera de los dos órdenes (el puerto de fábrica es 100).
const portOf = (a, b) => { const be = (a << 8) | b, le = (b << 8) | a; return be === 100 ? be : le; };

// Cliente TCP del lector (el lector es el servidor, puerto 100 por defecto). Un comando a la vez: el lector contesta en el mismo orden.
export class Reader {
  constructor({ host, port = 100, timeoutMs = 1500, addr = 0xFF, connect = net.connect } = {}) {
    Object.assign(this, { host, port, timeoutMs, addr, _connect: connect });
    this.sock = null; this.parser = new FrameParser(); this.pending = null; this.queue = Promise.resolve();
  }
  open() {
    return new Promise((resolve, reject) => {
      const s = this._connect({ host: this.host, port: this.port });
      const fail = (e) => { s.destroy(); reject(e); };
      s.setNoDelay?.(true);
      s.once('error', fail);
      s.once('connect', () => {
        s.off('error', fail); this.sock = s; this.parser = new FrameParser();
        s.on('data', (d) => this._onData(d));
        s.on('error', (e) => this._drop(e));
        s.on('close', () => this._drop(new Error('Conexión cerrada')));
        resolve();
      });
    });
  }
  close() { this.sock?.destroy(); this.sock = null; }
  get connected() { return !!this.sock && !this.sock.destroyed; }
  _drop(err) { this.sock = null; if (this.pending) { const p = this.pending; this.pending = null; clearTimeout(p.timer); p.reject(err); } }
  _onData(d) {
    for (const f of this.parser.push(d)) {
      if (!this.pending) continue;                            // respuesta sin pregunta: se ignora
      const p = this.pending; this.pending = null; clearTimeout(p.timer);
      if (f.error) p.reject(new Error(f.error)); else p.resolve(f);
    }
  }
  // Manda un comando y espera su respuesta. Los comandos se encolan para que nunca haya dos a la vez.
  request(cmd, params = []) {
    const run = () => new Promise((resolve, reject) => {
      if (!this.connected) return reject(new Error('Lector sin conexión'));
      const timer = setTimeout(() => { this.pending = null; reject(new Error('Tiempo agotado esperando al lector')); }, this.timeoutMs);
      this.pending = { resolve, reject, timer };
      this.sock.write(buildCommand(cmd, params, this.addr));
    });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  async ok(cmd, params) {
    const r = await this.request(cmd, params);
    if (r.status !== 0) { const e = new Error(`El lector respondió ${STATUS[r.status] ?? r.status}`); e.status = r.status; throw e; }
    return r;
  }
  async version() { const r = await this.ok(CMD.VERSION); return `${r.data[0]}.${r.data[1]}`; }
  async getIp() { const d = (await this.ok(CMD.GET_IP)).data; return { ip: [...d.subarray(0, 4)].join('.'), mask: [...d.subarray(4, 8)].join('.'), gateway: [...d.subarray(8, 12)].join('.'), port: portOf(d[12], d[13]) }; }
  async getPower() { return (await this.ok(CMD.GET_POWER)).data[0]; }
  async setPower(dbm) { await this.ok(CMD.SET_POWER, [dbm, 0, 0, 0]); }
  // Un ciclo de lectura: inventario, saca las etiquetas del buffer y lo vacía. Devuelve [{ant, epc}] (puede traer repetidos).
  async poll() {
    const inv = await this.request(CMD.INVENTORY);
    if (inv.status === 0x04) return [];                       // ERR_NO_TAG: no hay etiquetas
    if (inv.status !== 0) throw new Error(`Inventario: ${STATUS[inv.status] ?? inv.status}`);
    const count = inv.data.length >= 2 ? inv.data.readUInt16BE(0) : 0;
    const tags = [];
    for (let left = count; left > 0; left -= 16) {
      const r = await this.ok(CMD.GET_TAGS, [Math.min(left, 16)]);
      const got = parseTagData(r.data); tags.push(...got);
      if (!got.length) break;
    }
    if (count) await this.request(CMD.CLEAR).catch(() => {});
    return tags;
  }
}
