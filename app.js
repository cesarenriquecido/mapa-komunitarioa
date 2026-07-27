const map = L.map('map', { zoomControl: true }).setView([43.22, -2.73], 10);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const qEl = document.getElementById('q');
const temaEl = document.getElementById('tema');
const poblacionEl = document.getElementById('poblacion');
const tipoEl = document.getElementById('tipo');
const zonaEl = document.getElementById('zona');
const resetEl = document.getElementById('reset');
const countEl = document.getElementById('count');
const legendItemsEl = document.getElementById('legend-items');
const statusEl = document.getElementById('status');

const markersLayer = L.layerGroup().addTo(map);

let allRows = [];
let renderedMarkers = [];

const palette = ['#1d4ed8', '#be123c', '#0f766e', '#7c3aed', '#c2410c', '#0369a1', '#3f6212', '#374151', '#7e22ce', '#15803d'];
const colorByTipo = new Map();

function parseJsonishArray(value) {
  if (!value) return [];
  const source = String(value).trim();
  if (!source) return [];

  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {}

  return source
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((segment) => segment.trim().replace(/^"+|"+$/g, ''))
    .filter(Boolean);
}

function uniqueValues(rows, fieldName) {
  const values = new Set();
  rows.forEach((row) => {
    parseJsonishArray(row[fieldName]).forEach((item) => values.add(item));
  });
  return [...values].sort((a, b) => a.localeCompare(b, 'es'));
}

function fillSelect(selectEl, values, firstLabel) {
  if (!selectEl) return;
  selectEl.innerHTML = '';

  const firstOption = document.createElement('option');
  firstOption.value = '';
  firstOption.textContent = firstLabel;
  selectEl.appendChild(firstOption);

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });
}

function normalizeUrl(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function extractPointCoords(pointValue) {
  if (!pointValue) return null;
  const match = String(pointValue).match(/Point\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!match) return null;

  const lon = Number.parseFloat(match[1]);
  const lat = Number.parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lat, lon };
}

function extractCoordsFromDireccion(rawDireccion) {
  if (!rawDireccion) return null;
  const trimmed = String(rawDireccion).trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    const lat = Number(parsed?.Coordinates?.Latitude);
    const lon = Number(parsed?.Coordinates?.Longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon };
    }
  } catch {}

  return null;
}

function getTipoColor(tipo) {
  const key = tipo || 'Sin tipo';
  if (!colorByTipo.has(key)) {
    colorByTipo.set(key, palette[colorByTipo.size % palette.length]);
  }
  return colorByTipo.get(key);
}

function markerIcon(color) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<span style="display:inline-block;width:14px;height:14px;border-radius:999px;background:${color};border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(15,23,42,.35)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

