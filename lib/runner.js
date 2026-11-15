// Ciclo principal del puente. El latido y el vaciado de la cola van en sus propios temporizadores, así que siguen saliendo aunque el lector esté caído
// o reconectando: el servidor recibe «lector sin conexión» y no un silencio que se confunde con apagón o falta de internet.
export class Runner {
  constructor({ reader, dedupe, sender, log = () => {}, intervalMs = 150, heartbeatMs = 60000, flushMs = 2000, backoffMs = 1000, maxBackoffMs = 15000,
    power = null, version = '0.1.0', now = Date.now } = {}) {
    Object.assign(this, { reader, dedupe, sender, log, intervalMs, heartbeatMs, flushMs, backoffMs, maxBackoffMs, power, version, now });
    this.running = false; this.timers = []; this.wake = null;
    this.s = { startedAt: now(), connected: false, firmware: null, powerDbm: null, lastPollOkAt: null, lastError: null, lastErrorAt: null, reconnects: 0, raw: 0, notified: 0 };
  }
  status() {
    const t = this.now(), s = this.s;
    return {
      bridge: { version: this.version, startedAt: new Date(s.startedAt).toISOString(), uptimeSec: Math.round((t - s.startedAt) / 1000) },
      reader: { host: this.reader.host, connected: s.connected, firmware: s.firmware, powerDbm: s.powerDbm, reconnects: s.reconnects,
        lastPollOkAt: s.lastPollOkAt ? new Date(s.lastPollOkAt).toISOString() : null, lastPollAgeSec: s.lastPollOkAt ? Math.round((t - s.lastPollOkAt) / 1000) : null,
        lastError: s.lastError, lastErrorAt: s.lastErrorAt ? new Date(s.lastErrorAt).toISOString() : null },
      reads: { raw: s.raw, notified: s.notified, queued: this.sender.queue.length, dropped: this.sender.dropped, sent: this.sender.sent },
    };
  }
  _fail(msg) { this.s.connected = false; this.s.lastError = msg; this.s.lastErrorAt = this.now(); this.log('lector:', msg); }
  // Espera que se puede interrumpir con stop().
  _wait(ms) { return new Promise((resolve) => { const t = setTimeout(resolve, ms); this.wake = () => { clearTimeout(t); resolve(); }; }); }
  async _connect() {
    this.reader.close();
    await this.reader.open();
    this.s.firmware = await this.reader.version();
    if (this.power != null) await this.reader.setPower(+this.power);
    this.s.powerDbm = await this.reader.getPower();
    this.s.connected = true; this.s.lastError = null;
    this.log('lector conectado', this.reader.host, 'firmware', this.s.firmware, 'potencia', this.s.powerDbm, 'dBm');
  }
  async run() {
    this.running = true;
    const beat = () => this.sender.heartbeat(this.status());
    this.timers.push(setInterval(beat, this.heartbeatMs), setInterval(() => this.sender.flush(), this.flushMs));
    beat();
    let wait = this.backoffMs, first = true;
    while (this.running) {
      if (!this.reader.connected || !this.s.connected) {
        try { await this._connect(); if (!first) this.s.reconnects++; first = false; wait = this.backoffMs; }
        catch (e) { this._fail(e.message); this.reader.close(); await this._wait(wait); wait = Math.min(this.maxBackoffMs, wait * 2); continue; }
      }
      try {
        const tags = await this.reader.poll();
        this.s.lastPollOkAt = this.now();
        for (const t of tags) {
          this.s.raw++;
          if (this.dedupe.see(t.epc)) { this.s.notified++; this.log('lectura nueva', t.epc); this.sender.add({ tag: t.epc, at: new Date().toISOString(), ant: t.ant }); }
        }
        if (tags.length) this.sender.flush();
      } catch (e) { this._fail(e.message); this.reader.close(); continue; }
      await this._wait(this.intervalMs);
    }
    for (const t of this.timers) clearInterval(t);
    this.reader.close();
  }
  stop() { this.running = false; this.wake?.(); }
}
