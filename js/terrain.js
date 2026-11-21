/**
 * TERRA // FOLIO — Terrain Elevation Field, D8 Hydrology, Terraforming & Biome Engine
 */

import { SimplexNoise2D, evaluatePresetElevation, createPRNG } from './noise.js';

const WAYPOINT_NAMES = {
  summit: ['Piz Bernina', 'K2 North Spur', 'Aiguille Noire', 'Hornindal Peak', 'Surtsey Dome', 'Monte Rosa', 'Valkyrie Crag'],
  anchorage: ['Halcyon Sound', 'Barents Cove', 'Port Meridian', 'Kestrel Bight', 'Siren Roadstead', 'Echo Narrows'],
  thermal: ['Solfatara Vent', 'Hekla Fumarole', 'Obsidian Spring', 'Brimstone Basin', 'Caldera Plume'],
  observatory: ['Geodetic Sta. IV', 'Triangulation Pillar 09', 'Zenith Beacon', 'Altimetry Relay', 'Signal Turret'],
  camp: ['Basecamp Alpha', 'Col Bivouac', 'Glacier Depot', 'Moraine Shelter', 'Ridge Outpost']
};

export class TerrainEngine {
  constructor(cols = 176, rows = 112) {
    this.cols = cols;
    this.rows = rows;
    this.size = cols * rows;

    // Map physical dimensions: 24.0 km wide x 15.27 km tall
    this.widthKm = 24.0;
    this.heightKm = (rows / cols) * this.widthKm;

    this.baseGrid = new Float32Array(this.size);
    this.sculptGrid = new Float32Array(this.size);
    this.elevGrid = new Float32Array(this.size);
    this.moistureGrid = new Float32Array(this.size);
    this.fluxGrid = new Float32Array(this.size);
    this.downstream = new Int32Array(this.size);

    this.presetId = 'fjord';
    this.seed = 'SVALBARD-78N';
    this.seaLevel = 0;
    this.exaggeration = 1.15;
    this.contourInterval = 100;
    this.sunAzimuth = 315;
    this.sunAltitude = 34;

    this.benchmarks = { peaks: [], soundings: [] };
    this.rivers = [];
    this.waypoints = [];
    this.rainParticles = [];
    this.stats = {
      maxElevation: 0,
      minElevation: 0,
      landRatio: 0,
      meanElevation: 0,
      riverCount: 0
    };

    this.waypointCounter = 0;
  }

  generate(presetId, seedStr, options = {}) {
    this.presetId = presetId || this.presetId;
    this.seed = seedStr || this.seed;
    if (typeof options.seaLevel === 'number') this.seaLevel = options.seaLevel;
    if (typeof options.exaggeration === 'number') this.exaggeration = options.exaggeration;
    if (typeof options.contourInterval === 'number') this.contourInterval = options.contourInterval;
    if (typeof options.sunAzimuth === 'number') this.sunAzimuth = options.sunAzimuth;
    if (typeof options.sunAltitude === 'number') this.sunAltitude = options.sunAltitude;

    const simplex = new SimplexNoise2D(this.seed);
    const moistureSimplex = new SimplexNoise2D(this.seed + '-MOIST');
    this.sculptGrid.fill(0);
    this.rainParticles = [];

    for (let r = 0; r < this.rows; r++) {
      const v = r / (this.rows - 1);
      for (let c = 0; c < this.cols; c++) {
        const u = c / (this.cols - 1);
        const idx = r * this.cols + c;
        this.baseGrid[idx] = evaluatePresetElevation(this.presetId, u, v, simplex);
        const m = 0.5 + 0.5 * moistureSimplex.fbm(u * 3.2, v * 3.2, 4);
        this.moistureGrid[idx] = Math.max(0, Math.min(1, m));
      }
    }

    this.recomputeSurface(true);
    this.seedDefaultWaypoints();
  }

  recomputeSurface(rebuildHydrology = true) {
    let maxE = -Infinity;
    let minE = Infinity;
    let sumE = 0;
    let landCells = 0;

    for (let i = 0; i < this.size; i++) {
      const e = Math.max(-2400, Math.min(4400, this.baseGrid[i] * this.exaggeration + this.sculptGrid[i]));
      this.elevGrid[i] = e;
      if (e > maxE) maxE = e;
      if (e < minE) minE = e;
      sumE += e;
      if (e >= this.seaLevel) landCells++;
    }

    this.stats.maxElevation = Math.round(maxE);
    this.stats.minElevation = Math.round(minE);
    this.stats.meanElevation = Math.round(sumE / this.size);
    this.stats.landRatio = Math.round((landCells / this.size) * 100);

    this.detectBenchmarks();
    if (rebuildHydrology) {
      this.computeHydrology();
    }
  }

