import { state } from '../state/store.js';

export const numFormatter = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const numFormatter5 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 5, maximumFractionDigits: 5 });

// Redondeo exacto a 2 decimales para cantidades de catálogo general, costos y totales
export const round2 = (val) => {
  const n = Number(val) || 0;
  return Math.round((n + (n >= 0 ? 1e-12 : -1e-12)) * 100) / 100;
};

// Redondeo exacto a 5 decimales exclusivamente para cantidades de las matrices APU
export const round5 = (val) => {
  const n = Number(val) || 0;
  return Math.round((n + (n >= 0 ? 1e-12 : -1e-12)) * 100000) / 100000;
};

export const getCurrencySymbol = () => {
  return (state && state.settings && state.settings.currencySymbol) || '$';
};

export const getCurrencyCode = () => {
  return (state && state.settings && state.settings.currency) || 'MXN';
};

export const formatCurrency = (val, customSymbol = null) => {
  const symbol = customSymbol !== null ? customSymbol : getCurrencySymbol();
  const num = round2(val);
  return symbol + numFormatter.format(num);
};

export const formatNumber = (val, decimals = 2) => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(num);
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

// Formato con exactamente 5 decimales para cantidades de matrices APU (ej. 0.00500, 0.00021)
export const formatMatrixQty = (val) => {
  const num = round5(val);
  return numFormatter5.format(num);
};

export const formatMatrixQtyInput = (val) => {
  const num = round5(val);
  return num.toFixed(5);
};

// Conversión inteligente de números (soporta números nativos, strings con coma decimal europea/latina y separadores de miles)
export const parseFlexibleNumber = (val, defaultVal = 0) => {
  if (val === null || val === undefined || val === '') return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;

  let s = String(val).trim().replace(/[$€£\s]/g, '');
  if (!s) return defaultVal;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }

  s = s.replace(/[^0-9.-]/g, '');
  const num = parseFloat(s);
  return isNaN(num) ? defaultVal : num;
};

// Clases CSS de color para filas de insumos en matrices APU según su rubro/tipo
export const getInsumoRowColorClass = (tipo) => {
  switch (tipo) {
    case 'Material':
      return 'bg-blue-50/40 hover:bg-blue-100/60 border-l-[3px] border-l-blue-500';
    case 'Mano de Obra':
      return 'bg-amber-50/40 hover:bg-amber-100/60 border-l-[3px] border-l-amber-500';
    case 'Herramienta':
      return 'bg-orange-50/40 hover:bg-orange-100/60 border-l-[3px] border-l-orange-500';
    case 'Equipo':
      return 'bg-purple-50/40 hover:bg-purple-100/60 border-l-[3px] border-l-purple-500';
    case 'Maquinaria':
      return 'bg-rose-50/40 hover:bg-rose-100/60 border-l-[3px] border-l-rose-500';
    case 'Subcontrato':
      return 'bg-emerald-50/40 hover:bg-emerald-100/60 border-l-[3px] border-l-emerald-500';
    default:
      return 'bg-white hover:bg-slate-50 border-l-[3px] border-l-slate-300';
  }
};