function popupRow(label, value, format = 'text') {
  if (!value) return '';

  if (format === 'email') {
    const escaped = escapeHtml(value);
    return `<p class="popup-row"><strong>${label}:</strong> <a href="mailto:${escaped}">${escaped}</a></p>`;
  }

  if (format === 'web') {
    const normalized = normalizeUrl(value);
    if (!normalized) return '';
    const escapedHref = escapeHtml(normalized);
    const escapedLabel = escapeHtml(value);
    return `<p class="popup-row"><strong>${label}:</strong> <a href="${escapedHref}" target="_blank" rel="noopener">${escapedLabel}</a></p>`;
  }

  if (format === 'long-text') {
    return `<p class="popup-row"><strong>${label}:</strong> <em>${escapeHtml(value)}</em></p>`;
  }

  return `<p class="popup-row"><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
}

function popupHtml(row) {
  const title = row['Título'] || '(Sin título)';
  const actividad = row['Actividad'] || '';
  const tema = parseJsonishArray(row['Temática']).join(', ');
  const zona = parseJsonishArray(row['Zona Accción']).join(', ');
  const tipo = parseJsonishArray(row['Tipo de recurso']).join(', ');
  const poblacion = parseJsonishArray(row['Población diana']).join(', ');
  const telefono = row['Teléfono'] || '';
  const email = row['e-mail'] || '';
  const web = row['Web'] || '';
  const otros = row['Otros'] || '';

  return `
    <article class="popup-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="popup-grid">
        ${popupRow('Actividad', actividad)}
        ${popupRow('Temática', tema)}
        ${popupRow('Zona', zona)}
        ${popupRow('Tipo', tipo)}
        ${popupRow('Población', poblacion)}
        ${popupRow('Teléfono', telefono)}
        ${popupRow('Email', email, 'email')}
        ${popupRow('Web', web, 'web')}
        ${popupRow('Otros', otros, 'long-text')}
      </div>
    </article>
  `;
}

function rowMatches(row) {
  const search = qEl?.value?.trim().toLowerCase() || '';
  const tema = temaEl?.value || '';
  const poblacion = poblacionEl?.value || '';
  const tipo = tipoEl?.value || '';
  const zona = zonaEl?.value || '';

  if (search && !String(row['Título'] || '').toLowerCase().includes(search)) {
    return false;
  }

  const temas = parseJsonishArray(row['Temática']);
  const poblaciones = parseJsonishArray(row['Población diana']);
  const tipos = parseJsonishArray(row['Tipo de recurso']);
  const zonas = parseJsonishArray(row['Zona Accción']);

  if (tema && !temas.includes(tema)) return false;
  if (poblacion && !poblaciones.includes(poblacion)) return false;
  if (tipo && !tipos.includes(tipo)) return false;
  if (zona && !zonas.includes(zona)) return false;

  return true;
}

function renderLegend() {
  if (!legendItemsEl) return;
  legendItemsEl.innerHTML = '';

  const tipos = uniqueValues(allRows, 'Tipo de recurso');
  tipos.forEach((tipo) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = getTipoColor(tipo);

    const text = document.createElement('span');
    text.textContent = tipo;

    li.appendChild(dot);
    li.appendChild(text);
    legendItemsEl.appendChild(li);
  });
}

function render() {
  markersLayer.clearLayers();
  renderedMarkers = [];

  allRows.forEach((row) => {
    if (!rowMatches(row)) return;

    const coordFromPoint = extractPointCoords(row['Dirección: coordenadas']);
    const coordFromDireccion = extractCoordsFromDireccion(row['Dirección']);
    const coords = coordFromPoint || coordFromDireccion;
    if (!coords) return;

    const tipos = parseJsonishArray(row['Tipo de recurso']);
    const marker = L.marker([coords.lat, coords.lon], {
      icon: markerIcon(getTipoColor(tipos[0] || 'Sin tipo'))
    });

    marker.bindPopup(popupHtml(row), { maxWidth: 400 });
    marker.addTo(markersLayer);
    renderedMarkers.push(marker);
  });

  if (countEl) {
    countEl.textContent = String(renderedMarkers.length);
  }

  if (statusEl) {
    statusEl.textContent = renderedMarkers.length === 0
      ? 'No hay recursos con los filtros seleccionados.'
      : '';
  }

  if (renderedMarkers.length > 0) {
    const featureGroup = L.featureGroup(renderedMarkers);
    map.fitBounds(featureGroup.getBounds().pad(0.1));
  }
}

function bootstrapFilters(rows) {
  fillSelect(temaEl, uniqueValues(rows, 'Temática'), 'Todas');
  fillSelect(poblacionEl, uniqueValues(rows, 'Población diana'), 'Todas');
  fillSelect(tipoEl, uniqueValues(rows, 'Tipo de recurso'), 'Todos');
  fillSelect(zonaEl, uniqueValues(rows, 'Zona Accción'), 'Todas');
}

[qEl, temaEl, poblacionEl, tipoEl, zonaEl].filter(Boolean).forEach((el) => {
  el.addEventListener('input', render);
  el.addEventListener('change', render);
});

if (resetEl) {
  resetEl.addEventListener('click', () => {
    if (qEl) qEl.value = '';
    if (temaEl) temaEl.value = '';
    if (poblacionEl) poblacionEl.value = '';
    if (tipoEl) tipoEl.value = '';
    if (zonaEl) zonaEl.value = '';
    render();
  });
}

Papa.parse('./Instituciones.csv', {
  header: true,
  skipEmptyLines: true,
  download: true,
  complete: (result) => {
    allRows = result.data || [];
    bootstrapFilters(allRows);
    renderLegend();
    render();
  },
  error: () => {
    if (statusEl) statusEl.textContent = 'No se pudo cargar Instituciones.csv';
    alert('No se pudo leer Instituciones.csv');
  }
});
