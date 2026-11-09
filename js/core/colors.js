import { isNightMode } from '../ui/themeController.js';

// Cache de colores jerárquicos para evitar cálculos repetitivos
export const hierarchyColorCache = new Map();

// Función de cálculo de color jerárquico progresivo (se va aclarando en Vista de Día y suavizando en Modo Nocturno)
export function getHierarchyColor(hexColor, depthOffset, options = {}) {
  if (!hexColor) return null;
  const night = options.forceLight ? false : isNightMode();
  const cacheKey = `${night ? 'night' : 'day'}_${hexColor}_${depthOffset}`;
  if (hierarchyColorCache.has(cacheKey)) return hierarchyColorCache.get(cacheKey);

  let c = hexColor.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return null;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  if (night) {
    // Mezcla progresiva sobre base nocturna oscura (#0f172a -> rgb(15, 23, 42))
    const nightColorWeights = [0.28, 0.19, 0.12, 0.07];
    const weight = depthOffset < nightColorWeights.length ? nightColorWeights[depthOffset] : 0.05;
    const baseR = 15;
    const baseG = 23;
    const baseB = 42;

    const rDark = Math.round(baseR + (r - baseR) * weight);
    const gDark = Math.round(baseG + (g - baseG) * weight);
    const bDark = Math.round(baseB + (b - baseB) * weight);

    const resDark = `rgb(${rDark}, ${gDark}, ${bDark})`;
    hierarchyColorCache.set(cacheKey, resDark);
    return resDark;
  }

  // Factores de mezcla con blanco según la jerarquía (se va aclarando progresivamente)
  // Nivel 0 (concepto con color propio): 28% color + 72% blanco
  // Nivel 1 (sub-fila directa): 18% color + 82% blanco
  // Nivel 2 (sub-sub-fila): 10% color + 90% blanco
  // Nivel 3+: 5% color + 95% blanco
  const factors = [0.72, 0.82, 0.90, 0.95];
  const factor = depthOffset < factors.length ? factors[depthOffset] : 0.96;

  const rTint = Math.round(r + (255 - r) * factor);
  const gTint = Math.round(g + (255 - g) * factor);
  const bTint = Math.round(b + (255 - b) * factor);

  const res = `rgb(${rTint}, ${gTint}, ${bTint})`;
  hierarchyColorCache.set(cacheKey, res);
  return res;
}
