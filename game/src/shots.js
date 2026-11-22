// The screenshot scenes behind ?shot=title|drive|chase|mission. Each one stages a
// real game state (the same entities and rules the live game uses) at a frozen
// moment, so the frame is honest: a title over the city, a drive through traffic,
// a three-star chase, and the first mission marker on the pier.
import { WANTED } from './config.js';
import { makeCar } from './world.js';
import { enterCar } from './vehicles.js';
import { startCampaign, startMissionAt } from './missions.js';

function placeTraffic(state, spots) {
  let i = 0;
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    const spot = spots[i % spots.length];
    car.x = spot.x;
    car.y = spot.y;
    car.angle = spot.angle;
    car.dir = spot.dir;
    car.speed = spot.speed;
    i += 1;
    if (i >= spots.length) break;
  }
}

function putPlayerInCar(state, x, y, angle, speed) {
  const car = state.cars.find((c) => c.kind === 'civilian' && !c.driver) || state.cars[0];
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = speed;
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
    startMissionAt(state, 3);
    state.briefTimer = 4;
    // Southbound at speed with three units on the tail and the hideout ahead.
    putPlayerInCar(state, 1696, 940, Math.PI / 2, 320);
    state.police = [
      makeCar(1648, 700, Math.PI / 2, '#e8ecf2', 'police'),
      makeCar(1744, 660, Math.PI / 2, '#e8ecf2', 'police'),
      makeCar(1696, 520, Math.PI / 2, '#e8ecf2', 'police'),
    ];
    for (const cop of state.police) cop.speed = 300;
    state.wantedHeat = WANTED.thresholds[3] + 6;
    state.wanted = 3;
    state.cash = 2500;
    return;
  }
  // mission: on foot on Pier 9, the package marker glowing at the end of the pier.
  startCampaign(state);
  state.player.x = 548;
  state.player.y = 2128;
  state.player.angle = Math.PI / 2;
  state.cash = 0;
}