  detectBenchmarks() {
    const peaks = [];
    const soundings = [];
    const margin = 6;
    const radius = 5;

    for (let r = margin; r < this.rows - margin; r += 2) {
      for (let c = margin; c < this.cols - margin; c += 2) {
        const idx = r * this.cols + c;
        const val = this.elevGrid[idx];
        let isMax = val > this.seaLevel + 280;
        let isMin = val < this.seaLevel - 240;
        if (!isMax && !isMin) continue;

        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nVal = this.elevGrid[(r + dr) * this.cols + (c + dc)];
            if (isMax && nVal >= val) isMax = false;
            if (isMin && nVal <= val) isMin = false;
            if (!isMax && !isMin) break;
          }
          if (!isMax && !isMin) break;
        }

        if (isMax) {
          peaks.push({ u: c / (this.cols - 1), v: r / (this.rows - 1), elev: Math.round(val), c, r });
        } else if (isMin) {
          soundings.push({ u: c / (this.cols - 1), v: r / (this.rows - 1), elev: Math.round(val), c, r });
        }
      }
    }

    peaks.sort((a, b) => b.elev - a.elev);
    soundings.sort((a, b) => a.elev - b.elev);

    this.benchmarks.peaks = filterSeparated(peaks, 0.14, 5);
    this.benchmarks.soundings = filterSeparated(soundings, 0.15, 4);
  }

  computeHydrology() {
    this.fluxGrid.fill(1.0);
    this.downstream.fill(-1);

    const indices = [];
    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        const idx = r * this.cols + c;
        if (this.elevGrid[idx] >= this.seaLevel - 10) {
          indices.push(idx);
        }
      }
    }

    // Sort descending by elevation so overland flow accumulates from ridge to coast
    indices.sort((a, b) => this.elevGrid[b] - this.elevGrid[a]);

    const dR = [-1, -1, -1, 0, 0, 1, 1, 1];
    const dC = [-1, 0, 1, -1, 1, -1, 0, 1];
    const dDist = [1.414, 1, 1.414, 1, 1, 1.414, 1, 1.414];

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const r = (idx / this.cols) | 0;
      const c = idx % this.cols;
      const e = this.elevGrid[idx];

      let bestSlope = 0;
      let bestTarget = -1;

      for (let k = 0; k < 8; k++) {
        const nr = r + dR[k];
        const nc = c + dC[k];
        const nIdx = nr * this.cols + nc;
        const drop = (e - this.elevGrid[nIdx]) / dDist[k];
        if (drop > bestSlope) {
          bestSlope = drop;
          bestTarget = nIdx;
        }
      }

      if (bestTarget !== -1) {
        this.downstream[idx] = bestTarget;
        // High altitude receives extra orographic precipitation
        const precip = 1.0 + Math.max(0, (e - this.seaLevel) / 1400) * 1.4;
        this.fluxGrid[bestTarget] += this.fluxGrid[idx] * 0.96 + precip * 0.25;
      }
    }

    // Extract major river polylines from cells with high flux
    const visited = new Uint8Array(this.size);
    const riverPaths = [];
    const fluxThreshold = 34;

    for (let i = 0; i < indices.length; i++) {
      const startIdx = indices[i];
      if (this.fluxGrid[startIdx] < fluxThreshold || visited[startIdx]) continue;
      if (this.elevGrid[startIdx] <= this.seaLevel) continue;

      const path = [];
      let curr = startIdx;
      let steps = 0;

      while (curr !== -1 && steps < 220) {
        const r = (curr / this.cols) | 0;
        const c = curr % this.cols;
        const e = this.elevGrid[curr];
        path.push({
          u: c / (this.cols - 1),
          v: r / (this.rows - 1),
          flux: this.fluxGrid[curr],
          elev: e
        });
        if (e < this.seaLevel) break;
        if (visited[curr] && path.length > 2) break;
        visited[curr] = 1;
        curr = this.downstream[curr];
        steps++;
      }

      if (path.length >= 5) {
        riverPaths.push(path);
      }
    }

    this.rivers = riverPaths;
    this.stats.riverCount = riverPaths.length;
  }

  seedDefaultWaypoints() {
    this.waypoints = [];
    const rand = createPRNG(this.seed);
    if (this.benchmarks.peaks.length > 0) {
      const p = this.benchmarks.peaks[0];
      const names = WAYPOINT_NAMES.summit;
      this.waypoints.push({
        id: 'wp-1',
        type: 'summit',
        u: p.u,
        v: p.v,
        name: names[Math.floor(rand() * names.length)]
      });
    }
    if (this.benchmarks.soundings.length > 0) {
      const s = this.benchmarks.soundings[0];
      const names = WAYPOINT_NAMES.anchorage;
      this.waypoints.push({
        id: 'wp-2',
        type: 'anchorage',
        u: clamp(s.u + 0.05, 0.08, 0.92),
        v: clamp(s.v - 0.04, 0.08, 0.92),
        name: names[Math.floor(rand() * names.length)]
      });
    }
    this.waypointCounter = this.waypoints.length;
  }

  addWaypoint(u, v, type = 'summit', customName = '') {
    this.waypointCounter++;
    const pool = WAYPOINT_NAMES[type] || WAYPOINT_NAMES.summit;
    const defaultName = pool[(this.waypointCounter - 1) % pool.length];
    const wp = {
      id: `wp-${Date.now()}-${this.waypointCounter}`,
      type,
      u: clamp(u, 0.03, 0.97),
      v: clamp(v, 0.03, 0.97),
      name: (customName && customName.trim()) ? customName.trim() : defaultName
    };
    this.waypoints.push(wp);
    return wp;
  }

  /**
   * Sculpt terrain at normalized coordinates (u, v)
   * mode: 'raise' | 'lower' | 'smooth' | 'rain'
   */
  applyBrush(u, v, mode = 'raise', radiusNorm = 0.075, strength = 48) {
    if (mode === 'rain') {
      this.spawnRainBurst(u, v, 24, radiusNorm * 1.1);
      return false;
    }

    const centerC = u * (this.cols - 1);
    const centerR = v * (this.rows - 1);
    const radCols = Math.ceil(radiusNorm * this.cols);
    const radRows = Math.ceil(radiusNorm * (this.cols)); // isotropic radius in grid space

    const c0 = Math.max(1, Math.floor(centerC - radCols));
    const c1 = Math.min(this.cols - 2, Math.ceil(centerC + radCols));
    const r0 = Math.max(1, Math.floor(centerR - radRows));
    const r1 = Math.min(this.rows - 2, Math.ceil(centerR + radRows));

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const dx = (c - centerC) / radCols;
        const dy = (r - centerR) / radCols;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1.0) continue;

        // Smooth quintic falloff kernel
        const w = Math.pow(1.0 - d2, 2);
        const idx = r * this.cols + c;

        if (mode === 'raise') {
          this.sculptGrid[idx] += strength * w;
        } else if (mode === 'lower') {
          this.sculptGrid[idx] -= strength * w;
        } else if (mode === 'smooth') {
          const avg = (
            this.elevGrid[idx - 1] +
            this.elevGrid[idx + 1] +
            this.elevGrid[idx - this.cols] +
            this.elevGrid[idx + this.cols]
          ) * 0.25;
          const diff = avg - this.elevGrid[idx];
          this.sculptGrid[idx] += diff * 0.35 * w;
        }
      }
    }

    this.recomputeSurface(false);
    return true;
  }

  spawnRainBurst(u, v, count = 28, spread = 0.07) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * spread;
      const pu = clamp(u + Math.cos(angle) * dist, 0.02, 0.98);
      const pv = clamp(v + Math.sin(angle) * dist * (this.cols / this.rows), 0.02, 0.98);
      this.rainParticles.push({
        u: pu,
        v: pv,
        vu: 0,
        vv: 0,
        sediment: 0,
        life: 90 + Math.floor(Math.random() * 75),
        maxLife: 165,
        trail: [{ u: pu, v: pv }]
      });
    }
    if (this.rainParticles.length > 550) {
      this.rainParticles.splice(0, this.rainParticles.length - 550);
    }
  }

  spawnGlobalStorm(count = 160) {
    for (let i = 0; i < count; i++) {
      const u = 0.05 + Math.random() * 0.9;
      const v = 0.05 + Math.random() * 0.9;
      if (this.sampleElevation(u, v) > this.seaLevel + 50) {
        this.spawnRainBurst(u, v, 1, 0.01);
      }
    }
  }

  /**
   * Steps live hydrological water droplets downhill along terrain gradients
   */
  updateRainParticles() {
    if (this.rainParticles.length === 0) return false;

    let eroded = false;
    for (let i = this.rainParticles.length - 1; i >= 0; i--) {
      const p = this.rainParticles[i];
      p.life--;
      if (p.life <= 0) {
        this.rainParticles.splice(i, 1);
        continue;
      }

      const sample = this.sampleGradient(p.u, p.v);
      if (sample.elev <= this.seaLevel - 15) {
        p.life = Math.min(p.life, 8);
      }

      // Accelerate downhill
      p.vu = p.vu * 0.65 - sample.gx * 0.000011;
      p.vv = p.vv * 0.65 - sample.gy * 0.000011;

      const speed = Math.hypot(p.vu, p.vv);
      if (speed < 0.00025) {
        // Gentle jitter in flat basins
        p.vu += (Math.random() - 0.5) * 0.0004;
        p.vv += (Math.random() - 0.5) * 0.0004;
      }

      p.u += p.vu;
      p.v += p.vv;

      if (p.u <= 0.01 || p.u >= 0.99 || p.v <= 0.01 || p.v >= 0.99) {
        this.rainParticles.splice(i, 1);
        continue;
      }

      p.trail.push({ u: p.u, v: p.v });
      if (p.trail.length > 11) p.trail.shift();

      // Subtle hydraulic carving along steep slopes
      if (sample.elev > this.seaLevel && speed > 0.0008) {
        const c = Math.round(p.u * (this.cols - 1));
        const r = Math.round(p.v * (this.rows - 1));
        const idx = r * this.cols + c;
        if (idx >= 0 && idx < this.size) {
          this.sculptGrid[idx] -= 0.35;
          this.elevGrid[idx] -= 0.35;
          eroded = true;
        }
      }
    }

    return eroded;
  }

  /**
   * Bilinear interpolation of elevation at normalized (u, v) in [0, 1]
   */
  sampleElevation(u, v) {
    const cu = clamp(u, 0, 1) * (this.cols - 1);
    const cv = clamp(v, 0, 1) * (this.rows - 1);
    const c0 = Math.floor(cu);
    const r0 = Math.floor(cv);
    const c1 = Math.min(this.cols - 1, c0 + 1);
    const r1 = Math.min(this.rows - 1, r0 + 1);
    const tx = cu - c0;
    const ty = cv - r0;

    const e00 = this.elevGrid[r0 * this.cols + c0];
    const e10 = this.elevGrid[r0 * this.cols + c1];
    const e01 = this.elevGrid[r1 * this.cols + c0];
    const e11 = this.elevGrid[r1 * this.cols + c1];

    const top = e00 + (e10 - e00) * tx;
    const bot = e01 + (e11 - e01) * tx;
    return top + (bot - top) * ty;
  }

  sampleMoisture(u, v) {
    const c = Math.round(clamp(u, 0, 1) * (this.cols - 1));
    const r = Math.round(clamp(v, 0, 1) * (this.rows - 1));
    const idx = r * this.cols + c;
    const fluxBonus = Math.min(0.45, Math.sqrt(this.fluxGrid[idx] || 0) * 0.03);
    return Math.min(1, (this.moistureGrid[idx] || 0.5) + fluxBonus);
  }

  sampleGradient(u, v) {
    const du = 1 / (this.cols - 1);
    const dv = 1 / (this.rows - 1);
    const elev = this.sampleElevation(u, v);
    const ex1 = this.sampleElevation(u + du, v);
    const ex0 = this.sampleElevation(u - du, v);
    const ey1 = this.sampleElevation(u, v + dv);
    const ey0 = this.sampleElevation(u, v - dv);

    const cellWidthMeters = (this.widthKm * 1000) / (this.cols - 1);
    const cellHeightMeters = (this.heightKm * 1000) / (this.rows - 1);

    const dzdx = (ex1 - ex0) / (2 * cellWidthMeters);
    const dzdy = (ey1 - ey0) / (2 * cellHeightMeters);
    const slopeRad = Math.atan(Math.hypot(dzdx, dzdy));
    const slopeDeg = (slopeRad * 180) / Math.PI;
    const gradePct = Math.hypot(dzdx, dzdy) * 100;

    return {
      elev,
      gx: (ex1 - ex0) * 0.5,
      gy: (ey1 - ey0) * 0.5,
      dzdx,
      dzdy,
      slopeDeg,
      gradePct
    };
  }

  classifyBiome(elev, moisture = 0.5, slopeDeg = 10) {
    const rel = elev - this.seaLevel;
    if (rel < -1100) return { id: 'abyss', label: 'Abyssal Trench', code: 'B-01', color: [16, 46, 74] };
    if (rel < -350) return { id: 'bathyal', label: 'Bathyal Slope', code: 'B-02', color: [31, 78, 114] };
    if (rel < -60) return { id: 'neritic', label: 'Pelagic Shelf', code: 'B-03', color: [58, 116, 148] };
    if (rel < 0) return { id: 'littoral', label: 'Littoral Shoal', code: 'B-04', color: [98, 162, 178] };
    if (rel < 65) return { id: 'strand', label: 'Coastal Strand & Estuary', code: 'T-01', color: [214, 198, 152] };
    if (rel > 2450) return { id: 'glacial', label: 'Alpine Névé & Glacier', code: 'T-07', color: [242, 246, 250] };
    if (rel > 1800) {
      return slopeDeg > 28
        ? { id: 'arête', label: 'Hornfels Arête & Scree', code: 'T-06', color: [142, 134, 126] }
        : { id: 'tundra', label: 'Alpine Krummholz Tundra', code: 'T-05', color: [176, 172, 145] };
    }
    if (rel > 1050) {
      return moisture > 0.48
        ? { id: 'taiga', label: 'Subalpine Boreal Taiga', code: 'T-04', color: [84, 118, 92] }
        : { id: 'steppe', label: 'Montane Steppe & Talus', code: 'T-04B', color: [158, 148, 112] };
    }
    return moisture > 0.52
      ? { id: 'forest', label: 'Temperate Valley Forest', code: 'T-03', color: [102, 142, 98] }
      : { id: 'meadow', label: 'Upland Heath & Meadow', code: 'T-02', color: [154, 168, 112] };
  }

  /**
   * Formats normalized (u, v) into realistic Lat / Lon strings based on current preset
   */
  formatCoordinates(u, v) {
    const baseCoords = {
      fjord: { lat: 78.22, lon: 15.65, latDir: 'N', lonDir: 'E' },
      caldera: { lat: 36.39, lon: 25.45, latDir: 'N', lonDir: 'E' },
      massif: { lat: 28.59, lon: 83.82, latDir: 'N', lonDir: 'E' },
      atoll: { lat: 11.35, lon: 142.20, latDir: 'N', lonDir: 'E' },
      archipelago: { lat: 46.84, lon: 151.87, latDir: 'N', lonDir: 'E' }
    }[this.presetId] || { lat: 64.15, lon: 21.93, latDir: 'N', lonDir: 'W' };

    const latVal = baseCoords.lat + (0.5 - v) * 0.22;
    const lonVal = baseCoords.lon + (u - 0.5) * 0.36;

    return `${toDMS(latVal)}${baseCoords.latDir} · ${toDMS(lonVal)}${baseCoords.lonDir}`;
  }
}

function toDMS(degFloat) {
  const abs = Math.abs(degFloat);
  const d = Math.floor(abs);
  const minFloat = (abs - d) * 60;
  const m = Math.floor(minFloat);
  const s = Math.round((minFloat - m) * 60);
  return `${String(d).padStart(2, '0')}°${String(m).padStart(2, '0')}′${String(s === 60 ? 59 : s).padStart(2, '0')}″`;
}

function filterSeparated(list, minDist, maxCount) {
  const out = [];
  for (const item of list) {
    let tooClose = false;
    for (const existing of out) {
      if (Math.hypot(item.u - existing.u, item.v - existing.v) < minDist) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      out.push(item);
      if (out.length >= maxCount) break;
    }
  }
  return out;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
