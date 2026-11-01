import { state } from '../state/store.js';

export const numFormatter = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Redondeo exacto a 2 decimales para cantidades, costos y totales
export const round2 = (val) => {
  return Math.round(((Number(val) || 0) + Number.EPSILON) * 100) / 100;
};

export const getCurrencySymbol = () => {
  return (state && state.settings && state.settings.currencySymbol) || '$';
};

export const getCurrencyCode = () => {
  return (state && state.settings && state.settings.currency) || 'MXN';
};

export const formatMoney = (val) => {
  const symbol = getCurrencySymbol();
  const showCode = state && state.settings && state.settings.showCurrencyCode;
  const code = (showCode && state.settings.currency) ? ` ${state.settings.currency}` : '';
  const num = round2(val);
  return `${symbol}${numFormatter.format(num)}${code}`;
};

export const formatQty = (val) => {
  const num = round2(val);
  return numFormatter.format(num);
};
