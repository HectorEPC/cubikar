import { state, persistLocalData } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { calculateParentTotal } from '../../core/calculations.js';
import { recalculateClaves } from '../catalog/treeService.js';
import { renderTAB1 } from '../catalog/catalogView.js';

// Exportación completa del catálogo a CSV
export function exportData() {
  let csvContent = "data:text/csv;charset=utf-8,Nivel,Clave,Descripcion,Unidad,Cantidad,PrecioUnitario,Total,Seleccionado\n";
  
  function buildCsv(nodes, level = 1) {
    nodes.forEach(n => {
      const isParent = n.children && n.children.length > 0;
      const total = isParent ? calculateParentTotal(n) : ((n.cantidad || 0) * (n.precioUnitario || 0));
      csvContent += `"${level}","${n.clave || ''}","${(n.descripcion || '').replace(/"/g, '""')}","${n.unidad || 'pza'}",${n.cantidad || 0},${n.precioUnitario || 0},${total},"${n.selected ? 'Sí' : 'No'}"\n`;
      if (isParent) buildCsv(n.children, level + 1);
    });
  }

  buildCsv(state.treeData);
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Presupuesto_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Presupuesto exportado a CSV', 'success');
}

// Importación y parsing de archivo CSV con reconstrucción de árbol jerárquico
export function importData(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        showToast('El archivo CSV está vacío o no es válido', 'error');
        return;
      }

      function parseCsvRow(rowText) {
        let fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < rowText.length; i++) {
          let char = rowText[i];
          if (char === '"') {
            if (inQuotes && rowText[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        fields.push(current.trim());
        return fields;
      }

      saveState();
      const parsedTree = [];
      const stack = []; // Stack con { level, node }

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvRow(lines[i]);
        if (cols.length < 4) continue;

        const level = parseInt(cols[0]) || 1;
        const clave = cols[1] || '';
        const desc = cols[2] || 'Concepto importado';
        const unid = cols[3] || 'pza';
        const cant = Math.round(((parseFloat(cols[4]) || 1) + Number.EPSILON) * 100) / 100;
        const pu = Math.round(((parseFloat(cols[5]) || 0) + Number.EPSILON) * 100) / 100;
        const isSel = (cols[7] || '').toLowerCase().includes('s');

        const newNode = {
          id: '_' + Math.random().toString(36).substr(2, 9),
          clave: clave,
          descripcion: desc,
          unidad: unid,
          cantidad: cant,
          precioUnitario: pu,
          costoDirecto: pu,
          expanded: true,
          selected: isSel,
          insumos: [],
          children: []
        };

        if (level === 1) {
          parsedTree.push(newNode);
          stack.length = 0;
          stack.push({ level: 1, node: newNode });
        } else {
          while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
          }

          if (stack.length > 0) {
            stack[stack.length - 1].node.children.push(newNode);
          } else {
            parsedTree.push(newNode);
          }
          stack.push({ level: level, node: newNode });
        }
      }

      state.treeData = parsedTree;
      recalculateClaves(state.treeData);
      persistLocalData();
      renderTAB1();
      showToast(`CSV importado con éxito (${lines.length - 1} renglones)`, 'success');
    } catch (err) {
      console.error('Error importando CSV:', err);
      showToast('Error al procesar el archivo CSV', 'error');
    } finally {
      if (event.target) event.target.value = '';
    }
  };
  reader.readAsText(file);
}
