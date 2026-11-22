// Every tuning number, colour and city constant for Sunfall Harbor in one place.
// The world is a fixed 3000x2300 harbour city; the renderer follows the player with a
// camera, so no rule below depends on the screen size.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = { width: 3000, height: 2300 };

/** Road centre lines: traffic, pedestrians and the minimap all read the same grid. */
export const ROAD_XS = [220, 720, 1220, 1720, 2220, 2720];
export const ROAD_YS = [220, 670, 1120, 1570, 1950];
export const ROAD_W = 112;

/** The harbour waterline: south of this y is water, except on the wooden piers. */
export const WATER_Y = 2140;
export const PIERS = [
  { x: 500, y: 2030, w: 96, h: 240 },
  { x: 760, y: 2030, w: 96, h: 240 },
  { x: 2380, y: 2030, w: 96, h: 240 },
];

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  sprintSpeed: 275,
  health: 100,
};

export const CAR = {
  length: 46,
  width: 22,
  radius: 24,
  accel: 300,
  brake: 420,
  maxSpeed: 430,
  maxReverse: 150,
  drag: 0.55,
  turnRate: 2.5,
  trafficSpeed: 150,
  parkedCount: 26,
  trafficCount: 14,
};

export const WANTED = {
  /** Heat needed for each star count, index = stars. */
  thresholds: [0, 12, 30, 55, 90, 135],
  decayPerSecond: 2.2,
  escapeDecayPerSecond: 9,
  carjack: 14,
  hitCar: 8,
  hitPed: 26,
  gunshot: 10,
  hitPolice: 22,
};

export const POLICE = {
  maxSpeed: 455,
  accel: 320,
  spawnDistance: 620,
  bustRadius: 52,
  bustSeconds: 2.5,
};

export const PISTOL = { ammo: 12, range: 330, reloadSeconds: 1.2, cooldown: 0.22 };

export const SAVE_KEY = 'sunfall-harbor.save.v1';

export const PALETTE = {
  ground: '#3a4149',
  sidewalk: '#565e68',
  road: '#22252c',
  roadEdge: '#c8b458',
  lane: '#9aa0a8',
  water: '#14425e',
  waterLight: '#1d5a7d',
  pier: '#7a5c3e',
  park: '#2e5d3a',
  parking: '#31353d',
  player: '#ffd34d',
  police: '#e8ecf2',
  policeBlue: '#2456c8',
  gold: '#f5b921',
  text: '#f2f4f6',
  muted: '#a7b0ba',
  panel: 'rgba(12,14,20,0.78)',
  danger: '#e5534b',
  good: '#57d977',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Building signs: original Sunfall Harbor businesses, painted on the roofs. */
export const SIGNS = [
  'HOTEL SOL', 'CAFE LUMEN', 'TIDELINE BAR', 'PIER 9 DINER', 'KITE & CO', 'VELA BOOKS',
  'NOVA GYM', 'HARBOUR PHARMACY', 'OSTRA SEAFOOD', 'MERCADO LUZ', 'BANCO FARO', 'TALLER RUIZ',
  'CINEMA BRISA', 'FLORERIA MIA', 'PANADERIA SOL', 'CLUB NEON', 'RAMEN FARO', 'PIZZA VELA',
  'JOYERIA MAR', 'TATTOO BRISA', 'OPTICA LUZ', 'LIBROS FARO', 'SUPER MAREA', 'GYM TITAN',
];

export const CAR_COLORS = [
  '#c8452c', '#2c6ec8', '#e0e4e8', '#3a3f46', '#57a773', '#e3b505',
  '#8e44ad', '#d46a1f', '#4fb3bf', '#b03a5b', '#7a828c', '#274156',
];
