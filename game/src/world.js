// The city of Sunfall Harbor and the whole game state. This module builds the road
// grid, the blocks between the roads (buildings with signs, parks, parking lots),
// the piers over the harbour water, and the starting entities. It also owns the
// geometry helpers every other module uses: what is road, what is water, which
// district a point is in, and how a circle is pushed out of the buildings.
import {
  CAR, CAR_COLORS, PIERS, PLAYER, ROAD_W, ROAD_XS, ROAD_YS, SIGNS, WATER_Y, WORLD,
} from './config.js';

export function districtAt(x, y) {
  if (y >= 1980) return x < 1500 ? 'Dockyards' : 'Marina';
  if (y < 470) return 'Hillcrest';
  if (x >= 1470 && x < 2470 && y >= 470 && y < 1820) return 'Neon Row';
  if (x < 970 && y >= 470) return 'Old Market';
  if (x >= 2470) return 'Marina';
  return 'Midtown';
}

export function isOnRoad(x, y) {
  for (const rx of ROAD_XS) if (Math.abs(x - rx) <= ROAD_W / 2) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) <= ROAD_W / 2) return true;
  return false;
}

export function isOnSidewalk(x, y) {
  const edge = ROAD_W / 2 + 16;
  for (const rx of ROAD_XS) if (Math.abs(x - rx) <= edge) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) <= edge) return true;
  return false;
}

export function isOnPier(x, y) {
  return PIERS.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

export function isWater(x, y) {
  return y >= WATER_Y && !isOnPier(x, y);
}

/** The blocks between the roads: each cell is split into lots. */
function buildBlocks(random) {
  const buildings = [];
  const parks = [];
  const lots = [];
  const xs = [40, ...ROAD_XS, WORLD.width - 40];
  const ys = [40, ...ROAD_YS, 2030];
  let signIndex = random.int(0, SIGNS.length - 1);
  for (let cx = 0; cx < xs.length - 1; cx += 1) {
    for (let cy = 0; cy < ys.length - 1; cy += 1) {
      const x0 = xs[cx] + (cx === 0 ? 0 : ROAD_W / 2 + 18);
      const x1 = xs[cx + 1] - (cx === xs.length - 2 ? 0 : ROAD_W / 2 + 18);
      const y0 = ys[cy] + (cy === 0 ? 0 : ROAD_W / 2 + 18);
      const y1 = ys[cy + 1] - (cy === ys.length - 2 ? 0 : ROAD_W / 2 + 18);
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const roll = random.next();
      if (roll < 0.14) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, trees: makeTrees(random, x0, y0, x1, y1) });
        continue;
      }
      if (roll < 0.3) {
        lots.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        continue;
      }
      // Buildings: 1-4 per cell, each with a sign and a dusk colour.
      const cols = x1 - x0 > 260 ? 2 : 1;
      const rows = y1 - y0 > 260 ? 2 : 1;
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const bx = x0 + ((x1 - x0) / cols) * i + 8;
          const by = y0 + ((y1 - y0) / rows) * j + 8;
          const bw = (x1 - x0) / cols - 16;
          const bh = (y1 - y0) / rows - 16;
          buildings.push({
            x: bx, y: by, w: bw, h: bh,
            color: `hsl(${random.int(18, 220)}, ${random.int(24, 48)}%, ${random.int(38, 58)}%)`,
            roof: `hsl(${random.int(18, 220)}, ${random.int(18, 38)}%, ${random.int(26, 40)}%)`,
            sign: SIGNS[signIndex % SIGNS.length],
            windowsSeed: random.int(1, 99999),
          });
          signIndex += random.int(1, 3);
        }
      }
    }
  }
  return { buildings, parks, lots };
}

function makeTrees(random, x0, y0, x1, y1) {
  const trees = [];
  const count = random.int(4, 9);
  for (let i = 0; i < count; i += 1) {
    trees.push({ x: random.range(x0 + 20, x1 - 20), y: random.range(y0 + 20, y1 - 20), r: random.range(11, 19) });
  }
  return trees;
}

let carId = 1;
export function makeCar(x, y, angle, color, kind = 'civilian') {
  return {
    id: carId++, x, y, angle, speed: 0, color, kind,
    damage: 0, driver: null, parked: false, missionTarget: false,
    // Traffic state: current heading along the grid (0=E, 1=S, 2=W, 3=N).
    dir: 0, turnCooldown: 0, honk: 0,
  };
}

