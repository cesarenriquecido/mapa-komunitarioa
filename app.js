const map = L.map('map', { zoomControl: true }).setView([43.22, -2.73], 10);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const qEl = document.getElementById('q');
const temaEl = document.getElementById('tema');
const zonaEl = document.getElementById('zona');
const tipoEl = document.getElementById('tipo');
const poblacionEl = document.getElementById('poblacion');
const resetEl = document.getElementById('reset');
const countEl = document.getElementById('count');
const legendItemsEl = document.getElementById('legend-items');

const markersLayer = L.layerGroup().addTo(map);

let allRows = [];
let rendered = [];

const colorByTipo = new Map();
const palette = [
  '#e11d48','#2563eb','#059669','#d97706','#7c3aed',
  '#0ea5e9','#84cc16','#f97316','#14b8a6','#ef4444'
];

function parseJsonishArray(value) {
  if (!value) return [];
  const v = String(value).trim();
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.map(x => String(x).trim()).filter(Boolean);
  } catch {}
  return v
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(s => s.replace(/^"+|"+$/g, '').trim())
    .filter(Boolean);
}

function uniqueValues(rows, field) {
  const set = new Set();
  rows.forEach(r => parseJsonishArray(r[field]).forEach(v => set.add(v)));
  return [...set].sort((a,b)=>a.localeCompare(b, 'es'));
}

