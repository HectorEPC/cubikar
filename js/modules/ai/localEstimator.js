// js/modules/ai/localEstimator.js
// Generador y estimador de matrices APU usando Catálogos Locales Importados (BIMSA, Gobierno, etc.)

import { state } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { formatMoney } from '../../core/formatters.js';
import { findNodeById } from '../catalog/treeService.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { renderAPUInsumos, renderInsumosUnitarios, toggleApuSection } from '../apu/apuView.js';
import { closeAiGeneratorModal } from '../../ui/modalController.js';
import { searchReferenceItems, getReferenceDatabaseStats, listReferenceCatalogs } from '../reference/referenceDb.js';
import { installPresetCatalog } from '../reference/presetCatalogs.js';

// Palabras vacías en español para limpiar términos de búsqueda
const STOP_WORDS = new Set([
  'de', 'la', 'el', 'en', 'para', 'con', 'y', 'a', 'los', 'las', 'por', 'un', 'una', 'del', 'al', 
  'se', 'su', 'sus', 'incluye', 'suministro', 'colocacion', 'colocación', 'elaboracion', 'elaboración', 
  'fabricacion', 'fabricación', 'instalacion', 'instalación', 'mano', 'obra', 'equipo', 'herramienta', 
  'material', 'materiales', 'todo', 'toda', 'todos', 'todas', 'cada', 'unos', 'unas', 'donde', 'cual', 
  'entre', 'hacia', 'hasta', 'desde', 'sobre', 'este', 'esta', 'estos', 'estas', 'acabado', 'correcto', 
  'correcta', 'ejecucion', 'ejecución', 'medidas', 'tipo', 'marca', 'modelo', 'segun', 'según'
]);

