// Utilidad de Notificaciones Toast
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
    info: 'bg-slate-800 text-white',
    warning: 'bg-amber-600 text-white'
  };
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-triangle-exclamation',
    info: 'fa-info-circle',
    warning: 'fa-exclamation-circle'
  };

  toast.className = `${colors[type] || colors.info} px-3.5 py-2 rounded-lg shadow-xl text-xs flex items-center gap-2 pointer-events-auto transition-all duration-300 transform translate-y-0 font-medium`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
