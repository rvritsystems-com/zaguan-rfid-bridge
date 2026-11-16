// Marca de tiempo del log en la hora local del equipo (la zona horaria de la Raspberry), con su desfase:
// 2026-11-16 14:28:05.123 -06:00. Solo es para leer el log; lo que se manda al servidor sigue en UTC (ISO).
const p = (n, w = 2) => String(n).padStart(w, '0');
export const stamp = (d = new Date()) => {
  const off = -d.getTimezoneOffset(), sign = off < 0 ? '-' : '+', a = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)} ${sign}${p(Math.floor(a / 60))}:${p(a % 60)}`;
};
