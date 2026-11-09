// js/modules/io/casaLauraData.js
// Base de datos exacta del proyecto Casa Laura de Opus 2014
// 12 partidas, 94 conceptos, 414 insumos con cantidades de hasta 5 decimales y costos directos originales.

export const CASA_LAURA_PROJECT = [
  {
    "clave": "1",
    "descripcion": "Preliminares",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 5239.39,
    "costoDirecto": 5239.39,
    "children": [
      {
        "clave": "G800100-1000",
        "descripcion": "Trazo y nivelacion topografica de terreno para estructuras, estableciendo ejes y referencias, para superficies menores de 300 m2",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 243.7,
        "precioUnitario": 16.05,
        "costoDirecto": 16.05,
        "insumos": [
          {
            "clave": "500165-3045",
            "descripcion": "Duela 3/4  x 4  x 8 1/4",
            "unidad": "pt",
            "cantidad": 0.03,
            "costoUnitario": 17.66,
            "tipo": "Material"
          },
          {
            "clave": "130100-1205",
            "descripcion": "Polin 3 1/2 x3 1/2 x8 1/4",
            "unidad": "pt",
            "cantidad": 0.06,
            "costoUnitario": 7.98,
            "tipo": "Material"
          },
          {
            "clave": "130100-1045",
            "descripcion": "Barrote 2\"x4\"x8 1/4",
            "unidad": "pt",
            "cantidad": 0.045,
            "costoUnitario": 21.63,
            "tipo": "Material"
          },
          {
            "clave": "500180-1051",
            "descripcion": "Flash coat (esmalte alquidalico) colores regulares, marca Comex",
            "unidad": "L",
            "cantidad": 0.003,
            "costoUnitario": 133.62,
            "tipo": "Material"
          },
          {
            "clave": "103247-1265",
            "descripcion": "Hilo para albañil HIL-65 marca Truper.",
            "unidad": "m",
            "cantidad": 0.35,
            "costoUnitario": 0.21,
            "tipo": "Material"
          },
          {
            "clave": "175125-2010",
            "descripcion": "Clavo c/cabeza de 2-4, marca Deacero",
            "unidad": "kg",
            "cantidad": 0.003,
            "costoUnitario": 12.1,
            "tipo": "Material"
          },
          {
            "clave": "103100-1005",
            "descripcion": "Calhidra",
            "unidad": "Ton",
            "cantidad": 0.0004,
            "costoUnitario": 2887.93,
            "tipo": "Material"
          },
          {
            "clave": "C990180-1515",
            "descripcion": "Nivel topográfico basculante con precisión de +/- 2 mm/km  nivelado  aumentos del lente de 40 X  imagen directa y tripie  marca Keuffel & Esser Co  modelo Dummpy.",
            "unidad": "hr",
            "cantidad": 0.025,
            "costoUnitario": 1.1,
            "tipo": "Equipo"
          },
          {
            "clave": "A100105-4000",
            "descripcion": "Cuadrilla de topografía. Incluye : topógrafo, ayudante, cadenero, estadalero y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0045,
            "costoUnitario": 2749.74,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G105111-1000",
        "descripcion": "Desmonte con retroexcavadora en terreno semi desértico. Incluye: tala, roza, desenraice y limpieza.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 664,
        "precioUnitario": 2,
        "costoDirecto": 2,
        "insumos": [
          {
            "clave": "A100105-1000",
            "descripcion": "Cuadrilla para desmontes. Incluye: peón, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.002,
            "costoUnitario": 531.14,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "C990120-3015",
            "descripcion": "Retroexcavadora Cargador tracción 4 x 4  mca. Komatsu mod. 4WB146  potencia neta 86.00 HP  Cucharón frontal de 2355 mm. cap. 0.95 m3  profundidad de excavación estandar de 4875 mm. cabina Canopy Rops.",
            "unidad": "hr",
            "cantidad": 0.004,
            "costoUnitario": 235.12,
            "tipo": "Equipo"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "2",
    "descripcion": "Cimentación",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 498359.57,
    "costoDirecto": 498359.57,
    "children": [
      {
        "clave": "G105116-1030",
        "descripcion": "Relleno de cepa de cimentación con material producto de excavación, compactado con pisón de mano en capas de  20 cm. Incluye: carga en carretilla de zona de acopio a cepa, tiro a volteo, incorporación de agua a razón de 100 L/m3 y compactación.",
        "unidad": "m3",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 123,
        "precioUnitario": 191.27,
        "costoDirecto": 191.27,
        "insumos": [
          {
            "clave": "103247-1040",
            "descripcion": "Agua",
            "unidad": "L",
            "cantidad": 100,
            "costoUnitario": 0.16,
            "tipo": "Material"
          },
          {
            "clave": "A100105-1045",
            "descripcion": "Cuadrilla para carga de materiales. Incluye : peón, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.03,
            "costoUnitario": 531.14,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "A100105-1015",
            "descripcion": "Cuadrilla para rellenos, incluye: peón , cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.3,
            "costoUnitario": 531.14,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G105116-1065",
        "descripcion": "Relleno en cepas compactado con pison de mano en capas de 20 cm utilizando tepetate, incluye: volteo a mano con pala.",
        "unidad": "m3",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 82.5,
        "precioUnitario": 393.63,
        "costoDirecto": 393.63,
        "insumos": [
          {
            "clave": "103247-1035",
            "descripcion": "Agua",
            "unidad": "m3",
            "cantidad": 0.18,
            "costoUnitario": 160,
            "tipo": "Material"
          },
          {
            "clave": "103200-1090",
            "descripcion": "Tepetate amarillo",
            "unidad": "m3",
            "cantidad": 1.2,
            "costoUnitario": 215.5,
            "tipo": "Material"
          },
          {
            "clave": "A100105-1500",
            "descripcion": "Cuadrilla de peones. Incluye : peón, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.2,
            "costoUnitario": 531.14,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G140105-1110",
        "descripcion": "Dala de desplante, seccion 15 x 20 cm, concreto fc=200 kg/cm2, r.n. ag.max. 3/4\", reforzada con 4 varillas de 3/8\" de diametro (no. 3) y estribos de 1/4\" de diametro (no. 2) a cada 20 cm, cimbrado comun, incluye: acarreo de los materiales a una 1a. estacion a 20.00 m. de distancia horizontal.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 206,
        "precioUnitario": 439.72,
        "costoDirecto": 439.72,
        "insumos": [
          {
            "clave": "125100-1005",
            "descripcion": "Varilla de acero corrugada 3/8\" No. 3, marca Aceros San Luis",
            "unidad": "Ton",
            "cantidad": 0.0023,
            "costoUnitario": 19950,
            "tipo": "Material"
          },
          {
            "clave": "HULE-01",
            "descripcion": "Polietileno Negro Calibre 600 ",
            "unidad": "kg",
            "cantidad": 0.05,
            "costoUnitario": 65.51,
            "tipo": "Material"
          },
          {
            "clave": "125100-2005",
            "descripcion": "Alambre recocido Calibre 18",
            "unidad": "kg",
            "cantidad": 0.13,
            "costoUnitario": 37.5,
            "tipo": "Material"
          },
          {
            "clave": "125100-1065",
            "descripcion": "Varilla de acero corrugado de 1/4\" MS-60, marca Gasa",
            "unidad": "Ton",
            "cantidad": 0.0011,
            "costoUnitario": 27000,
            "tipo": "Material"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.171,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "G140310-1020",
            "descripcion": "Concreto fc=200kg/cm2 hecho con revolvedora en dalas castillos cejas y repisones seccion >0.02, r. n., tma. 20mm. (3/4\"), incluye: acarreos a 1a. estacion a 20m.",
            "unidad": "m3",
            "cantidad": 0.0315,
            "costoUnitario": 3265.93,
            "tipo": "Subcontrato"
          }
        ],
        "children": []
      },
      {
        "clave": "G140100-1895",
        "descripcion": "Castillo de 15 x 20 cm, fabricado de concreto fc = 200 kg/cm2, armado con 4V3 y E2 @ 25, utilizando cimbra de madera acabado comón a 2 caras. Incluye: armado, cimbra, lubricación, colado, retiro de cimbra y curado en las superficies expuestas.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 67.5,
        "precioUnitario": 396.72,
        "costoDirecto": 396.72,
        "insumos": [
          {
            "clave": "G140300-1010",
            "descripcion": "Acero de refuerzo del No. 3  (3/8) en albañilería. Incluye: dimensionamiento, habilitación, cortes, desperdicios, dobleces, ganchos, traslapes y amarres con alambre recocido Calibre 18.",
            "unidad": "kg",
            "cantidad": 2.24,
            "costoUnitario": 29.33,
            "tipo": "Subcontrato"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.1281,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "G140310-1005",
            "descripcion": "Concreto fc = 200 kg/cm2 para albañilería fabricado en obra con revolvedora, con tma = 19 mm, rn. Incluye: dosificación, mezclado en revolvedora, incorporación de agua, colado y curado superficial.",
            "unidad": "m3",
            "cantidad": 0.03,
            "costoUnitario": 3083.77,
            "tipo": "Subcontrato"
          },
          {
            "clave": "G910115-2030",
            "descripcion": "Acero de refuerzo en cimentacion y estructura, resistencia normal fy=2,530 kg/cm2, no. 2 (1/4\") de diametro; el precio unitario incluye: materiales, pruebas,traslapes, ganchos, elevacion, carga, acarreos, descargas y desperdicios, mano de obra y herramienta.",
            "unidad": "Ton",
            "cantidad": 0.00113,
            "costoUnitario": 43279.09,
            "tipo": "Subcontrato"
          }
        ],
        "children": []
      },
      {
        "clave": "G110120-1005",
        "descripcion": "Cimientos de mamposteria de piedra brasa asentada con mezcla cemento - calhidra - arena 1:1:6, incluye: acarreo material a 1a. estacion a 20.00 m. de distancia horizontal.",
        "unidad": "m3",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 185.4,
        "precioUnitario": 1710.83,
        "costoDirecto": 1710.83,
        "insumos": [
          {
            "clave": "103200-1140",
            "descripcion": "Piedra braza 7m3 viaje completo",
            "unidad": "m3",
            "cantidad": 1.05,
            "costoUnitario": 360,
            "tipo": "Material"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.4271,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "E140210-1530",
            "descripcion": "Mortero cemento - calhidra - arena 1 : 1 : 6",
            "unidad": "m3",
            "cantidad": 0.31,
            "costoUnitario": 2260.3,
            "tipo": "Flete"
          }
        ],
        "children": []
      },
      {
        "clave": "G970110-1010",
        "descripcion": "Excavación con retroexcavadora para cepa de 2.00 a 4.00 m. de profundidad en material tipo \"II\" seco zona A (Urbana). Incluye: corte, extracción de material, acarreo a pie de cepa, barreras de protección y señalización",
        "unidad": "m3",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 319.3,
        "precioUnitario": 24.46,
        "costoDirecto": 24.46,
        "insumos": [
          {
            "clave": "700100-1005",
            "descripcion": "Cinta polietileno p/advertencia de 800 mts.",
            "unidad": "Rollo",
            "cantidad": 0.005,
            "costoUnitario": 681.5,
            "tipo": "Material"
          },
          {
            "clave": "125100-1005",
            "descripcion": "Varilla de acero corrugada 3/8\" No. 3, marca Aceros San Luis",
            "unidad": "Ton",
            "cantidad": 0.00023,
            "costoUnitario": 19950,
            "tipo": "Material"
          },
          {
            "clave": "C990120-3015",
            "descripcion": "Retroexcavadora Cargador tracción 4 x 4  mca. Komatsu mod. 4WB146  potencia neta 86.00 HP  Cucharón frontal de 2355 mm. cap. 0.95 m3  profundidad de excavación estandar de 4875 mm. cabina Canopy Rops.",
            "unidad": "hr",
            "cantidad": 0.07,
            "costoUnitario": 235.12,
            "tipo": "Equipo"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "3",
    "descripcion": "Estructura",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 393670.15,
    "costoDirecto": 393670.15,
    "children": [
      {
        "clave": "G110135-1020",
        "descripcion": "Losa piso de 15 cm, a base de concreto fc = 200 kg/cm2, armada con varilla del No. 3 a cada 20 cm en ambos sentidos.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 250,
        "precioUnitario": 870.37,
        "costoDirecto": 870.37,
        "insumos": [
          {
            "clave": "F103130-4515",
            "descripcion": "Vaciado en forma manual de concreto en planta baja, con vibrado y curado, incluye : materiales, mano de obra y equipo.",
            "unidad": "m3",
            "cantidad": 0.15,
            "costoUnitario": 91.23,
            "tipo": "Flete"
          },
          {
            "clave": "A100140-1015",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, 2 ayudantes, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0634,
            "costoUnitario": 2028.69,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "A100105-3000",
            "descripcion": "Cuadrilla de fierreros. Incluye : fierrero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.089,
            "costoUnitario": 1154.13,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "A100105-1515",
            "descripcion": "Cuadrilla de peones. Incluye : 5 peones, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0397,
            "costoUnitario": 2655.74,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "G140300-1000",
            "descripcion": "Acero de refuerzo en albañilería del No. 3 (3/8), incluye: dimensionamiento, habilitado, armado, traslapes y desperdicios.",
            "unidad": "Ton",
            "cantidad": 0.01253,
            "costoUnitario": 22677.75,
            "tipo": "Subcontrato"
          },
          {
            "clave": "F103130-2230",
            "descripcion": "Concreto f¨c=200kg/cm2, resistencia normal, agregado maximo 20mm., fabricado en obra con revolvedora; incluye: acarreos a 1ra. estacion a 20.00m.",
            "unidad": "m3",
            "cantidad": 0.12,
            "costoUnitario": 1964.78,
            "tipo": "Flete"
          }
        ],
        "children": []
      },
      {
        "clave": "G140100-5005",
        "descripcion": "Castillo de 15 x 15 cm, concreto fc=200 kg/cm2 normal agreg. 3/4\", con armex 15x15-4 incluye: cimbra comun 2 caras, acarreo 1a. estacion a 20.00 m",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 69,
        "precioUnitario": 302.49,
        "costoDirecto": 302.49,
        "insumos": [
          {
            "clave": "125100-2005",
            "descripcion": "Alambre recocido Calibre 18",
            "unidad": "kg",
            "cantidad": 0.01,
            "costoUnitario": 37.5,
            "tipo": "Material"
          },
          {
            "clave": "125100-5040",
            "descripcion": "Armex en hoja 15 x 15-4, marca Gasa",
            "unidad": "m",
            "cantidad": 1.05,
            "costoUnitario": 32.5,
            "tipo": "Material"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.1281,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "G140310-1020",
            "descripcion": "Concreto fc=200kg/cm2 hecho con revolvedora en dalas castillos cejas y repisones seccion >0.02, r. n., tma. 20mm. (3/4\"), incluye: acarreos a 1a. estacion a 20m.",
            "unidad": "m3",
            "cantidad": 0.024,
            "costoUnitario": 3265.93,
            "tipo": "Subcontrato"
          }
        ],
        "children": []
      },
      {
        "clave": "G140105-2230",
        "descripcion": "Dala de liga, seccion 15 x 30 cm, concreto fc=200 kg/cm2, r.n. ag.max. 3/4\", reforzada con 4 varillas de 3/8\" de diametro (no.3) y estribos de 1/4\" de diametro (no.2) a cada 20 cm, cimbrado acabado comun, incluye: acarreo de los materiales a una 1a. estacion a 20.00 m. de distancia horizontal.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 206,
        "precioUnitario": 493.44,
        "costoDirecto": 493.44,
        "insumos": [
          {
            "clave": "125100-1005",
            "descripcion": "Varilla de acero corrugada 3/8\" No. 3, marca Aceros San Luis",
            "unidad": "Ton",
            "cantidad": 0.0023,
            "costoUnitario": 19950,
            "tipo": "Material"
          },
          {
            "clave": "125100-2005",
            "descripcion": "Alambre recocido Calibre 18",
            "unidad": "kg",
            "cantidad": 0.13,
            "costoUnitario": 37.5,
            "tipo": "Material"
          },
          {
            "clave": "125100-1065",
            "descripcion": "Varilla de acero corrugado de 1/4\" MS-60, marca Gasa",
            "unidad": "Ton",
            "cantidad": 0.0013,
            "costoUnitario": 27000,
            "tipo": "Material"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.171,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "G140310-1020",
            "descripcion": "Concreto fc=200kg/cm2 hecho con revolvedora en dalas castillos cejas y repisones seccion >0.02, r. n., tma. 20mm. (3/4\"), incluye: acarreos a 1a. estacion a 20m.",
            "unidad": "m3",
            "cantidad": 0.0473,
            "costoUnitario": 3265.93,
            "tipo": "Subcontrato"
          }
        ],
        "children": []
      },
      {
        "clave": "G140100-1895",
        "descripcion": "Castillo de 15 x 20 cm, fabricado de concreto fc = 200 kg/cm2, armado con 4V3 y E2 @ 25, utilizando cimbra de madera acabado comón a 2 caras. Incluye: armado, cimbra, lubricación, colado, retiro de cimbra y curado en las superficies expuestas.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 135,
        "precioUnitario": 396.72,
        "costoDirecto": 396.72,
        "insumos": [
          {
            "clave": "G140300-1010",
            "descripcion": "Acero de refuerzo del No. 3  (3/8) en albañilería. Incluye: dimensionamiento, habilitación, cortes, desperdicios, dobleces, ganchos, traslapes y amarres con alambre recocido Calibre 18.",
            "unidad": "kg",
            "cantidad": 2.24,
            "costoUnitario": 29.33,
            "tipo": "Subcontrato"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.1281,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "G140310-1005",
            "descripcion": "Concreto fc = 200 kg/cm2 para albañilería fabricado en obra con revolvedora, con tma = 19 mm, rn. Incluye: dosificación, mezclado en revolvedora, incorporación de agua, colado y curado superficial.",
            "unidad": "m3",
            "cantidad": 0.03,
            "costoUnitario": 3083.77,
            "tipo": "Subcontrato"
          },
          {
            "clave": "G910115-2030",
            "descripcion": "Acero de refuerzo en cimentacion y estructura, resistencia normal fy=2,530 kg/cm2, no. 2 (1/4\") de diametro; el precio unitario incluye: materiales, pruebas,traslapes, ganchos, elevacion, carga, acarreos, descargas y desperdicios, mano de obra y herramienta.",
            "unidad": "Ton",
            "cantidad": 0.00113,
            "costoUnitario": 43279.09,
            "tipo": "Subcontrato"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "4",
    "descripcion": "Albañileria",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 401004.09,
    "costoDirecto": 401004.09,
    "children": [
      {
        "clave": "G500140-1245",
        "descripcion": "Aplanado de 2 cm de yeso en plafones a una altura de 3 m máximo. Incluye: maestras, reventón y terminado con llana",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 243,
        "precioUnitario": 105.47,
        "costoDirecto": 105.47,
        "insumos": [
          {
            "clave": "E140210-3020",
            "descripcion": "Mortero con yeso y agua. Incluye: dosificación y mezcla.",
            "unidad": "m3",
            "cantidad": 0.021,
            "costoUnitario": 2040.33,
            "tipo": "Flete"
          },
          {
            "clave": "F990105-2510",
            "descripcion": "Andamio de caballetes formado por 2 caballetes de madera para alcanzar una altura de hasta 1.00m.,  de 10 a 20 usos y para utilizarse solo en         trabajosde albanileria y pintura en muros de      tabique.",
            "unidad": "pza",
            "cantidad": 0.0025,
            "costoUnitario": 356.09,
            "tipo": "Flete"
          },
          {
            "clave": "A100115-1000",
            "descripcion": "Cuadrilla de yeseros. Incluye : yesero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.05,
            "costoUnitario": 1234.51,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G500140-1000",
        "descripcion": "Aplanado de 2 cm de yeso en muros a una altura de 3 m máximo. Incluye: maestras, reventón y terminado con llana",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 286,
        "precioUnitario": 97.45,
        "costoDirecto": 97.45,
        "insumos": [
          {
            "clave": "130100-1000",
            "descripcion": "Barrote 1 1/2  x 4  x 8",
            "unidad": "pt",
            "cantidad": 0.12,
            "costoUnitario": 28.45,
            "tipo": "Material"
          },
          {
            "clave": "103260-1350",
            "descripcion": "Hilo de cáñamo (carrete 50 m )",
            "unidad": "pza",
            "cantidad": 0.0017,
            "costoUnitario": 24.13,
            "tipo": "Material"
          },
          {
            "clave": "E140210-3020",
            "descripcion": "Mortero con yeso y agua. Incluye: dosificación y mezcla.",
            "unidad": "m3",
            "cantidad": 0.021,
            "costoUnitario": 2040.33,
            "tipo": "Flete"
          },
          {
            "clave": "A100115-1000",
            "descripcion": "Cuadrilla de yeseros. Incluye : yesero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.04143,
            "costoUnitario": 1234.51,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G500140-2010",
        "descripcion": "Aplanado fino de 1 cm en muros a base de mortero   cemento arena proporción 1:3. Incluye :   materiales, mano de obra y herramienta.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 0,
        "precioUnitario": 223.51,
        "costoDirecto": 223.51,
        "insumos": [
          {
            "clave": "103247-1035",
            "descripcion": "Agua",
            "unidad": "m3",
            "cantidad": 0.03,
            "costoUnitario": 160,
            "tipo": "Material"
          },
          {
            "clave": "E140210-1175",
            "descripcion": "Mortero con cemento y arena en proporción 1:3, incluye dosificación y mezcla de materiales.",
            "unidad": "m3",
            "cantidad": 0.011,
            "costoUnitario": 2645.03,
            "tipo": "Flete"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.12811,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G500140-2025",
        "descripcion": "Aplanado rugoso de 2 cm en muros a base de mortero cemento y arena proporción 1:3, a cualquier altura. Incluye: aplicación de Festerbond para mejorar adherencia.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 0,
        "precioUnitario": 327.83,
        "costoDirecto": 327.83,
        "insumos": [
          {
            "clave": "103247-1040",
            "descripcion": "Agua",
            "unidad": "L",
            "cantidad": 2.5,
            "costoUnitario": 0.16,
            "tipo": "Material"
          },
          {
            "clave": "G500140-3555",
            "descripcion": "Festerbond en muros para mejorar la adherencia del acabado. Incluye preparación de la superficie.",
            "unidad": "m2",
            "cantidad": 1,
            "costoUnitario": 55.22,
            "tipo": "Subcontrato"
          },
          {
            "clave": "E140210-1155",
            "descripcion": "Mortero cemento, arena proporción 1:3. Incluye:  dosificación con agua , cemento CPC 30 R (cemento portland compuesto), marca Tolteca y mezclado.",
            "unidad": "m3",
            "cantidad": 0.0208,
            "costoUnitario": 2556.33,
            "tipo": "Flete"
          },
          {
            "clave": "F990105-3000",
            "descripcion": "Hamaca de 60 x 150 cm a base de bastidor perfil OR y lámina antiderrapante Calibre 12. Incluye: barandal, poleas, cable y par de malacates para izaje lateral.",
            "unidad": "pza",
            "cantidad": 0.00226,
            "costoUnitario": 13014.71,
            "tipo": "Flete"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.12812,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G500145-1500",
        "descripcion": "Emboquillado de 15 cm con aplanado fino de 1 cm en muros a base de mortero cemento y arena proporción 1:3, a cualquier altura. Incluye: aplicación de Festerbond para mejorar adherencia.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 591.5,
        "precioUnitario": 119.91,
        "costoDirecto": 119.91,
        "insumos": [
          {
            "clave": "103247-1040",
            "descripcion": "Agua",
            "unidad": "L",
            "cantidad": 0.3,
            "costoUnitario": 0.16,
            "tipo": "Material"
          },
          {
            "clave": "G500140-3555",
            "descripcion": "Festerbond en muros para mejorar la adherencia del acabado. Incluye preparación de la superficie.",
            "unidad": "m2",
            "cantidad": 0.15,
            "costoUnitario": 55.22,
            "tipo": "Subcontrato"
          },
          {
            "clave": "E140210-1155",
            "descripcion": "Mortero cemento, arena proporción 1:3. Incluye:  dosificación con agua , cemento CPC 30 R (cemento portland compuesto), marca Tolteca y mezclado.",
            "unidad": "m3",
            "cantidad": 0.01575,
            "costoUnitario": 2556.33,
            "tipo": "Flete"
          },
          {
            "clave": "F990105-3000",
            "descripcion": "Hamaca de 60 x 150 cm a base de bastidor perfil OR y lámina antiderrapante Calibre 12. Incluye: barandal, poleas, cable y par de malacates para izaje lateral.",
            "unidad": "pza",
            "cantidad": 0.00059,
            "costoUnitario": 13014.71,
            "tipo": "Flete"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.043,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G140110-1060",
        "descripcion": "Firme 10cm espesor concreto fc=150kg/cm2 resistencia normal, agregado maximo de 20mm., premezclado revenimiento 10cm., incluye: acarreo a 1a estacion a 20m.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 260,
        "precioUnitario": 440.1,
        "costoDirecto": 440.1,
        "insumos": [
          {
            "clave": "103247-1035",
            "descripcion": "Agua",
            "unidad": "m3",
            "cantidad": 0.0706,
            "costoUnitario": 160,
            "tipo": "Material"
          },
          {
            "clave": "F103130-2160",
            "descripcion": "Concreto fc=150 kg/cm2, r.n., tma 19mm (3/4\"), hecho en obra c/revolvedora",
            "unidad": "m3",
            "cantidad": 0.105,
            "costoUnitario": 1893.21,
            "tipo": "Flete"
          },
          {
            "clave": "G115100-2000",
            "descripcion": "Malla electrosoldada 6x6-10/10 en firmes, pisos o losas. Incluye: dimensionamiento, desenrrollado, extendido, cortes, traslapes sujetos con alambre recocido Calibre 18 con un mínimo de un cuadro, silletas, alineación y sujección durante el colado.",
            "unidad": "m2",
            "cantidad": 1,
            "costoUnitario": 37.06,
            "tipo": "Subcontrato"
          },
          {
            "clave": "A100105-2015",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, 2 ayudantes, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.09511,
            "costoUnitario": 2028.69,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G145115-2410",
        "descripcion": "Muro de Block de hormigon liso color  de 12x20x40 cm  marca Industrial Bloquera Mexicana, asentado con mortero cemento - arena 1:4, con refuerzo horizontal tipo escalerilla a cada 2 hiladas, juntas de 1 cm. de espesor, acabado comun, hasta una altura de 3.50 m., incluye: acarreo de los materiales a 1a. estacion a 20.0 m. de distancia horizontal.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 158.36,
        "precioUnitario": 364.91,
        "costoDirecto": 364.91,
        "insumos": [
          {
            "clave": "125100-3005",
            "descripcion": "Escalerilla de 10 cms. para refuerzo en muro, marca Deacero",
            "unidad": "tmo/3m",
            "cantidad": 0.905,
            "costoUnitario": 15,
            "tipo": "Material"
          },
          {
            "clave": "170100-1000",
            "descripcion": "Andamio tubular de 2 m, con ruedas, plataforma y barras, marca Atlas",
            "unidad": "r/d",
            "cantidad": 0.08,
            "costoUnitario": 13.33,
            "tipo": "Material"
          },
          {
            "clave": "145115-2410",
            "descripcion": "Block de hormigon liso color  de 12x20x40 cm  marca Industrial Bloquera Mexicana.",
            "unidad": "pza",
            "cantidad": 13,
            "costoUnitario": 10.12,
            "tipo": "Material"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.12812,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "E140210-1005",
            "descripcion": "Mortero cemento - arena 1:4",
            "unidad": "m3",
            "cantidad": 0.012,
            "costoUnitario": 2422.32,
            "tipo": "Flete"
          }
        ],
        "children": []
      },
      {
        "clave": "G145115-2410",
        "descripcion": "Muro de Block de hormigon liso color  de 12x20x40 cm  marca Industrial Bloquera Mexicana, asentado con mortero cemento - arena 1:4, con refuerzo horizontal tipo escalerilla a cada 2 hiladas, juntas de 1 cm. de espesor, acabado comun, hasta una altura de 3.50 m., incluye: acarreo de los materiales a 1a. estacion a 20.0 m. de distancia horizontal.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 286,
        "precioUnitario": 364.91,
        "costoDirecto": 364.91,
        "insumos": [
          {
            "clave": "125100-3005",
            "descripcion": "Escalerilla de 10 cms. para refuerzo en muro, marca Deacero",
            "unidad": "tmo/3m",
            "cantidad": 0.905,
            "costoUnitario": 15,
            "tipo": "Material"
          },
          {
            "clave": "170100-1000",
            "descripcion": "Andamio tubular de 2 m, con ruedas, plataforma y barras, marca Atlas",
            "unidad": "r/d",
            "cantidad": 0.08,
            "costoUnitario": 13.33,
            "tipo": "Material"
          },
          {
            "clave": "145115-2410",
            "descripcion": "Block de hormigon liso color  de 12x20x40 cm  marca Industrial Bloquera Mexicana.",
            "unidad": "pza",
            "cantidad": 13,
            "costoUnitario": 10.12,
            "tipo": "Material"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.12812,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "E140210-1005",
            "descripcion": "Mortero cemento - arena 1:4",
            "unidad": "m3",
            "cantidad": 0.012,
            "costoUnitario": 2422.32,
            "tipo": "Flete"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "5",
    "descripcion": "Instalacion Sanitaria",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 32306.86,
    "costoDirecto": 32306.86,
    "children": [
      {
        "clave": "G250100-2061",
        "descripcion": "Codo PVC-Sc sanitario cementar de 45°x 50 mm (2) Lieresa, marca Tubos Flexibles . Incluye: limpieza y conexión cementada a tuberia",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 7,
        "precioUnitario": 37.97,
        "costoDirecto": 37.97,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.001,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "250100-2120",
            "descripcion": "Codo 45º pvc sanitario de 50 mm (2\") BI cementar, marca Amanco",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 10,
            "tipo": "Material"
          },
          {
            "clave": "200115-9940",
            "descripcion": "Limpiador de PVC, lata de 480 ml",
            "unidad": "pza",
            "cantidad": 0.1666,
            "costoUnitario": 19.84,
            "tipo": "Material"
          },
          {
            "clave": "200115-9915",
            "descripcion": "Cemento para pvc sanitario lata de 480 ml, marca Amanco",
            "unidad": "pza",
            "cantidad": 0.0333,
            "costoUnitario": 276,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0104,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G250100-9076",
        "descripcion": "Codo 90° de pvc sanitaria de 2\", marca Cresco, incluye: dimensionamiento, alineación y fijación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 19,
        "precioUnitario": 42.46,
        "costoDirecto": 42.46,
        "insumos": [
          {
            "clave": "200115-9915",
            "descripcion": "Cemento para pvc sanitario lata de 480 ml, marca Amanco",
            "unidad": "pza",
            "cantidad": 0.01,
            "costoUnitario": 276,
            "tipo": "Material"
          },
          {
            "clave": "200115-9940",
            "descripcion": "Limpiador de PVC, lata de 480 ml",
            "unidad": "pza",
            "cantidad": 0.005,
            "costoUnitario": 19.84,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.02,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "250100-9076",
            "descripcion": "Codo 90° de PVC sanitaria de 2\", marca Cresco",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 10,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G250100-9086",
        "descripcion": "Cople de pvc sanitaria de 2\", marca Cresco, incluye: dimensionamiento, alineación y fijación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 0,
        "precioUnitario": 40.46,
        "costoDirecto": 40.46,
        "insumos": [
          {
            "clave": "200115-9915",
            "descripcion": "Cemento para pvc sanitario lata de 480 ml, marca Amanco",
            "unidad": "pza",
            "cantidad": 0.01,
            "costoUnitario": 276,
            "tipo": "Material"
          },
          {
            "clave": "200115-9940",
            "descripcion": "Limpiador de PVC, lata de 480 ml",
            "unidad": "pza",
            "cantidad": 0.005,
            "costoUnitario": 19.84,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.02,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "250100-9086",
            "descripcion": "Cople de PVC sanitaria de 2\", marca Cresco",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 8,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G250100-4045",
        "descripcion": "Ye sencilla PVC-Sa sanitario anger de 50 x 50 mm (2 x 2), marca Tubos Flexibles . Incluye: limpieza y conexión a tuberia",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 2,
        "precioUnitario": 26.71,
        "costoDirecto": 26.71,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.001,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "250100-4150",
            "descripcion": "Yee sencilla pvc sanitaria de 50 x 50 mm (2\" x 2\") cementar, marca Amanco",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 11,
            "tipo": "Material"
          },
          {
            "clave": "200115-9971",
            "descripcion": "Lubricante para PVC de 0.500 kg, marca Rexolit",
            "unidad": "pza",
            "cantidad": 0.006,
            "costoUnitario": 39.87,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0104,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200115-1055",
        "descripcion": "Tubo PVC-Ha hidraulico SI de 50 mm ( 2\" ) RD 32.5, marca Amanco. Incluye: cortes y fijacion",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 28,
        "precioUnitario": 29.76,
        "costoDirecto": 29.76,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0005,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200115-1100",
            "descripcion": "Tubo pvc hidráulico SI de 50 mm (2\") RD 32.5 BI con campana, marca Amanco",
            "unidad": "m",
            "cantidad": 1,
            "costoUnitario": 22,
            "tipo": "Material"
          },
          {
            "clave": "200115-9971",
            "descripcion": "Lubricante para PVC de 0.500 kg, marca Rexolit",
            "unidad": "pza",
            "cantidad": 0.0005,
            "costoUnitario": 39.87,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0052,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G250100-9116",
        "descripcion": "Coladera universal de 4\" x 3\" x  2\", marca Cresco, incluye: dimensionamiento, alineación y fijación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 4,
        "precioUnitario": 119,
        "costoDirecto": 119,
        "insumos": [
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.05,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "250100-9116",
            "descripcion": "Coladera universal de 4\" x 3\" x  2\", marca Cresco",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 45,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G250100-2071",
        "descripcion": "Codo PVC-Sc sanitario cementar de 45°x 100 mm (4) Lieresa, marca Tubos Flexibles . Incluye: limpieza y conexión cementada a tuberia",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 7,
        "precioUnitario": 86.26,
        "costoDirecto": 86.26,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.002,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "250100-2130",
            "descripcion": "Codo 45º pvc sanitario de 110mm (4\") BI cementar, marca Amanco",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 29,
            "tipo": "Material"
          },
          {
            "clave": "200115-9940",
            "descripcion": "Limpiador de PVC, lata de 480 ml",
            "unidad": "pza",
            "cantidad": 0.4,
            "costoUnitario": 19.84,
            "tipo": "Material"
          },
          {
            "clave": "200115-9915",
            "descripcion": "Cemento para pvc sanitario lata de 480 ml, marca Amanco",
            "unidad": "pza",
            "cantidad": 0.0666,
            "costoUnitario": 276,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0208,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G250100-9080",
        "descripcion": "Codo 90° de pvc sanitaria de 4\", marca Cresco, incluye: dimensionamiento, alineación y fijación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 6,
        "precioUnitario": 84.36,
        "costoDirecto": 84.36,
        "insumos": [
          {
            "clave": "200115-9915",
            "descripcion": "Cemento para pvc sanitario lata de 480 ml, marca Amanco",
            "unidad": "pza",
            "cantidad": 0.0125,
            "costoUnitario": 276,
            "tipo": "Material"
          },
          {
            "clave": "200115-9940",
            "descripcion": "Limpiador de PVC, lata de 480 ml",
            "unidad": "pza",
            "cantidad": 0.0055,
            "costoUnitario": 19.84,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.035,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "250100-9080",
            "descripcion": "Codo 90° de PVC sanitaria de 4\", marca Cresco",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 29,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G250100-9090",
        "descripcion": "Cople de pvc sanitaria de 4\", marca Cresco, incluye: dimensionamiento, alineación y fijación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 0,
        "precioUnitario": 75.36,
        "costoDirecto": 75.36,
        "insumos": [
          {
            "clave": "200115-9915",
            "descripcion": "Cemento para pvc sanitario lata de 480 ml, marca Amanco",
            "unidad": "pza",
            "cantidad": 0.0125,
            "costoUnitario": 276,
            "tipo": "Material"
          },
          {
            "clave": "200115-9940",
            "descripcion": "Limpiador de PVC, lata de 480 ml",
            "unidad": "pza",
            "cantidad": 0.0055,
            "costoUnitario": 19.84,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.035,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "250100-9090",
            "descripcion": "Cople de PVC sanitaria de 4\", marca Cresco",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 20,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G250100-4550",
        "descripcion": "Reduccion excentrica PVC-Sa sanitario anger de 100 x 50 mm (4 x 2), marca Tubos Flexibles . Incluye: limpieza y conexión a tuberia",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 6,
        "precioUnitario": 34.06,
        "costoDirecto": 34.06,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.005,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "250100-4556",
            "descripcion": "Reducción pvc sanitaria de 110 x 50 mm (4\" x 2\") anger, marca Rexolit",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 25.86,
            "tipo": "Material"
          },
          {
            "clave": "200115-9971",
            "descripcion": "Lubricante para PVC de 0.500 kg, marca Rexolit",
            "unidad": "pza",
            "cantidad": 0.003,
            "costoUnitario": 39.87,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0052,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G250100-4070",
        "descripcion": "Ye sencilla PVC-Sa sanitario anger de 100 x 100 mm (4 x 4), marca Tubos Flexibles . Incluye: limpieza y conexión a tuberia",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 9,
        "precioUnitario": 76.83,
        "costoDirecto": 76.83,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.002,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "250100-4120",
            "descripcion": "Yee sencilla pvc sanitaria de 110 x 110 mm (4\"x 4\") cementar, marca Amanco",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 45,
            "tipo": "Material"
          },
          {
            "clave": "200115-9971",
            "descripcion": "Lubricante para PVC de 0.500 kg, marca Rexolit",
            "unidad": "pza",
            "cantidad": 0.0222,
            "costoUnitario": 39.87,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0208,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200115-1040",
        "descripcion": "Tubo PVC-Ha hidraulico SI de 100 mm ( 4\" ) RD 26, marca Amanco. Incluye: cortes y fijacion",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 25,
        "precioUnitario": 54.05,
        "costoDirecto": 54.05,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.001,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200115-1080",
            "descripcion": "Tubo pvc hidráulico SI de 100 mm (4\") RD 26 BI con campana, marca Amanco",
            "unidad": "m",
            "cantidad": 1,
            "costoUnitario": 38.5,
            "tipo": "Material"
          },
          {
            "clave": "200115-9971",
            "descripcion": "Lubricante para PVC de 0.500 kg, marca Rexolit",
            "unidad": "pza",
            "cantidad": 0.0019,
            "costoUnitario": 39.87,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0104,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200115-1045",
        "descripcion": "Tubo PVC-Ha hidraulico SI de 150 mm ( 6\" ) RD 26, marca Amanco. Incluye: cortes y fijacion",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 42,
        "precioUnitario": 134.76,
        "costoDirecto": 134.76,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0015,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200115-1085",
            "descripcion": "Tubo pvc hidráulico SI de 150 mm (6\") RD 26 BI con campana, marca Amanco",
            "unidad": "m",
            "cantidad": 1,
            "costoUnitario": 106,
            "tipo": "Material"
          },
          {
            "clave": "200115-9971",
            "descripcion": "Lubricante para PVC de 0.500 kg, marca Rexolit",
            "unidad": "pza",
            "cantidad": 0.0041,
            "costoUnitario": 39.87,
            "tipo": "Material"
          },
          {
            "clave": "A100110-1510",
            "descripcion": "Cuadrilla de tuberos: Incluye: 1 tubero + 3 ayudantes de tubero + 0.10 cabo de oficiales y herramienta menor",
            "unidad": "Jor",
            "cantidad": 0.014,
            "costoUnitario": 2035.11,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G140150-3090",
        "descripcion": "Ranurado en muro de tabique para alojar tuberia de 50 mm (2\"), incluye trazo y limpieza.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 6,
        "precioUnitario": 88.8,
        "costoDirecto": 88.8,
        "insumos": [
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.06,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G105112-1385",
        "descripcion": "Excavacion a mano material tipo \"II\" seco zona \"A\" cepas hasta 2 mts. incluye: afine de taludes, fondo y apile del material a un lado de la cepa.",
        "unidad": "m3",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 9,
        "precioUnitario": 196.52,
        "costoDirecto": 196.52,
        "insumos": [
          {
            "clave": "A100105-1500",
            "descripcion": "Cuadrilla de peones. Incluye : peón, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.37,
            "costoUnitario": 531.14,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G140115-1010",
        "descripcion": "Registro sanitario de 40 x 60 x 60 cm, con plantilla de concreto fc = 150 kg/cm2, muro de tabique rojo recocido asentado con mortero cemento arena proporción 1:3, aplanado aparente pulido en el interior, tapa de 7.5 cm de concreto fc = 100 kg/cm2, marco de LI 76 x 5 y contramarco de LI 89 x 5, anclas de solera de 6 x 25 x 75 cm @ 40 cm, agarradera de 15 x15 cm a base de redondo de acero de 19 mm, incluye : excavación y relleno.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 6,
        "precioUnitario": 1102.16,
        "costoDirecto": 1102.16,
        "insumos": [
          {
            "clave": "250200-1000",
            "descripcion": "Marco y contramarco de 40x60 cms angulo 1 1/4\" (r-06) para registro",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 230,
            "tipo": "Material"
          },
          {
            "clave": "F103130-2155",
            "descripcion": "Concreto fc=150kg/cm2, resistencia normal, agreg. max. 20mm., fabricado en obra con revolvedora; incluye: acarreos a 1ra. estacion a 20.00m.",
            "unidad": "m3",
            "cantidad": 0.018,
            "costoUnitario": 1969.74,
            "tipo": "Flete"
          },
          {
            "clave": "G500140-2015",
            "descripcion": "Aplanado fino en muros a regla, nivel y plomo, con mezcla calhidra-arena 1:4, de 2.5 cm. de espesor promedio, hasta una altura maxima de 3.00 m., incluye: pulido con plana, acarreo de los materiales a una 1a. estacion a 20.00 m. de distancia horizontal.",
            "unidad": "m2",
            "cantidad": 0.96,
            "costoUnitario": 158.85,
            "tipo": "Subcontrato"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.15,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "G145105-1130",
            "descripcion": "Muro de tabique de barro rojo recocido de 5 x 11.5 x 23 cm., de 11.5 cm. de espesor, asentado con mezcla mortero plasto-cem-arena gr. 1:5, juntas de 1.5 cm. de espesor, acabado comun, hasta una altura de 3.50 m., incluye: acarreo de los materiales a 1a. estacion a 20.0 m. de distancia horizontal.",
            "unidad": "m2",
            "cantidad": 0.96,
            "costoUnitario": 403.07,
            "tipo": "Subcontrato"
          },
          {
            "clave": "G110115-1030",
            "descripcion": "Plantilla de concreto fc=100 kg/cm2 de 5 cm., incluye: compactacion del fondo y curado.",
            "unidad": "m2",
            "cantidad": 0.55,
            "costoUnitario": 136.8,
            "tipo": "Subcontrato"
          }
        ],
        "children": []
      },
      {
        "clave": "G550110-8194",
        "descripcion": "Sanitario alargado dolphin AL. descarga 4.8L, color. Blanco,  mod. 58430-022, marca Orión (incluye taza y tanque), Incluye: instalación y pruebas.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 3,
        "precioUnitario": 3980.07,
        "costoDirecto": 3980.07,
        "insumos": [
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 1,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "550110-8194",
            "descripcion": "Sanitario alargado dolphin AL. descarga 4.8L, color. Blanco,  mod. 58430-022, marca Orión (incluye taza y tanque)",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 2500,
            "tipo": "Material"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "6",
    "descripcion": "Instalacion Hidraulica",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 113791.05,
    "costoDirecto": 113791.05,
    "children": [
      {
        "clave": "6.1",
        "descripcion": "Cisterna",
        "unidad": "lote",
        "nivel": 2,
        "tipo": "Partida",
        "cantidad": 1,
        "precioUnitario": 30531.04,
        "costoDirecto": 30531.04,
        "expanded": true,
        "children": [
          {
            "clave": "G550100-4520",
            "descripcion": "Cisterna para 5,000 l., marca Rotoplas con equipo integrado, incluye: descargo, acomodo, fijación y conexiones a red hidráulica, herramienta y mano de obra.",
            "unidad": "pza",
            "nivel": 3,
            "tipo": "Concepto",
            "cantidad": 1,
            "precioUnitario": 17521.15,
            "costoDirecto": 17521.15,
            "expanded": true,
            "insumos": [
              {
                "clave": "103100-4520",
                "descripcion": "Cisterna Rotoplas 5,000 lts con equipo integrado, filtro y bomba",
                "unidad": "pza",
                "cantidad": 1,
                "costoUnitario": 16340,
                "tipo": "Material"
              },
              {
                "clave": "A100105-2015",
                "descripcion": "Cuadrilla de plomería y montaje. Incluye: plomero, ayudante y herramienta",
                "unidad": "Jor",
                "cantidad": 0.58227,
                "costoUnitario": 2028.69,
                "tipo": "Mano de Obra"
              }
            ],
            "children": []
          },
          {
            "clave": "G140110-1060",
            "descripcion": "Firme 10cm espesor concreto fc=150kg/cm2 resistencia normal, agregado maximo de 20mm., premezclado",
            "unidad": "m2",
            "nivel": 3,
            "tipo": "Concepto",
            "cantidad": 13,
            "precioUnitario": 440.1,
            "costoDirecto": 440.1,
            "expanded": true,
            "insumos": [
              { "clave": "103247-1035", "descripcion": "Agua", "unidad": "m3", "cantidad": 0.0706, "costoUnitario": 160, "tipo": "Material" },
              { "clave": "F103130-2160", "descripcion": "Concreto fc=150 kg/cm2, r.n., tma 19mm (3/4\"), hecho en obra c/revolvedora", "unidad": "m3", "cantidad": 0.105, "costoUnitario": 1893.21, "tipo": "Flete" },
              { "clave": "G115100-2000", "descripcion": "Malla electrosoldada 6x6-10/10 en firmes, pisos o losas", "unidad": "m2", "cantidad": 1, "costoUnitario": 37.06, "tipo": "Subcontrato" },
              { "clave": "A100105-2015", "descripcion": "Cuadrilla de albañiles. Incluye : albañil, 2 ayudantes, cabo y herramienta.", "unidad": "Jor", "cantidad": 0.09511, "costoUnitario": 2028.69, "tipo": "Mano de Obra" }
            ],
            "children": []
          },
          {
            "clave": "G140100-5005",
            "descripcion": "Castillo de 15 x 15 cm, concreto fc=200 kg/cm2 normal agreg. 3/4\", con armex 15x15-4 incluye: cimbra comun 2",
            "unidad": "m",
            "nivel": 3,
            "tipo": "Concepto",
            "cantidad": 6,
            "precioUnitario": 302.49,
            "costoDirecto": 302.49,
            "expanded": true,
            "insumos": [
              { "clave": "125100-2005", "descripcion": "Alambre recocido Calibre 18", "unidad": "kg", "cantidad": 0.01, "costoUnitario": 37.5, "tipo": "Material" },
              { "clave": "125100-5040", "descripcion": "Armex en hoja 15 x 15-4, marca Gasa", "unidad": "m", "cantidad": 1.05, "costoUnitario": 32.5, "tipo": "Material" },
              { "clave": "A100105-2000", "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.", "unidad": "Jor", "cantidad": 0.1281, "costoUnitario": 1480.07, "tipo": "Mano de Obra" },
              { "clave": "G140310-1020", "descripcion": "Concreto fc=200kg/cm2 hecho con revolvedora en dalas castillos", "unidad": "m3", "cantidad": 0.024, "costoUnitario": 3265.93, "tipo": "Subcontrato" }
            ],
            "children": []
          },
          {
            "clave": "G145115-2410",
            "descripcion": "Muro de Block de hormigon liso color de 12x20x40 cm marca Industrial Bloquera Mexicana, asentado con mortero",
            "unidad": "m2",
            "nivel": 3,
            "tipo": "Concepto",
            "cantidad": 15,
            "precioUnitario": 364.91,
            "costoDirecto": 364.91,
            "expanded": true,
            "insumos": [
              { "clave": "125100-3005", "descripcion": "Escalerilla de 10 cms. para refuerzo en muro, marca Deacero", "unidad": "tmo/3m", "cantidad": 0.905, "costoUnitario": 15, "tipo": "Material" },
              { "clave": "170100-1000", "descripcion": "Andamio tubular de 2 m, con ruedas, plataforma y barras, marca Atlas", "unidad": "r/d", "cantidad": 0.08, "costoUnitario": 13.33, "tipo": "Material" },
              { "clave": "145115-2410", "descripcion": "Block de hormigon liso color de 12x20x40 cm marca Industrial Bloquera Mexicana.", "unidad": "pza", "cantidad": 13, "costoUnitario": 10.12, "tipo": "Material" },
              { "clave": "A100105-2000", "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.", "unidad": "Jor", "cantidad": 0.12812, "costoUnitario": 1480.07, "tipo": "Mano de Obra" },
              { "clave": "E140210-1005", "descripcion": "Mortero cemento - arena 1:4", "unidad": "m3", "cantidad": 0.012, "costoUnitario": 2422.32, "tipo": "Flete" }
            ],
            "children": []
          }
        ]
      },
      {
        "clave": "6.2",
        "descripcion": "Tinaco",
        "unidad": "lote",
        "nivel": 2,
        "tipo": "Partida",
        "cantidad": 1,
        "precioUnitario": 8992.36,
        "costoDirecto": 8992.36,
        "expanded": true,
        "children": [
          {
            "clave": "G550100-4001",
            "descripcion": "Tinaco Smar 1500 lts. Bicapa filtro y acc. rotoplas, incluye: elevación, colocación, fijación, armado de válvulas y flotador, materiales, mano de obra y herramienta.",
            "unidad": "pza",
            "nivel": 3,
            "tipo": "Concepto",
            "cantidad": 2,
            "precioUnitario": 2633.26,
            "costoDirecto": 2633.26,
            "expanded": true,
            "insumos": [
              {
                "clave": "103100-4001",
                "descripcion": "Tinaco Rotoplas 1,500 lts. bicapa con filtro y accesorios",
                "unidad": "pza",
                "cantidad": 1,
                "costoUnitario": 2350,
                "tipo": "Material"
              },
              {
                "clave": "A100105-2000",
                "descripcion": "Cuadrilla de plomería y colocación. Incluye: plomero, ayudante y herramienta",
                "unidad": "Jor",
                "cantidad": 0.19138,
                "costoUnitario": 1480.07,
                "tipo": "Mano de Obra"
              }
            ],
            "children": []
          },
          {
            "clave": "G140110-1060",
            "descripcion": "Firme 10cm espesor concreto fc=150kg/cm2 resistencia normal, agregado maximo de 20mm., premezclado",
            "unidad": "m2",
            "nivel": 3,
            "tipo": "Concepto",
            "cantidad": 2.4,
            "precioUnitario": 440.1,
            "costoDirecto": 440.1,
            "expanded": true,
            "insumos": [
              { "clave": "103247-1035", "descripcion": "Agua", "unidad": "m3", "cantidad": 0.0706, "costoUnitario": 160, "tipo": "Material" },
              { "clave": "F103130-2160", "descripcion": "Concreto fc=150 kg/cm2, r.n., tma 19mm (3/4\"), hecho en obra c/revolvedora", "unidad": "m3", "cantidad": 0.105, "costoUnitario": 1893.21, "tipo": "Flete" },
              { "clave": "G115100-2000", "descripcion": "Malla electrosoldada 6x6-10/10 en firmes, pisos o losas", "unidad": "m2", "cantidad": 1, "costoUnitario": 37.06, "tipo": "Subcontrato" },
              { "clave": "A100105-2015", "descripcion": "Cuadrilla de albañiles. Incluye : albañil, 2 ayudantes, cabo y herramienta.", "unidad": "Jor", "cantidad": 0.09511, "costoUnitario": 2028.69, "tipo": "Mano de Obra" }
            ],
            "children": []
          },
          {
            "clave": "G140100-5005",
            "descripcion": "Castillo de 15 x 15 cm, concreto fc=200 kg/cm2 normal agreg. 3/4\", con armex 15x15-4 incluye: cimbra comun 2",
            "unidad": "m",
            "nivel": 3,
            "tipo": "Concepto",
            "cantidad": 4,
            "precioUnitario": 302.49,
            "costoDirecto": 302.49,
            "expanded": true,
            "insumos": [
              { "clave": "125100-2005", "descripcion": "Alambre recocido Calibre 18", "unidad": "kg", "cantidad": 0.01, "costoUnitario": 37.5, "tipo": "Material" },
              { "clave": "125100-5040", "descripcion": "Armex en hoja 15 x 15-4, marca Gasa", "unidad": "m", "cantidad": 1.05, "costoUnitario": 32.5, "tipo": "Material" },
              { "clave": "A100105-2000", "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.", "unidad": "Jor", "cantidad": 0.1281, "costoUnitario": 1480.07, "tipo": "Mano de Obra" },
              { "clave": "G140310-1020", "descripcion": "Concreto fc=200kg/cm2 hecho con revolvedora en dalas castillos", "unidad": "m3", "cantidad": 0.024, "costoUnitario": 3265.93, "tipo": "Subcontrato" }
            ],
            "children": []
          },
          {
            "clave": "G145115-2410",
            "descripcion": "Muro de Block de hormigon liso color de 12x20x40 cm marca Industrial Bloquera Mexicana, asentado con mortero",
            "unidad": "m2",
            "nivel": 3,
            "tipo": "Concepto",
            "cantidad": 4,
            "precioUnitario": 364.91,
            "costoDirecto": 364.91,
            "expanded": true,
            "insumos": [
              { "clave": "125100-3005", "descripcion": "Escalerilla de 10 cms. para refuerzo en muro, marca Deacero", "unidad": "tmo/3m", "cantidad": 0.905, "costoUnitario": 15, "tipo": "Material" },
              { "clave": "170100-1000", "descripcion": "Andamio tubular de 2 m, con ruedas, plataforma y barras, marca Atlas", "unidad": "r/d", "cantidad": 0.08, "costoUnitario": 13.33, "tipo": "Material" },
              { "clave": "145115-2410", "descripcion": "Block de hormigon liso color de 12x20x40 cm marca Industrial Bloquera Mexicana.", "unidad": "pza", "cantidad": 13, "costoUnitario": 10.12, "tipo": "Material" },
              { "clave": "A100105-2000", "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.", "unidad": "Jor", "cantidad": 0.12812, "costoUnitario": 1480.07, "tipo": "Mano de Obra" },
              { "clave": "E140210-1005", "descripcion": "Mortero cemento - arena 1:4", "unidad": "m3", "cantidad": 0.012, "costoUnitario": 2422.32, "tipo": "Flete" }
            ],
            "children": []
          }
        ]
      },
      {
        "clave": "TEMP*7",
        "descripcion": "Llave angular 1/2\"",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 15,
        "precioUnitario": 25.9,
        "costoDirecto": 25.9,
        "insumos": [
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0175,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "LLAVE ANGULAR 01",
            "descripcion": "Llave angular 01",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 0,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G550110-7145",
        "descripcion": "Llave nariz de 13 mm de bronce incluye instalación",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 3,
        "precioUnitario": 184.99,
        "costoDirecto": 184.99,
        "insumos": [
          {
            "clave": "550110-2515",
            "descripcion": "Llave manguera 13 mm (1/2) bronce marca Urrea",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 159.09,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0175,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-5515",
        "descripcion": "Cople PP-R polipropileno hidraulico 50 mm  unido por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 6,
        "precioUnitario": 88.82,
        "costoDirecto": 88.82,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.026,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5795",
            "descripcion": "Cople de PPR de 50 (38)mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 45,
            "tipo": "Material"
          },
          {
            "clave": "550100-1160",
            "descripcion": "Dados macho-hembra de PPR de 50 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0003,
            "costoUnitario": 341.04,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.00166,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.022,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.026,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "TEMP*9",
        "descripcion": "Te 13 mm polipropileno hidraulico unido  por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 22,
        "precioUnitario": 31.49,
        "costoDirecto": 31.49,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0045,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "HID-TEE-01",
            "descripcion": "Tee roscable macho de PPR de 13 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 6,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0156,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0054,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0011,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "550100-1140",
            "descripcion": "Dados macho-hembra de PPR de 20 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0005,
            "costoUnitario": 85.27,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-7000",
        "descripcion": "Tapon 20 mm polipropileno hidraulico unido  por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 22,
        "precioUnitario": 36.85,
        "costoDirecto": 36.85,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.003,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5910",
            "descripcion": "Tapón de PPR de 13 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 20,
            "tipo": "Material"
          },
          {
            "clave": "550100-1140",
            "descripcion": "Dados macho-hembra de PPR de 20 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0002,
            "costoUnitario": 85.27,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.00067,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0025,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0104,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-6040",
        "descripcion": "Codo PP-R polipropileno hidraulico  90°  r/int. 20 mm x 1/2 unido por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 4,
        "precioUnitario": 58.86,
        "costoDirecto": 58.86,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.003,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5605",
            "descripcion": "Codo de PPR de 90º roscable r/int 20 (13) x 1/2\", marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 42,
            "tipo": "Material"
          },
          {
            "clave": "550100-1140",
            "descripcion": "Dados macho-hembra de PPR de 20 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0003,
            "costoUnitario": 85.27,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.00067,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0025,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0104,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-1100",
        "descripcion": "Tubo PP-R de ½\" (13mm), termofusionable de 4.00 m, marca Verde Plus, Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 23,
        "precioUnitario": 28.6,
        "costoDirecto": 28.6,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.002,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "550100-1140",
            "descripcion": "Dados macho-hembra de PPR de 20 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.001,
            "costoUnitario": 85.27,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0007,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.002,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.003,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "200120-6100",
            "descripcion": "Tubo PP-R de ½\" (13mm), termofusionable de 4.00 m, marca Verde Plus.",
            "unidad": "tmo",
            "cantidad": 0.2575,
            "costoUnitario": 88,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-5510",
        "descripcion": "Cople PP-R polipropileno hidraulico 40 mm  unido por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 24,
        "precioUnitario": 58.62,
        "costoDirecto": 58.62,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0189,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5790",
            "descripcion": "Cople de PPR de 19 (19)mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 23.72,
            "tipo": "Material"
          },
          {
            "clave": "550100-1155",
            "descripcion": "Dados macho-hembra de PPR de 40 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0003,
            "costoUnitario": 264.32,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.00133,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0158,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0208,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "TEMP*4",
        "descripcion": "Válvula de paso de 3/4\" hembra",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 0,
        "precioUnitario": 15.39,
        "costoDirecto": 15.39,
        "insumos": [
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0104,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "VALVULA-01",
            "descripcion": "Valvula de paso de agua 3/4\"",
            "unidad": "pza",
            "cantidad": 0,
            "costoUnitario": 0,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-6505",
        "descripcion": "Reduccion de 32 x 20 mm  polipropileno hidraulico unido por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 22,
        "precioUnitario": 29.09,
        "costoDirecto": 29.09,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0075,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5850",
            "descripcion": "Reduccion de PPR de 19 x 13 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 6.78,
            "tipo": "Material"
          },
          {
            "clave": "550100-1140",
            "descripcion": "Dados macho-hembra de PPR de 20 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0003,
            "costoUnitario": 85.27,
            "tipo": "Material"
          },
          {
            "clave": "550100-1150",
            "descripcion": "Dados macho-hembra de PPR de 32 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0003,
            "costoUnitario": 179.04,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0009,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0068,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0135,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-6300",
        "descripcion": "Te 20 mm polipropileno hidraulico unido  por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 14,
        "precioUnitario": 37.49,
        "costoDirecto": 37.49,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0045,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5950",
            "descripcion": "Tee de PPR de 20 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 12,
            "tipo": "Material"
          },
          {
            "clave": "550100-1140",
            "descripcion": "Dados macho-hembra de PPR de 20 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0005,
            "costoUnitario": 85.27,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0011,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0054,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0156,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-6050",
        "descripcion": "Codo PP-R polipropileno hidraulico  90°  r/int. 25 mm x 3/4 unido por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 31,
        "precioUnitario": 83.33,
        "costoDirecto": 83.33,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0068,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5615",
            "descripcion": "Codo de PPR de 90º r/int 25 (19) x 3/4\", marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 62,
            "tipo": "Material"
          },
          {
            "clave": "550100-1145",
            "descripcion": "Dados macho-hembra de PPR de 25 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0003,
            "costoUnitario": 116.2,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.00083,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0057,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.013,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-5870",
        "descripcion": "Conector macho 25 (19) x 19 mm PP-R polipropileno hidraulico,  unido por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 3,
        "precioUnitario": 83.32,
        "costoDirecto": 83.32,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0068,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5735",
            "descripcion": "Conector macho de PPR de 25 (19)x 19mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 62,
            "tipo": "Material"
          },
          {
            "clave": "550100-1145",
            "descripcion": "Dados macho-hembra de PPR de 25 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0002,
            "costoUnitario": 116.2,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.00083,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0057,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.013,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-1102",
        "descripcion": "Tubo PP-R de 3/4\" (19mm), termofusionable de 4.00 m, marca Verde Plus, Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 95,
        "precioUnitario": 41.62,
        "costoDirecto": 41.62,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.002,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "550100-1140",
            "descripcion": "Dados macho-hembra de PPR de 20 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.001,
            "costoUnitario": 85.27,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0008,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.002,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0035,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "200120-6102",
            "descripcion": "Tubo PP-R de 3/4\" (19mm), termofusionable de 4.00 m, marca Verde Plus.",
            "unidad": "tmo",
            "cantidad": 0.2575,
            "costoUnitario": 135,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-5500",
        "descripcion": "Cople PP-R polipropileno hidraulico 25 mm  unido por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 13,
        "precioUnitario": 41.33,
        "costoDirecto": 41.33,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0068,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5780",
            "descripcion": "Cople de PPR de 25 (19)mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 20,
            "tipo": "Material"
          },
          {
            "clave": "550100-1145",
            "descripcion": "Dados macho-hembra de PPR de 25 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0003,
            "costoUnitario": 116.2,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.00083,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0057,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.013,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "TEMP*5",
        "descripcion": "Valvula de paso de agua 1\"",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 2,
        "precioUnitario": 15.39,
        "costoDirecto": 15.39,
        "insumos": [
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0104,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "VALVULA-02",
            "descripcion": "Valvula de paso de agua 1\"",
            "unidad": "pza",
            "cantidad": 0,
            "costoUnitario": 0,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-6500",
        "descripcion": "Reduccion de 25 x 20 mm  polipropileno hidraulico unido por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 8,
        "precioUnitario": 32.73,
        "costoDirecto": 32.73,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0049,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5845",
            "descripcion": "Reduccion de PPR de 25 x 20mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 13.5,
            "tipo": "Material"
          },
          {
            "clave": "550100-1140",
            "descripcion": "Dados macho-hembra de PPR de 20 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0003,
            "costoUnitario": 85.27,
            "tipo": "Material"
          },
          {
            "clave": "550100-1145",
            "descripcion": "Dados macho-hembra de PPR de 25 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0003,
            "costoUnitario": 116.2,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0008,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0047,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0117,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-6305",
        "descripcion": "Te 25 mm polipropileno hidraulico unido  por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 5,
        "precioUnitario": 59.94,
        "costoDirecto": 59.94,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.0102,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5955",
            "descripcion": "Tee de PPR de 25 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 28,
            "tipo": "Material"
          },
          {
            "clave": "550100-1145",
            "descripcion": "Dados macho-hembra de PPR de 25 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0005,
            "costoUnitario": 116.2,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0012,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.0086,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0195,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-6065",
        "descripcion": "Codo PP-R polipropileno hidraulico  90°  r/int. 32 mm x 1 unido por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 8,
        "precioUnitario": 167.54,
        "costoDirecto": 167.54,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.012,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5630",
            "descripcion": "Codo de PPR de 90º r/int 32 (25) x 1\", marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 140,
            "tipo": "Material"
          },
          {
            "clave": "550100-1150",
            "descripcion": "Dados macho-hembra de PPR de 32 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0003,
            "costoUnitario": 179.04,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.00105,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.01,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0166,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-5880",
        "descripcion": "Conector macho 32 (25) x 25 mm PP-R polipropileno hidraulico,  unido por termofusion, marca Tuboplus de Rotoplas. Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 3,
        "precioUnitario": 167.53,
        "costoDirecto": 167.53,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.012,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "200120-5745",
            "descripcion": "Conector macho de PPR de 32 (25)x 25mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 140,
            "tipo": "Material"
          },
          {
            "clave": "550100-1150",
            "descripcion": "Dados macho-hembra de PPR de 32 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0002,
            "costoUnitario": 179.04,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.00105,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.01,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0166,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200120-1104",
        "descripcion": "Tubo PP-R de 1\" (25mm), termofusionable de 4.00 m, marca Verde Plus, Incluye: material, mano de obra, herramienta y equipo.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 50,
        "precioUnitario": 79.03,
        "costoDirecto": 79.03,
        "insumos": [
          {
            "clave": "103247-1085",
            "descripcion": "Estopa blanca",
            "unidad": "kg",
            "cantidad": 0.002,
            "costoUnitario": 75,
            "tipo": "Material"
          },
          {
            "clave": "550100-1145",
            "descripcion": "Dados macho-hembra de PPR de 25 mm, marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.001,
            "costoUnitario": 116.2,
            "tipo": "Material"
          },
          {
            "clave": "550100-1200",
            "descripcion": "Termofusor AST2001, 110v hasta 110 Marca Tuboplus de Rotoplas",
            "unidad": "pza",
            "cantidad": 0.0008,
            "costoUnitario": 1749.39,
            "tipo": "Material"
          },
          {
            "clave": "103205-1005",
            "descripcion": "Alcohol etilico (96)",
            "unidad": "L",
            "cantidad": 0.002,
            "costoUnitario": 17.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0037,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "200120-6104",
            "descripcion": "Tubo PP-R de 1\" (25mm), termofusionable de 4.00 m, marca Verde Plus.",
            "unidad": "tmo",
            "cantidad": 0.2575,
            "costoUnitario": 279,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G550110-7910",
        "descripcion": "Calentador de paso a base de gas, modelo 110-020, interior galvanizado para 1 1/2 regaderas, 8 litros por minuto, marca Leflam, Incluye: instalación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 7938.07,
        "costoDirecto": 7938.07,
        "insumos": [
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 1,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "550110-8450",
            "descripcion": "Calentador de paso a base de gas, modelo 110-020, interior galvanizado para 1 1/2 regaderas, 8 litros por minuto, marca Leflam.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 6458,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G140150-3005",
        "descripcion": "Ranurado en estructura de concreto para alojar tuberia de 19 mm (3/4\"), incluye trazo y limpieza.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 15,
        "precioUnitario": 81.4,
        "costoDirecto": 81.4,
        "insumos": [
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.055,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G200150-2162",
        "descripcion": "Bomba eléctrica centrifuga para agua, potencia 1/2 HP, frecuencia 127V/60Hz, velocidad 3.400 rpm, flujo máximo 12-21 L x min., altura máxima 23m, cat. ACm37. Cuerpo de hierro con tratamiento anticorrosivo, impulsor de acero inoxidable, marca Iusa",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 1843.17,
        "costoDirecto": 1843.17,
        "insumos": [
          {
            "clave": "A100110-1015",
            "descripcion": "Cuadrilla de electricistas en baja tensión. Incluye : electricista en baja tensión, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.1,
            "costoUnitario": 1202.39,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.25,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "200150-1374",
            "descripcion": "Bomba eléctrica centrifuga para agua, potencia 1/2 HP, frecuencia 127V/60Hz, velocidad 3.400 rpm, flujo máximo 12-21 L x min., altura máxima 23m, cat. ACm37. Cuerpo de hierro con tratamiento anticorrosivo, impulsor de acero inoxidable, marca Iusa",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 1352.91,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "TEMP*8",
        "descripcion": "Lavadero, incluye instalación",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 1520.02,
        "costoDirecto": 1520.02,
        "insumos": [
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.25,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "LAVADERO-01",
            "descripcion": "Lavadero blanco de 90 x 72 cm",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 1150,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G550110-8618",
        "descripcion": "Juego  de maneral y cebolleta para regadera Posi Temp con presión balanceada y límite ajustable de temperatura, mod. TS8712, acabado cromo, marca Moen, sin válvula, incluye: instalación.",
        "unidad": "jgo",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 2,
        "precioUnitario": 3546.01,
        "costoDirecto": 3546.01,
        "insumos": [
          {
            "clave": "550110-8618",
            "descripcion": "Juego  de maneral y regadera",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 2500,
            "tipo": "Material"
          },
          {
            "clave": "LLAVE-04",
            "descripcion": "JUEGO DE LLAVES PARA EMPOTRAR COFLEX GR-D210 VALVULAS DE REGADERA 1/2 PARA EMPOTRAR",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 750,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.2,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G550110-7164",
        "descripcion": "Mezcladora monomando para fregadero con manguera retractil  y sistema anticalcareo, modelo E-306, marca Helvex, incluye: el suministro de los materiales, instalacion y pruebas.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 3018.02,
        "costoDirecto": 3018.02,
        "insumos": [
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.35,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "550110-7164",
            "descripcion": "Mezcladora monomando para fregadero con manguera retractil y sistema anticalcareo mod. E-306, marca Helvex",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 2500,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G550120-5565",
        "descripcion": "Tarja modelo 7KSU0131800 sencilla, color blanco, marca Artic Surface, incluye: instalación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 2470.02,
        "costoDirecto": 2470.02,
        "insumos": [
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.25,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "550120-1402",
            "descripcion": "Tarja modelo 7KSU0131800 sencilla, color blanco, marca Artic Surface.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 2100,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G550110-7154",
        "descripcion": "Mezcladora monomando para lavabo  con desague de rejilla, modelo Explora ecologica E-907-CE, marca Helvex, incluye: el suministro de los materiales, instalacion y pruebas.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 4,
        "precioUnitario": 2680.42,
        "costoDirecto": 2680.42,
        "insumos": [
          {
            "clave": "550110-7154",
            "descripcion": "Mezcladora monomando para lavabo con desagüe de rejilla Mod. Explora ecológico E-907-Ce, marca Helvex",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 2310.4,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.25,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G550110-8248",
        "descripcion": "Lavabo modelo Senso Square con juego de fijación, color blanco, marca Roca., Incluye: instalación y pruebas.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 4,
        "precioUnitario": 3570.02,
        "costoDirecto": 3570.02,
        "insumos": [
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.25,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "550110-8248",
            "descripcion": "Lavabo modelo Senso Square con juego de fijación, color blanco, marca Roca.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 3200,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G200100-9015",
        "descripcion": "Toma de agua domiciliaria de 19 mm (3/4), con cuadro de tubería y conexiones de Fo Go, incluye desde abrazadera para toma principal a 3 m con tubo pead, válvulas, conexiones y medidor.",
        "unidad": "toma",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 4007.63,
        "costoDirecto": 4007.63,
        "insumos": [
          {
            "clave": "200105-5000",
            "descripcion": "Cinta teflon  de ½\" en 12 m TFN1 marca Pedrollo.",
            "unidad": "m",
            "cantidad": 1.8,
            "costoUnitario": 1.25,
            "tipo": "Material"
          },
          {
            "clave": "175100-1115",
            "descripcion": "Abrazadera inserción 152 mm (6\"), marca Fundidora Tenayuca",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 132.46,
            "tipo": "Material"
          },
          {
            "clave": "200105-1045",
            "descripcion": "Tubo galvanizado 19mm (3/4\") c-40 c/rosca, marca Ternium",
            "unidad": "m",
            "cantidad": 2.5,
            "costoUnitario": 54.86,
            "tipo": "Material"
          },
          {
            "clave": "200105-2135",
            "descripcion": "Codo galvanizado 90ø 19mm",
            "unidad": "pza",
            "cantidad": 3,
            "costoUnitario": 8.42,
            "tipo": "Material"
          },
          {
            "clave": "200105-2515",
            "descripcion": "Tee galvanizada ref. 19mm",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 10.68,
            "tipo": "Material"
          },
          {
            "clave": "550110-2515",
            "descripcion": "Llave manguera 13 mm (1/2) bronce marca Urrea",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 159.09,
            "tipo": "Material"
          },
          {
            "clave": "200130-5705",
            "descripcion": "Válvula inserción 19 mm (3/4\") figura F-40C, marca Urrea.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 350,
            "tipo": "Material"
          },
          {
            "clave": "200130-3045",
            "descripcion": "Válvula globo 100 lbs roscable 19 mm Fg 65, marca Urrea.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 97.69,
            "tipo": "Material"
          },
          {
            "clave": "200300-1025",
            "descripcion": "Medidor de agua domiciliario 19 mm (3/4\") T10 cuerpo de bronce, con desplazamiento positivo, marca Neptune.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 1920.6,
            "tipo": "Material"
          },
          {
            "clave": "200100-2345",
            "descripcion": "Cople reducción de cobre tipo bushing de 19x13mm Cp-Rd Cu, No. 118 marca Nacobre",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 20,
            "tipo": "Material"
          },
          {
            "clave": "200118-1665",
            "descripcion": "Tubo ramal para toma domiciliaria de 20mm pead clase 10,  marca Amanco",
            "unidad": "m",
            "cantidad": 3.05,
            "costoUnitario": 13.9,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.75,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "7",
    "descripcion": "Instalacion Electrica",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 113975.29,
    "costoDirecto": 113975.29,
    "children": [
      {
        "clave": "G300150-1015",
        "descripcion": "Apagador sencillo de 15 amperes, 127 volts, marca Bticino modelo 5001N. Incluye conexión de cables y colocación en bastidor.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 0,
        "precioUnitario": 117.95,
        "costoDirecto": 117.95,
        "insumos": [
          {
            "clave": "300150-3145",
            "descripcion": "Interruptor sencillo 1módulo 16A, 127/220V, modelo 5001N línea Magic, marca Bticino.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 80.44,
            "tipo": "Material"
          },
          {
            "clave": "A100110-1015",
            "descripcion": "Cuadrilla de electricistas en baja tensión. Incluye : electricista en baja tensión, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.0312,
            "costoUnitario": 1202.39,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "TEMP*12",
        "descripcion": "Suministro y colocación de bajada monofásica para acometida, incluye: mufa seca de 32 mm., tubo conduit p.g. De 32 mm. De diametro, base de medición de 4 mordazas, reducción de 32 mm. A 13 mm., condulet tipo t de 13 mm., (4) conectores p.d. De 13 mm., conector flexible de 13 mm., (1m) de tubo conduit flexible de 13 mm., (3 m.) Tubo conduit p. D. De 13 mm., interruptor de seguridad de 2 x 30 amp. Con fusibles, (3 m) de cable de cobre thw # 12 marca condumex, (2 m) de cable desnudo # 8, varilla de tierra copperweld de 5/8\" x 1.50m. Con conector, (3) abrazaderas omegas p.g. De 32 mm., (3) abrazaderas omega p. D. De 13 mm., materiales, mano de obra y herramienta.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 3687,
        "costoDirecto": 3687,
        "insumos": [
          {
            "clave": "ELEC-01",
            "descripcion": "Suministro y colocación de bajada monofásica para acometida, incluye: mufa seca de 32 mm., tubo conduit p.g. De 32 mm. De diametro, base de medición de 4 mordazas, reducción de 32 mm. A 13 mm., condulet tipo t de 13 mm., (4) conectores p.d. De 13 mm., conector flexible de 13 mm., (1m) de tubo conduit flexible de 13 mm., (3 m.) Tubo conduit p. D. De 13 mm., interruptor de seguridad de 2 x 30 amp. Con fusibles, (3 m) de cable de cobre thw # 12 marca condumex, (2 m) de cable desnudo # 8, varilla de tierra copperweld de 5/8\" x 1.50m. Con conector, (3) abrazaderas omegas p.g. De 32 mm., (3) abrazaderas omega p. D. De 13 mm., materiales, mano de obra y herramienta.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 3687,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G970130-1125",
        "descripcion": "Nicho eléctrico para equipo de medición e interruptor general, a base de muros de block hueco, dimensiones 0.90 m. de largo, 2.00 m. de alto y 0.60 m. de profundidad (medidas a paños exteriores), Incluye protección metálica o puertas según especificaciones de CFE.    ( puerta de aluminio con mirilla de acrílico  zonas costeras, alta contaminación)",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 4718.25,
        "costoDirecto": 4718.25,
        "insumos": [
          {
            "clave": "500180-2050",
            "descripcion": "Esmalte evolution mca. Sherwin Williams",
            "unidad": "cb/1L",
            "cantidad": 0.168,
            "costoUnitario": 121.55,
            "tipo": "Material"
          },
          {
            "clave": "600350-3005",
            "descripcion": "Mirilla acrilica",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 56.62,
            "tipo": "Material"
          },
          {
            "clave": "600350-5015",
            "descripcion": "Bisagra Month Hard de libro plana modelo 1079 de 3 X 3 acabado dorado.",
            "unidad": "pza",
            "cantidad": 2,
            "costoUnitario": 51.72,
            "tipo": "Material"
          },
          {
            "clave": "600250-1070",
            "descripcion": "Lamina de aluminio liso cal. 18, de 0.91 x 2.44 m 3.40 kg/m2",
            "unidad": "kg",
            "cantidad": 1.656,
            "costoUnitario": 101.05,
            "tipo": "Material"
          },
          {
            "clave": "103205-1075",
            "descripcion": "Thiner normal adelgazador acrilico No.40 marca Sherwin Williams",
            "unidad": "L",
            "cantidad": 0.0168,
            "costoUnitario": 53.45,
            "tipo": "Material"
          },
          {
            "clave": "C990140-3510",
            "descripcion": "Vibrador de Concreto mot. gasolina 8 hp Kolher flecha 14\" cabezal AA48 de 17/8  (45mm).",
            "unidad": "hr",
            "cantidad": 0.047,
            "costoUnitario": 70.75,
            "tipo": "Equipo"
          },
          {
            "clave": "F103130-2185",
            "descripcion": "Concreto f¨c = 200 kg/cm2, rn tma = 19 mm (3/4¨¨) fabricado en obra a mano. Incluye: dosificación y mezcla.",
            "unidad": "m3",
            "cantidad": 0.053,
            "costoUnitario": 2251.3,
            "tipo": "Flete"
          },
          {
            "clave": "G110100-1005",
            "descripcion": "Acero de refuerzo del  No 2 (1/4\") alambron, incluye: habilitado y armado ganchos, traslapes, desperdicios y acarreos",
            "unidad": "Ton",
            "cantidad": 0.0008,
            "costoUnitario": 40649.54,
            "tipo": "Subcontrato"
          },
          {
            "clave": "G110100-1015",
            "descripcion": "Acero de refuerzo cimentacion N 3 (3/8\") incluye: habilitado y armado, ganchos, traslapes, desperdicios y acarreos",
            "unidad": "Ton",
            "cantidad": 0.0043,
            "costoUnitario": 29464.61,
            "tipo": "Subcontrato"
          },
          {
            "clave": "G500140-2040",
            "descripcion": "Aplanado fino en muros con mr c-a 1:4 e= 2.5cm y h= 3.00m, incluye: dosificación y mezcla manual de materiales.",
            "unidad": "m2",
            "cantidad": 8.4,
            "costoUnitario": 228.32,
            "tipo": "Subcontrato"
          },
          {
            "clave": "G110105-1135",
            "descripcion": "Cimbra comun contratrabes dados cimentación incluye: materiales y mano de obra.",
            "unidad": "m2",
            "cantidad": 0.738,
            "costoUnitario": 291.89,
            "tipo": "Subcontrato"
          },
          {
            "clave": "G115105-2045",
            "descripcion": "Cimbra aparente en losas hasta 3.50 m. de altura incluye: materiales y mano de obra.",
            "unidad": "m2",
            "cantidad": 0.567,
            "costoUnitario": 325.5,
            "tipo": "Subcontrato"
          },
          {
            "clave": "A100105-2000",
            "descripcion": "Cuadrilla de albañiles. Incluye : albañil, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.15,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "A100115-1130",
            "descripcion": "Cuadrilla de herreros. Incluye : herrero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.2,
            "costoUnitario": 1077.6,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "G145115-1110",
            "descripcion": "Muro de block de concreto RBH-60 ENTERO de 15 x 20 x 40 cm., de 15 cm. de espesor, asentado con mortero cemento - arena 1:4, con refuerzo horizontal tipo escalerilla a cada 2 hiladas, juntas de 1 cm. de espesor, acabado comun, hasta una altura de 3.50 m., incluye: acarreo de los materiales a 1a. estacion a 20.0 m. de distancia horizontal.",
            "unidad": "m2",
            "cantidad": 4.2,
            "costoUnitario": 215.47,
            "tipo": "Subcontrato"
          },
          {
            "clave": "G500170-1115",
            "descripcion": "Pintura vinilica comex me-70 c/r (vinil economica), en muros y plafones, acabados con mezcla fina, hasta una altura maxima de 3.00 m., incluye: dos manos de pintura y una mano de sellador, preparacion de la superficie y acarreo de los materiales a una 1a. estacion a 20.00 m. de distancia horizontal.",
            "unidad": "m2",
            "cantidad": 6.63,
            "costoUnitario": 52.75,
            "tipo": "Subcontrato"
          },
          {
            "clave": "G110115-1030",
            "descripcion": "Plantilla de concreto fc=100 kg/cm2 de 5 cm., incluye: compactacion del fondo y curado.",
            "unidad": "m2",
            "cantidad": 0.567,
            "costoUnitario": 136.8,
            "tipo": "Subcontrato"
          }
        ],
        "children": []
      },
      {
        "clave": "G300165-1205",
        "descripcion": "Centro de carga de 8 polos, 100amp.max. 60Hz 120/240v, para empotrar, código CC08E, Marca Igesa, incluye: fijación, conexiones y pruebas.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 594.29,
        "costoDirecto": 594.29,
        "insumos": [
          {
            "clave": "A100110-1015",
            "descripcion": "Cuadrilla de electricistas en baja tensión. Incluye : electricista en baja tensión, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.12,
            "costoUnitario": 1202.39,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "300165-2024",
            "descripcion": "Centro de carga de 8 polos, 100Amp. max. 60Hz 120/240v, para empotrar, código CC08E, marca Igesa",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 450,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G300220-1030",
        "descripcion": "Salida para contacto doble polarizado de 127 v",
        "unidad": "Salida",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 31,
        "precioUnitario": 1428.45,
        "costoDirecto": 1428.45,
        "insumos": [
          {
            "clave": "300105-1515",
            "descripcion": "Poliflex naranja con guía plástica de 19mm (3/4\"), marca Poliflex",
            "unidad": "m",
            "cantidad": 6,
            "costoUnitario": 8.64,
            "tipo": "Material"
          },
          {
            "clave": "G140150-3050",
            "descripcion": "Ranurado en muro de tabique para alojar tuberia de 19 mm (3/4\"), incluye trazo y limpieza.",
            "unidad": "m",
            "cantidad": 1.5,
            "costoUnitario": 37,
            "tipo": "Subcontrato"
          },
          {
            "clave": "ELE-07",
            "descripcion": "Caja Chalupa plástica reforzada 2x4 ",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 13,
            "tipo": "Material"
          },
          {
            "clave": "300160-2185",
            "descripcion": "Cinta aislante de 19 mm color negro (rollo con 18 m uso eléctrico), modelo M-33 marca Truper",
            "unidad": "pza",
            "cantidad": 0.05,
            "costoUnitario": 40,
            "tipo": "Material"
          },
          {
            "clave": "300130-1030",
            "descripcion": "Cable de cobre THHW-LS 105º C, cal. 12, marca Iusa.",
            "unidad": "m",
            "cantidad": 24,
            "costoUnitario": 10.8,
            "tipo": "Material"
          },
          {
            "clave": "ELEC-06",
            "descripcion": "Contacto con placa Duplex",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 85,
            "tipo": "Material"
          },
          {
            "clave": "A100110-1015",
            "descripcion": "Cuadrilla de electricistas en baja tensión. Incluye : electricista en baja tensión, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.8,
            "costoUnitario": 1202.39,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "TEMP*13",
        "descripcion": "Salida electrica de iluminacion",
        "unidad": "Salida",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 50,
        "precioUnitario": 738.24,
        "costoDirecto": 738.24,
        "insumos": [
          {
            "clave": "A100110-1015",
            "descripcion": "Cuadrilla de electricistas en baja tensión. Incluye : electricista en baja tensión, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.3,
            "costoUnitario": 1202.39,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "ELE-10",
            "descripcion": "Luminaria led para plafon de sobreponer",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 150,
            "tipo": "Material"
          },
          {
            "clave": "ELE-08",
            "descripcion": "Caja Octagonal de 4” y 2” de profundidad",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 18,
            "tipo": "Material"
          },
          {
            "clave": "300130-1030",
            "descripcion": "Cable de cobre THHW-LS 105º C, cal. 12, marca Iusa.",
            "unidad": "m",
            "cantidad": 17,
            "costoUnitario": 10.8,
            "tipo": "Material"
          },
          {
            "clave": "300105-1515",
            "descripcion": "Poliflex naranja con guía plástica de 19mm (3/4\"), marca Poliflex",
            "unidad": "m",
            "cantidad": 3,
            "costoUnitario": 8.64,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G300220-1045",
        "descripcion": "Salida electrica de iluminacion en plafon",
        "unidad": "Salida",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 20,
        "precioUnitario": 1189.09,
        "costoDirecto": 1189.09,
        "insumos": [
          {
            "clave": "300105-1515",
            "descripcion": "Poliflex naranja con guía plástica de 19mm (3/4\"), marca Poliflex",
            "unidad": "m",
            "cantidad": 6,
            "costoUnitario": 8.64,
            "tipo": "Material"
          },
          {
            "clave": "ELE-08",
            "descripcion": "Caja Octagonal de 4” y 2” de profundidad",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 18,
            "tipo": "Material"
          },
          {
            "clave": "ELE-09",
            "descripcion": "Apagador sencillo con placa",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 60,
            "tipo": "Material"
          },
          {
            "clave": "ELE-10",
            "descripcion": "Luminaria led para plafon de sobreponer",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 150,
            "tipo": "Material"
          },
          {
            "clave": "ELE-07",
            "descripcion": "Caja Chalupa plástica reforzada 2x4 ",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 13,
            "tipo": "Material"
          },
          {
            "clave": "300130-1030",
            "descripcion": "Cable de cobre THHW-LS 105º C, cal. 12, marca Iusa.",
            "unidad": "m",
            "cantidad": 34,
            "costoUnitario": 10.8,
            "tipo": "Material"
          },
          {
            "clave": "A100110-1015",
            "descripcion": "Cuadrilla de electricistas en baja tensión. Incluye : electricista en baja tensión, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.44,
            "costoUnitario": 1202.39,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "8",
    "descripcion": "Acabados",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 205955.47,
    "costoDirecto": 205955.47,
    "children": [
      {
        "clave": "G500105-1015",
        "descripcion": "Zoclo de 10 cm con loseta modelo Magnum color negro marca Porcelanite",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 0,
        "precioUnitario": 95.18,
        "costoDirecto": 95.18,
        "insumos": [
          {
            "clave": "103247-1040",
            "descripcion": "Agua",
            "unidad": "L",
            "cantidad": 0.1,
            "costoUnitario": 0.16,
            "tipo": "Material"
          },
          {
            "clave": "500135-1000",
            "descripcion": "Loseta de 33 x 33 cm modelo Magnum, marca Porcelanite",
            "unidad": "m2",
            "cantidad": 0.105,
            "costoUnitario": 350,
            "tipo": "Material"
          },
          {
            "clave": "500135-9925",
            "descripcion": "Pegazulejo Porcelanite 20.00 kg",
            "unidad": "bulto",
            "cantidad": 0.03,
            "costoUnitario": 295,
            "tipo": "Material"
          },
          {
            "clave": "500135-9045",
            "descripcion": "Juntacrest ultramax, color blanco, saco 5 kg., marca Crest",
            "unidad": "pza",
            "cantidad": 0.0111,
            "costoUnitario": 146.12,
            "tipo": "Material"
          },
          {
            "clave": "E140220-1010",
            "descripcion": "Lechada espesa de cemento blanco con agua. Incluye: dosificación y mezcla.",
            "unidad": "L",
            "cantidad": 0.00015,
            "costoUnitario": 25.57,
            "tipo": "Flete"
          },
          {
            "clave": "A100115-1045",
            "descripcion": "Cuadrilla de loseteros. Incluye : losetero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.04,
            "costoUnitario": 1198.4,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G500105-1051",
        "descripcion": "Piso de loseta de porcelanato de 50 x 50 cm., línea Vantagio color gris, marca Interceramic.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 14,
        "precioUnitario": 571.22,
        "costoDirecto": 571.22,
        "insumos": [
          {
            "clave": "103247-1035",
            "descripcion": "Agua",
            "unidad": "m3",
            "cantidad": 0.01,
            "costoUnitario": 160,
            "tipo": "Material"
          },
          {
            "clave": "500135-9945",
            "descripcion": "Pegamix epoxico PSP 20 kg. marca Cemix",
            "unidad": "pza",
            "cantidad": 0.33,
            "costoUnitario": 171.37,
            "tipo": "Material"
          },
          {
            "clave": "500135-9045",
            "descripcion": "Juntacrest ultramax, color blanco, saco 5 kg., marca Crest",
            "unidad": "pza",
            "cantidad": 0.07,
            "costoUnitario": 146.12,
            "tipo": "Material"
          },
          {
            "clave": "500135-4501",
            "descripcion": "Loseta Porcelanato de 50 x 50 cm., línea Vantagio color gris, marca interceramic.",
            "unidad": "m2",
            "cantidad": 1.08,
            "costoUnitario": 350,
            "tipo": "Material"
          },
          {
            "clave": "A100115-1045",
            "descripcion": "Cuadrilla de loseteros. Incluye : losetero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.09,
            "costoUnitario": 1198.4,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "C990215-1205",
            "descripcion": "Cortadora de Material Vidriado 1 hp (incluye operador)",
            "unidad": "hr",
            "cantidad": 0.3333,
            "costoUnitario": 50.94,
            "tipo": "Equipo"
          }
        ],
        "children": []
      },
      {
        "clave": "G500105-1051",
        "descripcion": "Piso de loseta de porcelanato de 50 x 50 cm., línea Vantagio color gris, marca Interceramic.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 20,
        "precioUnitario": 571.22,
        "costoDirecto": 571.22,
        "insumos": [
          {
            "clave": "103247-1035",
            "descripcion": "Agua",
            "unidad": "m3",
            "cantidad": 0.01,
            "costoUnitario": 160,
            "tipo": "Material"
          },
          {
            "clave": "500135-9945",
            "descripcion": "Pegamix epoxico PSP 20 kg. marca Cemix",
            "unidad": "pza",
            "cantidad": 0.33,
            "costoUnitario": 171.37,
            "tipo": "Material"
          },
          {
            "clave": "500135-9045",
            "descripcion": "Juntacrest ultramax, color blanco, saco 5 kg., marca Crest",
            "unidad": "pza",
            "cantidad": 0.07,
            "costoUnitario": 146.12,
            "tipo": "Material"
          },
          {
            "clave": "500135-4501",
            "descripcion": "Loseta Porcelanato de 50 x 50 cm., línea Vantagio color gris, marca interceramic.",
            "unidad": "m2",
            "cantidad": 1.08,
            "costoUnitario": 350,
            "tipo": "Material"
          },
          {
            "clave": "A100115-1045",
            "descripcion": "Cuadrilla de loseteros. Incluye : losetero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.09,
            "costoUnitario": 1198.4,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "C990215-1205",
            "descripcion": "Cortadora de Material Vidriado 1 hp (incluye operador)",
            "unidad": "hr",
            "cantidad": 0.3333,
            "costoUnitario": 50.94,
            "tipo": "Equipo"
          }
        ],
        "children": []
      },
      {
        "clave": "G500105-1051",
        "descripcion": "Piso de loseta de porcelanato de 50 x 50 cm., línea Vantagio color gris, marca Interceramic.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 170,
        "precioUnitario": 571.22,
        "costoDirecto": 571.22,
        "insumos": [
          {
            "clave": "103247-1035",
            "descripcion": "Agua",
            "unidad": "m3",
            "cantidad": 0.01,
            "costoUnitario": 160,
            "tipo": "Material"
          },
          {
            "clave": "500135-9945",
            "descripcion": "Pegamix epoxico PSP 20 kg. marca Cemix",
            "unidad": "pza",
            "cantidad": 0.33,
            "costoUnitario": 171.37,
            "tipo": "Material"
          },
          {
            "clave": "500135-9045",
            "descripcion": "Juntacrest ultramax, color blanco, saco 5 kg., marca Crest",
            "unidad": "pza",
            "cantidad": 0.07,
            "costoUnitario": 146.12,
            "tipo": "Material"
          },
          {
            "clave": "500135-4501",
            "descripcion": "Loseta Porcelanato de 50 x 50 cm., línea Vantagio color gris, marca interceramic.",
            "unidad": "m2",
            "cantidad": 1.08,
            "costoUnitario": 350,
            "tipo": "Material"
          },
          {
            "clave": "A100115-1045",
            "descripcion": "Cuadrilla de loseteros. Incluye : losetero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.09,
            "costoUnitario": 1198.4,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "C990215-1205",
            "descripcion": "Cortadora de Material Vidriado 1 hp (incluye operador)",
            "unidad": "hr",
            "cantidad": 0.3333,
            "costoUnitario": 50.94,
            "tipo": "Equipo"
          }
        ],
        "children": []
      },
      {
        "clave": "G500310-1590",
        "descripcion": "Impermeabilización a base de resinas Top total secado rápido 10 años, marca Comex, incluye: limpieza y acarreos a 1a. estacion a 20.00 m.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 243.7,
        "precioUnitario": 105.78,
        "costoDirecto": 105.78,
        "insumos": [
          {
            "clave": "500310-1590",
            "descripcion": "Top total secado rápido 10 años, marca Comex",
            "unidad": "cb/19L",
            "cantidad": 0.05,
            "costoUnitario": 1625,
            "tipo": "Material"
          },
          {
            "clave": "A100115-1205",
            "descripcion": "Cuadrilla de impermeabilizacion. Incluye: impermeabilizador, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.02,
            "costoUnitario": 1226.42,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G500170-1060",
        "descripcion": "Pintura vinílica marca Vinimex 700 de Comex color Blanco Ostión, en muros exteriores con mezcla acabado fino, a cualquier altura, aplicando sellador 5 x 1 de Comex. Incluye: preparación de la superficie, limpieza, aplicación hasta cubrir perfectamente la superficie a dos manos mínimo.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 0,
        "precioUnitario": 78.33,
        "costoDirecto": 78.33,
        "insumos": [
          {
            "clave": "103247-1035",
            "descripcion": "Agua",
            "unidad": "m3",
            "cantidad": 0.005,
            "costoUnitario": 160,
            "tipo": "Material"
          },
          {
            "clave": "PINTURA-01",
            "descripcion": "Pintura comex color gris",
            "unidad": "Cb/19L",
            "cantidad": 0.0126,
            "costoUnitario": 1544,
            "tipo": "Material"
          },
          {
            "clave": "F990105-3010",
            "descripcion": "Hamaca con plataforma de 4.00 m, 2 malacates marca Alsi y 50 m de cable de 1/4¨",
            "unidad": "r/d",
            "cantidad": 0.045,
            "costoUnitario": 127.51,
            "tipo": "Flete"
          },
          {
            "clave": "500170-1110",
            "descripcion": "Sellador vinilico 5x1, clasico mca Comex",
            "unidad": "cb/19L",
            "cantidad": 0.0026,
            "costoUnitario": 800.86,
            "tipo": "Material"
          },
          {
            "clave": "A100115-1015",
            "descripcion": "Cuadrilla de pintores. Incluye: pintor, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.045,
            "costoUnitario": 1116.93,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G500170-1021",
        "descripcion": "Pintura vinílica linea Vinimex 700, marca Comex, color Blanco Ostión, en muros exteriores con mezcla acabado rugoso, a cualquier altura, aplicando sellador 5 x 1 de Comex. Incluye: preparación de la superficie, limpieza, aplicación hasta cubrir perfectamente la superficie a dos manos mínimo.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 850,
        "precioUnitario": 74.88,
        "costoDirecto": 74.88,
        "insumos": [
          {
            "clave": "103247-1035",
            "descripcion": "Agua",
            "unidad": "m3",
            "cantidad": 0.00561,
            "costoUnitario": 160,
            "tipo": "Material"
          },
          {
            "clave": "F990105-3010",
            "descripcion": "Hamaca con plataforma de 4.00 m, 2 malacates marca Alsi y 50 m de cable de 1/4¨",
            "unidad": "r/d",
            "cantidad": 0.04,
            "costoUnitario": 127.51,
            "tipo": "Flete"
          },
          {
            "clave": "500170-1060",
            "descripcion": "Vinimex 700 colores regulares (pintura vinil-acrilica) marca Comex.",
            "unidad": "cb/19L",
            "cantidad": 0.01415,
            "costoUnitario": 1544.82,
            "tipo": "Material"
          },
          {
            "clave": "500170-1110",
            "descripcion": "Sellador vinilico 5x1, clasico mca Comex",
            "unidad": "cb/19L",
            "cantidad": 0.00292,
            "costoUnitario": 800.86,
            "tipo": "Material"
          },
          {
            "clave": "A100115-1015",
            "descripcion": "Cuadrilla de pintores. Incluye: pintor, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.04,
            "costoUnitario": 1116.93,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "9",
    "descripcion": "Carpinteria",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 44411.9,
    "costoDirecto": 44411.9,
    "children": [
      {
        "clave": "G600105-1515",
        "descripcion": "Puerta madera de caoba de 19 mm. de 1.20 x 2.20 m. con bastidorde 11/2\"x1\" @ 30cm forrada con triplay de caoba   incluye: acarreo 1a. estacion a 20m.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 8936.6,
        "costoDirecto": 8936.6,
        "insumos": [
          {
            "clave": "600300-1011",
            "descripcion": "Cristal bronce recodido de 10mm de espesor de 3.60 x 2.60m, marca Saint-Gobain",
            "unidad": "m2",
            "cantidad": 0.25,
            "costoUnitario": 743.29,
            "tipo": "Material"
          },
          {
            "clave": "600350-5020",
            "descripcion": "Bisagra per/suel. B10L250 marca Phillips",
            "unidad": "pza",
            "cantidad": 3,
            "costoUnitario": 12.32,
            "tipo": "Material"
          },
          {
            "clave": "500106-1015",
            "descripcion": "Pegamento para madera unirapid profesional, marca Comex",
            "unidad": "kg",
            "cantidad": 1.12,
            "costoUnitario": 90.95,
            "tipo": "Material"
          },
          {
            "clave": "103247-1196",
            "descripcion": "Lija para madera oxalum J86 G320",
            "unidad": "Hoja",
            "cantidad": 2.82,
            "costoUnitario": 9.23,
            "tipo": "Material"
          },
          {
            "clave": "500165-2510",
            "descripcion": "Triplay de caoba 19x1.22x2.44",
            "unidad": "pza",
            "cantidad": 2,
            "costoUnitario": 2200,
            "tipo": "Material"
          },
          {
            "clave": "500165-1035",
            "descripcion": "Madera de pino 1a 1/2x12x81/4",
            "unidad": "pt",
            "cantidad": 10.92,
            "costoUnitario": 31.55,
            "tipo": "Material"
          },
          {
            "clave": "175125-5290",
            "descripcion": "Tornillo #10 50long x 4.8 mm para madera cabeza plana ranurada, zincado (acero) marca Lammsa. Familia 42g",
            "unidad": "pza",
            "cantidad": 25.2,
            "costoUnitario": 0.42,
            "tipo": "Material"
          },
          {
            "clave": "175125-2010",
            "descripcion": "Clavo c/cabeza de 2-4, marca Deacero",
            "unidad": "kg",
            "cantidad": 0.462,
            "costoUnitario": 12.1,
            "tipo": "Material"
          },
          {
            "clave": "A100115-1110",
            "descripcion": "Cuadrilla de ebanistas. Incluye : ebanista, ayudante y herramienta.",
            "unidad": "Jor",
            "cantidad": 1.5,
            "costoUnitario": 2158.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "A100115-1190",
            "descripcion": "Cuadrilla de vidrieros. Incluye : vidriero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.5,
            "costoUnitario": 1176.23,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G600105-1545",
        "descripcion": "Puerta madera de pino de 0.90x2.10 m. con bastidor de 11/2\"x1\" @ 30cm forrada con triplay de cedro incluye: acarreo 1a. estacion a 20m.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 10,
        "precioUnitario": 3547.53,
        "costoDirecto": 3547.53,
        "insumos": [
          {
            "clave": "600350-5020",
            "descripcion": "Bisagra per/suel. B10L250 marca Phillips",
            "unidad": "pza",
            "cantidad": 3,
            "costoUnitario": 12.32,
            "tipo": "Material"
          },
          {
            "clave": "500106-1015",
            "descripcion": "Pegamento para madera unirapid profesional, marca Comex",
            "unidad": "kg",
            "cantidad": 0.8,
            "costoUnitario": 90.95,
            "tipo": "Material"
          },
          {
            "clave": "103247-1196",
            "descripcion": "Lija para madera oxalum J86 G320",
            "unidad": "Hoja",
            "cantidad": 2,
            "costoUnitario": 9.23,
            "tipo": "Material"
          },
          {
            "clave": "500165-1035",
            "descripcion": "Madera de pino 1a 1/2x12x81/4",
            "unidad": "pt",
            "cantidad": 7.8,
            "costoUnitario": 31.55,
            "tipo": "Material"
          },
          {
            "clave": "500165-2520",
            "descripcion": "Triplay de caoba 6x1.22x2.44",
            "unidad": "pza",
            "cantidad": 2,
            "costoUnitario": 750,
            "tipo": "Material"
          },
          {
            "clave": "175125-5290",
            "descripcion": "Tornillo #10 50long x 4.8 mm para madera cabeza plana ranurada, zincado (acero) marca Lammsa. Familia 42g",
            "unidad": "pza",
            "cantidad": 18,
            "costoUnitario": 0.42,
            "tipo": "Material"
          },
          {
            "clave": "175125-2010",
            "descripcion": "Clavo c/cabeza de 2-4, marca Deacero",
            "unidad": "kg",
            "cantidad": 0.33,
            "costoUnitario": 12.1,
            "tipo": "Material"
          },
          {
            "clave": "A100115-1110",
            "descripcion": "Cuadrilla de ebanistas. Incluye : ebanista, ayudante y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.77,
            "costoUnitario": 2158.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "10",
    "descripcion": "Herreria",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 11423.46,
    "costoDirecto": 11423.46,
    "children": [
      {
        "clave": "G600110-4110",
        "descripcion": "Puerta de herrería de 0.90 x 2.00 m cerrada de lámina hecha con tablero C20  y chapa marca Dexter, incluye: suministro, instalación, acarreo de los materiales, a una 1a. estacion a 20.00 m. de distancia horizontal, en p.b. y 1er. nivel.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 2,
        "precioUnitario": 5711.73,
        "costoDirecto": 5711.73,
        "insumos": [
          {
            "clave": "170100-1000",
            "descripcion": "Andamio tubular de 2 m, con ruedas, plataforma y barras, marca Atlas",
            "unidad": "r/d",
            "cantidad": 1,
            "costoUnitario": 13.33,
            "tipo": "Material"
          },
          {
            "clave": "600110-4110",
            "descripcion": "Puerta de herrería de 0.90 x 2.00 m cerrada de lámina hecha con tablero C20  y chapa marca Dexter.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 4500,
            "tipo": "Material"
          },
          {
            "clave": "A100115-1135",
            "descripcion": "Cuadrilla de herreros. Incluye : herrero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 1,
            "costoUnitario": 1198.4,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "11",
    "descripcion": "Canceleria",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 202835.73,
    "costoDirecto": 202835.73,
    "children": [
      {
        "clave": "TEMP*6",
        "descripcion": "Suministro y colocación de cancelería de aluminio natural de 3\" elaborada con perfiles comerciales en ventanas, incluye: accesorios necesarios para su instalación y sellado, vidrio claro de 6 mm. De espesor en ventanas fijas y corredizas, trabajo terminado, andamios, jaladera, materiales, mano de obra y herramienta.",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 71.52,
        "precioUnitario": 2836.07,
        "costoDirecto": 2836.07,
        "insumos": [
          {
            "clave": "CANCELERIA-01",
            "descripcion": "Suministro y colocación de cancelería de aluminio natural de 3\" elaborada con perfiles comerciales en ventanas, incluye: accesorios necesarios para su instalación y sellado, vidrio claro de 6 mm. De espesor en ventanas fijas y corredizas, trabajo terminado, andamios, jaladera, materiales, mano de obra y herramienta.",
            "unidad": "m2",
            "cantidad": 1,
            "costoUnitario": 2836.07,
            "tipo": "Material"
          }
        ],
        "children": []
      }
    ]
  },
  {
    "clave": "12",
    "descripcion": "Instalacion de Gas",
    "unidad": "lote",
    "nivel": 1,
    "tipo": "Partida",
    "cantidad": 1,
    "precioUnitario": 20726.58,
    "costoDirecto": 20726.58,
    "children": [
      {
        "clave": "TEMP*11",
        "descripcion": "El kit de conexiones de tanque estacionario a suministro, incluye: 1 Acoplador para tanque estacionario",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 1080,
        "costoDirecto": 1080,
        "insumos": [
          {
            "clave": "GAS-02",
            "descripcion": "El kit de conexiones de tanque estacionario a suministro, incluye:\r\n1 Acoplador para tanque estacionario\r\n1 Válvula globo para gas 3/4\"\r\n1 Niple galvanizado 3/4\" x 2\"\r\n1 Tee Galvanizada 3/4\"1 Conector macho cobre 3/4\"\r\n1 Válvula de seguridad para tanque estacionario",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 1080,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "TEMP*10",
        "descripcion": "Línea Kit De Llenado Para Tanque Estacionario",
        "unidad": "m2",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 1080,
        "costoDirecto": 1080,
        "insumos": [
          {
            "clave": "GAS-01",
            "descripcion": "Línea Kit De Llenado Para Tanque Estacionario, incluye: Media línea de llenado (sólo la parte de la calle). Este producto consta de:\r\n1 válvula de llenado ( doble check) 32 mm (1-1/4”)\r\n1 codo de 32mm (1-1/4”) x 45 galvanizado.\r\n1 Reducción de 32mm x 19 mm (1-1/4” x 3/4”) negra.\r\n1 Niple galvanizado 3/4” x 2” corto 10 CM.\r\n1 válvula de globo para gas 19mm (3/4”). iusa\r\n1 Conector cuerda exterior de cobre 19mm (3/4”).",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 1080,
            "tipo": "Material"
          }
        ],
        "children": []
      },
      {
        "clave": "G350101-1000",
        "descripcion": "Tuberia multicapa PE-AL-PE 3/4\" de diam marca Durman para conducción de gas natural y gas l.p., incluye: suministro e instalación.",
        "unidad": "m",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 50,
        "precioUnitario": 150.82,
        "costoDirecto": 150.82,
        "insumos": [
          {
            "clave": "170100-1000",
            "descripcion": "Andamio tubular de 2 m, con ruedas, plataforma y barras, marca Atlas",
            "unidad": "r/d",
            "cantidad": 0.025,
            "costoUnitario": 13.33,
            "tipo": "Material"
          },
          {
            "clave": "350101-1000",
            "descripcion": "Tuberia multicapa PE-AL-PE 3/4\" de diam marca Durman para conducción de gas natural y gas l.p.",
            "unidad": "m",
            "cantidad": 1.03,
            "costoUnitario": 110.18,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.025,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G350101-1020",
        "descripcion": "Te recta PE-AL-PE 3/4\" de diam marca Durman para conducción de gas natural y gas l.p., incluye: suministro e instalación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 313.43,
        "costoDirecto": 313.43,
        "insumos": [
          {
            "clave": "170100-1000",
            "descripcion": "Andamio tubular de 2 m, con ruedas, plataforma y barras, marca Atlas",
            "unidad": "r/d",
            "cantidad": 0.014,
            "costoUnitario": 13.33,
            "tipo": "Material"
          },
          {
            "clave": "350101-1020",
            "descripcion": "Te recta PE-AL-PE 3/4\" de diam marca Durman para conducción de gas natural y gas l.p.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 292.52,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.014,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G350101-1040",
        "descripcion": "Cople recto PE-AL-PE 3/4\" de diam marca Durman para conducción de gas natural y gas l.p., incluye: suministro e instalación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 4,
        "precioUnitario": 251.5,
        "costoDirecto": 251.5,
        "insumos": [
          {
            "clave": "170100-1000",
            "descripcion": "Andamio tubular de 2 m, con ruedas, plataforma y barras, marca Atlas",
            "unidad": "r/d",
            "cantidad": 0.013,
            "costoUnitario": 13.33,
            "tipo": "Material"
          },
          {
            "clave": "350101-1040",
            "descripcion": "Cople recto PE-AL-PE 3/4\" de diam marca Durman para conducción de gas natural y gas l.p.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 232.09,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.013,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G350101-1010",
        "descripcion": "Adaptador macho PE-AL-PE 3/4\" de diam marca Durman para conducción de gas natural y gas l.p., incluye: suministro e instalación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 4,
        "precioUnitario": 169.2,
        "costoDirecto": 169.2,
        "insumos": [
          {
            "clave": "170100-1000",
            "descripcion": "Andamio tubular de 2 m, con ruedas, plataforma y barras, marca Atlas",
            "unidad": "r/d",
            "cantidad": 0.012,
            "costoUnitario": 13.33,
            "tipo": "Material"
          },
          {
            "clave": "350101-1010",
            "descripcion": "Adaptador macho PE-AL-PE 3/4\" de diam marca Durman para conducción de gas natural y gas l.p.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 151.28,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.012,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G350101-1050",
        "descripcion": "Valvula de paso 3/4\" de diam marca Durman para conducción de gas natural y gas l.p., incluye: suministro e instalación.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 2,
        "precioUnitario": 350.49,
        "costoDirecto": 350.49,
        "insumos": [
          {
            "clave": "350101-1050",
            "descripcion": "Valvula de paso 3/4\" de diam marca Durman para conducción de gas natural y gas l.p.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 326.6,
            "tipo": "Material"
          },
          {
            "clave": "170100-1000",
            "descripcion": "Andamio tubular de 2 m, con ruedas, plataforma y barras, marca Atlas",
            "unidad": "r/d",
            "cantidad": 0.016,
            "costoUnitario": 13.33,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 0.016,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          }
        ],
        "children": []
      },
      {
        "clave": "G350110-1040",
        "descripcion": "Tanque de gas estacionario uso domestico capacidad de 120 l marca Cytsa, incluye: válvula de servicio, seguridad, llenado, sistema indicador de máximo llenado e indicador de niveles de liquido, regulador de baja presión, instación y herramienta.",
        "unidad": "pza",
        "nivel": 2,
        "tipo": "Concepto",
        "cantidad": 1,
        "precioUnitario": 8328.37,
        "costoDirecto": 8328.37,
        "insumos": [
          {
            "clave": "103247-1130",
            "descripcion": "Gasolina Magna",
            "unidad": "L",
            "cantidad": 0.35,
            "costoUnitario": 23.5,
            "tipo": "Material"
          },
          {
            "clave": "910100-1411",
            "descripcion": "Soplete precimex para cilindro desechable con boquilla estándar Mod. 901, marca Iusa",
            "unidad": "pza",
            "cantidad": 0.01,
            "costoUnitario": 73.96,
            "tipo": "Material"
          },
          {
            "clave": "200100-9510",
            "descripcion": "Pasta fundente Soldering en bote de 500 grs",
            "unidad": "pza",
            "cantidad": 0.2,
            "costoUnitario": 67.83,
            "tipo": "Material"
          },
          {
            "clave": "200100-9560",
            "descripcion": "Carrete de soldadura de 95 x 5 z",
            "unidad": "pza",
            "cantidad": 0.05,
            "costoUnitario": 388.24,
            "tipo": "Material"
          },
          {
            "clave": "350110-1040",
            "descripcion": "Tanque de gas estacionario uso domestico capacidad de 120 l marca Cytsa, incluye: válvula de servicio, seguridad, llenado, sistema indicador de máximo llenado e indicador de niveles de liquido y regulador de baja presión.",
            "unidad": "pza",
            "cantidad": 1,
            "costoUnitario": 6785.5,
            "tipo": "Material"
          },
          {
            "clave": "A100110-2020",
            "descripcion": "Cuadrilla de plomeros. Incluye : plomero, ayudante, cabo y herramienta.",
            "unidad": "Jor",
            "cantidad": 1,
            "costoUnitario": 1480.07,
            "tipo": "Mano de Obra"
          },
          {
            "clave": "C990130-1010",
            "descripcion": "Grua marca Hiab modelo 035/2 para 510 kg en camion de 3.5 t marca Dodge 3500 6 ton.",
            "unidad": "hr",
            "cantidad": 0.15,
            "costoUnitario": 139.01,
            "tipo": "Equipo"
          }
        ],
        "children": []
      }
    ]
  }
];

export function getExactOpusInsumosForClave(clave) {
  if (!clave) return null;
  const target = String(clave).trim().toUpperCase();
  for (const p of CASA_LAURA_PROJECT) {
    for (const c of (p.children || [])) {
      if (c.clave && c.clave.trim().toUpperCase() === target) {
        return c.insumos || [];
      }
    }
  }
  return null;
}
