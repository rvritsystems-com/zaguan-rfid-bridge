// Tramas del protocolo UHF (V1.2) del lector: comando 0x0A, respuesta 0x0B.
//   Comando:   0A | addr | len | cmd | parámetros… | cc
//   Respuesta: 0B | addr | len | status | datos… | cc
// `len` cuenta todo lo que va después de él, incluida la suma final. La suma (cc) es el complemento a dos de la suma de todos los bytes anteriores.
export const HEAD_CMD = 0x0A, HEAD_RES = 0x0B, ADDR_PUBLIC = 0xFF;

export const CMD = { RESET: 0x21, VERSION: 0x22, SET_POWER: 0x25, GET_POWER: 0x26, GET_IP: 0x2B, SET_IP: 0x2C,
  INVENTORY: 0x80, GET_TAGS: 0x41, COUNT: 0x43, CLEAR: 0x44 };

export const STATUS = { 0x00: 'OK', 0x01: 'ERR_GENERAL', 0x02: 'ERR_PAR_SET_FAILED', 0x03: 'ERR_PAR_GET_FAILED', 0x04: 'ERR_NO_TAG',
  0x05: 'ERR_READ_FAILED', 0x06: 'ERR_WRITE_FAILED', 0x07: 'ERR_LOCK_FAILED', 0x08: 'ERR_ERASE_FAILED', 0xFE: 'ERR_CMD_ERR', 0xFF: 'ERR_UNDEFINED' };

export const checksum = (bytes) => { let s = 0; for (const b of bytes) s = (s + b) & 0xFF; return (~s + 1) & 0xFF; };

export const buildCommand = (cmd, params = [], addr = ADDR_PUBLIC) => {
  const body = [HEAD_CMD, addr, params.length + 2, cmd, ...params];
  return Buffer.from([...body, checksum(body)]);
};

// Acumula bytes del socket y entrega respuestas completas y válidas. Si hay basura antes de la cabecera la descarta.
export class FrameParser {
  constructor() { this.buf = Buffer.alloc(0); }
  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out = [];
    for (;;) {
      const i = this.buf.indexOf(HEAD_RES);
      if (i < 0) { this.buf = Buffer.alloc(0); break; }
      if (i > 0) this.buf = this.buf.subarray(i);
      if (this.buf.length < 3) break;
      const total = 3 + this.buf[2];
      if (this.buf[2] < 2) { this.buf = this.buf.subarray(1); continue; }   // longitud imposible: no era una cabecera
      if (this.buf.length < total) break;
      const frame = this.buf.subarray(0, total);
      this.buf = this.buf.subarray(total);
      if (checksum(frame.subarray(0, total - 1)) !== frame[total - 1]) { out.push({ error: 'BAD_CHECKSUM', raw: Buffer.from(frame) }); continue; }
      out.push({ addr: frame[1], status: frame[3], statusName: STATUS[frame[3]] ?? 'UNKNOWN', data: Buffer.from(frame.subarray(4, total - 1)), raw: Buffer.from(frame) });
    }
    return out;
  }
}

// Datos de "Get Tag Data": [count] y luego `count` unidades [len][ant][EPC… (len-1 bytes)]. Devuelve [{ant, epc}] con el EPC en hexadecimal mayúsculas.
export const parseTagData = (data) => {
  if (!data.length) return [];
  const count = data[0], tags = [];
  let p = 1;
  for (let n = 0; n < count && p < data.length; n++) {
    const len = data[p];
    if (len < 2 || p + 1 + len > data.length) break;           // unidad incompleta o corrupta
    tags.push({ ant: data[p + 1], epc: data.subarray(p + 2, p + 1 + len).toString('hex').toUpperCase() });
    p += 1 + len;
  }
  return tags;
};

export const hex = (buf) => [...buf].map((b) => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
