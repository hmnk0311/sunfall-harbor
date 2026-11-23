// The screenshot scenes behind ?shot=chase|foot|combat|mission (plus the older
// title and drive scenes). Each one stages a real game state — the same
// entities, rules and renderer the live game uses — at a frozen moment, so the
// frame is honest: a three-star Mission 4 chase for the cover, unmistakable
// on-foot play, a pistol shot mid-fight, and the Pier 9 package pickup.
import { WANTED } from './config.js';
import { makeCar } from './world.js';
import { enterCar } from './vehicles.js';
import { startCampaign, startMissionAt } from './missions.js';

const REMOTE_TRAFFIC_SPOTS = [
  { x: 2720, y: 244, angle: Math.PI / 2, dir: 1, speed: 145 },
  { x: 2744, y: 1570, angle: Math.PI / 2, dir: 1, speed: 145 },
  { x: 220, y: 244, angle: 0, dir: 0, speed: 145 },
  { x: 2720, y: 1974, angle: Math.PI, dir: 2, speed: 145 },
  { x: 244, y: 1950, angle: 0, dir: 0, speed: 145 },
];

function placeTraffic(state, spots) {
  let i = 0;
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    // Stage every traffic car: the named spots near the action, and all the
    // rest far away, so a random spawn can never overlap the staged subject.
    const spot = i < spots.length ? spots[i] : REMOTE_TRAFFIC_SPOTS[(i - spots.length) % REMOTE_TRAFFIC_SPOTS.length];
    car.x = spot.x;
    car.y = spot.y;
    car.angle = spot.angle;
    car.dir = spot.dir;
    car.speed = spot.speed;
    i += 1;
  }
}

function placePeds(state, spots) {
  for (let i = 0; i < spots.length && i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    const spot = spots[i];
    ped.x = spot.x;
    ped.y = spot.y;
    ped.dir = spot.dir;
    if (spot.color) ped.color = spot.color;
    ped.down = 0;
    ped.flee = 0;
  }
}

function placeParkedCar(state, x, y, angle) {
  const car = state.cars.find((c) => c.kind === 'civilian' && !c.driver && !c.missionTarget) || state.cars[0];
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  car.damage = 0;
  car.wrecked = false;
  car.driver = null;
  car.parked = true;
  return car;
}

function putPlayerInCar(state, x, y, angle, speed) {
  const car = state.cars.find((c) => c.kind === 'civilian' && !c.driver && !c.missionTarget) || state.cars[0];
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = speed;
  car.damage = 0;
  car.wrecked = false;
  car.parked = false;
  state.player.x = x;
  state.player.y = y;
  enterCar(state, car);
  if (state.events) state.events.length = 0;
  return car;
}

export function stageShot(name, state) {
  state.time = 2.4;
  if (name === 'title') {
    state.screen = 'title';
    state.saveExists = true;
    return;
  }
  state.screen = 'play';
  if (name === 'drive') {
    startCampaign(state);
    state.briefTimer = 0;
    // Eastbound on the Old Market high street, traffic around, one star of heat.
    putPlayerInCar(state, 1080, 694, 0, 215);
    placeTraffic(state, [
      { x: 1330, y: 694, angle: 0, dir: 0, speed: 150 },
      { x: 830, y: 646, angle: Math.PI, dir: 2, speed: 150 },
      { x: 1470, y: 646, angle: Math.PI, dir: 2, speed: 140 },
    ]);
    state.wantedHeat = WANTED.thresholds[1] + 3;
    state.wanted = 1;
    state.cash = 500;
    return;
  }
  if (name === 'chase') {
    // The cover: Mission 4 at three stars, the player's car centred in the
    // frame, two marked patrol cars tight behind and ordinary traffic nearby.
    startMissionAt(state, 3);
    state.briefTimer = 0;
    const car = putPlayerInCar(state, 1220, 1120, 0, 305);
    car.color = '#d94f30';
    state.police = [
      makeCar(1048, 1096, 0, '#e8ecf2', 'police'),
      makeCar(1108, 1150, 0, '#e8ecf2', 'police'),
    ];
    for (const cop of state.police) cop.speed = 330;
    placeTraffic(state, [
      { x: 1515, y: 1096, angle: 0, dir: 0, speed: 150 },
      { x: 1560, y: 1144, angle: Math.PI, dir: 2, speed: 150 },
      { x: 1244, y: 845, angle: Math.PI / 2, dir: 1, speed: 145 },
    ]);
    state.wantedHeat = WANTED.thresholds[3] + 6;
    state.wanted = 3;
    state.cash = 2500;
    return;
  }
  if (name === 'foot') {
    // Mission 1 before the pickup: on foot at an intersection, beside a parked
    // car, with three pedestrians close enough to read as people.
    startCampaign(state);
    state.briefTimer = 0;
    state.player.x = 738;
    state.player.y = 716;
    state.player.angle = -0.35;
    state.player.speed = 0;
    placeParkedCar(state, 792, 704, 0);
    placePeds(state, [
      { x: 694, y: 678, dir: 1, color: '#4fb3bf' },
      { x: 792, y: 758, dir: 3, color: '#d46a1f' },
      { x: 676, y: 762, dir: 0, color: '#b03a5b' },
    ]);
    placeTraffic(state, [
      { x: 1045, y: 646, angle: Math.PI, dir: 2, speed: 140 },
    ]);
    state.police = [];
    state.wantedHeat = 0;
    state.wanted = 0;
    state.cash = 0;
    return;
  }
  if (name === 'combat') {
    // On foot and firing: muzzle flash and tracer frozen mid-shot, one patrol
    // car closing in from the east under two wanted stars.
    startCampaign(state);
    state.briefTimer = 0;
    state.bannerTimer = 0;
    state.player.x = 1080;
    state.player.y = 1120;
    state.player.angle = 0;
    state.player.ammo = 11;
    state.player.muzzle = 0.07;
    state.tracers.push({
      x1: 1099, y1: 1120, x2: 1266, y2: 1120, life: 0.14,
    });
    const cop = makeCar(1292, 1120, Math.PI, '#e8ecf2', 'police');
    cop.speed = 185;
    state.police = [cop];
    placeTraffic(state, []);
    placePeds(state, [
      { x: 1015, y: 1032, dir: 1, color: '#57a773' },
      { x: 1160, y: 1212, dir: 3, color: '#e3b505' },
    ]);
    state.wantedHeat = WANTED.thresholds[2] + 4;
    state.wanted = 2;
    state.cash = 500;
    return;
  }
  // mission: on foot on Pier 9, standing well clear of the package marker and
  // its label so both the player and the objective read separately.
  startCampaign(state);
  placeTraffic(state, []);
  state.player.x = 520;
  state.player.y = 2045;
  state.player.angle = Math.PI / 2;
  state.cash = 0;
}
