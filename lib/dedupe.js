// Filtro de repetidos del puente: una etiqueta se avisa una vez y no se vuelve a avisar hasta que pasa `windowMs` desde la última vez que se VIO
// (mientras siga frente al lector la ventana se renueva, así un auto parado no genera lecturas nuevas). Con `minHits` > 1 pide varias lecturas seguidas
// dentro de `confirmMs` antes de avisar, para descartar lecturas sueltas de autos que pasan por el carril de al lado.
export class Dedupe {
  constructor({ windowMs = 30000, minHits = 1, confirmMs = 2000, now = Date.now, max = 5000 } = {}) {
    Object.assign(this, { windowMs, minHits, confirmMs, now, max });
    this.last = new Map();        // epc → última vez vista
    this.pend = new Map();        // epc → {n, first} esperando confirmación
  }
  // Devuelve true si esta lectura debe avisarse.
  see(epc) {
    const t = this.now(), prev = this.last.get(epc);
    if (prev !== undefined && t - prev < this.windowMs) { this.last.set(epc, t); return false; }
    if (this.minHits > 1) {
      let p = this.pend.get(epc);
      if (!p || t - p.first > this.confirmMs) p = { n: 0, first: t };
      p.n++; this.pend.set(epc, p);
      if (p.n < this.minHits) return false;
      this.pend.delete(epc);
    }
    this.last.set(epc, t);
    if (this.last.size > this.max) this.prune();
    return true;
  }
  prune() { const t = this.now(); for (const [k, v] of this.last) if (t - v >= this.windowMs) this.last.delete(k); for (const [k, v] of this.pend) if (t - v.first > this.confirmMs) this.pend.delete(k); }
}
