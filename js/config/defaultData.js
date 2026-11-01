export const defaultTreeData = [
  {
    id: '1',
    clave: '1',
    descripcion: 'CIMENTACIÓN Y EXTERIORES',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    color: '#3b82f6',
    expanded: true,
    selected: true,
    children: [
      {
        id: '1.1',
        clave: '1.1',
        descripcion: 'NAVE TIPO 01',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        expanded: true,
        selected: true,
        children: [
          {
            id: '1.1.24',
            clave: '1.1.24',
            descripcion: 'Firme de concreto espesor 20 cm f\'c=250 kg/cm2 reforzado con malla electrosoldada',
            unidad: 'm2',
            cantidad: 12134.10,
            precioUnitario: 427.00,
            costoDirecto: 427.00,
            selected: true,
            googleSearchQueries: [
              "precio concreto f'c 250 m3 mexico",
              "malla electrosoldada 6-6 10-10 m2 costo",
              "rendimiento cuadrilla colado y vibrado concreto m2"
            ],
            googleSources: [
              { title: "Home Depot México - Concreto y Malla", uri: "https://www.homedepot.com.mx" },
              { title: "Tabulador de Salarios y Rendimientos CMIC", uri: "https://www.cmic.org" }
            ],
            aiTips: "Consumo unitario por 1 m2: 0.20m * 1.05 = 0.21 m3 de concreto premezclado y 1.10 m2 de malla (10% traslapes).",
            insumos: [
              { clave: 'MAT-01', tipo: 'Material', descripcion: 'Concreto premezclado f\'c=250 kg/cm2 bombeable', unidad: 'm3', cantidad: 0.21, costoUnitario: 1650.00 },
              { clave: 'MAT-02', tipo: 'Material', descripcion: 'Malla electrosoldada 6-6/10-10 en rollo', unidad: 'm2', cantidad: 1.10, costoUnitario: 42.50 },
              { clave: 'MO-01', tipo: 'Mano de Obra', descripcion: 'Cuadrilla de colado, nivelación y acabado pulido (1 Oficial + 4 Peones)', unidad: 'jor', cantidad: 0.08, costoUnitario: 1850.00 },
              { clave: 'EQ-01', tipo: 'Equipo', descripcion: 'Vibrador para concreto a gasolina y herramienta menor (% MO)', unidad: '%', cantidad: 0.03, costoUnitario: 1850.00 }
            ]
          },
          {
            id: '1.1.25',
            clave: '1.1.25',
            descripcion: 'Banqueta perimetral de concreto espesor 10 cm f\'c=200 kg/cm2 con malla',
            unidad: 'm2',
            cantidad: 450.00,
            precioUnitario: 295.00,
            costoDirecto: 295.00,
            selected: true,
            aiTips: "Consumo unitario por 1 m2: 0.10m * 1.05 = 0.11 m3 de concreto y 1.10 m2 de malla.",
            insumos: [
              { clave: 'MAT-01', tipo: 'Material', descripcion: 'Concreto premezclado f\'c=200 kg/cm2 bombeable', unidad: 'm3', cantidad: 0.11, costoUnitario: 1650.00 },
              { clave: 'MAT-02', tipo: 'Material', descripcion: 'Malla electrosoldada 6-6/10-10 en rollo', unidad: 'm2', cantidad: 1.10, costoUnitario: 42.50 },
              { clave: 'MO-01', tipo: 'Mano de Obra', descripcion: 'Cuadrilla de colado, nivelación y acabado pulido (1 Oficial + 4 Peones)', unidad: 'jor', cantidad: 0.07, costoUnitario: 1850.00 },
              { clave: 'EQ-01', tipo: 'Equipo', descripcion: 'Vibrador para concreto a gasolina y herramienta menor (% MO)', unidad: '%', cantidad: 0.03, costoUnitario: 1850.00 }
            ]
          },
          {
            id: '1.1.26',
            clave: '1.1.26',
            descripcion: 'Relleno premoldeado FEXPAN Mca. Fester para junta de dilatación',
            unidad: 'm',
            cantidad: 666.22,
            precioUnitario: 102.78,
            costoDirecto: 102.78,
            selected: true,
            insumos: [
              { clave: 'MAT-03', tipo: 'Material', descripcion: 'Cinta Fexpan 1/2x4 pulg', unidad: 'm', cantidad: 1.05, costoUnitario: 85.00 },
              { clave: 'MO-02', tipo: 'Mano de Obra', descripcion: 'Oficial colocador de juntas y calafateador', unidad: 'jor', cantidad: 0.04, costoUnitario: 850.00 },
              { clave: 'EQ-01', tipo: 'Equipo', descripcion: 'Herramienta menor (% MO)', unidad: '%', cantidad: 0.03, costoUnitario: 850.00 }
            ]
          }
        ]
      }
    ]
  },
  {
    id: '2',
    clave: '2',
    descripcion: 'ESTRUCTURA',
    unidad: 'ton',
    cantidad: 15.50,
    precioUnitario: 0.00,
    costoDirecto: 0.00,
    color: '#10b981',
    expanded: false,
    selected: true,
    children: []
  }
];

export const defaultSettings = {
  apiKey: '',
  applySobrecosto: false,
  pctIndirectos: 12.00,
  pctFinanciamiento: 1.50,
  pctUtilidad: 10.00,
  pctAdicionales: 0.50,
  currency: 'MXN',
  currencySymbol: '$',
  showCurrencyCode: false,
  companyName: 'Sistema de Control de Obra',
  companySubtitle: '',
  companyLogo: '',
  projectName: 'Proyecto de Obra Base',
  projectLocation: 'Ciudad de México, CDMX'
};
