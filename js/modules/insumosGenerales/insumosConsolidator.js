// js/modules/insumosGenerales/insumosConsolidator.js
// Consolidación de insumos de todas las matrices del presupuesto activo

import { state } from '../../state/store.js';
import { round2, round5 } from '../../core/formatters.js';
import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';
import { getExactOpusInsumosForClave } from '../io/casaLauraData.js';

// Normalizar texto para agrupar insumos idénticos con precisión
export function normalizeInsumoText(text) {
  if (!text) return '';
  return text.toString()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[.,;:\-_/()"'*]/g, ' ')               // Quitar signos de puntuación
    .replace(/\s+/g, ' ')                           // Colapsar espacios múltiples
    .trim();
}

// Helper para mapear rubros a las 4 tablas de consolidación general (Agrupando Herramienta y Maquinaria en Equipo/Maquinaria/Herramienta)
export function normalizeConsolidatedTipo(t) {
  if (t === 'Herramienta' || t === 'Maquinaria') return 'Equipo';
  return ['Material', 'Mano de Obra', 'Equipo', 'Subcontrato'].includes(t) ? t : 'Material';
}

// Generar una clave de agrupación robusta para un insumo
export function getInsumoConsolidationKey(ins) {
  const tipo = normalizeConsolidatedTipo(ins.tipo);
  const cleanDesc = normalizeInsumoText(ins.descripcion || '');
  const cleanUnid = normalizeInsumoText(ins.unidad || 'pza');
  
  // Clave del catálogo: si es un código formal de catálogo de referencia (ej. G300206-1000, 310300-3150, EFc0237, etc.)
  const clave = (ins.clave || '').trim();
  const isGeneric = !clave || /^(mat|mo|eq|sub|ins|herr|maq)[-_]?\d+$/i.test(clave);

  // Si tiene clave oficial de catálogo y unidad congruente
  if (!isGeneric) {
    return `${tipo}_cve_${clave.toLowerCase()}_${cleanUnid}`;
  }

  // De lo contrario, agrupar por tipo + descripción normalizada + unidad
  return `${tipo}_desc_${cleanDesc}_${cleanUnid}`;
}

// Consolidación general de insumos ÚNICAMENTE de los conceptos seleccionados en la columna checkbox de TAB1-CAT-BASE
export function getConsolidatedDataMap() {
  const consolidated = {
    'Material': {},
    'Mano de Obra': {},
    'Equipo': {},
    'Subcontrato': {}
  };

  let selectedConceptsCount = 0;

  function collectInsumos(nodes) {
    nodes.forEach(node => {
      const isParent = Boolean(node.children && node.children.length > 0);
      if (!isParent) {
        // FILTRADO ESTRICTO: Solo incluir conceptos que estén explícitamente marcados con el checkbox en TAB1-CAT-BASE
        if (Boolean(node.selected)) {
          selectedConceptsCount++;
          const rawCant = round2(node.cantidad);
          const cantConcepto = (!isNaN(rawCant) && rawCant > 0) ? rawCant : 1.00;

          // Si el concepto tiene costo pero aún no tiene matriz asignada, generar su matriz integrada
          if (!node.insumos || node.insumos.length === 0) {
            if (parseFloat(node.precioUnitario) > 0 || parseFloat(node.costoDirecto) > 0) {
              const opusInsumos = getExactOpusInsumosForClave(node.clave);
              if (opusInsumos && opusInsumos.length > 0) {
                node.insumos = JSON.parse(JSON.stringify(opusInsumos));
                node.insumos.forEach(ins => {
                  ins.cantidad = round5(ins.cantidad);
                  ins.costoUnitario = round2(ins.costoUnitario);
                });
              } else {
                node.insumos = generateIntegratedMatrixForConcept(node);
              }
            }
          }

          if (node.insumos && node.insumos.length > 0) {
            node.insumos.forEach(ins => {
              const tipo = normalizeConsolidatedTipo(ins.tipo);
              const key = getInsumoConsolidationKey(ins);
              if (!key) return;

              const costoUnit = round2(ins.costoUnitario || 0);

              if (!consolidated[tipo][key]) {
                consolidated[tipo][key] = {
                  key: key,
                  clave: ins.clave || `${tipo.substring(0, 3).toUpperCase()}-01`,
                  insumoName: ins.descripcion || '',
                  descripcion: ins.descripcion || 'Sin descripción',
                  unidad: ins.unidad || 'pza',
                  cantidadTotal: 0,
                  sumCantUnitaria: 0,
                  costoUnitario: costoUnit,
                  totalImporte: 0,
                  sources: []
                };
              }

              // Cantidad unitaria en la matriz (para 1 unidad de concepto)
              const cantUnitaria = round5(ins.cantidad || 0);
              // Cantidad total en obra = (volumen del concepto en obra) * (consumo unitario de la matriz)
              const cantTotalEnConcepto = round2(cantUnitaria * cantConcepto);
              const importeEnConcepto = round2(cantTotalEnConcepto * costoUnit);

              consolidated[tipo][key].cantidadTotal = round2(consolidated[tipo][key].cantidadTotal + cantTotalEnConcepto);
              consolidated[tipo][key].sumCantUnitaria = round5(consolidated[tipo][key].sumCantUnitaria + cantUnitaria);
              consolidated[tipo][key].totalImporte = round2(consolidated[tipo][key].totalImporte + importeEnConcepto);

              consolidated[tipo][key].sources.push({
                node,
                nodeClave: node.clave || '',
                nodeDesc: node.descripcion || '',
                nodeUnidad: node.unidad || 'pza',
                cantConcepto: cantConcepto,
                cantUnitaria: cantUnitaria,
                cantTotal: cantTotalEnConcepto,
                insumo: ins
              });
            });
          }
        }
      } else {
        collectInsumos(node.children);
      }
    });
  }

  collectInsumos(state.treeData);
  consolidated._selectedConceptsCount = selectedConceptsCount;
  return consolidated;
}
