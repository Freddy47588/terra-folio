/**
 * TERRA // FOLIO — High-DPI Cartographic & 3D Axonometric Rendering Engine
 * Implements Eduard Imhof Hillshading, Marching Squares Isolines, 4 Archival Editions,
 * and an Interactive 3D Axonometric Terrain Slab with Translucent Water Volume.
 */

export const EDITIONS = {
  imhof: {
    id: 'imhof',
    name: 'IMHOF 1965',
    subtitle: 'Swiss Hypsometric Atlas',
    bg: '#f2ece0',
    neatlineBg: '#faf6ee',
    gridLine: 'rgba(65, 58, 46, 0.13)',
    coastColor: '#264e68',
    minorContour: 'rgba(84, 62, 42, 0.34)',
    indexContour: 'rgba(62, 42, 24, 0.76)',
    bathyContour: 'rgba(32, 85, 118, 0.30)',
    riverColor: '#246a96',
    accent: '#d94b27',
    textPrimary: '#1d1b18',
    textSecondary: '#5c5549',
    labelBg: 'rgba(245, 239, 226, 0.88)',
    waterWall: 'rgba(42, 112, 148, 0.42)',
    waterTop: 'rgba(66, 145, 182, 0.28)',
    strataTop: '#8e7f6a',
    strataMid: '#6e604f',
    strataBase: '#4a4137'
  },
  admiralty: {
    id: 'admiralty',
    name: 'ADMIRALTY 1888',
    subtitle: 'Copperplate Nautical Survey',
    bg: '#eae0cc',
    neatlineBg: '#f4ebd9',
    gridLine: 'rgba(72, 54, 34, 0.18)',
    coastColor: '#1f3b4d',
    minorContour: 'rgba(78, 56, 34, 0.38)',
    indexContour: 'rgba(48, 32, 18, 0.82)',
    bathyContour: 'rgba(38, 73, 92, 0.38)',
    riverColor: '#26536b',
    accent: '#9e2f1e',
    textPrimary: '#241a10',
    textSecondary: '#5e4b36',
    labelBg: 'rgba(238, 228, 208, 0.92)',
    waterWall: 'rgba(52, 96, 114, 0.42)',
    waterTop: 'rgba(82, 128, 144, 0.25)',
    strataTop: '#9c886b',
    strataMid: '#78664d',
    strataBase: '#524432'
  },
  sonar: {
    id: 'sonar',
    name: 'SONAR // BATHY',
    subtitle: 'Abyssal Tactical Telemetry',
    bg: '#07111a',
    neatlineBg: '#0b1926',
    gridLine: 'rgba(56, 189, 248, 0.12)',
    coastColor: '#38bdf8',
    minorContour: 'rgba(52, 211, 153, 0.28)',
    indexContour: 'rgba(110, 231, 183, 0.78)',
    bathyContour: 'rgba(56, 189, 248, 0.32)',
    riverColor: '#38bdf8',
    accent: '#fb923c',
    textPrimary: '#e2f1f8',
    textSecondary: '#7da2b8',
    labelBg: 'rgba(7, 19, 30, 0.88)',
    waterWall: 'rgba(14, 116, 144, 0.45)',
    waterTop: 'rgba(56, 189, 248, 0.22)',
    strataTop: '#163247',
    strataMid: '#0f2436',
    strataBase: '#081521'
  },
  mono: {
    id: 'mono',
    name: 'GEODETIC // MONO',
    subtitle: 'Architectural Fine-Art Plate',
    bg: '#f4f4f1',
    neatlineBg: '#ffffff',
    gridLine: 'rgba(24, 24, 27, 0.11)',
    coastColor: '#18181b',
    minorContour: 'rgba(39, 39, 42, 0.30)',
    indexContour: 'rgba(9, 9, 11, 0.85)',
    bathyContour: 'rgba(82, 82, 91, 0.28)',
    riverColor: '#18181b',
    accent: '#ff4411',
    textPrimary: '#111113',
    textSecondary: '#52525b',
    labelBg: 'rgba(250, 250, 249, 0.92)',
    waterWall: 'rgba(113, 113, 122, 0.35)',
    waterTop: 'rgba(161, 161, 170, 0.22)',
    strataTop: '#a1a1aa',
    strataMid: '#71717a',
    strataBase: '#3f3f46'
  }
};

export class CartographicRenderer {
  constructor(canvas, terrain) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrain = terrain;

    this.edition = 'imhof';
    this.viewMode = 'topo'; // 'topo' | 'block3d' | 'hydro' | 'biome'

    // Offscreen raster buffer for smooth hypsometric & hillshade rendering
    this.rasterCanvas = document.createElement('canvas');
    this.rasterCanvas.width = terrain.cols;
    this.rasterCanvas.height = terrain.rows;
    this.rasterCtx = this.rasterCanvas.getContext('2d');
    this.rasterImageData = this.rasterCtx.createImageData(terrain.cols, terrain.rows);

    // Cached contour segment arrays
    this.contourCache = null;
    this.rasterDirty = true;
    this.contoursDirty = true;

    // 3D Axonometric camera state
    this.camera3D = {
      yaw: -0.62,      // radians
      pitch: 0.58,     // radians
      zoom: 1.0
    };

    // Interactive state
    this.transect = {
      ax: 0.14,
      ay: 0.24,
      bx: 0.86,
      by: 0.74,
      hoverT: null // [0..1] along A->B
    };
    this.cursor = {
      active: false,
      u: 0.5,
      v: 0.5,
      tool: 'raise',
      brushRadius: 0.075
    };