// Analizar la descripción del concepto para determinar su categoría técnica y términos de búsqueda
function analyzeConcept(desc) {
  const d = (desc || '').toLowerCase();
  
  // Extraer palabras clave útiles
  const rawWords = d.replace(/[^a-záéíóúüñ0-9/.-]/g, ' ').split(/\s+/);
  const keywords = rawWords.filter(w => w.length > 2 && !STOP_WORDS.has(w));

  // Detección de especialidades y patrones comunes en obra
  if (d.includes('concreto') || d.includes('firme') || d.includes('losa') || d.includes('banqueta') || 
      d.includes('pavimento') || d.includes('zapata') || d.includes('guarnicion') || d.includes('guarnición') || 
      d.includes('columna') || d.includes('trabe') || d.includes('dintel') || d.includes('cadena') || d.includes('castillo')) {
    return {
      specialty: 'Concreto y Cimentación',
      keywords,
      matQueries: ['concreto', 'cemento', 'malla', 'arena', 'grava', 'adhesivo', 'curador'],
      moQueries: ['albañil', 'colado', 'peon', 'oficial'],
      eqQueries: ['vibrador', 'revolvedora', 'herramienta', 'regla'],
      unitRatio: d.includes('m3') ? 1.05 : (d.includes('firme') || d.includes('piso') || d.includes('pavimento') || d.includes('banqueta') ? 0.105 : 1.0)
    };
  }

  if (d.includes('muro') || d.includes('tabique') || d.includes('block') || d.includes('mampostería') || 
      d.includes('mamposteria') || d.includes('celosia') || d.includes('celosía') || d.includes('albanileria') || d.includes('albañilería')) {
    return {
      specialty: 'Albañilería y Muros',
      keywords,
      matQueries: ['block', 'tabique', 'mortero', 'cemento', 'arena', 'cal'],
      moQueries: ['albañil', 'oficial', 'peon'],
      eqQueries: ['andamio', 'herramienta', 'revolvedora'],
      unitRatio: 1.0
    };
  }

  if (d.includes('acero') || d.includes('varilla') || d.includes('estribo') || d.includes('armado') || 
      d.includes('alambron') || d.includes('alambrón') || d.includes('malla electrosoldada')) {
    return {
      specialty: 'Acero de Refuerzo',
      keywords,
      matQueries: ['varilla', 'alambre', 'acero', 'alambron'],
      moQueries: ['fierrero', 'oficial', 'peon'],
      eqQueries: ['cortadora', 'dobladora', 'herramienta'],
      unitRatio: 1.05
    };
  }

  if (d.includes('cable') || d.includes('electr') || d.includes('eléctr') || d.includes('alumbr') || 
      d.includes('conduit') || d.includes('lampara') || d.includes('lámpara') || d.includes('luminaria') || 
      d.includes('contacto') || d.includes('apagador') || d.includes('tablero') || d.includes('murete') || 
      d.includes('transformador') || d.includes('acometida')) {
    return {
      specialty: 'Instalaciones Eléctricas',
      keywords,
      matQueries: ['cable', 'conduit', 'luminaria', 'lampara', 'caja', 'tubo', 'interruptor', 'murete'],
      moQueries: ['electricista', 'oficial', 'ayudante'],
      eqQueries: ['guia', 'multimetro', 'herramienta'],
      unitRatio: 1.0
    };
  }

  if (d.includes('tuberia') || d.includes('tubería') || d.includes('hidraul') || d.includes('hidrául') || 
      d.includes('sanit') || d.includes('pvc') || d.includes('cpvc') || d.includes('cobre') || 
      d.includes('tuboplus') || d.includes('valvula') || d.includes('válvula') || d.includes('drenaje') || 
      d.includes('agua potable') || d.includes('tinaco') || d.includes('bomba')) {
    return {
      specialty: 'Instalaciones Hidráulicas y Sanitarias',
      keywords,
      matQueries: ['tubo', 'pvc', 'cobre', 'cpvc', 'valvula', 'codo', 'pegamento', 'bomba'],
      moQueries: ['plomero', 'tubero', 'oficial', 'ayudante'],
      eqQueries: ['termofusora', 'herramienta', 'soplete'],
      unitRatio: 1.0
    };
  }

  if (d.includes('pintura') || d.includes('vinil') || d.includes('esmalte') || d.includes('impermeabiliz') || 
      d.includes('sellador') || d.includes('acabado') || d.includes('pasta') || d.includes('yeso') || d.includes('tirol')) {
    return {
      specialty: 'Pintura y Acabados',
      keywords,
      matQueries: ['pintura', 'sellador', 'impermeabilizante', 'pasta', 'yeso', 'esmalte'],
      moQueries: ['pintor', 'impermeabilizador', 'oficial', 'ayudante'],
      eqQueries: ['escalera', 'andamio', 'brocha', 'herramienta'],
      unitRatio: 1.0
    };
  }

  if (d.includes('excavacion') || d.includes('excavación') || d.includes('relleno') || d.includes('terracer') || 
      d.includes('corte') || d.includes('despalme') || d.includes('acarreo') || d.includes('demolicion') || 
      d.includes('demolición') || d.includes('afine') || d.includes('compactac')) {
    return {
      specialty: 'Terracerías y Movimiento de Tierras',
      keywords,
      matQueries: ['tepetate', 'material', 'banco', 'agua'],
      moQueries: ['peon', 'excavacion', 'cuadrilla', 'oficial'],
      eqQueries: ['retroexcavadora', 'tractor', 'compactador', 'camion', 'pico', 'herramienta'],
      unitRatio: 1.0
    };
  }

  if (d.includes('aire') || d.includes('acondicionado') || d.includes('minisplit') || d.includes('clima') || 
      d.includes('ducto') || d.includes('hvac') || d.includes('refrigeracion') || d.includes('refrigeración')) {
    return {
      specialty: 'Aire Acondicionado y HVAC',
      keywords,
      matQueries: ['minisplit', 'refrigerante', 'ducto', 'aislamiento', 'cobre'],
      moQueries: ['tecnico', 'electricista', 'oficial'],
      eqQueries: ['bomba', 'vacio', 'manometro', 'herramienta'],
      unitRatio: 1.0
    };
  }

  // Genérico / Otros
  return {
    specialty: 'General de Obra',
    keywords,
    matQueries: keywords.slice(0, 3),
    moQueries: ['cuadrilla', 'oficial', 'peon', 'albañil'],
    eqQueries: ['herramienta', 'equipo'],
    unitRatio: 1.0
  };
}

