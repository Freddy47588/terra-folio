/**
 * TERRA // FOLIO — Main Application Controller
 */

import { EXPEDITION_PRESETS } from './noise.js';
import { TerrainEngine } from './terrain.js';
import { CartographicRenderer, EDITIONS } from './renderer.js';
import { TransectProfiler } from './transect.js';
import { FieldAudioEngine } from './audio.js';
import { exportCartographicPlate } from './exporter.js';

class TerraFolioApp {
  constructor() {
    this.terrain = new TerrainEngine(176, 112);
    this.mapCanvas = document.getElementById('map-canvas');
    this.transectCanvas = document.getElementById('transect-canvas');
    this.sunDialCanvas = document.getElementById('sun-dial');

    this.renderer = new CartographicRenderer(this.mapCanvas, this.terrain);
    this.transectProfiler = new TransectProfiler(this.transectCanvas, this.terrain, this.renderer);
    this.audio = new FieldAudioEngine();

    this.activePreset = EXPEDITION_PRESETS[0];
    this.activeTool = 'raise';
    this.isPointerDown = false;
    this.draggingTransectHandle = null; // 'A' | 'B' | 'NEW' | null
    this.lastPointer = { x: 0, y: 0 };
    this.sculptNeedsHydrologyRebuild = false;

    this.init();
  }

  init() {
    this.loadPreset(EXPEDITION_PRESETS[0]);
    this.bindMastheadControls();
    this.bindInstrumentRack();
    this.bindViewportControls();
    this.bindMapCanvasEvents();
    this.bindTransectEvents();
    this.bindSunDialEvents();
    this.bindKeyboardShortcuts();

    window.addEventListener('resize', () => {
      this.renderer.markDirty(false);
    });

    this.startLoop();
  }

