/**
 * TERRA // FOLIO — High-Resolution Archival Cartographic Plate Exporter
 */

import { EDITIONS } from './renderer.js';

export function exportCartographicPlate(terrain, renderer, transectProfiler, presetMeta) {
  const plateW = 1600;
  const plateH = 1120;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = plateW;
  outCanvas.height = plateH;
  const ctx = outCanvas.getContext('2d');

  const theme = EDITIONS[renderer.edition] || EDITIONS.imhof;

  // 1. Archival paper sheet background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, plateW, plateH);

  // Outer double border
  ctx.strokeStyle = theme.textPrimary;
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, plateW - 48, plateH - 48);
  ctx.lineWidth = 0.8;
  ctx.strokeRect(30, 30, plateW - 60, plateH - 60);

  // 2. Header Masthead inside plate
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 22px "Fraunces", Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText(`TERRA // FOLIO — ${presetMeta.name.toUpperCase()}`, 52, 66);

  ctx.fillStyle = theme.textSecondary;
  ctx.font = '500 12px "IBM Plex Mono", monospace';
  ctx.fillText(
    `${presetMeta.region}  ·  SEED: ${terrain.seed}  ·  EDITION: ${theme.name}  ·  DATUM: ${terrain.seaLevel}m  ·  CONTOUR INTERVAL: ${terrain.contourInterval}m`,
    52,
    88
  );

  // 3. Draw main map canvas snapshot
  const mapX = 52;
  const mapY = 106;
  const mapW = plateW - 104;
  const mapH = 740;

  ctx.fillStyle = theme.neatlineBg;
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.drawImage(renderer.canvas, mapX, mapY, mapW, mapH);

  ctx.strokeStyle = theme.textPrimary;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  // 4. Draw Geological Cross-Section Transect panel at bottom-left
  const profX = 52;
  const profY = 866;
  const profW = 1040;
  const profH = 202;

  ctx.fillStyle = theme.neatlineBg;
  ctx.fillRect(profX, profY, profW, profH);
  ctx.drawImage(transectProfiler.canvas, profX, profY, profW, profH);
  ctx.strokeStyle = theme.textPrimary;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(profX, profY, profW, profH);

  // 5. Archival Title & Geodetic Specification Cartridge at bottom-right
  const cartX = 1112;
  const cartY = 866;
  const cartW = plateW - 52 - cartX;
  const cartH = 202;

  ctx.fillStyle = theme.neatlineBg;
  ctx.fillRect(cartX, cartY, cartW, cartH);
  ctx.strokeStyle = theme.textPrimary;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(cartX, cartY, cartW, cartH);

  ctx.fillStyle = theme.accent;
  ctx.fillRect(cartX, cartY, cartW, 6);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 13px "IBM Plex Mono", monospace';
  ctx.fillText('GEODETIC SURVEY SPECIFICATION', cartX + 18, cartY + 30);

  const rows = [
    ['SURVEY PLATE', `${presetMeta.code} // ${renderer.viewMode.toUpperCase()}`],
    ['HIGHEST SUMMIT', `△ ${terrain.stats.maxElevation} m`],
    ['DEEPEST SOUNDING', `▽ ${terrain.stats.minElevation} m`],
    ['LAND / PELAGIC RATIO', `${terrain.stats.landRatio}% / ${100 - terrain.stats.landRatio}%`],
    ['TRANSECT A→BSPAN', `${transectProfiler.metrics.distanceKm.toFixed(1)} km (Δ ${transectProfiler.metrics.relief}m)`],
    ['SOLAR ILLUMINATION', `AZ ${terrain.sunAzimuth}° · ALT ${terrain.sunAltitude}°`]
  ];

  ctx.font = '500 11.5px "IBM Plex Mono", monospace';
  rows.forEach(([k, v], i) => {
    const ry = cartY + 58 + i * 23;
    ctx.fillStyle = theme.textSecondary;
    ctx.textAlign = 'left';
    ctx.fillText(k, cartX + 18, ry);
    ctx.fillStyle = theme.textPrimary;
    ctx.textAlign = 'right';
    ctx.fillText(v, cartX + cartW - 18, ry);
  });

  // Trigger download
  const slug = `${terrain.presetId}-${terrain.seed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const link = document.createElement('a');
  link.download = `terra-folio-${slug}.png`;
  link.href = outCanvas.toDataURL('image/png');
  link.click();
}