/** A fresh game state: city, player, traffic, parked cars and pedestrians. */
export function createGame(random) {
  carId = 1;
  const { buildings, parks, lots } = buildBlocks(random);
  const state = {
    random,
    buildings, parks, lots,
    player: {
      x: 330, y: 330, angle: 0, radius: PLAYER.radius, health: PLAYER.health,
      mode: 'foot', car: null, ammo: 12, reloading: 0, shootCooldown: 0,
      muzzle: 0, dead: false,
    },
    cars: [],
    peds: [],
    police: [],
    tracers: [],
    skidmarks: [],
    camera: { x: 0, y: 0 },
    screen: 'title',
    cash: 0,
    wantedHeat: 0,
    wanted: 0,
    bustTimer: 0,
    hiddenTimer: 0,
    banner: null,
    bannerTimer: 0,
    brief: null,
    briefTimer: 0,
    message: '',
    time: 0,
    saveExists: false,
    campaignDone: false,
    stats: { crimes: 0, shots: 0 },
  };

  // Parked cars: in the parking lots and along a few road edges.
  for (const lot of lots) {
    const n = Math.min(4, Math.max(1, ((lot.w / 70) | 0)));
    for (let i = 0; i < n; i += 1) {
      const car = makeCar(lot.x + 40 + i * 68, lot.y + lot.h / 2, Math.PI / 2, random.pick(CAR_COLORS));
      car.parked = true;
      state.cars.push(car);
    }
  }
  for (let i = 0; i < CAR.parkedCount; i += 1) {
    const vertical = random.chance(0.5);
    if (vertical) {
      const rx = random.pick(ROAD_XS);
      const car = makeCar(rx + ROAD_W / 2 + 22, random.range(120, 2000), Math.PI / 2, random.pick(CAR_COLORS));
      car.parked = true;
      state.cars.push(car);
    } else {
      const ry = random.pick(ROAD_YS);
      const car = makeCar(random.range(120, 2900), ry + ROAD_W / 2 + 22, 0, random.pick(CAR_COLORS));
      car.parked = true;
      state.cars.push(car);
    }
  }

  // Moving traffic, already placed on the grid with a heading.
  for (let i = 0; i < CAR.trafficCount; i += 1) {
    state.cars.push(spawnTrafficCar(state, random, true));
  }

  // Pedestrians on the sidewalks.
  for (let i = 0; i < 36; i += 1) {
    state.peds.push(spawnPed(random));
  }
  return state;
}

/** A traffic car on a random road, driving its heading's right-hand lane. */
export function spawnTrafficCar(state, random, anywhere = false) {
  const horizontal = random.chance(0.5);
  const dir = horizontal ? (random.chance(0.5) ? 0 : 2) : (random.chance(0.5) ? 1 : 3);
  let x; let y;
  if (horizontal) {
    const ry = random.pick(ROAD_YS);
    y = ry + (dir === 0 ? 24 : -24);
    x = anywhere ? random.range(80, WORLD.width - 80) : (dir === 0 ? 60 : WORLD.width - 60);
  } else {
    const rx = random.pick(ROAD_XS);
    x = rx + (dir === 1 ? -24 : 24);
    y = anywhere ? random.range(80, 1980) : (dir === 1 ? 60 : 2020);
  }
  const car = makeCar(x, y, dirAngle(dir), random.pick(CAR_COLORS), 'traffic');
  car.dir = dir;
  car.speed = CAR.trafficSpeed * random.range(0.8, 1.1);
  return car;
}

export function dirAngle(dir) {
  return [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir];
}

/** Lane-correct centre for a car with heading `dir` passing a road crossing. */
export function lanePosition(dir, crossX, crossY) {
  if (dir === 0) return { x: crossX, y: crossY + 24 };
  if (dir === 2) return { x: crossX, y: crossY - 24 };
  if (dir === 1) return { x: crossX - 24, y: crossY };
  return { x: crossX + 24, y: crossY };
}

