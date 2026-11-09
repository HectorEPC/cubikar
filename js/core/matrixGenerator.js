// js/core/matrixGenerator.js
// Generador y calibrador de Matrices Integradas de APU para conceptos importados
// Asegura que cada concepto importado (ej. Opus, BIMSA, catálogos externos)
// ya contenga su desglose completo de Materiales, Mano de Obra y Equipo/Herramienta,
// con consumos estrictamente unitarios y suma exacta igual al Costo Unitario del concepto.

/**
 * Genera la matriz integrada (insumos) para un concepto de obra.
 * @param {Object} concept { clave, descripcion, unidad, costoUnitario, precioUnitario }
 * @returns {Array} Lista de insumos [{ clave, tipo, descripcion, unidad, cantidad, costoUnitario }]
 */
export function generateIntegratedMatrixForConcept(concept) {
  if (!concept) return [];

  // Si ya tiene insumos válidos definidos, retornarlos
  if (Array.isArray(concept.insumos) && concept.insumos.length > 0) {
    return concept.insumos;
  }

  const desc = (concept.descripcion || '').trim();
  const descLower = desc.toLowerCase();
  const unit = (concept.unidad || 'pza').toLowerCase().trim();
  const totalCost = parseFloat(concept.costoUnitario || concept.precioUnitario) || 0;

  if (totalCost <= 0) {
    return [];
  }

  const insumos = [];
  const cvePrefix = (concept.clave || 'CONC').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);

  // =========================================================================
  // 1. CASO: CONCEPTOS POR M2 (Firmes, Losas, Muros, Pisos, Pintura, etc.)
  // =========================================================================
  if (unit === 'm2') {
    // 1.1 Firmes, banquetas, pavimentos, losas de concreto
    if (descLower.includes('concreto') || descLower.includes('firme') || descLower.includes('losa') || descLower.includes('banqueta') || descLower.includes('piso de concreto')) {
      let espesorM = 0.10;
      const espMatch = descLower.match(/(\d+(?:\.\d+)?)\s*(?:cm|cms|cent[ií]metros)/i);
      if (espMatch) {
        const cm = parseFloat(espMatch[1]);
        if (cm > 0 && cm <= 100) espesorM = cm / 100;
      }
      const cantConcreto = Math.round((1.0 * espesorM * 1.05) * 10000) / 10000;
      const tieneMalla = descLower.includes('malla') || descLower.includes('reforz');

      // Distribución: 65% concreto, 10% malla (si aplica), 22% MO, 3% EQ
      const pctMat = tieneMalla ? 0.72 : 0.65;
      const pctMO = tieneMalla ? 0.25 : 0.32;
      const pctEQ = 0.03;

      const costConcretoTotal = tieneMalla ? totalCost * 0.60 : totalCost * pctMat;
      const costMallaTotal = tieneMalla ? totalCost * 0.12 : 0;
      const costMOTotal = totalCost * pctMO;
      const costEQTotal = totalCost * pctEQ;

      insumos.push({
        clave: `${cvePrefix}-M01`,
        tipo: 'Material',
        descripcion: `Concreto premezclado para ${desc.substring(0, 45)}...`,
        unidad: 'm3',
        cantidad: cantConcreto,
        costoUnitario: Math.round((costConcretoTotal / cantConcreto) * 100) / 100
      });

      if (tieneMalla) {
        insumos.push({
          clave: `${cvePrefix}-M02`,
          tipo: 'Material',
          descripcion: 'Malla electrosoldada en rollo (incluye 10% de traslapes)',
          unidad: 'm2',
          cantidad: 1.1000,
          costoUnitario: Math.round((costMallaTotal / 1.1000) * 100) / 100
        });
      }

      insumos.push({
        clave: `${cvePrefix}-O01`,
        tipo: 'Mano de Obra',
        descripcion: 'Cuadrilla de colado, nivelación, vibrado y acabado (1 Oficial + 4 Peones)',
        unidad: 'jor',
        cantidad: 0.0800,
        costoUnitario: Math.round((costMOTotal / 0.0800) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-E01`,
        tipo: 'Equipo',
        descripcion: 'Herramienta menor y equipo de seguridad (% MO)',
        unidad: '%',
        cantidad: 0.0300,
        costoUnitario: Math.round(costMOTotal * 100) / 100
      });
    }
    // 1.2 Muros de block o tabique
    else if (descLower.includes('muro') || descLower.includes('block') || descLower.includes('tabique') || descLower.includes('ladrillo')) {
      const isBlock = descLower.includes('block') || descLower.includes('bloque');
      const cantPzas = isBlock ? 13.0000 : 50.0000;
      const costPiezas = totalCost * 0.52;
      const costMortero = totalCost * 0.13;
      const costMO = totalCost * 0.32;
      const costEQ = totalCost * 0.03;

      insumos.push({
        clave: `${cvePrefix}-M01`,
        tipo: 'Material',
        descripcion: isBlock ? 'Block de concreto para muro asentado con mortero' : 'Tabique rojo recocido para muro',
        unidad: 'pza',
        cantidad: cantPzas,
        costoUnitario: Math.round((costPiezas / cantPzas) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-M02`,
        tipo: 'Material',
        descripcion: 'Mortero cemento-arena para junteo de piezas',
        unidad: 'm3',
        cantidad: 0.0250,
        costoUnitario: Math.round((costMortero / 0.0250) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-O01`,
        tipo: 'Mano de Obra',
        descripcion: 'Cuadrilla de albañilería (1 Oficial albañil + 1 Peón)',
        unidad: 'jor',
        cantidad: 0.1100,
        costoUnitario: Math.round((costMO / 0.1100) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-E01`,
        tipo: 'Equipo',
        descripcion: 'Andamios, herramienta menor y seguridad (% MO)',
        unidad: '%',
        cantidad: 0.0300,
        costoUnitario: Math.round(costMO * 100) / 100
      });
    }
    // 1.3 Pintura, impermeabilizante o aplanados
    else if (descLower.includes('pintura') || descLower.includes('esmalte') || descLower.includes('impermeabiliz') || descLower.includes('aplanado')) {
      const isPintura = descLower.includes('pintura') || descLower.includes('esmalte');
      const costMat = totalCost * 0.60;
      const costMO = totalCost * 0.37;
      const costEQ = totalCost * 0.03;

      insumos.push({
        clave: `${cvePrefix}-M01`,
        tipo: 'Material',
        descripcion: isPintura ? 'Pintura vinílica o esmalte a dos manos' : 'Impermeabilizante y membrana de refuerzo',
        unidad: isPintura ? 'lt' : 'm2',
        cantidad: isPintura ? 0.2500 : 1.1000,
        costoUnitario: Math.round((costMat / (isPintura ? 0.2500 : 1.1000)) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-O01`,
        tipo: 'Mano de Obra',
        descripcion: isPintura ? 'Cuadrilla de pintor y ayudante' : 'Cuadrilla de impermeabilizador y ayudante',
        unidad: 'jor',
        cantidad: isPintura ? 0.0250 : 0.0350,
        costoUnitario: Math.round((costMO / (isPintura ? 0.0250 : 0.0350)) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-E01`,
        tipo: 'Equipo',
        descripcion: 'Herramienta menor y equipo de seguridad (% MO)',
        unidad: '%',
        cantidad: 0.0300,
        costoUnitario: Math.round(costMO * 100) / 100
      });
    }
    // 1.4 Otros conceptos en m2
    else {
      const costMat = totalCost * 0.65;
      const costMO = totalCost * 0.32;
      const costEQ = totalCost * 0.03;

      insumos.push({
        clave: `${cvePrefix}-M01`,
        tipo: 'Material',
        descripcion: `Materiales e insumos para ${desc.substring(0, 50)}`,
        unidad: 'm2',
        cantidad: 1.0500,
        costoUnitario: Math.round((costMat / 1.0500) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-O01`,
        tipo: 'Mano de Obra',
        descripcion: 'Cuadrilla de obra especializada (1 Oficial + 1 Peón)',
        unidad: 'jor',
        cantidad: 0.0800,
        costoUnitario: Math.round((costMO / 0.0800) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-E01`,
        tipo: 'Equipo',
        descripcion: 'Herramienta menor y equipo de seguridad (% MO)',
        unidad: '%',
        cantidad: 0.0300,
        costoUnitario: Math.round(costMO * 100) / 100
      });
    }
  }

  // =========================================================================
  // 2. CASO: CONCEPTOS LINEALES (m, ml - Tuberías, cables, guarniciones)
  // =========================================================================
  else if (unit === 'm' || unit === 'ml') {
    const costMat = totalCost * 0.65;
    const costAcc = totalCost * 0.08;
    const costMO = totalCost * 0.24;
    const costEQ = totalCost * 0.03;

    insumos.push({
      clave: `${cvePrefix}-M01`,
      tipo: 'Material',
      descripcion: `Suministro de ${desc.substring(0, 50)}`,
      unidad: 'm',
      cantidad: 1.0500,
      costoUnitario: Math.round((costMat / 1.0500) * 100) / 100
    });

    insumos.push({
      clave: `${cvePrefix}-M02`,
      tipo: 'Material',
      descripcion: 'Accesorios de fijación, coples, soldadura o consumibles',
      unidad: 'pza',
      cantidad: 0.2000,
      costoUnitario: Math.round((costAcc / 0.2000) * 100) / 100
    });

    insumos.push({
      clave: `${cvePrefix}-O01`,
      tipo: 'Mano de Obra',
      descripcion: 'Cuadrilla de instalación especializada (1 Oficial + 1 Ayudante)',
      unidad: 'jor',
      cantidad: 0.0600,
      costoUnitario: Math.round((costMO / 0.0600) * 100) / 100
    });

    insumos.push({
      clave: `${cvePrefix}-E01`,
      tipo: 'Equipo',
      descripcion: 'Herramienta menor y equipo de seguridad (% MO)',
      unidad: '%',
      cantidad: 0.0300,
      costoUnitario: Math.round(costMO * 100) / 100
    });
  }

  // =========================================================================
  // 3. CASO: CONCEPTOS VOLUMÉTRICOS (m3 - Concretos, excavaciones, rellenos)
  // =========================================================================
  else if (unit === 'm3') {
    if (descLower.includes('excavaci') || descLower.includes('demolici')) {
      // Mano de obra + maquinaria
      const costMO = totalCost * 0.40;
      const costMaq = totalCost * 0.57;
      const costEQ = totalCost * 0.03;

      insumos.push({
        clave: `${cvePrefix}-O01`,
        tipo: 'Mano de Obra',
        descripcion: 'Cuadrilla para excavación, perfilado de cepas y acarreo (Peones)',
        unidad: 'jor',
        cantidad: 0.3500,
        costoUnitario: Math.round((costMO / 0.3500) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-E01`,
        tipo: 'Equipo',
        descripcion: 'Retroexcavadora / equipo mecánico para excavación y carga',
        unidad: 'hr',
        cantidad: 0.1500,
        costoUnitario: Math.round((costMaq / 0.1500) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-E02`,
        tipo: 'Equipo',
        descripcion: 'Herramienta menor (% MO)',
        unidad: '%',
        cantidad: 0.0300,
        costoUnitario: Math.round(costMO * 100) / 100
      });
    } else {
      // Concreto en volumen o relleno
      const costMat = totalCost * 0.70;
      const costMO = totalCost * 0.25;
      const costEQ = totalCost * 0.05;

      insumos.push({
        clave: `${cvePrefix}-M01`,
        tipo: 'Material',
        descripcion: `Suministro de material para ${desc.substring(0, 45)}`,
        unidad: 'm3',
        cantidad: 1.0500,
        costoUnitario: Math.round((costMat / 1.0500) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-O01`,
        tipo: 'Mano de Obra',
        descripcion: 'Cuadrilla de colocación y vaciado (1 Oficial + 4 Peones)',
        unidad: 'jor',
        cantidad: 0.2800,
        costoUnitario: Math.round((costMO / 0.2800) * 100) / 100
      });

      insumos.push({
        clave: `${cvePrefix}-E01`,
        tipo: 'Equipo',
        descripcion: 'Vibrador de concreto a gasolina / compactador y herramienta',
        unidad: 'hr',
        cantidad: 0.2500,
        costoUnitario: Math.round((costEQ / 0.2500) * 100) / 100
      });
    }
  }

  // =========================================================================
  // 4. CASO: CONCEPTOS POR PESO (kg, ton - Acero de refuerzo, perfiles)
  // =========================================================================
  else if (unit === 'kg' || unit === 'ton') {
    const isTon = unit === 'ton';
    const cantAcero = isTon ? 1.0500 : 1.0500;
    const cantAlambre = isTon ? 30.0000 : 0.0300;
    const cantMO = isTon ? 6.7000 : 0.0067;

    const costAcero = totalCost * 0.78;
    const costAlambre = totalCost * 0.03;
    const costMO = totalCost * 0.16;
    const costEQ = totalCost * 0.03;

    insumos.push({
      clave: `${cvePrefix}-M01`,
      tipo: 'Material',
      descripcion: `Acero de refuerzo / perfiles para ${desc.substring(0, 45)}`,
      unidad: unit,
      cantidad: cantAcero,
      costoUnitario: Math.round((costAcero / cantAcero) * 100) / 100
    });

    insumos.push({
      clave: `${cvePrefix}-M02`,
      tipo: 'Material',
      descripcion: 'Alambre recocido del No. 18 para amarres',
      unidad: 'kg',
      cantidad: cantAlambre,
      costoUnitario: Math.round((costAlambre / cantAlambre) * 100) / 100
    });

    insumos.push({
      clave: `${cvePrefix}-O01`,
      tipo: 'Mano de Obra',
      descripcion: 'Cuadrilla de habilitado, corte, doblado y armado (1 Fierrero + 1 Ayudante)',
      unidad: 'jor',
      cantidad: cantMO,
      costoUnitario: Math.round((costMO / cantMO) * 100) / 100
    });

    insumos.push({
      clave: `${cvePrefix}-E01`,
      tipo: 'Equipo',
      descripcion: 'Cizalla, dobladora y herramienta menor (% MO)',
      unidad: '%',
      cantidad: 0.0300,
      costoUnitario: Math.round(costMO * 100) / 100
    });
  }

  // =========================================================================
  // 5. CASO GENERAL: PIEZAS, SALIDAS, LOTES, JUNTAS, EQUIPOS (pza, sal, lote, etc.)
  // =========================================================================
  else {
    const costEquipoMat = totalCost * 0.72;
    const costFijacion = totalCost * 0.05;
    const costMO = totalCost * 0.20;
    const costEQ = totalCost * 0.03;

    insumos.push({
      clave: `${cvePrefix}-M01`,
      tipo: 'Material',
      descripcion: `Suministro de ${desc.substring(0, 50)}`,
      unidad: unit === 'lote' ? 'lote' : 'pza',
      cantidad: 1.0000,
      costoUnitario: Math.round(costEquipoMat * 100) / 100
    });

    insumos.push({
      clave: `${cvePrefix}-M02`,
      tipo: 'Material',
      descripcion: 'Materiales menores, herrajes de montaje y fijación',
      unidad: 'lote',
      cantidad: 1.0000,
      costoUnitario: Math.round(costFijacion * 100) / 100
    });

    insumos.push({
      clave: `${cvePrefix}-O01`,
      tipo: 'Mano de Obra',
      descripcion: 'Cuadrilla de montaje, instalación y pruebas (1 Especialista + 1 Ayudante)',
      unidad: 'jor',
      cantidad: 0.1500,
      costoUnitario: Math.round((costMO / 0.1500) * 100) / 100
    });

    insumos.push({
      clave: `${cvePrefix}-E01`,
      tipo: 'Equipo',
      descripcion: 'Herramienta menor y equipo de seguridad (% MO)',
      unidad: '%',
      cantidad: 0.0300,
      costoUnitario: Math.round(costMO * 100) / 100
    });
  }

  // =========================================================================
  // 6. CALIBRACIÓN MATEMÁTICA EXACTA AL CENTAVO
  // =========================================================================
  // La suma de (cantidad * costoUnitario) debe dar EXACTAMENTE totalCost
  calibrateMatrixSum(insumos, totalCost);

  return insumos;
}

/**
 * Ajusta los costos unitarios de los insumos para que la suma total coincida
 * al centavo con el costo unitario objetivo del concepto.
 */
function calibrateMatrixSum(insumos, targetCost) {
  if (!insumos || insumos.length === 0) return;

  insumos.forEach(ins => {
    ins.cantidad = Math.round(((Number(ins.cantidad) || 0) + Number.EPSILON) * 100000) / 100000;
    ins.costoUnitario = Math.round(((Number(ins.costoUnitario) || 0) + Number.EPSILON) * 100) / 100;
  });

  const target = Math.round(((Number(targetCost) || 0) + Number.EPSILON) * 100) / 100;
  let currentSum = insumos.reduce((acc, ins) => acc + (Math.round(((ins.cantidad * ins.costoUnitario) + Number.EPSILON) * 100) / 100), 0);
  currentSum = Math.round((currentSum + Number.EPSILON) * 100) / 100;
  let diff = Math.round((target - currentSum) * 100) / 100;

  if (Math.abs(diff) > 0.001) {
    // Ajustar la diferencia en el primer material principal o primer insumo
    const primaryMat = insumos.find(ins => ins.tipo === 'Material') || insumos[0];
    if (primaryMat && primaryMat.cantidad > 0) {
      const adjustment = diff / primaryMat.cantidad;
      primaryMat.costoUnitario = Math.round(((primaryMat.costoUnitario + adjustment) + Number.EPSILON) * 100) / 100;
    }
  }
}