// Calcular la cantidad estrictamente unitaria y congruente para 1 unidad de concepto
function calculateCongruentUnitQuantity(conceptDesc, conceptUnit, itemTipo, itemDesc, itemUnit) {
  const cDesc = (conceptDesc || '').toLowerCase();
  const cUnit = (conceptUnit || 'pza').toLowerCase().trim();
  const iDesc = (itemDesc || '').toLowerCase();
  const iUnit = (itemUnit || 'pza').toLowerCase().trim();

  // 1. MATERIALES (Consumo por 1 unidad de concepto)
  if (itemTipo === 'Material') {
    if (cUnit === 'm2') {
      // Concreto en m2: volumen = 1 m2 * espesor + 5% desperdicio
      if (iDesc.includes('concreto') || iUnit.includes('m3')) {
        let espesorM = 0.10; // 10 cm por defecto
        const espMatch = cDesc.match(/(\d+(?:\.\d+)?)\s*(?:cm|cms|cent[ií]metros)/i);
        if (espMatch) {
          const cm = parseFloat(espMatch[1]);
          if (cm > 0 && cm <= 100) espesorM = cm / 100;
        }
        return Math.round((1.0 * espesorM * 1.05) * 10000) / 10000;
      }
      
      // Malla electrosoldada en m2 (1 m2 + 10% traslapes)
      if (iDesc.includes('malla') || (iUnit.includes('m2') && iDesc.includes('acero'))) {
        return 1.1000;
      }

      // Membrana de curado o sellador
      if (iDesc.includes('curador') || iDesc.includes('curado') || iDesc.includes('membrana') || iDesc.includes('sellador')) {
        return 0.2500;
      }

      // Block o tabique en muros (piezas por m2)
      if (iDesc.includes('block') || iDesc.includes('bloque')) {
        return 13.0000; // 12.5 pzas/m2 + merma
      }
      if (iDesc.includes('tabique') || iDesc.includes('ladrillo')) {
        return 50.0000;
      }

      // Mortero para junteo en muros (m3 por m2)
      if (iDesc.includes('mortero') || (iDesc.includes('cemento') && cDesc.includes('muro'))) {
        return 0.0250;
      }

      // Pintura / esmalte a 2 manos (litros por m2)
      if (iDesc.includes('pintura') || iDesc.includes('esmalte') || iDesc.includes('vinil')) {
        return 0.2500;
      }

      // Impermeabilizante acrílico/asfáltico (litros por m2)
      if (iDesc.includes('impermeabiliz')) {
        return 1.2000;
      }

      // Adhesivo / pegazulejo (kg por m2)
      if (iDesc.includes('adhesivo') || iDesc.includes('pega') || iDesc.includes('piso') || iDesc.includes('porcelan')) {
        return 5.0000;
      }

      if (iUnit === 'm2') return 1.0500;
      if (iUnit === 'lt') return 0.2500;
      if (iUnit === 'kg') return 1.0500;
      return 1.0000;
    }

    if (cUnit === 'm3') {
      if (iDesc.includes('concreto') || iUnit.includes('m3')) return 1.0500;
      if (iDesc.includes('agua')) return 0.1800;
      if (iDesc.includes('tepetate') || iDesc.includes('banco') || iDesc.includes('material')) return 1.2000;
      return 1.0500;
    }

    if (cUnit === 'kg') {
      if (iDesc.includes('varilla') || iDesc.includes('acero')) return 1.0500;
      if (iDesc.includes('alambre')) return 0.0300;
      return 1.0000;
    }

    if (cUnit === 'm' || cUnit === 'ml') {
      if (iDesc.includes('tubo') || iDesc.includes('cable') || iDesc.includes('conduit') || iUnit === 'm' || iUnit === 'ml') {
        return 1.0500;
      }
      if (iDesc.includes('conector') || iDesc.includes('cople') || iDesc.includes('codo')) return 0.2000;
      if (iDesc.includes('pegamento') || iDesc.includes('soldadura')) return 0.0200;
      return 1.0000;
    }

    return 1.0000;
  }

  // 2. MANO DE OBRA (Jornadas requeridas para elaborar exactamente 1 unidad de concepto)
  if (itemTipo === 'Mano de Obra') {
    if (cUnit === 'm2') {
      if (cDesc.includes('firme') || cDesc.includes('piso') || cDesc.includes('pavimento') || cDesc.includes('banqueta')) {
        return 0.0800; // Rendimiento ~12.5 m2/jornada
      }
      if (cDesc.includes('muro') || cDesc.includes('block') || cDesc.includes('tabique')) {
        return 0.1100; // Rendimiento ~9 m2/jornada
      }
      if (cDesc.includes('pintura') || cDesc.includes('esmalte')) {
        return 0.0250; // Rendimiento ~40 m2/jornada
      }
      if (cDesc.includes('aplanado') || cDesc.includes('yeso') || cDesc.includes('pasta')) {
        return 0.0700; // Rendimiento ~14 m2/jornada
      }
      if (cDesc.includes('impermeabiliz')) {
        return 0.0350; // Rendimiento ~28 m2/jornada
      }
      return 0.0800;
    }

    if (cUnit === 'm3') {
      if (cDesc.includes('colado') || cDesc.includes('concreto')) return 0.2800;
      if (cDesc.includes('excavacion') || cDesc.includes('excavación')) return 0.4000;
      if (cDesc.includes('relleno')) return 0.2000;
      return 0.2500;
    }

    if (cUnit === 'kg') {
      return 0.0067; // Habilitado de 150 kg/jornada = 0.0067 jor/kg
    }

    if (cUnit === 'm' || cUnit === 'ml') {
      if (cDesc.includes('tuberia') || cDesc.includes('tubería') || cDesc.includes('plomer')) return 0.0700;
      if (cDesc.includes('cable') || cDesc.includes('electr')) return 0.0500;
      if (cDesc.includes('guarnicion') || cDesc.includes('guarnición')) return 0.1000;
      return 0.0600;
    }

    if (cUnit === 'pza' || cUnit === 'sal') {
      if (cDesc.includes('murete') || cDesc.includes('registro')) return 0.5000;
      if (cDesc.includes('luminaria') || cDesc.includes('contacto') || cDesc.includes('salida')) return 0.1500;
      if (cDesc.includes('lavabo') || cDesc.includes('inodoro') || cDesc.includes('wc')) return 0.3500;
      return 0.2500;
    }

    return 0.1000;
  }

  // 3. EQUIPO / HERRAMIENTA (Horas o porcentaje por 1 unidad de concepto)
  if (itemTipo === 'Equipo') {
    if (iUnit === '%' || iDesc.includes('%') || iDesc.includes('herramienta menor')) {
      return 0.0300; // 3% de Mano de Obra
    }

    if (cUnit === 'm2') {
      if (iDesc.includes('vibrador') || iDesc.includes('regla')) return 0.0500;
      if (iDesc.includes('andamio')) return 0.0800;
      if (iDesc.includes('revolvedora')) return 0.0500;
      return 0.0500;
    }

    if (cUnit === 'm3') {
      if (iDesc.includes('vibrador')) return 0.2500;
      if (iDesc.includes('revolvedora')) return 0.3000;
      if (iDesc.includes('retroexcavadora')) return 0.0800;
      if (iDesc.includes('bailarina') || iDesc.includes('compactador')) return 0.1500;
      return 0.2000;
    }

    if (cUnit === 'kg') {
      if (iDesc.includes('cortadora') || iDesc.includes('dobladora')) return 0.0050;
      return 0.0050;
    }

    if (cUnit === 'm' || cUnit === 'ml') {
      if (iDesc.includes('termofusora') || iDesc.includes('planta') || iDesc.includes('soplete')) return 0.0400;
      return 0.0300;
    }

    return 0.0500;
  }

  // 4. SUBCONTRATO
  if (itemTipo === 'Subcontrato') {
    return 1.0000;
  }

  return 1.0000;
}