export function spawnPed(random) {
  const vertical = random.chance(0.5);
  let x; let y; let dir;
  if (vertical) {
    const rx = random.pick(ROAD_XS);
    x = rx + (random.chance(0.5) ? ROAD_W / 2 + 10 : -ROAD_W / 2 - 10);
    y = random.range(80, 2000);
    dir = random.chance(0.5) ? 1 : 3;
  } else {
    const ry = random.pick(ROAD_YS);
    y = ry + (random.chance(0.5) ? ROAD_W / 2 + 10 : -ROAD_W / 2 - 10);
    x = random.range(80, WORLD.width - 80);
    dir = random.chance(0.5) ? 0 : 2;
  }
  return {
    x, y, dir, speed: random.range(45, 75), radius: 9,
    color: random.pick(['#d46a1f', '#4fb3bf', '#b03a5b', '#e0e4e8', '#57a773', '#e3b505', '#8e44ad']),
    flee: 0, down: 0, panicX: 0, panicY: 0, turnCooldown: random.range(0, 3),
  };
}

/** Push a circle (entity with x/y/radius) out of every building and the water. Returns the push strength. */
export function collideWorld(state, ent, radius) {
  let pushed = 0;
  for (const b of state.buildings) {
    const nx = Math.max(b.x, Math.min(ent.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(ent.y, b.y + b.h));
    const dx = ent.x - nx;
    const dy = ent.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 < 0.01) {
        ent.x = b.x - radius;
        pushed = Math.max(pushed, 1);
        continue;
      }
      const d = Math.sqrt(d2);
      ent.x = nx + (dx / d) * radius;
      ent.y = ny + (dy / d) * radius;
      pushed = Math.max(pushed, 1 - d / radius);
    }
  }
  if (ent.y > WATER_Y - radius && !isOnPier(ent.x, ent.y)) {
    ent.y = WATER_Y - radius;
    pushed = Math.max(pushed, 0.5);
  }
  ent.x = Math.max(radius, Math.min(WORLD.width - radius, ent.x));
  ent.y = Math.max(radius, Math.min(WORLD.height - radius, ent.y));
  return pushed;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Any pedestrian or police officer close enough to see a crime at (x, y)? */
export function witnessedBy(state, x, y, range = 300) {
  for (const ped of state.peds) {
    if (ped.down <= 0 && dist(x, y, ped.x, ped.y) < range) return true;
  }
  for (const cop of state.police) {
    if (dist(x, y, cop.x, cop.y) < range + 120) return true;
  }
  return false;
}

/** Pedestrians near a scare run from it; used by gunfire, crashes and fast cars. */
export function scarePeds(state, x, y, range = 190) {
  for (const ped of state.peds) {
    const d = dist(x, y, ped.x, ped.y);
    if (ped.down <= 0 && d < range) {
      ped.flee = 2.5;
      const a = Math.atan2(ped.y - y, ped.x - x);
      ped.panicX = Math.cos(a);
      ped.panicY = Math.sin(a);
    }
  }
}

/** Pedestrians stroll the sidewalks; frightened ones sprint away from the scare. */
export function updatePeds(state, dt) {
  const { random } = state;
  for (const ped of state.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      continue;
    }
    if (ped.flee > 0) {
      ped.flee -= dt;
      ped.x += ped.panicX * 165 * dt;
      ped.y += ped.panicY * 165 * dt;
      collideWorld(state, ped, ped.radius);
      continue;
    }
    ped.turnCooldown -= dt;
    // At a crossing, sometimes turn onto the crossing street.
    const nearX = ROAD_XS.find((rx) => Math.abs(ped.x - rx) < 14);
    const nearY = ROAD_YS.find((ry) => Math.abs(ped.y - ry) < 14);
    if (ped.turnCooldown <= 0 && nearX !== undefined && nearY !== undefined && random.chance(0.4)) {
      ped.dir = random.int(0, 3);
      ped.turnCooldown = random.range(2, 6);
    }
    const a = dirAngle(ped.dir);
    ped.x += Math.cos(a) * ped.speed * dt;
    ped.y += Math.sin(a) * ped.speed * dt;
    if (ped.x < 30 || ped.x > WORLD.width - 30 || ped.y < 30 || ped.y > 2060) {
      ped.dir = (ped.dir + 2) % 4;
    }
    collideWorld(state, ped, ped.radius);
  }
}
