const dateFmt = new Intl.DateTimeFormat('es-PY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Asuncion' });
const dateTimeFmt = new Intl.DateTimeFormat('es-PY', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Asuncion',
});
export const fmtDate = (v: string | Date | null | undefined) => (v ? dateFmt.format(new Date(v)) : '—');
export const fmtDateTime = (v: string | Date | null | undefined) => (v ? dateTimeFmt.format(new Date(v)) : '—');
export const daysUntil = (v: string | Date) => Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000);

export { formatMoney as fmtMoney } from '@adiestra/shared';

const timeFmt = new Intl.DateTimeFormat('es-PY', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Asuncion' });
export const fmtTime = (v: string | Date) => timeFmt.format(new Date(v));
const dayFmt = new Intl.DateTimeFormat('es-PY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Asuncion' });
export const fmtDay = (v: string | Date) => {
  const s = dayFmt.format(new Date(v));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
/** Fecha AAAA-MM-DD (sin hora) mostrada sin correrse por zona horaria. */
export const fmtIsoDate = (v: string | null | undefined) => (v ? fmtDate(new Date(v + 'T12:00:00-03:00')) : '—');
/** Hoy en Asunción como AAAA-MM-DD. */
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());

/** Edad a partir de la fecha de nacimiento: "2 años y 4 meses", "5 meses". */
export function age(birth: string | null | undefined) {
  if (!birth) return null;
  const b = new Date(birth + 'T12:00:00-03:00');
  const n = new Date();
  let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n.getDate() < b.getDate()) months--;
  if (months < 0) return null;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} ${m === 1 ? 'mes' : 'meses'}`;
  return `${y} ${y === 1 ? 'año' : 'años'}${m ? ` y ${m} ${m === 1 ? 'mes' : 'meses'}` : ''}`;
}

/** Fecha y hora local (Asunción) para inputs datetime-local → ISO con -03:00. */
export const localInputToIso = (v: string) => new Date(v + ':00-03:00').toISOString();
export function isoToLocalInput(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** Enlace de WhatsApp: números locales 09xx → +595 9xx. */
export function waLink(n: string) {
  const d = n.replace(/\D/g, '');
  return `https://wa.me/${d.startsWith('0') ? '595' + d.slice(1) : d}`;
}
