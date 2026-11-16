/**
 * El dinero se guarda como entero en la unidad mínima de la moneda.
 * PYG no tiene decimales: 350000 = Gs. 350.000.
 */
export const CURRENCY_DECIMALS: Record<string, number> = { PYG: 0, USD: 2, BRL: 2, ARS: 2 };

export function formatMoney(amount: number | bigint, currency = 'PYG'): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const value = Number(amount) / 10 ** decimals;
  if (currency === 'PYG') {
    return 'Gs. ' + new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(value);
  }
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency, minimumFractionDigits: decimals }).format(value);
}