  loadPreset(preset) {
    this.activePreset = preset;
    this.terrain.generate(preset.id, preset.seed, {
      seaLevel: preset.seaLevel,
      exaggeration: preset.exaggeration,
      contourInterval: preset.contourInterval,
      sunAzimuth: preset.sunAzimuth,
      sunAltitude: preset.sunAltitude
    });

    this.renderer.transect.ax = preset.transect.ax;
    this.renderer.transect.ay = preset.transect.ay;
    this.renderer.transect.bx = preset.transect.bx;
    this.renderer.transect.by = preset.transect.by;

    // Sync UI inputs
    document.getElementById('seed-input').value = preset.seed;
    document.getElementById('sea-level').value = preset.seaLevel;
    document.getElementById('sea-level-val').textContent = `${preset.seaLevel} m`;
    document.getElementById('exaggeration').value = preset.exaggeration;
    document.getElementById('exaggeration-val').textContent = `${preset.exaggeration.toFixed(2)}×`;
    document.getElementById('contour-interval-val').textContent = `${preset.contourInterval} m`;
    document.getElementById('expedition-desc').textContent = preset.description;

    document.querySelectorAll('.pill-btn[data-interval]').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.interval) === preset.contourInterval);
    });

    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === preset.id);
    });

    this.renderer.markDirty(true);
    this.updateStatsUI();
    this.drawSunDial();
    this.updateTelemetry(0.5, 0.5);
  }

  bindMastheadControls() {
    // Expedition presets
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const found = EXPEDITION_PRESETS.find((p) => p.id === btn.dataset.preset);
        if (found) {
          this.audio.playClick(840, 0.04);
          this.loadPreset(found);
        }
      });
    });

    // Archival Print Editions
    document.querySelectorAll('.edition-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ed = btn.dataset.edition;
        document.documentElement.setAttribute('data-edition', ed);
        document.querySelectorAll('.edition-btn').forEach((b) => b.classList.toggle('active', b === btn));
        this.renderer.setEdition(ed);
        this.drawSunDial();
        this.audio.playClick(960, 0.035);
      });
    });

    // Audio toggle
    const audioBtn = document.getElementById('audio-toggle');
    const audioLabel = document.getElementById('audio-label');
    audioBtn.addEventListener('click', () => {
      const on = this.audio.toggle();
      audioBtn.setAttribute('aria-pressed', String(on));
      audioLabel.textContent = on ? 'AUDIO LIVE' : 'AUDIO OFF';
    });

    // Export Plate PNG
    document.getElementById('export-btn').addEventListener('click', () => {
      this.audio.playWaypointPing(1200);
      exportCartographicPlate(this.terrain, this.renderer, this.transectProfiler, this.activePreset);
    });
  }

  bindInstrumentRack() {
    // Field Tools
    document.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setActiveTool(btn.dataset.tool);
      });
    });

    // Brush size
    const brushInput = document.getElementById('brush-size');
    const brushVal = document.getElementById('brush-size-val');
    brushInput.addEventListener('input', () => {
      const r = parseFloat(brushInput.value);
      this.renderer.cursor.brushRadius = r;
      brushVal.textContent = `${(r * this.terrain.widthKm).toFixed(1)} km`;
    });

    // Quick Action: Monsoon Pulse
    document.getElementById('storm-btn').addEventListener('click', () => {
      this.terrain.spawnGlobalStorm(180);
      this.audio.playRainDrop();
    });

    // Quick Action: Snap Transect Peak -> Abyss
    document.getElementById('snap-transect-btn').addEventListener('click', () => {
      const peak = this.terrain.benchmarks.peaks[0];
      const abyss = this.terrain.benchmarks.soundings[0];
      if (peak && abyss) {
        this.renderer.transect.ax = peak.u;
        this.renderer.transect.ay = peak.v;
        this.renderer.transect.bx = abyss.u;
        this.renderer.transect.by = abyss.v;
        this.audio.playWaypointPing(peak.elev);
      }
    });

    // Quick Action: Reset Relief
    document.getElementById('reset-terrain-btn').addEventListener('click', () => {
      this.terrain.sculptGrid.fill(0);
      this.terrain.rainParticles = [];
      this.terrain.recomputeSurface(true);
      this.renderer.markDirty(true);
      this.updateStatsUI();
      this.audio.playClick(620, 0.045);
    });

    // Seed input & Randomize Seed
    const seedInput = document.getElementById('seed-input');
    seedInput.addEventListener('change', () => {
      const val = seedInput.value.trim().toUpperCase() || 'TERRA-08';
      seedInput.value = val;
      this.terrain.generate(this.activePreset.id, val);
      this.renderer.markDirty(true);
      this.updateStatsUI();
      this.audio.playClick(780, 0.04);
    });

    document.getElementById('random-seed-btn').addEventListener('click', () => {
      const prefixes = ['SVB', 'KRL', 'ANT', '26N', 'ARC', 'BTH', '48E'];
      const p = prefixes[Math.floor(Math.random() * prefixes.length)];
      const num = Math.floor(1000 + Math.random() * 9000);
      const newSeed = `${p}-${num}-X`;
      seedInput.value = newSeed;
      this.terrain.generate(this.activePreset.id, newSeed);
      this.renderer.markDirty(true);
      this.updateStatsUI();
      this.audio.playClick(890, 0.045);
    });

    // Sea Level Datum
    const seaInput = document.getElementById('sea-level');
    const seaVal = document.getElementById('sea-level-val');
    seaInput.addEventListener('input', () => {
      const lvl = parseInt(seaInput.value, 10);
      this.terrain.seaLevel = lvl;
      seaVal.textContent = `${lvl > 0 ? '+' : ''}${lvl} m`;
      this.terrain.recomputeSurface(true);
      this.renderer.markDirty(true);
      this.updateStatsUI();
    });

    // Vertical Exaggeration
    const exagInput = document.getElementById('exaggeration');
    const exagVal = document.getElementById('exaggeration-val');
    exagInput.addEventListener('input', () => {
      const ex = parseFloat(exagInput.value);
      this.terrain.exaggeration = ex;
      exagVal.textContent = `${ex.toFixed(2)}×`;
      this.terrain.recomputeSurface(false);
      this.renderer.markDirty(true);
      this.updateStatsUI();
    });
    exagInput.addEventListener('change', () => {
      this.terrain.computeHydrology();
      this.updateStatsUI();
    });

    // Contour Interval Pills
    document.querySelectorAll('.pill-btn[data-interval]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const interval = parseInt(btn.dataset.interval, 10);
        this.terrain.contourInterval = interval;
        document.getElementById('contour-interval-val').textContent = `${interval} m`;
        document.querySelectorAll('.pill-btn[data-interval]').forEach((b) => b.classList.toggle('active', b === btn));
        this.renderer.markDirty(true);
        this.audio.playClick(740, 0.03);
      });
    });
  }

  setActiveTool(toolName) {
    this.activeTool = toolName;
    this.renderer.cursor.tool = toolName;
    document.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
    this.audio.playClick(820, 0.03);
  }

  bindViewportControls() {
    const controls3D = document.getElementById('controls-3d');

    document.querySelectorAll('.viewmode-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.view;
        document.querySelectorAll('.viewmode-tab').forEach((t) => {
          const active = t === tab;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', String(active));
        });
        this.renderer.setViewMode(mode);
        controls3D.hidden = mode !== 'block3d';
        this.audio.playClick(910, 0.04);
      });
    });

    document.getElementById('orbit-left-btn').addEventListener('click', () => {
      this.renderer.camera3D.yaw -= 0.32;
      this.audio.playClick(700, 0.03);
    });
    document.getElementById('orbit-right-btn').addEventListener('click', () => {
      this.renderer.camera3D.yaw += 0.32;
      this.audio.playClick(700, 0.03);
    });
    document.getElementById('orbit-reset-btn').addEventListener('click', () => {
      this.renderer.camera3D.yaw = -0.62;
      this.renderer.camera3D.pitch = 0.58;
      this.renderer.camera3D.zoom = 1.0;
      this.audio.playClick(850, 0.035);
    });
  }

  bindMapCanvasEvents() {
    const canvas = this.mapCanvas;

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.isPointerDown = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };

      if (this.renderer.viewMode === 'block3d') {
        return;
      }

      const pt = this.renderer.screenToUV(e.clientX, e.clientY);
      if (!pt.inside) return;

      // Check if user grabbed Transect handle A or B directly
      const distA = Math.hypot(pt.u - this.renderer.transect.ax, pt.v - this.renderer.transect.ay);
      const distB = Math.hypot(pt.u - this.renderer.transect.bx, pt.v - this.renderer.transect.by);
      if (distA < 0.035) {
        this.draggingTransectHandle = 'A';
        return;
      }
      if (distB < 0.035) {
        this.draggingTransectHandle = 'B';
        return;
      }

      if (this.activeTool === 'transect') {
        this.renderer.transect.ax = pt.u;
        this.renderer.transect.ay = pt.v;
        this.renderer.transect.bx = Math.min(0.96, pt.u + 0.01);
        this.renderer.transect.by = Math.min(0.96, pt.v + 0.01);
        this.draggingTransectHandle = 'B';
        this.audio.playClick(680, 0.03);
        return;
      }

      if (this.activeTool === 'waypoint') {
        const type = document.getElementById('waypoint-type').value;
        const nameInput = document.getElementById('waypoint-name');
        const wp = this.terrain.addWaypoint(pt.u, pt.v, type, nameInput.value);
        nameInput.value = '';
        const elev = this.terrain.sampleElevation(wp.u, wp.v);
        this.audio.playWaypointPing(elev);
        return;
      }

      // Apply terraforming or rainstorm brush
      this.applyActiveBrushAt(pt.u, pt.v);
    });

    canvas.addEventListener('pointermove', (e) => {
      const pt = this.renderer.screenToUV(e.clientX, e.clientY);
      this.renderer.cursor.active = pt.inside && this.renderer.viewMode !== 'block3d';
      this.renderer.cursor.u = pt.u;
      this.renderer.cursor.v = pt.v;

      if (pt.inside) {
        this.updateTelemetry(pt.u, pt.v);
      }

      if (!this.isPointerDown) return;

      if (this.renderer.viewMode === 'block3d') {
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        this.renderer.camera3D.yaw += dx * 0.0085;
        this.renderer.camera3D.pitch = Math.max(0.22, Math.min(1.28, this.renderer.camera3D.pitch + dy * 0.007));
        return;
      }

      if (this.draggingTransectHandle === 'A') {
        this.renderer.transect.ax = pt.u;
        this.renderer.transect.ay = pt.v;
        return;
      }
      if (this.draggingTransectHandle === 'B') {
        this.renderer.transect.bx = pt.u;
        this.renderer.transect.by = pt.v;
        return;
      }

      if (pt.inside && ['raise', 'lower', 'smooth', 'rain'].includes(this.activeTool)) {
        this.applyActiveBrushAt(pt.u, pt.v);
      }
    });

    const endPointer = () => {
      this.isPointerDown = false;
      this.draggingTransectHandle = null;
      if (this.sculptNeedsHydrologyRebuild) {
        this.terrain.computeHydrology();
        this.updateStatsUI();
        this.sculptNeedsHydrologyRebuild = false;
      }
    };

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', () => {
      this.renderer.cursor.active = false;
    });

    // Wheel zoom in 3D mode or brush resize in 2D mode
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.renderer.viewMode === 'block3d') {
        const factor = e.deltaY < 0 ? 1.07 : 0.93;
        this.renderer.camera3D.zoom = Math.max(0.65, Math.min(1.65, this.renderer.camera3D.zoom * factor));
      } else {
        const brushInput = document.getElementById('brush-size');
        const next = Math.max(0.035, Math.min(0.14, this.renderer.cursor.brushRadius - Math.sign(e.deltaY) * 0.005));
        this.renderer.cursor.brushRadius = next;
        brushInput.value = String(next);
        document.getElementById('brush-size-val').textContent = `${(next * this.terrain.widthKm).toFixed(1)} km`;
      }
    }, { passive: false });
  }

  applyActiveBrushAt(u, v) {
    const modified = this.terrain.applyBrush(
      u,
      v,
      this.activeTool,
      this.renderer.cursor.brushRadius,
      40
    );
    if (modified) {
      this.renderer.markDirty(true);
      this.sculptNeedsHydrologyRebuild = true;
      this.updateStatsUI();
    } else if (this.activeTool === 'rain') {
      this.audio.playRainDrop();
    }
  }

  bindTransectEvents() {
    const tCanvas = this.transectCanvas;
    tCanvas.addEventListener('pointermove', (e) => {
      const t = this.transectProfiler.clientXToT(e.clientX);
      this.renderer.transect.hoverT = t;
      const u = this.renderer.transect.ax + (this.renderer.transect.bx - this.renderer.transect.ax) * t;
      const v = this.renderer.transect.ay + (this.renderer.transect.by - this.renderer.transect.ay) * t;
      this.updateTelemetry(u, v);
    });

    tCanvas.addEventListener('pointerleave', () => {
      this.renderer.transect.hoverT = null;
    });
  }

  bindSunDialEvents() {
    const dial = this.sunDialCanvas;
    let draggingSun = false;

    const updateSunFromEvent = (e) => {
      const rect = dial.getBoundingClientRect();
      const cx = rect.width * 0.5;
      const cy = rect.height * 0.5;
      const dx = e.clientX - rect.left - cx;
      const dy = e.clientY - rect.top - cy;
      const maxR = cx - 12;

      let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      if (angleDeg < 0) angleDeg += 360;

      const distNorm = Math.min(1, Math.hypot(dx, dy) / maxR);
      const altitude = Math.round(80 - distNorm * 65); // Center = 80° zenith, Rim = 15° low sun

      this.terrain.sunAzimuth = Math.round(angleDeg);
      this.terrain.sunAltitude = Math.max(12, Math.min(82, altitude));
      this.renderer.markDirty(false);
      this.drawSunDial();
    };

    dial.addEventListener('pointerdown', (e) => {
      dial.setPointerCapture(e.pointerId);
      draggingSun = true;
      updateSunFromEvent(e);
    });
    dial.addEventListener('pointermove', (e) => {
      if (draggingSun) updateSunFromEvent(e);
    });
    dial.addEventListener('pointerup', () => {
      draggingSun = false;
    });
  }

  drawSunDial() {
    const canvas = this.sunDialCanvas;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = cx - 14;

    const theme = EDITIONS[this.renderer.edition] || EDITIONS.imhof;

    ctx.clearRect(0, 0, w, h);

    // Compass rings
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;
    [maxR, maxR * 0.55].forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.stroke();

    // Cardinal labels
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '600 9px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, 7);
    ctx.fillText('S', cx, h - 6);
    ctx.fillText('E', w - 6, cy);
    ctx.fillText('W', 6, cy);

    // Sun vector position
    const azRad = ((this.terrain.sunAzimuth - 90) * Math.PI) / 180;
    const distNorm = (80 - this.terrain.sunAltitude) / 65;
    const r = Math.max(4, Math.min(maxR, distNorm * maxR));
    const sx = cx + Math.cos(azRad) * r;
    const sy = cy + Math.sin(azRad) * r;

    // Ray from sun to center
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    // Sun orb
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.neatlineBg;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dirStr = dirs[Math.round(this.terrain.sunAzimuth / 45) % 8];
    document.getElementById('sun-readout').textContent = `${this.terrain.sunAzimuth}° ${dirStr} · ${this.terrain.sunAltitude}°`;
  }

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const map = {
        '1': 'raise',
        '2': 'lower',
        '3': 'smooth',
        '4': 'rain',
        '5': 'transect',
        '6': 'waypoint'
      };
      if (map[e.key]) {
        this.setActiveTool(map[e.key]);
      }
    });
  }

  updateStatsUI() {
    const { maxElevation, minElevation, landRatio, riverCount } = this.terrain.stats;
    document.getElementById('stat-max-elev').textContent = `△ ${maxElevation > 0 ? '+' : ''}${maxElevation} m`;
    document.getElementById('stat-min-elev').textContent = `▽ ${minElevation} m`;
    document.getElementById('stat-land-ratio').textContent = `${landRatio}% / ${100 - landRatio}%`;
    document.getElementById('stat-rivers').textContent = `${riverCount} Basins`;
  }

  updateTelemetry(u, v) {
    const grad = this.terrain.sampleGradient(u, v);
    const moist = this.terrain.sampleMoisture(u, v);
    const biome = this.terrain.classifyBiome(grad.elev, moist, grad.slopeDeg);
    const elevRound = Math.round(grad.elev);

    document.getElementById('tele-coords').textContent = this.terrain.formatCoordinates(u, v);
    document.getElementById('tele-elev').textContent = `${elevRound >= 0 ? '+' : ''}${elevRound} m`;
    document.getElementById('tele-slope').textContent = `${Math.round(grad.slopeDeg)}° (${Math.round(grad.gradePct)}%)`;
    document.getElementById('tele-biome').textContent = biome.label;

    this.audio.updateElevationAcoustics(grad.elev, this.terrain.seaLevel);
  }

  updateTransectMetricsUI() {
    const m = this.transectProfiler.metrics;
    document.getElementById('tr-dist').textContent = `${m.distanceKm.toFixed(1)} km`;
    document.getElementById('tr-max').textContent = `${m.maxElev >= 0 ? '+' : ''}${m.maxElev} m`;
    document.getElementById('tr-min').textContent = `${m.minElev} m`;
    document.getElementById('tr-relief').textContent = `${m.relief} m`;
    document.getElementById('tr-grade').textContent = `${m.maxGradePct}%`;
  }

  startLoop() {
    const tick = () => {
      // Step active rainstorm erosion droplets
      if (this.terrain.rainParticles.length > 0) {
        const eroded = this.terrain.updateRainParticles();
        if (eroded) {
          this.renderer.markDirty(true);
        }
      }

      this.renderer.render();
      this.transectProfiler.render();
      this.updateTransectMetricsUI();

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.terraFolio = new TerraFolioApp();
});
