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
