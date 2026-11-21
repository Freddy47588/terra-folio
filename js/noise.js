/**
 * TERRA // FOLIO — Deterministic Geomorphological Noise & Preset Generators
 * Zero-dependency 2D Simplex Noise, Ridged Multifractal, and Domain Warping
 */

export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function createPRNG(seedStr) {
  const seed = hashSeed(String(seedStr || 'ISL-2026-08'));
  let a = seed(), b = seed(), c = seed(), d = seed();
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1]
];

export class SimplexNoise2D {
  constructor(seedStr = 'ISL-2026-08') {
    const rand = createPRNG(seedStr);
    this.p = new Uint8Array(256);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);

    for (let i = 0; i < 256; i++) this.p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = this.p[i];
      this.p[i] = this.p[j];
      this.p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2D(xin, yin) {
    let n0, n1, n2;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; }
    else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.permMod12[ii + this.perm[jj]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 < 0) n0 = 0.0;
    else {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD2[gi0][0] * x0 + GRAD2[gi0][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 < 0) n1 = 0.0;
    else {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD2[gi1][0] * x1 + GRAD2[gi1][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 < 0) n2 = 0.0;
    else {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD2[gi2][0] * x2 + GRAD2[gi2][1] * y2);
    }

    return 70.0 * (n0 + n1 + n2); // [-1, 1]
  }