function fillSelect(select, values, firstLabel) {
  if (!select) return;
  select.innerHTML = `<option value="">${firstLabel}</option>`;
  values.forEach(v => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

function normalizeUrl(u) {
  if (!u) return '';
  const v = String(u).trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function extractPointCoords(pointStr) {
  if (!pointStr) return null;
  const m = String(pointStr).match(/Point\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  const lon = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  return null;
}

function extractCoordsFromDireccion(rawDireccion) {
  if (!rawDireccion) return null;
  const v = String(rawDireccion).trim();
  if (!v.startsWith('{')) return null;
  try {
    const obj = JSON.parse(v);
    const lat = Number(obj?.Coordinates?.Latitude);
    const lon = Number(obj?.Coordinates?.Longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  } catch {}
  return null;
}

function chooseTipo(row) {
  const tipos = parseJsonishArray(row['Tipo de recurso']);
  return tipos[0] || 'Sin tipo';
}

function getTipoColor(tipo) {
  if (!colorByTipo.has(tipo)) {
    colorByTipo.set(tipo, palette[colorByTipo.size % palette.length]);
  }
  return colorByTipo.get(tipo);
}

function markerIcon(color) {
  return L.divIcon({
    className: '',
    html: `<span style="
      display:inline-block;width:14px;height:14px;border-radius:50%;
      background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.35);
    "></span>`,
    iconSize: [14,14],
    iconAnchor: [7,7]
  });
}

function popupHtml(r) {
  const title = r['Título'] || '(Sin título)';
  const actividad = r['Actividad'] || '';
  const tel = r['Teléfono'] || '';
  const email = r['e-mail'] || '';
  const web = normalizeUrl(r['Web']);
  const otros = r['Otros'] || '';
  const tema = parseJsonishArray(r['Temática']).join(', ');
  const zona = parseJsonishArray(r['Zona Accción']).join(', ');
  const tipo = parseJsonishArray(r['Tipo de recurso']).join(', ');
  const poblacion = parseJsonishArray(r['Población diana']).join(', ');

  return `
    <div class="popup">
      <h3>${escapeHtml(title)}</h3>
      ${actividad ? `<p><strong>Actividad:</strong> ${escapeHtml(actividad)}</p>` : ''}
      ${tema ? `<p><strong>Temática:</strong> ${escapeHtml(tema)}</p>` : ''}
      ${zona ? `<p><strong>Zona:</strong> ${escapeHtml(zona)}</p>` : ''}
      ${tipo ? `<p><strong>Tipo:</strong> ${escapeHtml(tipo)}</p>` : ''}
      ${poblacion ? `<p><strong>Población:</strong> ${escapeHtml(poblacion)}</p>` : ''}
      ${tel ? `<p><strong>Tel:</strong> ${escapeHtml(tel)}</p>` : ''}
      ${email ? `<p><strong>Email:</strong> <a href="mailto:${escapeAttr(email)}">${escapeHtml(email)}</a></p>` : ''}
      ${web ? `<p><strong>Web:</strong> <a href="${escapeAttr(web)}" target="_blank" rel="noopener">abrir</a></p>` : ''}
      ${otros ? `<p><strong>Otros:</strong> ${escapeHtml(otros)}</p>` : ''}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}
function escapeAttr(s){ return escapeHtml(s); }

function rowMatches(r) {
  const q = qEl?.value?.trim().toLowerCase() || '';
  const tema = temaEl?.value || '';
  const zona = zonaEl?.value || '';
  const tipo = tipoEl?.value || '';
  const pobl = poblacionEl?.value || '';

  if (q && !(r['Título'] || '').toLowerCase().includes(q)) return false;

  const temas = parseJsonishArray(r['Temática']);
  const zonas = parseJsonishArray(r['Zona Accción']);
  const tipos = parseJsonishArray(r['Tipo de recurso']);
  const poblaciones = parseJsonishArray(r['Población diana']);

  if (tema && !temas.includes(tema)) return false;
  if (zona && !zonas.includes(zona)) return false;
  if (tipo && !tipos.includes(tipo)) return false;
  if (pobl && !poblaciones.includes(pobl)) return false;

  return true;
}

function renderLegend() {
  if (!legendItemsEl) return;
  const tipos = uniqueValues(allRows, 'Tipo de recurso');
  legendItemsEl.innerHTML = '';

  tipos.forEach(tipo => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="legend-dot" style="background:${getTipoColor(tipo)}"></span><span>${escapeHtml(tipo)}</span>`;
    legendItemsEl.appendChild(li);
  });
}

function render() {
  markersLayer.clearLayers();
  rendered = [];

  allRows.forEach(r => {
    if (!rowMatches(r)) return;
    const c1 = extractPointCoords(r['Dirección: coordenadas']);
    const c2 = extractCoordsFromDireccion(r['Dirección']);
    const c = c1 || c2;
    if (!c) return;

    const tipo = chooseTipo(r);
    const marker = L.marker([c.lat, c.lon], { icon: markerIcon(getTipoColor(tipo)) });
    marker.bindPopup(popupHtml(r), { maxWidth: 380 });
    marker.addTo(markersLayer);
    rendered.push(marker);
  });

  if (countEl) countEl.textContent = rendered.length;

  if (rendered.length > 0) {
    const group = L.featureGroup(rendered);
    map.fitBounds(group.getBounds().pad(0.1));
  }
}

function bootstrapFilters(rows) {
  fillSelect(temaEl, uniqueValues(rows, 'Temática'), 'Todas');
  fillSelect(zonaEl, uniqueValues(rows, 'Zona Accción'), 'Todas');
  fillSelect(tipoEl, uniqueValues(rows, 'Tipo de recurso'), 'Todos');
  fillSelect(poblacionEl, uniqueValues(rows, 'Población diana'), 'Todas');
}

[qEl, temaEl, zonaEl, tipoEl, poblacionEl].filter(Boolean).forEach(el => {
  el.addEventListener('input', render);
  el.addEventListener('change', render);
});

if (resetEl) {
  resetEl.addEventListener('click', () => {
    if (qEl) qEl.value = '';
    if (temaEl) temaEl.value = '';
    if (zonaEl) zonaEl.value = '';
    if (tipoEl) tipoEl.value = '';
    if (poblacionEl) poblacionEl.value = '';
    render();
  });
}

Papa.parse('./Instituciones.csv', {
  header: true,
  skipEmptyLines: true,
  download: true,
  complete: (res) => {
    allRows = res.data || [];
    bootstrapFilters(allRows);
    renderLegend();
    render();
  },
  error: (err) => {
    console.error(err);
    alert('No se pudo leer Instituciones.csv');
  }
});