    this.sonarPhase = 0;
  }

  markDirty(rebuildContours = true) {
    this.rasterDirty = true;
    if (rebuildContours) {
      this.contoursDirty = true;
    }
  }

  setEdition(editionKey) {
    if (EDITIONS[editionKey]) {
      this.edition = editionKey;
      this.rasterDirty = true;
    }
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.rasterDirty = true;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(260, Math.floor(rect.height));

    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
    }
    this.width = w;
    this.height = h;
    this.dpr = dpr;
  }

  /**
   * Computes inner map viewport rectangle inside the neatline border
   */
  getMapRect() {
    const padX = Math.max(26, Math.min(40, this.width * 0.036));
    const padY = Math.max(26, Math.min(38, this.height * 0.045));
    return {
      x: padX,
      y: padY,
      w: this.width - padX * 2,
      h: this.height - padY * 2
    };
  }

  screenToUV(clientX, clientY) {
    const bounds = this.canvas.getBoundingClientRect();
    const sx = clientX - bounds.left;
    const sy = clientY - bounds.top;
    const rect = this.getMapRect();
    const u = (sx - rect.x) / rect.w;
    const v = (sy - rect.y) / rect.h;
    return {
      u: Math.max(0, Math.min(1, u)),
      v: Math.max(0, Math.min(1, v)),
      inside: sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h
    };
  }

  /**
   * Rasterizes hypsometric tint + Eduard Imhof hillshade into offscreen ImageData
   */
  updateRasterBuffer() {
    const { cols, rows, elevGrid, fluxGrid, seaLevel, sunAzimuth, sunAltitude } = this.terrain;
    const data = this.rasterImageData.data;

    const azRad = ((sunAzimuth - 90) * Math.PI) / 180;
    const altRad = (sunAltitude * Math.PI) / 180;
    const lx = Math.cos(azRad) * Math.cos(altRad);
    const ly = Math.sin(azRad) * Math.cos(altRad);
    const lz = Math.sin(altRad);

    const cellScale = 85.0;

    for (let r = 0; r < rows; r++) {
      const rPrev = Math.max(0, r - 1);
      const rNext = Math.min(rows - 1, r + 1);
      for (let c = 0; c < cols; c++) {
        const cPrev = Math.max(0, c - 1);
        const cNext = Math.min(cols - 1, c + 1);
        const idx = r * cols + c;
        const elev = elevGrid[idx];

        const dzdx = (elevGrid[r * cols + cNext] - elevGrid[r * cols + cPrev]) / (2 * cellScale);
        const dzdy = (elevGrid[rNext * cols + c] - elevGrid[rPrev * cols + c]) / (2 * cellScale);

        // Surface normal (-dzdx, -dzdy, 1)
        const invLen = 1.0 / Math.hypot(dzdx, dzdy, 1.0);
        const nx = -dzdx * invLen;
        const ny = -dzdy * invLen;
        const nz = invLen;

        const dot = Math.max(0, nx * lx + ny * ly + nz * lz);
        const slopeDeg = (Math.acos(Math.min(1, nz)) * 180) / Math.PI;

        const rgb = this.sampleColorRamp(elev, seaLevel, dot, slopeDeg, idx, fluxGrid[idx]);

        const p = idx * 4;
        data[p] = rgb[0];
        data[p + 1] = rgb[1];
        data[p + 2] = rgb[2];
        data[p + 3] = 255;
      }
    }

    this.rasterCtx.putImageData(this.rasterImageData, 0, 0);
    this.rasterDirty = false;
  }

  sampleColorRamp(elev, seaLevel, hillshade, slopeDeg, idx, flux) {
    const rel = elev - seaLevel;

    if (this.viewMode === 'biome') {
      const moist = this.terrain.moistureGrid[idx] || 0.5;
      const biome = this.terrain.classifyBiome(elev, moist, slopeDeg);
      const shade = rel >= 0 ? 0.68 + hillshade * 0.45 : 0.82 + hillshade * 0.22;
      return [
        clampByte(biome.color[0] * shade),
        clampByte(biome.color[1] * shade),
        clampByte(biome.color[2] * shade)
      ];
    }

    if (this.viewMode === 'hydro') {
      if (rel < 0) {
        const depthT = Math.min(1, Math.abs(rel) / 1800);
        return lerpRGB([38, 108, 148], [12, 36, 58], depthT);
      }
      const elevT = Math.min(1, rel / 3200);
      const base = lerpRGB([224, 232, 222], [150, 168, 158], elevT);
      const fluxBoost = Math.min(1, Math.sqrt(Math.max(0, flux - 2)) / 18);
      const shaded = [
        base[0] * (0.72 + hillshade * 0.38),
        base[1] * (0.72 + hillshade * 0.38),
        base[2] * (0.72 + hillshade * 0.38)
      ];
      return lerpRGB(shaded, [18, 114, 178], fluxBoost * 0.72);
    }

    // Standard edition hypsometric palettes
    if (this.edition === 'imhof') {
      if (rel < 0) {
        const d = Math.min(1, Math.abs(rel) / 1800);
        const shallow = [184, 214, 224];
        const mid = [114, 166, 192];
        const deep = [46, 96, 132];
        const c = d < 0.35 ? lerpRGB(shallow, mid, d / 0.35) : lerpRGB(mid, deep, (d - 0.35) / 0.65);
        const bathyShade = 0.88 + hillshade * 0.16;
        return [clampByte(c[0] * bathyShade), clampByte(c[1] * bathyShade), clampByte(c[2] * bathyShade)];
      }
      const h = Math.min(1, rel / 3200);
      let c;
      if (h < 0.14) c = lerpRGB([194, 208, 168], [218, 222, 178], h / 0.14);
      else if (h < 0.38) c = lerpRGB([218, 222, 178], [234, 216, 168], (h - 0.14) / 0.24);
      else if (h < 0.68) c = lerpRGB([234, 216, 168], [216, 182, 142], (h - 0.38) / 0.30);
      else if (h < 0.88) c = lerpRGB([216, 182, 142], [228, 222, 214], (h - 0.68) / 0.20);
      else c = lerpRGB([228, 222, 214], [248, 250, 252], (h - 0.88) / 0.12);

      // Eduard Imhof warm sunlight + cool shadow cast
      const light = Math.pow(hillshade, 0.92);
      const r = c[0] * (0.64 + light * 0.48) + (light - 0.5) * 18;
      const g = c[1] * (0.65 + light * 0.46) + (light - 0.5) * 10;
      const b = c[2] * (0.70 + light * 0.40) - (light - 0.5) * 12;
      return [clampByte(r), clampByte(g), clampByte(b)];
    }

    if (this.edition === 'admiralty') {
      if (rel < 0) {
        const d = Math.min(1, Math.abs(rel) / 1800);
        const c = lerpRGB([206, 214, 206], [134, 158, 164], Math.pow(d, 0.7));
        return [clampByte(c[0]), clampByte(c[1]), clampByte(c[2])];
      }
      const h = Math.min(1, rel / 3200);
      const base = lerpRGB([236, 225, 200], [198, 176, 142], h);
      const shade = 0.66 + hillshade * 0.44 - Math.min(0.18, slopeDeg * 0.004);
      return [clampByte(base[0] * shade), clampByte(base[1] * shade), clampByte(base[2] * shade)];
    }

    if (this.edition === 'sonar') {
      if (rel < 0) {
        const d = Math.min(1, Math.abs(rel) / 1900);
        const c = lerpRGB([14, 58, 84], [5, 16, 28], d);
        const shade = 0.75 + hillshade * 0.45;
        return [clampByte(c[0] * shade), clampByte(c[1] * shade), clampByte(c[2] * shade)];
      }
      const h = Math.min(1, rel / 3200);
      const c = lerpRGB([16, 54, 58], [52, 138, 118], h);
      const shade = 0.62 + hillshade * 0.58;
      return [clampByte(c[0] * shade), clampByte(c[1] * shade), clampByte(c[2] * shade)];
    }

    // 'mono'
    if (rel < 0) {
      const d = Math.min(1, Math.abs(rel) / 1800);
      const v = clampByte((228 - d * 42) * (0.92 + hillshade * 0.1));
      return [v, v, clampByte(v + 3)];
    }
    const h = Math.min(1, rel / 3200);
    const v = clampByte((245 - h * 35) * (0.64 + hillshade * 0.46));
    return [v, v, v];
  }

  /**
   * Extracts Marching Squares contour line segments for coastline, minor, index, and bathymetric levels
   */
  rebuildContours() {
    const { cols, rows, elevGrid, seaLevel, contourInterval } = this.terrain;
    const step = Math.max(25, contourInterval);

    const coastSegments = [];
    const minorSegments = [];
    const indexSegments = [];
    const bathySegments = [];
    const indexLabels = [];

    // Extract coastline (seaLevel)
    this.extractLevelSegments(seaLevel, coastSegments, null);

    // Above sea level contours
    const maxLevel = Math.min(4200, this.terrain.stats.maxElevation);
    let levelIdx = 1;
    for (let lvl = seaLevel + step; lvl <= maxLevel; lvl += step, levelIdx++) {
      const isIndex = levelIdx % 5 === 0;
      this.extractLevelSegments(
        lvl,
        isIndex ? indexSegments : minorSegments,
        isIndex ? indexLabels : null
      );
    }

    // Below sea level bathymetric contours
    const minLevel = Math.max(-2200, this.terrain.stats.minElevation);
    const bathyStep = step * 2;
    for (let lvl = seaLevel - bathyStep; lvl >= minLevel; lvl -= bathyStep) {
      this.extractLevelSegments(lvl, bathySegments, null);
    }

    this.contourCache = {
      coastSegments,
      minorSegments,
      indexSegments,
      bathySegments,
      indexLabels
    };
    this.contoursDirty = false;
  }

  /**
   * Marching Squares extractor for a single elevation threshold
   */
  extractLevelSegments(threshold, outSegments, outLabels) {
    const { cols, rows, elevGrid } = this.terrain;
    const invC = 1 / (cols - 1);
    const invR = 1 / (rows - 1);
    let segCounter = 0;

    for (let r = 0; r < rows - 1; r++) {
      const r0 = r * cols;
      const r1 = (r + 1) * cols;
      for (let c = 0; c < cols - 1; c++) {
        const v0 = elevGrid[r0 + c] - threshold;       // top-left
        const v1 = elevGrid[r0 + c + 1] - threshold;   // top-right
        const v2 = elevGrid[r1 + c + 1] - threshold;   // bottom-right
        const v3 = elevGrid[r1 + c] - threshold;       // bottom-left

        let mask = 0;
        if (v0 >= 0) mask |= 1;
        if (v1 >= 0) mask |= 2;
        if (v2 >= 0) mask |= 4;
        if (v3 >= 0) mask |= 8;
        if (mask === 0 || mask === 15) continue;

        // Edge intersections: top(0), right(1), bottom(2), left(3)
        const topU = (c + v0 / (v0 - v1)) * invC;
        const topV = r * invR;

        const rightU = (c + 1) * invC;
        const rightV = (r + v1 / (v1 - v2)) * invR;

        const botU = (c + v3 / (v3 - v2)) * invC;
        const botV = (r + 1) * invR;

        const leftU = c * invC;
        const leftV = (r + v0 / (v0 - v3)) * invR;

        const pushSeg = (u1, v1p, u2, v2p) => {
          outSegments.push(u1, v1p, u2, v2p);
          segCounter++;
          if (outLabels && segCounter % 145 === 40 && u1 > 0.08 && u1 < 0.92 && v1p > 0.08 && v1p < 0.92) {
            outLabels.push({
              u: (u1 + u2) * 0.5,
              v: (v1p + v2p) * 0.5,
              text: `${Math.round(threshold)}m`
            });
          }
        };

        switch (mask) {
          case 1:
          case 14:
            pushSeg(leftU, leftV, topU, topV);
            break;
          case 2:
          case 13:
            pushSeg(topU, topV, rightU, rightV);
            break;
          case 3:
          case 12:
            pushSeg(leftU, leftV, rightU, rightV);
            break;
          case 4:
          case 11:
            pushSeg(rightU, rightV, botU, botV);
            break;
          case 5:
            pushSeg(leftU, leftV, botU, botV);
            pushSeg(topU, topV, rightU, rightV);
            break;
          case 6:
          case 9:
            pushSeg(topU, topV, botU, botV);
            break;
          case 7:
          case 8:
            pushSeg(leftU, leftV, botU, botV);
            break;
          case 10:
            pushSeg(leftU, leftV, topU, topV);
            pushSeg(rightU, rightV, botU, botV);
            break;
        }
      }
    }
  }

  /**
   * Main render loop entry
   */
  render() {
    this.resize();
    if (this.rasterDirty) this.updateRasterBuffer();
    if (this.contoursDirty || !this.contourCache) this.rebuildContours();

    const ctx = this.ctx;
    const theme = EDITIONS[this.edition] || EDITIONS.imhof;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Outer sheet background
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    const rect = this.getMapRect();

    if (this.viewMode === 'block3d') {
      this.render3DBlockView(ctx, rect, theme);
    } else {
      this.render2DPlanView(ctx, rect, theme);
    }

    // Outer archival neatline & coordinate ticks
    this.renderNeatlineFrame(ctx, rect, theme);

    ctx.restore();
  }

  /**
   * 2D Cartographic Plan View (Topo / Hydrology / Biome)
   */
  render2DPlanView(ctx, rect, theme) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    // 1. Draw smoothed hypsometric + hillshade raster
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.rasterCanvas, rect.x, rect.y, rect.w, rect.h);

    // 2. Bathymetric isolines
    const { coastSegments, minorSegments, indexSegments, bathySegments, indexLabels } = this.contourCache;

    ctx.strokeStyle = theme.bathyContour;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([4, 3]);
    this.strokeSegmentArray(ctx, bathySegments, rect);
    ctx.setLineDash([]);

    // 3. Minor hypsometric contours
    ctx.strokeStyle = theme.minorContour;
    ctx.lineWidth = 0.7;
    this.strokeSegmentArray(ctx, minorSegments, rect);

    // 4. Index contours (every 5th interval)
    ctx.strokeStyle = theme.indexContour;
    ctx.lineWidth = 1.25;
    this.strokeSegmentArray(ctx, indexSegments, rect);

    // 5. Bold shoreline / seaLevel datum contour
    ctx.strokeStyle = theme.coastColor;
    ctx.lineWidth = 1.65;
    this.strokeSegmentArray(ctx, coastSegments, rect);

    // 6. Admiralty rhumb lines or Sonar radar sweep
    if (this.edition === 'admiralty') {
      this.renderAdmiraltyRhumbLines(ctx, rect, theme);
    } else if (this.edition === 'sonar') {
      this.renderSonarSweep(ctx, rect, theme);
    }

    // 7. Hydrological drainage rivers
    this.renderRivers(ctx, rect, theme);

    // 8. Live rainstorm erosion droplets
    this.renderRainParticles(ctx, rect, theme);

    // 9. Graticule coordinate grid
    this.renderGraticule(ctx, rect, theme);

    // 10. Index contour elevation labels
    this.renderContourLabels(ctx, rect, theme, indexLabels);

    // 11. Summit & sounding benchmarks + user waypoints
    this.renderBenchmarksAndWaypoints(ctx, rect, theme);

    // 12. Interactive Surveyor Transect Line (A -> B)
    this.renderTransectOverlay(ctx, rect, theme);

    // 13. Active terraforming brush reticle
    if (this.cursor.active && ['raise', 'lower', 'smooth', 'rain'].includes(this.cursor.tool)) {
      this.renderBrushReticle(ctx, rect, theme);
    }

    ctx.restore();
  }

  strokeSegmentArray(ctx, segs, rect) {
    if (!segs || segs.length === 0) return;
    ctx.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      ctx.moveTo(rect.x + segs[i] * rect.w, rect.y + segs[i + 1] * rect.h);
      ctx.lineTo(rect.x + segs[i + 2] * rect.w, rect.y + segs[i + 3] * rect.h);
    }
    ctx.stroke();
  }

  renderRivers(ctx, rect, theme) {
    const rivers = this.terrain.rivers;
    if (!rivers || rivers.length === 0) return;

    ctx.save();
    ctx.strokeStyle = theme.riverColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const boost = this.viewMode === 'hydro' ? 1.55 : 1.0;

    for (const path of rivers) {
      if (path.length < 3) continue;
      for (let i = 0; i < path.length - 1; i++) {
        const p0 = path[i];
        const p1 = path[i + 1];
        const width = Math.min(3.6, 0.55 + Math.sqrt(p0.flux) * 0.095) * boost;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(rect.x + p0.u * rect.w, rect.y + p0.v * rect.h);
        ctx.lineTo(rect.x + p1.u * rect.w, rect.y + p1.v * rect.h);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  renderRainParticles(ctx, rect, theme) {
    const particles = this.terrain.rainParticles;
    if (!particles || particles.length === 0) return;

    ctx.save();
    ctx.strokeStyle = this.edition === 'sonar' ? '#38bdf8' : '#1d70b8';
    ctx.fillStyle = this.edition === 'sonar' ? '#7dd3fc' : '#2589d8';
    ctx.lineWidth = 1.35;

    for (const p of particles) {
      if (p.trail.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < p.trail.length; i++) {
          const pt = p.trail[i];
          const x = rect.x + pt.u * rect.w;
          const y = rect.y + pt.v * rect.h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const hx = rect.x + p.u * rect.w;
      const hy = rect.y + p.v * rect.h;
      ctx.beginPath();
      ctx.arc(hx, hy, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderGraticule(ctx, rect, theme) {
    ctx.save();
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 0.8;

    const cols = 6;
    const rows = 4;
    for (let i = 1; i < cols; i++) {
      const x = rect.x + (i / cols) * rect.w;
      ctx.beginPath();
      ctx.moveTo(x, rect.y);
      ctx.lineTo(x, rect.y + rect.h);
      ctx.stroke();
    }
    for (let j = 1; j < rows; j++) {
      const y = rect.y + (j / rows) * rect.h;
      ctx.beginPath();
      ctx.moveTo(rect.x, y);
      ctx.lineTo(rect.x + rect.w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderAdmiraltyRhumbLines(ctx, rect, theme) {
    ctx.save();
    const cx = rect.x + rect.w * 0.22;
    const cy = rect.y + rect.h * 0.74;
    ctx.strokeStyle = 'rgba(72, 52, 32, 0.16)';
    ctx.lineWidth = 0.65;

    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * rect.w * 1.3, cy + Math.sin(angle) * rect.w * 1.3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  renderSonarSweep(ctx, rect, theme) {
    this.sonarPhase = (this.sonarPhase + 0.008) % (Math.PI * 2);
    const cx = rect.x + rect.w * 0.5;
    const cy = rect.y + rect.h * 0.5;
    const maxR = Math.hypot(rect.w, rect.h) * 0.55;

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 0.8;
    for (let r = 80; r < maxR; r += 90) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const sx = cx + Math.cos(this.sonarPhase) * maxR;
    const sy = cy + Math.sin(this.sonarPhase) * maxR;
    const grad = ctx.createLinearGradient(cx, cy, sx, sy);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.05)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.26)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.restore();
  }

  renderContourLabels(ctx, rect, theme, labels) {
    if (!labels || labels.length === 0) return;
    ctx.save();
    ctx.font = '500 9.5px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxLabels = Math.min(14, labels.length);
    for (let i = 0; i < maxLabels; i++) {
      const lb = labels[i];
      const x = rect.x + lb.u * rect.w;
      const y = rect.y + lb.v * rect.h;
      const w = ctx.measureText(lb.text).width + 6;
      ctx.fillStyle = theme.labelBg;
      ctx.fillRect(x - w * 0.5, y - 6, w, 12);
      ctx.fillStyle = theme.textSecondary;
      ctx.fillText(lb.text, x, y + 0.5);
    }
    ctx.restore();
  }

  renderBenchmarksAndWaypoints(ctx, rect, theme) {
    ctx.save();
    const { peaks, soundings } = this.terrain.benchmarks;

    // Prominent mountain summits (△)
    ctx.font = '600 10.5px "IBM Plex Mono", monospace';
    for (let i = 0; i < Math.min(4, peaks.length); i++) {
      const p = peaks[i];
      const x = rect.x + p.u * rect.w;
      const y = rect.y + p.v * rect.h;

      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 4.5, y + 3.5);
      ctx.lineTo(x - 4.5, y + 3.5);
      ctx.closePath();
      ctx.fill();

      const label = `△ ${p.elev}m`;
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = theme.labelBg;
      ctx.fillRect(x + 7, y - 7, tw, 14);
      ctx.fillStyle = theme.textPrimary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 11, y);
    }

    // Deepest bathymetric soundings (▽)
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    for (let i = 0; i < Math.min(3, soundings.length); i++) {
      const s = soundings[i];
      const x = rect.x + s.u * rect.w;
      const y = rect.y + s.v * rect.h;

      ctx.strokeStyle = theme.coastColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y + 4.5);
      ctx.lineTo(x + 4, y - 3);
      ctx.lineTo(x - 4, y - 3);
      ctx.closePath();
      ctx.stroke();

      const label = `${s.elev}m`;
      ctx.fillStyle = theme.coastColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 7, y);
    }

    // User / Expedition Waypoints
    const icons = {
      summit: '▲',
      anchorage: '⚓',
      thermal: '♨',
      observatory: '✦',
      camp: '⛺'
    };

    for (const wp of this.terrain.waypoints) {
      const x = rect.x + wp.u * rect.w;
      const y = rect.y + wp.v * rect.h;
      const elev = Math.round(this.terrain.sampleElevation(wp.u, wp.v));
      const glyph = icons[wp.type] || '✦';
      const title = `${glyph} ${wp.name.toUpperCase()} (${elev}m)`;

      // Target pin ring
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '600 10px "IBM Plex Mono", monospace';
      const tw = ctx.measureText(title).width + 12;
      const bx = Math.min(rect.x + rect.w - tw - 4, Math.max(rect.x + 4, x - tw * 0.5));
      const by = y - 24;

      ctx.fillStyle = theme.labelBg;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      ctx.fillRect(bx, by, tw, 16);
      ctx.strokeRect(bx, by, tw, 16);

      ctx.fillStyle = theme.textPrimary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, bx + 6, by + 8.5);
    }

    ctx.restore();
  }

  /**
   * Renders the Surveyor Transect Line A -> B with kilometer tick marks and synchronized hover point
   */
  renderTransectOverlay(ctx, rect, theme) {
    const { ax, ay, bx, by, hoverT } = this.transect;
    const x1 = rect.x + ax * rect.w;
    const y1 = rect.y + ay * rect.h;
    const x2 = rect.x + bx * rect.w;
    const y2 = rect.y + by * rect.h;

    ctx.save();

    // Dashed survey baseline
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2.0;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Perpendicular tick marks along the transect
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    ctx.lineWidth = 1.2;
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const tx = x1 + dx * t;
      const ty = y1 + dy * t;
      const tick = i === 5 ? 6 : 3.5;
      ctx.beginPath();
      ctx.moveTo(tx - nx * tick, ty - ny * tick);
      ctx.lineTo(tx + nx * tick, ty + ny * tick);
      ctx.stroke();
    }

    // Synchronized hover probe along transect
    if (typeof hoverT === 'number' && hoverT >= 0 && hoverT <= 1) {
      const hx = x1 + dx * hoverT;
      const hy = y1 + dy * hoverT;
      const u = ax + (bx - ax) * hoverT;
      const v = ay + (by - ay) * hoverT;
      const elev = Math.round(this.terrain.sampleElevation(u, v));

      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '600 10.5px "IBM Plex Mono", monospace';
      const tag = `${elev}m`;
      const tw = ctx.measureText(tag).width + 10;
      ctx.fillStyle = theme.accent;
      ctx.fillRect(hx + 10, hy - 18, tw, 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, hx + 15, hy - 10);
    }

    // Endpoints A and B
    this.drawTransectHandle(ctx, x1, y1, 'A', theme);
    this.drawTransectHandle(ctx, x2, y2, 'B', theme);

    ctx.restore();
  }

  drawTransectHandle(ctx, x, y, letter, theme) {
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = theme.neatlineBg;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x, y + 0.5);
  }

  renderBrushReticle(ctx, rect, theme) {
    const x = rect.x + this.cursor.u * rect.w;
    const y = rect.y + this.cursor.v * rect.h;
    const r = this.cursor.brushRadius * rect.w;

    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center crosshair
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y + 6);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 3D AXONOMETRIC BLOCK VIEW
   * Renders a rotatable 3D terrain block with geological cross-section walls,
   * translucent water plane, draped contours, and 3D transect line.
   */
  render3DBlockView(ctx, rect, theme) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    // Subtle studio backdrop inside neatline
    ctx.fillStyle = theme.neatlineBg;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const { cols, rows, seaLevel } = this.terrain;
    const stepC = 2;
    const stepR = 2;
    const gridW = Math.floor((cols - 1) / stepC);
    const gridH = Math.floor((rows - 1) / stepR);

    const cx = rect.x + rect.w * 0.5;
    const cy = rect.y + rect.h * 0.54;
    const scale = Math.min(rect.w * 0.62, rect.h * 0.86) * this.camera3D.zoom;

    const cosY = Math.cos(this.camera3D.yaw);
    const sinY = Math.sin(this.camera3D.yaw);
    const cosP = Math.cos(this.camera3D.pitch);
    const sinP = Math.sin(this.camera3D.pitch);

    const aspect = rows / cols;
    const baseDatum = -2200; // bottom of the geological slab in meters
    const zScale = 0.000105;

    const project = (u, v, elevMeters) => {
      const x0 = u - 0.5;
      const y0 = (v - 0.5) * aspect;
      const z0 = (elevMeters - seaLevel) * zScale;

      const rx = x0 * cosY - y0 * sinY;
      const ry = x0 * sinY + y0 * cosY;

      const sx = cx + rx * scale;
      const sy = cy + (ry * cosP - z0 * sinP) * scale;
      const depth = ry * sinP + z0 * cosP;
      return { x: sx, y: sy, depth };
    };

    const rasterData = this.rasterImageData.data;

    // Determine back-to-front traversal order based on camera yaw
    const cStart = sinY >= 0 ? 0 : gridW - 1;
    const cEnd = sinY >= 0 ? gridW : -1;
    const cDir = sinY >= 0 ? 1 : -1;

    const rStart = cosY >= 0 ? 0 : gridH - 1;
    const rEnd = cosY >= 0 ? gridH : -1;
    const rDir = cosY >= 0 ? 1 : -1;

    // 1. Render terrain surface quads back-to-front (Painter's algorithm)
    for (let gr = rStart; gr !== rEnd; gr += rDir) {
      const r0 = gr * stepR;
      const r1 = Math.min(rows - 1, (gr + 1) * stepR);
      const v0 = r0 / (rows - 1);
      const v1 = r1 / (rows - 1);

      for (let gc = cStart; gc !== cEnd; gc += cDir) {
        const c0 = gc * stepC;
        const c1 = Math.min(cols - 1, (gc + 1) * stepC);
        const u0 = c0 / (cols - 1);
        const u1 = c1 / (cols - 1);

        const e00 = this.terrain.elevGrid[r0 * cols + c0];
        const e10 = this.terrain.elevGrid[r0 * cols + c1];
        const e11 = this.terrain.elevGrid[r1 * cols + c1];
        const e01 = this.terrain.elevGrid[r1 * cols + c0];

        const p00 = project(u0, v0, e00);
        const p10 = project(u1, v0, e10);
        const p11 = project(u1, v1, e11);
        const p01 = project(u0, v1, e01);

        const pIdx = (r0 * cols + c0) * 4;
        const rCol = rasterData[pIdx];
        const gCol = rasterData[pIdx + 1];
        const bCol = rasterData[pIdx + 2];

        ctx.fillStyle = `rgb(${rCol},${gCol},${bCol})`;
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fill();

        // Subtle contour line highlight on 3D mesh
        const interval = this.terrain.contourInterval;
        if (Math.floor(e00 / interval) !== Math.floor(e11 / interval)) {
          ctx.strokeStyle = Math.abs(e00 - seaLevel) < interval * 0.6
            ? theme.coastColor
            : theme.minorContour;
          ctx.lineWidth = 0.65;
          ctx.stroke();
        }
      }
    }

    // 2. Translucent Sea-Level Water Plane & Cut-Away Water Volume on the 2 front-facing edges
    const frontRow = cosY >= 0 ? rows - 1 : 0;
    const frontV = frontRow / (rows - 1);
    const frontCol = sinY >= 0 ? cols - 1 : 0;
    const frontU = frontCol / (cols - 1);

    this.render3DGeologicalWall(ctx, project, true, frontRow, baseDatum, seaLevel, theme);
    this.render3DGeologicalWall(ctx, project, false, frontCol, baseDatum, seaLevel, theme);

    // Translucent water surface sheen for cells below seaLevel
    ctx.fillStyle = theme.waterTop;
    for (let gr = 0; gr < gridH; gr += 2) {
      const r0 = gr * stepR;
      const r1 = Math.min(rows - 1, (gr + 2) * stepR);
      const v0 = r0 / (rows - 1);
      const v1 = r1 / (rows - 1);
      for (let gc = 0; gc < gridW; gc += 2) {
        const c0 = gc * stepC;
        const c1 = Math.min(cols - 1, (gc + 2) * stepC);
        const eAvg = (
          this.terrain.elevGrid[r0 * cols + c0] +
          this.terrain.elevGrid[r1 * cols + c1]
        ) * 0.5;
        if (eAvg < seaLevel) {
          const u0 = c0 / (cols - 1);
          const u1 = c1 / (cols - 1);
          const w00 = project(u0, v0, seaLevel);
          const w10 = project(u1, v0, seaLevel);
          const w11 = project(u1, v1, seaLevel);
          const w01 = project(u0, v1, seaLevel);
          ctx.beginPath();
          ctx.moveTo(w00.x, w00.y);
          ctx.lineTo(w10.x, w10.y);
          ctx.lineTo(w11.x, w11.y);
          ctx.lineTo(w01.x, w01.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // 3. 3D Draped Surveyor Transect Line (A -> B)
    const { ax, ay, bx, by, hoverT } = this.transect;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    const samples = 50;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const u = ax + (bx - ax) * t;
      const v = ay + (by - ay) * t;
      const e = Math.max(seaLevel, this.terrain.sampleElevation(u, v)) + 30;
      const pt = project(u, v, e);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    if (typeof hoverT === 'number' && hoverT >= 0 && hoverT <= 1) {
      const hu = ax + (bx - ax) * hoverT;
      const hv = ay + (by - ay) * hoverT;
      const he = this.terrain.sampleElevation(hu, hv);
      const hPt = project(hu, hv, Math.max(seaLevel, he) + 35);
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(hPt.x, hPt.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Floating 3D Summit & Waypoint Callout Flags
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    for (const wp of this.terrain.waypoints) {
      const elev = this.terrain.sampleElevation(wp.u, wp.v);
      const surfPt = project(wp.u, wp.v, Math.max(seaLevel, elev));
      const pinTop = { x: surfPt.x, y: surfPt.y - 26 };

      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(surfPt.x, surfPt.y);
      ctx.lineTo(pinTop.x, pinTop.y);
      ctx.stroke();

      const label = `${wp.name.toUpperCase()} · ${Math.round(elev)}m`;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = theme.labelBg;
      ctx.fillRect(pinTop.x - tw * 0.5, pinTop.y - 16, tw, 15);
      ctx.strokeRect(pinTop.x - tw * 0.5, pinTop.y - 16, tw, 15);
      ctx.fillStyle = theme.textPrimary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pinTop.x, pinTop.y - 8);
    }

    // 3D interaction hint badge
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = theme.textSecondary;
    ctx.textAlign = 'left';
    ctx.fillText('3D AXONOMETRIC SLAB // DRAG TO ORBIT · SCROLL TO ZOOM', rect.x + 14, rect.y + rect.h - 14);

    ctx.restore();
  }

  render3DGeologicalWall(ctx, project, isRowEdge, fixedIndex, baseDatum, seaLevel, theme) {
    const { cols, rows, elevGrid } = this.terrain;
    const count = isRowEdge ? cols : rows;

    // 1. Water volume wall between seabed and seaLevel
    ctx.fillStyle = theme.waterWall;
    for (let i = 0; i < count - 1; i++) {
      const u0 = isRowEdge ? i / (cols - 1) : fixedIndex / (cols - 1);
      const v0 = isRowEdge ? fixedIndex / (rows - 1) : i / (rows - 1);
      const u1 = isRowEdge ? (i + 1) / (cols - 1) : fixedIndex / (cols - 1);
      const v1 = isRowEdge ? fixedIndex / (rows - 1) : (i + 1) / (rows - 1);

      const e0 = elevGrid[isRowEdge ? fixedIndex * cols + i : i * cols + fixedIndex];
      const e1 = elevGrid[isRowEdge ? fixedIndex * cols + (i + 1) : (i + 1) * cols + fixedIndex];

      if (e0 < seaLevel || e1 < seaLevel) {
        const top0 = project(u0, v0, seaLevel);
        const top1 = project(u1, v1, seaLevel);
        const bot0 = project(u0, v0, Math.min(seaLevel, e0));
        const bot1 = project(u1, v1, Math.min(seaLevel, e1));

        ctx.beginPath();
        ctx.moveTo(top0.x, top0.y);
        ctx.lineTo(top1.x, top1.y);
        ctx.lineTo(bot1.x, bot1.y);
        ctx.lineTo(bot0.x, bot0.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 2. Rock lithosphere wall from terrain surface down to baseDatum
    ctx.fillStyle = isRowEdge ? theme.strataTop : theme.strataMid;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const u = isRowEdge ? i / (cols - 1) : fixedIndex / (cols - 1);
      const v = isRowEdge ? fixedIndex / (rows - 1) : i / (rows - 1);
      const e = elevGrid[isRowEdge ? fixedIndex * cols + i : i * cols + fixedIndex];
      const pt = project(u, v, e);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    const endU = isRowEdge ? 1 : fixedIndex / (cols - 1);
    const endV = isRowEdge ? fixedIndex / (rows - 1) : 1;
    const startU = isRowEdge ? 0 : fixedIndex / (cols - 1);
    const startV = isRowEdge ? fixedIndex / (rows - 1) : 0;

    const bEnd = project(endU, endV, baseDatum);
    const bStart = project(startU, startV, baseDatum);
    ctx.lineTo(bEnd.x, bEnd.y);
    ctx.lineTo(bStart.x, bStart.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = theme.indexContour;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  /**
   * Renders the outer surveyor neatline border, degree tick marks, scale bar, and north arrow
   */
  renderNeatlineFrame(ctx, rect, theme) {
    ctx.save();

    // Double archival border
    ctx.strokeStyle = theme.textPrimary;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.lineWidth = 0.75;
    ctx.strokeRect(rect.x - 5, rect.y - 5, rect.w + 10, rect.h + 10);

    // Alternating black/white zebra surveyor scale segments along top and bottom border
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = theme.textPrimary;
        const sx = rect.x + (i / segs) * rect.w;
        const sw = rect.w / segs;
        ctx.fillRect(sx, rect.y - 5, sw, 2.5);
        ctx.fillRect(sx, rect.y + rect.h + 2.5, sw, 2.5);
      }
    }

    // Marginal coordinate labels
    ctx.font = '500 9.5px "IBM Plex Mono", monospace';
    ctx.fillStyle = theme.textSecondary;
    ctx.textAlign = 'center';
    for (let i = 1; i < 6; i++) {
      const u = i / 6;
      const x = rect.x + u * rect.w;
      const label = `${(15 + i * 2)}′E`;
      ctx.fillText(label, x, rect.y - 11);
      ctx.fillText(label, x, rect.y + rect.h + 15);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let j = 1; j < 4; j++) {
      const v = j / 4;
      const y = rect.y + v * rect.h;
      const label = `${(52 - j * 3)}′N`;
      ctx.fillText(label, rect.x - 9, y);
    }

    // Metric Scale Bar in bottom-right corner of map
    const barKm = 4; // 4 km scale bar
    const barPx = (barKm / this.terrain.widthKm) * rect.w;
    const bx = rect.x + rect.w - barPx - 16;
    const by = rect.y + rect.h - 22;

    ctx.fillStyle = theme.labelBg;
    ctx.fillRect(bx - 10, by - 14, barPx + 20, 26);
    ctx.strokeStyle = theme.textSecondary;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(bx - 10, by - 14, barPx + 20, 26);

    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k % 2 === 0 ? theme.textPrimary : theme.neatlineBg;
      ctx.fillRect(bx + (k * barPx) / 4, by, barPx / 4, 4.5);
      ctx.strokeStyle = theme.textPrimary;
      ctx.strokeRect(bx + (k * barPx) / 4, by, barPx / 4, 4.5);
    }

    ctx.fillStyle = theme.textPrimary;
    ctx.font = '600 9px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('0', bx, by - 6);
    ctx.textAlign = 'center';
    ctx.fillText('2 km', bx + barPx * 0.5, by - 6);
    ctx.textAlign = 'right';
    ctx.fillText('4 km', bx + barPx, by - 6);

    ctx.restore();
  }
}

function lerpRGB(a, b, t) {
  const ct = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    Math.round(a[0] + (b[0] - a[0]) * ct),
    Math.round(a[1] + (b[1] - a[1]) * ct),
    Math.round(a[2] + (b[2] - a[2]) * ct)
  ];
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
