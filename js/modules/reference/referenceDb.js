// js/modules/reference/referenceDb.js
// Gestor de base de datos local IndexedDB para Catálogos Maestros de Referencia

import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';

const DB_NAME = 'APU_REFERENCE_DB';
const DB_VERSION = 1;

let dbInstance = null;

export function openReferenceDb() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store para metadatos de los catálogos importados
      if (!db.objectStoreNames.contains('catalogs')) {
        const catStore = db.createObjectStore('catalogs', { keyPath: 'id' });
        catStore.createIndex('name', 'name', { unique: false });
        catStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Store para los conceptos e insumos de referencia
      if (!db.objectStoreNames.contains('items')) {
        const itemStore = db.createObjectStore('items', { keyPath: 'id' });
        itemStore.createIndex('catalogId', 'catalogId', { unique: false });
        itemStore.createIndex('tipo', 'tipo', { unique: false });
        itemStore.createIndex('clave', 'clave', { unique: false });
        itemStore.createIndex('catalogAndTipo', ['catalogId', 'tipo'], { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Error abriendo IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Guardar un catálogo nuevo con todos sus elementos (conceptos o insumos)
export async function saveReferenceCatalog(catalogMeta, itemsList) {
  const db = await openReferenceDb();

  const catalogId = catalogMeta.id || 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const catalogRecord = {
    id: catalogId,
    name: catalogMeta.name || 'Catálogo de Referencia',
    category: catalogMeta.category || 'General', // Edificación, Instalaciones, Gobierno, etc.
    type: catalogMeta.type || 'mixto', // conceptos, materiales, mano_obra, maquinaria, mixto
    sourceFileName: catalogMeta.sourceFileName || '',
    itemsCount: itemsList.length,
    createdAt: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['catalogs', 'items'], 'readwrite');
    const catStore = tx.objectStore('catalogs');
    const itemStore = tx.objectStore('items');

    catStore.put(catalogRecord);

    itemsList.forEach((item, index) => {
      const itemRecord = {
        id: `${catalogId}_${index}_${item.clave || ''}`,
        catalogId: catalogId,
        catalogName: catalogRecord.name,
        tipo: item.tipo || 'Concepto', // Concepto, Material, Mano de Obra, Equipo, Subcontrato
        clave: (item.clave || '').toString().trim(),
        descripcion: (item.descripcion || '').toString().trim(),
        unidad: (item.unidad || 'pza').toString().trim(),
        precioUnitario: parseFloat(item.precioUnitario || item.costoUnitario || 0) || 0,
        familia: (item.familia || '').toString().trim(),
        preciosZonas: item.preciosZonas || null
      };
      itemStore.put(itemRecord);
    });

    tx.oncomplete = () => {
      resolve(catalogRecord);
    };

    tx.onerror = (e) => {
      console.error('Error guardando catálogo en IndexedDB:', e.target.error);
      reject(e.target.error);
    };
  });
}

// Obtener la lista de todos los catálogos guardados
export async function listReferenceCatalogs() {
  const db = await openReferenceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('catalogs', 'readonly');
    const store = tx.objectStore('catalogs');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Eliminar un catálogo y todos sus items asociados
export async function deleteReferenceCatalog(catalogId) {
  const db = await openReferenceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['catalogs', 'items'], 'readwrite');
    const catStore = tx.objectStore('catalogs');
    const itemStore = tx.objectStore('items');

    catStore.delete(catalogId);

    const index = itemStore.index('catalogId');
    const request = index.openCursor(IDBKeyRange.only(catalogId));

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// Buscar en la base de datos de referencia con filtros y texto
export async function searchReferenceItems({ catalogId = 'all', tipo = 'all', query = '', limit = 100 }) {
  const db = await openReferenceDb();
  const searchTerms = (query || '').toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);

  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readonly');
    const store = tx.objectStore('items');
    const results = [];

    let request;
    if (catalogId !== 'all' && tipo !== 'all') {
      const index = store.index('catalogAndTipo');
      request = index.openCursor(IDBKeyRange.only([catalogId, tipo]));
    } else if (catalogId !== 'all') {
      const index = store.index('catalogId');
      request = index.openCursor(IDBKeyRange.only(catalogId));
    } else if (tipo !== 'all') {
      const index = store.index('tipo');
      request = index.openCursor(IDBKeyRange.only(tipo));
    } else {
      request = store.openCursor();
    }

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const item = cursor.value;

        // Comprobación de términos de búsqueda en clave y descripción
        let matches = true;
        if (searchTerms.length > 0) {
          const itemText = `${item.clave} ${item.descripcion} ${item.familia || ''}`.toLowerCase();
          for (const term of searchTerms) {
            if (!itemText.includes(term)) {
              matches = false;
              break;
            }
          }
        }

        if (matches) {
          if (item.tipo === 'Concepto' && (!item.insumos || item.insumos.length === 0)) {
            item.insumos = generateIntegratedMatrixForConcept(item);
          }
          results.push(item);
          if (results.length >= limit) {
            return resolve(results);
          }
        }

        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

// Conteo total de items y catálogos
export async function getReferenceDatabaseStats() {
  const db = await openReferenceDb();
  const catalogs = await listReferenceCatalogs();
  let totalItems = 0;
  catalogs.forEach(c => totalItems += (c.itemsCount || 0));
  return {
    catalogsCount: catalogs.length,
    totalItems: totalItems,
    catalogs: catalogs
  };
}
