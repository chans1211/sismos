(() => {
  const CONFIG = {
    baseUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/',
    feeds: { hour: 'all_hour', day: 'all_day', week: '2.5_week' },
    refreshMs: 5 * 60 * 1000,
    depthBands: [
      { max: 35, color: '#ff5a36', label: 'Superficial (<35 km)' },
      { max: 70, color: '#ffb000', label: '35–70 km' },
      { max: 300, color: '#1fb89f', label: '70–300 km' },
      { max: Infinity, color: '#5b7bff', label: 'Profundo (>300 km)' },
    ],
    histogramBins: [0, 1, 2, 3, 4, 5, 6, 7],
    fallback: [
      { id: 'f1', place: 'Costa de Chile', mag: 6.1, time: Date.now() - 3.6e6, lon: -71.6, lat: -33.2, depth: 28 },
      { id: 'f2', place: 'Islas Aleutianas, Alaska', mag: 5.2, time: Date.now() - 7.2e6, lon: -176.3, lat: 51.7, depth: 40 },
      { id: 'f3', place: 'Sur de Honshu, Japón', mag: 4.8, time: Date.now() - 1.1e7, lon: 139.9, lat: 35.1, depth: 55 },
      { id: 'f4', place: 'Costa de Perú', mag: 4.1, time: Date.now() - 1.5e7, lon: -76.9, lat: -12.5, depth: 110 },
      { id: 'f5', place: 'Fiyi', mag: 5.6, time: Date.now() - 2e7, lon: 179.3, lat: -21.1, depth: 580 },
      { id: 'f6', place: 'Sumatra, Indonesia', mag: 5.0, time: Date.now() - 3e7, lon: 96.2, lat: 2.9, depth: 22 },
    ],
  };

  const dom = {
    canvas: document.getElementById('map'),
    tooltip: document.getElementById('tooltip'),
    legend: document.getElementById('legend'),
    status: document.getElementById('status'),
    periods: document.getElementById('periods'),
    slider: document.getElementById('magSlider'),
    sliderValue: document.getElementById('magValue'),
    count: document.getElementById('statCount'),
    max: document.getElementById('statMax'),
    depth: document.getElementById('statDepth'),
    histogram: document.getElementById('histogram'),
    ranking: document.getElementById('ranking'),
  };

  const ctx = dom.canvas.getContext('2d');
  const relativeTime = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

  const state = {
    period: 'day',
    minMag: 0,
    quakes: [],
    visible: [],
    selectedId: null,
    size: { width: 0, height: 0 },
  };

  const depthColor = (depth) => CONFIG.depthBands.find((band) => depth < band.max).color;
  const radiusFor = (mag) => 2 + Math.pow(Math.max(mag, 0), 1.7) * 0.55;

  function project(lon, lat) {
    return {
      x: ((lon + 180) / 360) * state.size.width,
      y: ((90 - lat) / 180) * state.size.height,
    };
  }

  function formatAgo(time) {
    const minutes = Math.round((time - Date.now()) / 60000);
    if (Math.abs(minutes) < 60) return relativeTime.format(minutes, 'minute');
    if (Math.abs(minutes) < 1440) return relativeTime.format(Math.round(minutes / 60), 'hour');
    return relativeTime.format(Math.round(minutes / 1440), 'day');
  }

  function themeColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  }

  const api = {
    async fetchQuakes(period) {
      const response = await fetch(`${CONFIG.baseUrl}${CONFIG.feeds[period]}.geojson`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.features
        .filter((feature) => feature.properties.mag !== null)
        .map((feature) => ({
          id: feature.id,
          place: feature.properties.place || 'Ubicación desconocida',
          mag: feature.properties.mag,
          time: feature.properties.time,
          lon: feature.geometry.coordinates[0],
          lat: feature.geometry.coordinates[1],
          depth: feature.geometry.coordinates[2],
        }));
    },
  };

  const status = {
    live(text) {
      dom.status.textContent = text;
      dom.status.classList.add('live');
    },
    plain(text) {
      dom.status.textContent = text;
      dom.status.classList.remove('live');
    },
  };

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const width = dom.canvas.clientWidth;
    const height = dom.canvas.clientHeight;

    dom.canvas.width = width * ratio;
    dom.canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    state.size = { width, height };
    drawMap();
  }

  function drawGraticule() {
    const { width, height } = state.size;
    ctx.strokeStyle = themeColor('line');
    ctx.lineWidth = 1;

    for (let lon = -180; lon <= 180; lon += 30) {
      const { x } = project(lon, 0);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let lat = -60; lat <= 60; lat += 30) {
      const { y } = project(0, lat);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function drawQuakes() {
    const ordered = [...state.visible].sort((a, b) => b.mag - a.mag);

    for (const quake of ordered) {
      const { x, y } = project(quake.lon, quake.lat);
      const radius = radiusFor(quake.mag);

      ctx.globalAlpha = 0.6;
      ctx.fillStyle = depthColor(quake.depth);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1;
      ctx.strokeStyle = depthColor(quake.depth);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  function drawSelection() {
    const quake = state.visible.find((item) => item.id === state.selectedId);
    if (!quake) return;

    const { x, y } = project(quake.lon, quake.lat);
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeColor('ink');
    ctx.beginPath();
    ctx.arc(x, y, radiusFor(quake.mag) + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawMap() {
    ctx.clearRect(0, 0, state.size.width, state.size.height);
    drawGraticule();
    drawQuakes();
    drawSelection();
  }

  function renderStats() {
    const { visible } = state;
    const strongest = visible.reduce((best, quake) => Math.max(best, quake.mag), 0);
    const meanDepth = visible.length ? visible.reduce((sum, quake) => sum + quake.depth, 0) / visible.length : 0;

    dom.count.textContent = visible.length.toLocaleString('es');
    dom.max.textContent = visible.length ? strongest.toFixed(1) : '–';
    dom.depth.textContent = visible.length ? `${Math.round(meanDepth)} km` : '–';
  }

  function renderHistogram() {
    const bins = CONFIG.histogramBins;
    const counts = bins.map((low, index) => {
      const high = bins[index + 1] ?? Infinity;
      return state.visible.filter((quake) => quake.mag >= low && quake.mag < high).length;
    });
    const peak = Math.max(...counts, 1);

    dom.histogram.innerHTML = counts
      .map((count, index) => {
        const label = index === bins.length - 1 ? `${bins[index]}+` : bins[index];
        return `<div><small>${count}</small><span style="height:${(count / peak) * 100}%"></span>M${label}</div>`;
      })
      .join('');
  }

  function renderRanking() {
    const top = [...state.visible].sort((a, b) => b.mag - a.mag).slice(0, 8);

    dom.ranking.innerHTML = top
      .map(
        (quake) => `
        <li>
          <button data-id="${quake.id}" class="${quake.id === state.selectedId ? 'active' : ''}">
            <strong>M ${quake.mag.toFixed(1)}</strong>
            <span>${quake.place}</span>
            <small>${formatAgo(quake.time)}</small>
          </button>
        </li>`
      )
      .join('');

    if (!top.length) dom.ranking.innerHTML = '<li>No hay sismos con este filtro.</li>';
  }

  function renderLegend() {
    dom.legend.innerHTML = CONFIG.depthBands
      .map((band) => `<li><i style="background:${band.color}"></i>${band.label}</li>`)
      .join('');
  }

  function applyFilters() {
    state.visible = state.quakes.filter((quake) => quake.mag >= state.minMag);
    renderStats();
    renderHistogram();
    renderRanking();
    drawMap();
  }

  async function loadData() {
    status.plain('Cargando…');
    try {
      state.quakes = await api.fetchQuakes(state.period);
      status.live(`En vivo · actualizado ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`);
    } catch {
      state.quakes = CONFIG.fallback;
      status.plain('Sin conexión · mostrando datos de ejemplo');
    }
    applyFilters();
  }

  function findQuakeAt(clientX, clientY) {
    const bounds = dom.canvas.getBoundingClientRect();
    const px = clientX - bounds.left;
    const py = clientY - bounds.top;
    let nearest = null;
    let nearestDistance = Infinity;

    for (const quake of state.visible) {
      const { x, y } = project(quake.lon, quake.lat);
      const distance = Math.hypot(x - px, y - py);
      if (distance < radiusFor(quake.mag) + 5 && distance < nearestDistance) {
        nearest = quake;
        nearestDistance = distance;
      }
    }
    return { quake: nearest, px, py };
  }

  function showTooltip(quake, px, py) {
    if (!quake) {
      dom.tooltip.hidden = true;
      return;
    }
    dom.tooltip.hidden = false;
    dom.tooltip.innerHTML = `<b>M ${quake.mag.toFixed(1)}</b> · ${Math.round(quake.depth)} km de profundidad<br>${quake.place}<br>${formatAgo(quake.time)}`;
    const left = Math.min(px + 14, state.size.width - dom.tooltip.offsetWidth - 8);
    dom.tooltip.style.left = `${Math.max(8, left)}px`;
    dom.tooltip.style.top = `${Math.max(8, py - dom.tooltip.offsetHeight - 10)}px`;
  }

  function bindEvents() {
    dom.periods.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      state.period = button.dataset.period;
      dom.periods.querySelectorAll('button').forEach((item) => {
        item.setAttribute('aria-pressed', String(item === button));
      });
      state.selectedId = null;
      loadData();
    });

    dom.slider.addEventListener('input', () => {
      state.minMag = Number(dom.slider.value);
      dom.sliderValue.textContent = state.minMag.toFixed(1);
      applyFilters();
    });

    dom.canvas.addEventListener('pointermove', (event) => {
      const { quake, px, py } = findQuakeAt(event.clientX, event.clientY);
      showTooltip(quake, px, py);
    });

    dom.canvas.addEventListener('pointerleave', () => showTooltip(null));

    dom.canvas.addEventListener('click', (event) => {
      const { quake } = findQuakeAt(event.clientX, event.clientY);
      state.selectedId = quake ? quake.id : null;
      renderRanking();
      drawMap();
    });

    dom.ranking.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      state.selectedId = button.dataset.id;
      renderRanking();
      drawMap();
    });

    window.addEventListener('resize', resizeCanvas);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawMap);
  }

  function init() {
    renderLegend();
    bindEvents();
    resizeCanvas();
    loadData();
    setInterval(loadData, CONFIG.refreshMs);
  }

  init();
})();
