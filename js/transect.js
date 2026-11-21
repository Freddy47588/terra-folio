/**
 * TERRA // FOLIO — Live Geological Cross-Section & Elevation Transect Profiler
 */

import { EDITIONS } from './renderer.js';

export class TransectProfiler {
  constructor(canvas, terrain, renderer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrain = terrain;
    this.renderer = renderer;

    this.samples = [];
    this.metrics = {
      distanceKm: 0,
      maxElev: 0,
      minElev: 0,
      relief: 0,
      maxGradePct: 0
    };
  }

  computeProfile(numSamples = 180) {
    const { ax, ay, bx, by } = this.renderer.transect;
    const dxKm = (bx - ax) * this.terrain.widthKm;
    const dyKm = (by - ay) * this.terrain.heightKm;
    const distKm = Math.max(0.1, Math.hypot(dxKm, dyKm));

    const pts = [];
    let maxE = -Infinity;
    let minE = Infinity;
    let maxGrade = 0;

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const u = ax + (bx - ax) * t;
      const v = ay + (by - ay) * t;
      const elev = this.terrain.sampleElevation(u, v);
      if (elev > maxE) maxE = elev;
      if (elev < minE) minE = elev;

      pts.push({
        t,
        u,
        v,
        distKm: t * distKm,
        elev
      });
    }

    const stepMeters = (distKm * 1000) / numSamples;
    for (let i = 1; i < pts.length; i++) {
      const dE = Math.abs(pts[i].elev - pts[i - 1].elev);
      const grade = (dE / stepMeters) * 100;
      pts[i].gradePct = grade;
      if (grade > maxGrade) maxGrade = grade;
    }
    if (pts.length > 0) pts[0].gradePct = pts[1] ? pts[1].gradePct : 0;

    this.samples = pts;
    this.metrics = {
      distanceKm: distKm,
      maxElev: Math.round(maxE),
      minElev: Math.round(minE),
      relief: Math.round(maxE - minE),
      maxGradePct: Math.round(maxGrade)
    };
    return this.metrics;
  }

  render() {
    this.computeProfile(180);

    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(260, Math.floor(rect.width));
    const h = Math.max(130, Math.floor(rect.height));

    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
    }

    const ctx = this.ctx;
    const theme = EDITIONS[this.renderer.edition] || EDITIONS.imhof;
    const seaLevel = this.terrain.seaLevel;

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = theme.neatlineBg;
    ctx.fillRect(0, 0, w, h);

    const padL = 48;
    const padR = 18;
    const padT = 18;
    const padB = 24;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const minBound = Math.min(-1800, this.metrics.minElev - 200, seaLevel - 400);
    const maxBound = Math.max(3200, this.metrics.maxElev + 300, seaLevel + 600);
    const range = Math.max(1000, maxBound - minBound);

    const xForT = (t) => padL + t * plotW;
    const yForElev = (e) => padT + (1 - (e - minBound) / range) * plotH;
    const seaY = yForElev(seaLevel);

    // 1. Horizontal elevation datum lines
    ctx.font = '500 9.5px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const levels = [-1500, 0, 1500, 3000];
    for (const lvl of levels) {
      if (lvl < minBound || lvl > maxBound) continue;
      const y = yForElev(lvl);
      ctx.strokeStyle = lvl === 0 ? theme.coastColor : theme.gridLine;
      ctx.lineWidth = lvl === 0 ? 1.1 : 0.75;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();

      ctx.fillStyle = theme.textSecondary;
      ctx.fillText(`${lvl}m`, padL - 6, y);
    }

    // 2. Ocean water body fill below seaLevel
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, seaY, plotW, padT + plotH - seaY);
    ctx.clip();

    ctx.fillStyle = theme.waterWall;
    ctx.beginPath();
    ctx.moveTo(padL, seaY);
    for (const pt of this.samples) {
      ctx.lineTo(xForT(pt.t), yForElev(pt.elev));
    }
    ctx.lineTo(padL + plotW, seaY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Geological Lithosphere / Strata fill under the terrain curve
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    for (const pt of this.samples) {
      ctx.lineTo(xForT(pt.t), yForElev(pt.elev));
    }
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, theme.strataTop);
    grad.addColorStop(0.55, theme.strataMid);
    grad.addColorStop(1, theme.strataBase);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Clip to lithosphere to draw geological bedding hatches
    ctx.clip();
    ctx.strokeStyle = theme.minorContour;
    ctx.lineWidth = 0.65;
    for (let sx = padL - plotH; sx < padL + plotW + plotH; sx += 11) {
      ctx.beginPath();
      ctx.moveTo(sx, padT + plotH);
      ctx.lineTo(sx + plotH * 0.65, padT);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Sea level dashed datum line
    if (seaY >= padT && seaY <= padT + plotH) {
      ctx.strokeStyle = theme.coastColor;
      ctx.lineWidth = 1.3;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, seaY);
      ctx.lineTo(padL + plotW, seaY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5. Main terrain cross-section profile stroke
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let i = 0; i < this.samples.length; i++) {
      const pt = this.samples[i];
      const x = xForT(pt.t);
      const y = yForElev(pt.elev);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 6. Endpoints A & B badges + kilometer scale ticks along bottom
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('A (0.0 km)', padL, h - 8);
    ctx.textAlign = 'center';
    ctx.fillText(`${(this.metrics.distanceKm * 0.5).toFixed(1)} km`, padL + plotW * 0.5, h - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`B (${this.metrics.distanceKm.toFixed(1)} km)`, padL + plotW, h - 8);

    // 7. Interactive hover crosshair synced with main map
    const hoverT = this.renderer.transect.hoverT;
    if (typeof hoverT === 'number' && hoverT >= 0 && hoverT <= 1 && this.samples.length > 0) {
      const idx = Math.min(this.samples.length - 1, Math.max(0, Math.round(hoverT * (this.samples.length - 1))));
      const sample = this.samples[idx];
      const hx = xForT(sample.t);
      const hy = yForElev(sample.elev);

      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
      ctx.fill();

      const biome = this.terrain.classifyBiome(sample.elev, this.terrain.sampleMoisture(sample.u, sample.v));
      const info = `${sample.distKm.toFixed(1)}km · ${Math.round(sample.elev)}m · ${Math.round(sample.gradePct)}% · ${biome.label}`;
      ctx.font = '600 9.5px "IBM Plex Mono", monospace';
      const tw = ctx.measureText(info).width + 12;
      const tx = Math.min(padL + plotW - tw, Math.max(padL, hx - tw * 0.5));
      const ty = Math.max(padT + 2, hy - 24);

      ctx.fillStyle = theme.labelBg;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      ctx.fillRect(tx, ty, tw, 16);
      ctx.strokeRect(tx, ty, tw, 16);
      ctx.fillStyle = theme.textPrimary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(info, tx + 6, ty + 8.5);
    }

    // Plot border
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, plotW, plotH);

    ctx.restore();
  }

  /**
   * Converts mouse X position on the profile canvas to normalized t in [0, 1]
   */
  clientXToT(clientX) {
    const bounds = this.canvas.getBoundingClientRect();
    const padL = 48;
    const padR = 18;
    const plotW = Math.max(10, bounds.width - padL - padR);
    const t = (clientX - bounds.left - padL) / plotW;
    return Math.max(0, Math.min(1, t));
  }
}