// Generación de APU usando la base de datos de catálogos locales importados (IndexedDB)
export async function executeLocalGeneration() {
  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (!node) {
    showToast('Selecciona primero un concepto en la tabla para generar su matriz.', 'warning');
    return;
  }

  if (node.children && node.children.length > 0) {
    showToast('Esta fila contiene sub-conceptos (partida resumen) y no admite matriz de insumos.', 'warning');
    return;
  }

  const btnLocal = document.getElementById('btn-ai-modal-local');
  if (btnLocal) {
    btnLocal.disabled = true;
    btnLocal.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[10px]"></i> Consultando Catálogo...';
  }

  try {
    // 1. Verificar si existen catálogos en IndexedDB
    let stats = await getReferenceDatabaseStats();

    // Si aún no ha importado ningún catálogo, auto-instalamos BIMSA Edificación para una experiencia inmediata
    if (stats.catalogsCount === 0) {
      showToast('Inicializando catálogo local BIMSA Edificación 2018...', 'info');
      const installed = await installPresetCatalog('bimsa_edificacion_2018');
      if (installed) {
        stats = await getReferenceDatabaseStats();
      } else {
        showToast('Abre el "Catálogo Maestro" para gestionar tus catálogos locales.', 'warning');
        return;
      }
    }

    // 2. Analizar el concepto activo
    const analysis = analyzeConcept(node.descripcion);
    let matchedCatalogName = 'Catálogo Local de Referencia';

    // 3. Buscar si existe una Matriz / Concepto directamente en el catálogo importado
    let directConceptMatch = null;
    for (const kw of analysis.keywords.slice(0, 3)) {
      if (kw.length >= 4) {
        const matches = await searchReferenceItems({ tipo: 'Concepto', query: kw, limit: 3 });
        if (matches.length > 0) {
          directConceptMatch = matches[0];
          matchedCatalogName = directConceptMatch.catalogName || matchedCatalogName;
          break;
        }
      }
    }

    // Si encontramos una matriz de concepto completa en el catálogo de referencia, vincularla directamente
    if (directConceptMatch && Array.isArray(directConceptMatch.insumos) && directConceptMatch.insumos.length > 0) {
      saveState();
      toggleApuSection('matriz', true);
      node.insumos = JSON.parse(JSON.stringify(directConceptMatch.insumos));
      node.precioUnitario = directConceptMatch.precioUnitario || node.precioUnitario || 0;
      node.costoDirecto = directConceptMatch.precioUnitario || node.costoDirecto || 0;

      node.googleSearchQueries = [
        `Catálogo Opus/BIMSA: ${matchedCatalogName}`,
        `Matriz: ${directConceptMatch.clave || ''}`
      ];
      node.googleSources = [
        {
          title: `${matchedCatalogName} - Clave ${directConceptMatch.clave} (${directConceptMatch.descripcion.substring(0, 45)}...)`,
          uri: '#'
        }
      ];

      renderAPUInsumos(node);
      renderInsumosUnitarios(node);
      renderTAB1();
      closeAiGeneratorModal();
      showToast(`✅ Matriz integrada vinculada desde ${matchedCatalogName} (${directConceptMatch.clave})`, 'success');
      return;
    }

    // 4. Buscar MATERIALES en los catálogos importados
    const foundMaterials = [];
    const usedMaterialIds = new Set();

    for (const query of analysis.matQueries) {
      if (foundMaterials.length >= 3) break;
      const res = await searchReferenceItems({ tipo: 'Material', query: query, limit: 2 });
      for (const item of res) {
        if (!usedMaterialIds.has(item.id)) {
          usedMaterialIds.add(item.id);
          foundMaterials.push(item);
          if (item.catalogName) matchedCatalogName = item.catalogName;
          if (foundMaterials.length >= 3) break;
        }
      }
    }

    // Fallback: si no encontró con términos específicos, buscar con las palabras clave del concepto
    if (foundMaterials.length === 0) {
      for (const kw of analysis.keywords) {
        if (foundMaterials.length >= 2) break;
        if (kw.length >= 4) {
          const res = await searchReferenceItems({ tipo: 'Material', query: kw, limit: 2 });
          for (const item of res) {
            if (!usedMaterialIds.has(item.id)) {
              usedMaterialIds.add(item.id);
              foundMaterials.push(item);
              if (item.catalogName) matchedCatalogName = item.catalogName;
            }
          }
        }
      }
    }

    // 5. Buscar MANO DE OBRA en los catálogos importados
    let foundLabor = null;
    for (const query of analysis.moQueries) {
      const res = await searchReferenceItems({ tipo: 'Mano de Obra', query: query, limit: 2 });
      if (res.length > 0) {
        foundLabor = res[0];
        if (foundLabor.catalogName) matchedCatalogName = foundLabor.catalogName;
        break;
      }
    }

    // Si no encontró cuadrilla específica, obtener la primera cuadrilla disponible en la base
    if (!foundLabor) {
      const fallbackLabor = await searchReferenceItems({ tipo: 'Mano de Obra', query: '', limit: 1 });
      if (fallbackLabor.length > 0) {
        foundLabor = fallbackLabor[0];
      }
    }

    // 6. Buscar EQUIPO Y MAQUINARIA en los catálogos importados
    let foundEquipment = null;
    for (const query of analysis.eqQueries) {
      const res = await searchReferenceItems({ tipo: 'Equipo', query: query, limit: 2 });
      if (res.length > 0) {
        foundEquipment = res[0];
        if (foundEquipment.catalogName) matchedCatalogName = foundEquipment.catalogName;
        break;
      }
    }

    if (!foundEquipment) {
      const fallbackEq = await searchReferenceItems({ tipo: 'Equipo', query: '', limit: 1 });
      if (fallbackEq.length > 0) {
        foundEquipment = fallbackEq[0];
      }
    }

    // 7. Estructurar los insumos resultantes con rendimientos calibrados
    saveState();
    toggleApuSection('matriz', true);

    const generatedInsumos = [];

    // Agregar Materiales encontrados con cantidad unitaria congruente
    foundMaterials.forEach((mat, idx) => {
      const cant = calculateCongruentUnitQuantity(
        node.descripcion || '',
        node.unidad || 'pza',
        'Material',
        mat.descripcion || '',
        mat.unidad || 'pza'
      );

      generatedInsumos.push({
        clave: mat.clave || `MAT-0${idx + 1}`,
        tipo: 'Material',
        descripcion: mat.descripcion || 'Material de referencia',
        unidad: mat.unidad || 'pza',
        cantidad: cant,
        costoUnitario: mat.precioUnitario || mat.costoUnitario || 0
      });
    });

    // Si el catálogo aún no tenía materiales para este rubro específico, proveer material de referencia base
    if (generatedInsumos.length === 0) {
      const baseCost = directConceptMatch ? Math.round(directConceptMatch.precioUnitario * 0.60) : 320.00;
      const cant = calculateCongruentUnitQuantity(
        node.descripcion || '',
        node.unidad || 'pza',
        'Material',
        directConceptMatch ? directConceptMatch.descripcion : node.descripcion,
        node.unidad || 'pza'
      );
      generatedInsumos.push({
        clave: directConceptMatch ? directConceptMatch.clave : 'MAT-01',
        tipo: 'Material',
        descripcion: directConceptMatch ? `Material e insumos para ${directConceptMatch.descripcion.substring(0, 45)}` : `Suministro de materiales para ${node.descripcion.substring(0, 40)}`,
        unidad: node.unidad || 'pza',
        cantidad: cant,
        costoUnitario: baseCost
      });
    }

    // Agregar Mano de Obra con rendimiento unitario congruente (jornadas por 1 unidad de concepto)
    if (foundLabor) {
      const laborYield = calculateCongruentUnitQuantity(
        node.descripcion || '',
        node.unidad || 'pza',
        'Mano de Obra',
        foundLabor.descripcion || '',
        foundLabor.unidad || 'jor'
      );

      generatedInsumos.push({
        clave: foundLabor.clave || 'MO-01',
        tipo: 'Mano de Obra',
        descripcion: foundLabor.descripcion || 'Cuadrilla de mano de obra especializada',
        unidad: foundLabor.unidad || 'jor',
        cantidad: laborYield,
        costoUnitario: foundLabor.precioUnitario || foundLabor.costoUnitario || 750.00
      });
    } else {
      const laborYield = calculateCongruentUnitQuantity(
        node.descripcion || '',
        node.unidad || 'pza',
        'Mano de Obra',
        'Cuadrilla de obra (1 Oficial + 1 Peón)',
        'jor'
      );
      generatedInsumos.push({
        clave: 'MO-01',
        tipo: 'Mano de Obra',
        descripcion: 'Cuadrilla de obra (1 Oficial + 1 Peón)',
        unidad: 'jor',
        cantidad: laborYield,
        costoUnitario: 820.00
      });
    }

    // Agregar Equipo / Maquinaria o Herramienta Menor con rendimiento congruente
    if (foundEquipment) {
      const eqYield = calculateCongruentUnitQuantity(
        node.descripcion || '',
        node.unidad || 'pza',
        'Equipo',
        foundEquipment.descripcion || '',
        foundEquipment.unidad || 'hr'
      );
      generatedInsumos.push({
        clave: foundEquipment.clave || 'EQ-01',
        tipo: 'Equipo',
        descripcion: foundEquipment.descripcion || 'Herramienta menor y equipo de seguridad',
        unidad: foundEquipment.unidad || 'hr',
        cantidad: eqYield,
        costoUnitario: foundEquipment.precioUnitario || foundEquipment.costoUnitario || 120.00
      });
    } else {
      generatedInsumos.push({
        clave: 'EQ-01',
        tipo: 'Equipo',
        descripcion: 'Herramienta menor y equipo de seguridad (% MO)',
        unidad: '%',
        cantidad: 0.03,
        costoUnitario: 820.00
      });
    }

    // 8. Vincular metadatos de referencia en la sección APU Grounding
    node.googleSearchQueries = [
      `Catálogo Local: ${matchedCatalogName}`,
      `Especialidad: ${analysis.specialty}`
    ];

    node.googleSources = [
      {
        title: `${matchedCatalogName} (IndexedDB)`,
        uri: '#'
      }
    ];

    if (directConceptMatch) {
      node.aiTips = `Concepto localizado en ${matchedCatalogName} [${directConceptMatch.clave}]: Costo base referencial de ${formatMoney(directConceptMatch.precioUnitario)}. Se vincularon ${generatedInsumos.length} insumos analíticos con precios reales de tu base local.`;
    } else {
      node.aiTips = `Matriz analítica generada con ${generatedInsumos.length} insumos y cuadrillas reales desde ${matchedCatalogName} (${analysis.specialty}). Costos unitarios y claves sincronizadas.`;
    }

    generatedInsumos.forEach(ins => {
      ins.cantidad = Math.round(((Number(ins.cantidad) || 0) + Number.EPSILON) * 100) / 100;
      ins.costoUnitario = Math.round(((Number(ins.costoUnitario) || 0) + Number.EPSILON) * 100) / 100;
    });

    node.insumos = generatedInsumos;

    // 9. Actualizar interfaz
    closeAiGeneratorModal();
    renderAPUInsumos(node);
    renderInsumosUnitarios(node);
    renderTAB1();

    showToast(`¡APU generado desde catálogo local (${matchedCatalogName})!`, 'success');
  } catch (err) {
    console.error('Error generando APU local:', err);
    showToast(`Error al consultar catálogo local: ${err.message}`, 'error');
  } finally {
    if (btnLocal) {
      btnLocal.disabled = false;
      btnLocal.innerHTML = '<i class="fa-solid fa-database text-[10px] text-amber-500"></i> Usar catálogo local';
    }
  }
}
