// Servicio centralizado de Branding e Impresión por Plan de Suscripción (Free / Plus / Pro)
import { state } from '../../state/store.js';
import { resolveWorkspacePlanContext } from '../portal/projectService.js';

export const CUBIKAR_OFFICIAL_SVG = `<svg viewBox="0 0 512 512" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gBlue" x1="120" y1="80" x2="380" y2="180" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="50%" stop-color="#0EA5E9" />
      <stop offset="100%" stop-color="#0284C7" />
    </linearGradient>
    <linearGradient id="gRed" x1="70" y1="140" x2="160" y2="360" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FB7185" />
      <stop offset="45%" stop-color="#F43F5E" />
      <stop offset="100%" stop-color="#E11D48" />
    </linearGradient>
    <linearGradient id="gHook" x1="280" y1="100" x2="430" y2="200" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F43F5E" />
      <stop offset="60%" stop-color="#FB7185" />
      <stop offset="100%" stop-color="#FDA4AF" />
    </linearGradient>
    <linearGradient id="gGreen" x1="100" y1="360" x2="430" y2="320" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="35%" stop-color="#10B981" />
      <stop offset="75%" stop-color="#34D399" />
      <stop offset="100%" stop-color="#2DD4BF" />
    </linearGradient>
    <linearGradient id="gYellowTop" x1="180" y1="170" x2="320" y2="230" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FEF08A" />
      <stop offset="50%" stop-color="#FDE047" />
      <stop offset="100%" stop-color="#FACC15" />
    </linearGradient>
    <linearGradient id="gAmberSide" x1="180" y1="220" x2="280" y2="340" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FBBF24" />
      <stop offset="50%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#D97706" />
    </linearGradient>
  </defs>
  <g>
    <path d="M256 50 C266 44 278 47 288 53 L386 110 C396 116 394 128 384 134 L304 180 C292 187 276 187 264 180 L184 134 C174 128 176 116 186 110 L256 70 Z" fill="url(#gBlue)" />
    <path d="M288 138 L368 92 C380 85 396 88 404 99 C416 115 414 138 398 151 L348 191 C336 200 320 200 310 190 C300 179 302 163 314 154 L336 136 L288 138 Z" fill="url(#gHook)" />
    <path d="M88 160 C84 148 94 136 108 136 L176 176 C186 182 186 194 176 200 L176 332 C176 342 166 350 156 344 L104 314 C94 308 88 298 88 286 V160 Z" fill="url(#gRed)" />
    <path d="M180 172 L264 220 C270 223 274 230 274 237 V336 L258 327 V242 L180 198 Z" fill="#FFFFFF" opacity="0.95" />
    <path d="M192 190 L276 238 C284 243 290 252 290 262 L366 218 C376 212 376 200 366 194 L292 152 C280 145 264 145 252 152 L192 187 Z" fill="url(#gYellowTop)" />
    <path d="M192 202 L276 250 C284 255 290 264 290 274 V330 C290 340 280 348 270 342 L192 298 C184 293 180 284 180 274 V214 C180 204 186 198 192 202 Z" fill="url(#gAmberSide)" />
    <path d="M104 314 L176 356 C186 362 198 362 208 356 L256 328 C268 321 282 321 294 328 L380 378 C396 387 416 379 422 362 C428 345 418 327 402 318 L336 280 C324 273 308 277 300 289 C292 301 296 317 308 324 L330 336 L256 380 C246 386 234 386 224 380 L124 324 C112 317 106 304 112 291 L104 314 Z" fill="url(#gGreen)" />
  </g>
</svg>`;

