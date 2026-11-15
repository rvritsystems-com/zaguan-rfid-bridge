// Envía las lecturas a Zaguán. Si no hay internet las guarda en memoria (hasta `maxQueue`) y reintenta con espera creciente; las lecturas más viejas
// se descartan primero. Cada lectura lleva su hora (`at`) para que el servidor las ordene y las desduplique aunque lleguen tarde.
const LABELS = { queued: 'en cola', already_queued: 'ya estaba en la cola', duplicate: 'repetida (misma familia hace menos de 15 min)', unknown: 'etiqueta sin asignar',
  outside_window: 'fuera del horario de recogida', no_students_here: 'sin hijos que se recojan en este punto', stale: 'llegó tarde, se ignoró', no_cycle: 'sin ciclo activo' };

export class Sender {
  constructor({ url, token, point, maxQueue = 500, batch = 20, fetchFn = globalThis.fetch, log = () => {}, dryRun = false, timeoutMs = 8000 } = {}) {
    Object.assign(this, { url, token, point, maxQueue, batch, fetchFn, log, dryRun, timeoutMs });
    this.queue = []; this.failures = 0; this.nextTry = 0; this.sent = 0; this.dropped = 0; this.busy = false;
  }
  add(read) { this.queue.push(read); while (this.queue.length > this.maxQueue) { this.queue.shift(); this.dropped++; } }
  // Intenta vaciar la cola. `now` es solo para pruebas.
  async flush(now = Date.now()) {
    if (this.busy || !this.queue.length || now < this.nextTry) return 0;
    this.busy = true;
    try {
      let total = 0;
      while (this.queue.length) {
        const chunk = this.queue.slice(0, this.batch);
        const data = await this.post({ reads: chunk });
        this.report(chunk, data);
        this.queue.splice(0, chunk.length); total += chunk.length; this.sent += chunk.length;
      }
      this.failures = 0; return total;
    } catch (e) {
      this.failures++; this.nextTry = now + Math.min(60000, 1000 * 2 ** Math.min(this.failures, 6));
      this.log('envío falló', e.message, `reintento en ${Math.round((this.nextTry - now) / 1000)} s`); return 0;
    } finally { this.busy = false; }
  }
  // Aviso de que el lector sigue vivo (sin lecturas).
  async heartbeat(extra = {}) { try { await this.post({ reads: [], heartbeat: { at: new Date().toISOString(), ...extra } }); return true; } catch (e) { this.log('latido falló', e.message); return false; } }
  // Muestra qué hizo el servidor con cada lectura (en el mismo orden; las inválidas no tienen resultado).
  report(chunk, data) {
    const results = Array.isArray(data?.results) ? data.results : [];
    for (const r of results) {
      const who = r.students?.length ? ` (${r.students.join(', ')})` : '';
      this.log(`  ${r.tag} → ${LABELS[r.status] || r.status}${who}`);
    }
    if (data?.invalid) this.log(`  ${data.invalid} lectura(s) con EPC no válido`);
  }
  async post(payload) {
    const body = JSON.stringify({ ...(this.point ? { point: this.point } : {}), ...payload });
    if (this.dryRun) { this.log('[dry-run]', body); return; }
    const res = await this.fetchFn(this.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` }, body, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return typeof res.json === "function" ? await res.json().catch(() => null) : null;
  }
}
