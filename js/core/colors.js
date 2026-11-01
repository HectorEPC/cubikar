// Cache de colores jerárquicos para evitar cálculos repetitivos
export const hierarchyColorCache = new Map();

// Función de cálculo de color jerárquico progresivo (se va aclarando con cada nivel de sub-fila)
export function getHierarchyColor(hexColor, depthOffset) {
  if (!hexColor) return null;
  const cacheKey = `${hexColor}_${depthOffset}`;
  if (hierarchyColorCache.has(cacheKey)) return hierarchyColorCache.get(cacheKey);

  let c = hexColor.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return null;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

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