export const CUBIKAR_LOGO_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(CUBIKAR_OFFICIAL_SVG)}`;

let cachedPngDataUrl = null;
let pendingPngPromise = null;

/**
 * Convierte el SVG oficial de Cubikar a PNG DataURL cacheado para compatibilidad con jsPDF.
 */
export async function getCubikarLogoPngDataUrl(size = 192) {
  if (cachedPngDataUrl) return cachedPngDataUrl;
  if (pendingPngPromise) return pendingPngPromise;
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }

  pendingPngPromise = new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, size, size);
          cachedPngDataUrl = canvas.toDataURL('image/png');
          resolve(cachedPngDataUrl);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = CUBIKAR_LOGO_DATA_URL;
    } catch {
      resolve(null);
    }
  });

  return pendingPngPromise;
}

/**
 * Resuelve el branding de impresión/PDF según el plan efectivo del DUEÑO del proyecto activo.
 * - Plan 'free': Inyecta obligatoriamente el logo y nombre oficial de Cubikar (membrete + marca de agua).
 * - Plan 'plus' / 'pro': Usa exclusivamente el logotipo y nombre configurado por el usuario (marca blanca, sin marca de agua de Cubikar).
 */
export function resolveActivePrintBranding(settings = null, projectIdOverride = null) {
  const effectiveSettings = settings || state?.settings || {};
  const ctx = resolveWorkspacePlanContext(projectIdOverride);
  const planId = ctx?.planId === 'pro' ? 'pro' : (ctx?.planId === 'plus' ? 'plus' : 'free');
  const userCompanyName = String(effectiveSettings.companyName || '').trim();
  const userCompanyLogo = String(effectiveSettings.companyLogo || '').trim();

  if (planId === 'free') {
    const companyName = userCompanyName
      ? `${userCompanyName}  •  cubikar`
      : 'cubikar — Gestión Integral de Obras';

    const headerBadgeHtml = `
      <div class="cubikar-free-letterhead" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 12px;margin-bottom:10px;border:1px solid #cbd5e1;border-left:4px solid #0284c7;border-radius:6px;background:#f8fafc;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img src="${CUBIKAR_LOGO_DATA_URL}" alt="cubikar" style="width:22px;height:22px;object-fit:contain;flex-shrink:0;">
          <div style="line-height:1.2;">
            <div style="font-size:11px;font-weight:800;color:#0f172a;letter-spacing:0.3px;">cubikar <span style="font-weight:500;color:#475569;">— Software de Costos, Presupuestos y Obra</span></div>
            <div style="font-size:8.5px;color:#64748b;">Documento generado con Plan Gratuita · Membrete oficial incluido</div>
          </div>
        </div>
        <span style="font-size:8.5px;font-weight:700;color:#0369a1;background:#e0f2fe;padding:2px 8px;border-radius:999px;border:1px solid #bae6fd;">PLAN GRATUITA</span>
      </div>
    `;

    const watermarkLayerHtml = `
      <div class="cubikar-watermark-layer" aria-hidden="true">
        <div class="cubikar-watermark-inner">
          <img src="${CUBIKAR_LOGO_DATA_URL}" alt="" style="width:72px;height:72px;opacity:0.9;">
          <div class="cubikar-watermark-text">cubikar</div>
          <div class="cubikar-watermark-sub">PLAN GRATUITA</div>
        </div>
      </div>
    `;

    const watermarkFooterHtml = `
      <div class="cubikar-free-footer" style="margin-top:16px;padding:7px 10px;border-top:1px solid #cbd5e1;display:flex;align-items:center;justify-content:space-between;font-size:8.5px;color:#475569;background:#f8fafc;border-radius:4px;">
        <span style="display:inline-flex;align-items:center;gap:6px;font-weight:600;">
          <img src="${CUBIKAR_LOGO_DATA_URL}" alt="cubikar" style="width:14px;height:14px;">
          Impreso con <strong style="color:#0f172a;">cubikar</strong> (Plan Gratuita)
        </span>
        <span>Actualiza a Plan Plus o Pro para imprimir con tu logotipo propio y sin marca de agua</span>
      </div>
    `;

    const watermarkCss = `
      .cubikar-watermark-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.085;
      }
      .cubikar-watermark-inner {
        transform: rotate(-28deg);
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .cubikar-watermark-text {
        font-size: 46px;
        font-weight: 900;
        letter-spacing: 6px;
        color: #0f172a;
        text-transform: lowercase;
        line-height: 1;
      }
      .cubikar-watermark-sub {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 3px;
        color: #0369a1;
      }
      @media print {
        .cubikar-free-letterhead,
        .cubikar-free-footer {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .cubikar-watermark-layer {
          position: fixed;
          inset: 0;
        }
      }
    `;

    return {
      planId: 'free',
      isFree: true,
      requiresAppWatermark: true,
      appName: 'cubikar',
      appTagline: 'cubikar — Plan Gratuita',
      companyName,
      companyLogo: CUBIKAR_LOGO_DATA_URL,
      customUserCompanyName: userCompanyName,
      headerBadgeHtml,
      watermarkLayerHtml,
      watermarkFooterHtml,
      watermarkCss
    };
  }

  return {
    planId,
    isFree: false,
    requiresAppWatermark: false,
    appName: 'cubikar',
    appTagline: '',
    companyName: userCompanyName || 'Constructora y Desarrollos',
    companyLogo: userCompanyLogo,
    customUserCompanyName: userCompanyName,
    headerBadgeHtml: '',
    watermarkLayerHtml: '',
    watermarkFooterHtml: '',
    watermarkCss: ''
  };
}