  fbm(x, y, octaves = 5, lacunarity = 2.05, gain = 0.5) {
    let sum = 0;
    let amp = 1.0;
    let freq = 1.0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  ridged(x, y, octaves = 5, lacunarity = 2.1, gain = 0.52) {
    let sum = 0;
    let amp = 0.6;
    let freq = 1.0;
    let prev = 1.0;
    for (let i = 0; i < octaves; i++) {
      let n = this.noise2D(x * freq, y * freq);
      n = 1.0 - Math.abs(n);
      n = n * n;
      sum += n * amp * prev;
      prev = n;
      freq *= lacunarity;
      amp *= gain;
    }
    return sum; // roughly [0, 1.15]
  }

  warpedFbm(x, y, octaves = 5, warpAmount = 0.45) {
    const qx = this.fbm(x + 1.7, y + 9.2, 3);
    const qy = this.fbm(x + 8.3, y + 2.8, 3);
    return this.fbm(x + warpAmount * qx, y + warpAmount * qy, octaves);
  }
}

export const EXPEDITION_PRESETS = [
  {
    id: 'fjord',
    code: 'EXP-01',
    name: 'Svalbard Fjord & Glacier',
    region: '78°13′N · 15°39′E // HIGH ARCTIC',
    seed: 'SVALBARD-78N',
    seaLevel: 0,
    exaggeration: 1.15,
    contourInterval: 100,
    sunAzimuth: 315,
    sunAltitude: 34,
    transect: { ax: 0.14, ay: 0.24, bx: 0.86, by: 0.74 },
    description: 'Drowned glacial troughs carved between steep Permian ridges, alpine cirques, and submerged moraine sills.'
  },
  {
    id: 'caldera',
    code: 'EXP-02',
    name: 'Santorini Volcanic Caldera',
    region: '36°23′N · 25°27′E // AEGEAN ARC',
    seed: 'THERA-1600BC',
    seaLevel: 0,
    exaggeration: 1.1,
    contourInterval: 100,
    sunAzimuth: 295,
    sunAltitude: 42,
    transect: { ax: 0.12, ay: 0.52, bx: 0.88, by: 0.48 },
    description: 'Collapsed ring-fault stratovolcano with sheer inner caldera cliffs, lagoonal breach channels, and a central resurgent dacite dome.'
  },
  {
    id: 'massif',
    code: 'EXP-03',
    name: 'Annapurna Massif & Gorge',
    region: '28°35′N · 83°49′E // NEPAL HIMALAYA',
    seed: 'KALI-GANDAKI-83E',
    seaLevel: 0,
    exaggeration: 1.25,
    contourInterval: 200,
    sunAzimuth: 325,
    sunAltitude: 38,
    transect: { ax: 0.15, ay: 0.65, bx: 0.85, by: 0.28 },
    description: 'Extreme orogenic fold belt where 3,800m+ glaciated arêtes plunge directly into a deep antecedent river gorge and foreland lake.'
  },
  {
    id: 'atoll',
    code: 'EXP-04',
    name: 'Pelagic Atoll & Abyssal Trench',
    region: '11°21′N · 142°12′E // WESTERN PACIFIC',
    seed: 'CHALLENGER-11N',
    seaLevel: 0,
    exaggeration: 1.0,
    contourInterval: 100,
    sunAzimuth: 310,
    sunAltitude: 46,
    transect: { ax: 0.16, ay: 0.18, bx: 0.84, by: 0.82 },
    description: 'Carbonate coral ring reef enclosing a turquoise lagoon atop a guyot seamount bordering a 1,900m subduction trench.'
  },
  {
    id: 'archipelago',
    code: 'EXP-05',
    name: 'Kuril Shattered Archipelago',
    region: '46°50′N · 151°52′E // OKHOTSK BASIN',
    seed: 'SIMUSHIR-151E',
    seaLevel: 0,
    exaggeration: 1.1,
    contourInterval: 100,
    sunAzimuth: 300,
    sunAltitude: 36,
    transect: { ax: 0.10, ay: 0.76, bx: 0.90, by: 0.22 },
    description: 'Tectonic island chain linked by shallow submarine saddles, tidal straits, and volcanic headlands.'
  }
];

/**
 * Generates elevation in meters [-2000, +3800] for normalized coordinates u, v in [0, 1]
 */
export function evaluatePresetElevation(presetId, u, v, simplex) {
  // Aspect-corrected coordinates centered at (0, 0)
  const x = (u - 0.5) * 2.2;
  const y = (v - 0.5) * 1.45;
  const r = Math.hypot(x, y);

  if (presetId === 'fjord') {
    // Deep branching fjord channels entering from the west/southwest into high glaciated mountains on the east
    const wx = simplex.fbm(x * 1.1 + 3.1, y * 1.1 - 1.7, 3) * 0.42;
    const wy = simplex.fbm(x * 1.1 - 4.2, y * 1.1 + 2.4, 3) * 0.42;
    const px = x + wx;
    const py = y + wy;

    // Main fjord valley axis and secondary tributary arm
    const mainTrough = Math.exp(-Math.pow((py - 0.18 * px + 0.08) * 3.8, 2));
    const northBranch = Math.exp(-Math.pow((py - 0.65 * (px - 0.05) - 0.25) * 4.5, 2)) * (px > -0.25 ? 1 : 0);
    const trough = Math.max(mainTrough, northBranch * 0.85);

    // Mountain plateau + sharp glacial arêtes
    const ridges = simplex.ridged(px * 1.35 + 1.2, py * 1.35 + 0.8, 5);
    const detail = simplex.fbm(px * 3.6, py * 3.6, 4) * 220;

    // West coast drops to continental shelf; east rises into alpine icefield
    const continentalTrend = (u - 0.24) * 1550;
    let elev = continentalTrend + ridges * 1950 - trough * 2150 + detail;

    // U-shaped glacial valley floor flattening
    if (elev < 200 && elev > -650) {
      elev = -650 + Math.pow((elev + 650) / 850, 1.35) * 850;
    }
    return clamp(elev, -1850, 3600);
  }

  if (presetId === 'caldera') {
    // Ring stratovolcano with collapsed central caldera and two breach channels
    const wx = simplex.fbm(x * 1.6, y * 1.6, 3) * 0.16;
    const wy = simplex.fbm(x * 1.6 + 5.2, y * 1.6 + 1.4, 3) * 0.16;
    const rx = x + wx;
    const ry = y + wy;
    const rad = Math.hypot(rx, ry);
    const angle = Math.atan2(ry, rx);

    // Outer ring peak around rad = 0.56
    const ringProfile = Math.exp(-Math.pow((rad - 0.54) / 0.21, 2)) * 1850;
    // Steep inner caldera collapse wall
    const calderaBowl = Math.exp(-Math.pow(rad / 0.36, 4)) * 1450;
    // Central resurgent volcanic dome (Nea Kameni style)
    const centralCone = Math.exp(-Math.pow(rad / 0.12, 2)) * 960;
    const craterPit = Math.exp(-Math.pow(rad / 0.04, 2)) * 290;

    // Two radial sea breaches in the ring (NW and SW)
    const breach1 = Math.exp(-Math.pow(angle - 2.35, 2) / 0.07) * Math.exp(-Math.pow((rad - 0.54) / 0.22, 2));
    const breach2 = Math.exp(-Math.pow(angle + 1.75, 2) / 0.05) * Math.exp(-Math.pow((rad - 0.54) / 0.22, 2));

    const radialGullies = simplex.ridged(rx * 2.2, ry * 2.2, 5) * 680;
    const outerBathymetry = -320 - Math.pow(Math.max(0, rad - 0.55), 1.35) * 1450;

    let elev = outerBathymetry + ringProfile - calderaBowl + centralCone - craterPit + radialGullies;
    elev -= (breach1 * 1450 + breach2 * 1250);
    return clamp(elev, -1900, 3400);
  }

  if (presetId === 'massif') {
    // High Himalayan dendritic ridge system with a deep antecedent river gorge cutting across
    const wx = simplex.fbm(x * 1.15 + 2.0, y * 1.15 - 3.0, 3) * 0.34;
    const wy = simplex.fbm(x * 1.15 - 1.5, y * 1.15 + 4.1, 3) * 0.34;
    const px = x + wx;
    const py = y + wy;

    const primaryMassif = simplex.ridged(px * 1.05 + 0.4, py * 1.05 - 0.3, 6) * 2950;
    const secondarySpurs = simplex.ridged(px * 2.3 - 1.8, py * 2.3 + 2.1, 4) * 820;

    // Antecedent river gorge winding from NE to SW + foreland basin in the south-east corner
    const gorgeAxis = Math.abs(px * 0.72 + py * 0.65 - 0.06);
    const gorgeCut = Math.exp(-Math.pow(gorgeAxis * 4.4, 2)) * 2150;

    // Southern foreland lake / sea embayment
    const forelandDrop = Math.max(0, (v - 0.62) * 2.6 + (0.35 - u) * 1.1) * 1250;

    let elev = primaryMassif + secondarySpurs - gorgeCut - forelandDrop - 520;
    return clamp(elev, -1600, 3850);
  }

  if (presetId === 'atoll') {
    // Coral ring atoll + central volcanic remnant peak + deep oceanic subduction trench to the east
    const wx = simplex.fbm(x * 1.9, y * 1.9, 3) * 0.14;
    const wy = simplex.fbm(x * 1.9 + 4.4, y * 1.9 - 2.2, 3) * 0.14;
    const ax = x + 0.25 + wx;
    const ay = y - 0.04 + wy;
    const rad = Math.hypot(ax, ay);

    // Seamount pedestal rising from -1400m
    const pedestal = Math.exp(-Math.pow(rad / 0.62, 2.4)) * 1550 - 1150;
    // Barrier reef rim around rad = 0.44
    const reefMod = simplex.fbm(ax * 3.8, ay * 3.8, 4);
    const reefRim = Math.exp(-Math.pow((rad - 0.43) / 0.09, 2)) * (540 + reefMod * 420);
    // Shallow lagoon floor (-40m to -160m) with central volcanic pinnacle
    const centralPeak = Math.exp(-Math.pow(rad / 0.13, 2)) * 1380;

    // Deep abyssal subduction trench curving along the right side
    const trenchCurve = x - 0.58 + 0.22 * y * y + wx * 0.4;
    const trenchDrop = Math.exp(-Math.pow(trenchCurve * 3.8, 2)) * 1250;

    const seafloorDetail = simplex.ridged(x * 2.1, y * 2.1, 4) * 320;
    let elev = pedestal + reefRim + centralPeak - trenchDrop + seafloorDetail - 180;
    return clamp(elev, -1980, 3200);
  }

  // Default / 'archipelago': Shattered tectonic island arc
  const wx = simplex.fbm(x * 1.35, y * 1.35, 3) * 0.35;
  const wy = simplex.fbm(x * 1.35 + 7.1, y * 1.35 - 3.4, 3) * 0.35;
  const px = x + wx;
  const py = y + wy;

  // Curved island arc spine running diagonally SW to NE
  const arcDist = Math.abs(py + 0.42 * px - 0.16 * px * px);
  const arcSpine = Math.exp(-Math.pow(arcDist * 2.45, 2)) * 1650;

  // Chain of 4 volcanic island centers along the arc
  const peaks =
    Math.exp(-(Math.pow(px + 0.62, 2) + Math.pow(py - 0.26, 2)) / 0.07) * 1350 +
    Math.exp(-(Math.pow(px + 0.12, 2) + Math.pow(py - 0.04, 2)) / 0.09) * 1680 +
    Math.exp(-(Math.pow(px - 0.38, 2) + Math.pow(py + 0.17, 2)) / 0.06) * 1450 +
    Math.exp(-(Math.pow(px - 0.78, 2) + Math.pow(py + 0.32, 2)) / 0.05) * 1180;

  const ridges = simplex.ridged(px * 1.85, py * 1.85, 5) * 1120;
  const micro = simplex.fbm(px * 4.5, py * 4.5, 3) * 180;
  const edgeFalloff = Math.pow(Math.min(1.2, r / 1.15), 2.1) * 950;

  let elev = -1150 + arcSpine + peaks + ridges + micro - edgeFalloff;
  return clamp(elev, -1950, 3500);
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
