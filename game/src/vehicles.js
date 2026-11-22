// Cars: the player's feet and wheels, traffic that drives the grid, and every
// collision between cars, buildings and pedestrians. Functions push short event
// names into state.events ('crash', 'hitcar', 'hitped') for the caller to turn
// into sound and wanted heat; this module never touches audio or the police.
import { CAR, PLAYER, ROAD_W, ROAD_XS, ROAD_YS, WORLD } from './config.js';
import { collideWorld, dirAngle, dist, lanePosition, scarePeds, spawnTrafficCar } from './world.js';

export function emit(state, name) {
  if (!state.events) state.events = [];
  state.events.push(name);
}

export function nearestEnterableCar(state, range = 58) {
  const p = state.player;
  let best = null;
  let bestD = range;
  for (const car of state.cars) {
    if (car.driver) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  for (const car of state.police) {
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function enterCar(state, car) {
  const p = state.player;
  p.mode = 'car';
  p.car = car;
  car.driver = 'player';
  car.parked = false;
  emit(state, 'door');
}

export function exitCar(state) {
  const p = state.player;
  if (!p.car) return;
  const car = p.car;
  car.driver = null;
  if (Math.abs(car.speed) < 20) car.parked = true;
  car.speed = 0;
  p.car = null;
  p.mode = 'foot';
  // Step out on the left side of the car.
  p.x = car.x + Math.cos(car.angle - Math.PI / 2) * 30;
  p.y = car.y + Math.sin(car.angle - Math.PI / 2) * 30;
  collideWorld(state, p, p.radius);
  emit(state, 'door');
}

export function updatePlayerFoot(state, input, dt) {
  const p = state.player;
  const axis = input.moveAxis();
  const len = Math.hypot(axis.x, axis.y);
  if (len > 0) {
    const speed = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    p.x += (axis.x / len) * speed * dt;
    p.y += (axis.y / len) * speed * dt;
    p.angle = Math.atan2(axis.y, axis.x);
    p.moving = true;
  } else {
    p.moving = false;
  }
  collideWorld(state, p, p.radius);
}

export function updatePlayerCar(state, input, dt) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  const drive = input.drive();
  if (drive.throttle > 0) {
    car.speed += CAR.accel * dt;
  } else if (drive.throttle < 0) {
    if (car.speed > 12) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.55 * dt;
  }
  if (drive.handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 500 * dt);
    if (Math.abs(car.speed) > 150 && state.random.chance(0.5)) {
      state.skidmarks.push({ x: car.x, y: car.y, life: 6 });
      if (state.skidmarks.length > 420) state.skidmarks.shift();
    }
  }
  car.speed -= car.speed * CAR.drag * dt;
  if (!drive.throttle) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  const grip = Math.max(-1, Math.min(1, car.speed / 130));
  car.angle += drive.steer * CAR.turnRate * grip * dt * (drive.handbrake ? 1.55 : 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  const pushed = collideWorld(state, car, CAR.radius - 4);
  if (pushed > 0.25 && Math.abs(car.speed) > 85) {
    car.damage = Math.min(100, car.damage + Math.abs(car.speed) * 0.045);
    emit(state, 'crash');
    scarePeds(state, car.x, car.y, 170);
    car.speed *= -0.22;
  } else if (pushed > 0) {
    car.speed *= 0.6;
  }
  p.x = car.x;
  p.y = car.y;
  if (car.damage >= 100 && !car.wrecked) {
    car.wrecked = true;
    car.speed = 0;
    p.health = Math.max(20, p.health - 25);
    emit(state, 'wrecked');
  }
}

/** Traffic: follow the lane, slow for the car ahead, sometimes turn at crossings. */
export function updateTraffic(state, dt) {
  const { random } = state;
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.driver) continue;
    car.turnCooldown -= dt;
    // Slow down for anything ahead in the same heading.
    let target = CAR.trafficSpeed;
    for (const other of state.cars) {
      if (other === car) continue;
      const ahead = aheadDistance(car, other);
      if (ahead > 0 && ahead < 74) target = Math.min(target, ahead < 40 ? 0 : CAR.trafficSpeed * 0.45);
    }
    for (const cop of state.police) {
      const ahead = aheadDistance(car, cop);
      if (ahead > 0 && ahead < 74) target = Math.min(target, CAR.trafficSpeed * 0.4);
    }
    car.speed += Math.max(-260 * dt, Math.min(190 * dt, target - car.speed));
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;

    // Crossings: when the centre of a crossing is just ahead, maybe turn.
    const cross = nextCrossing(car);
    if (cross && car.turnCooldown <= 0 && random.chance(0.38)) {
      const options = [0, 1, 2, 3].filter((d) => d !== (car.dir + 2) % 4);
      car.dir = random.pick(options);
      const pos = lanePosition(car.dir, cross.x, cross.y);
      car.x = pos.x;
      car.y = pos.y;
      car.angle = dirAngle(car.dir);
      car.turnCooldown = 2.5;
    }
    collideWorld(state, car, CAR.radius - 4);
    // Off the world or in the water: recycle as a fresh car at an edge.
    if (car.x < 30 || car.x > WORLD.width - 30 || car.y < 30 || car.y > 2060) {
      const fresh = spawnTrafficCar(state, random);
      car.x = fresh.x; car.y = fresh.y; car.dir = fresh.dir; car.angle = fresh.angle; car.speed = fresh.speed;
    }
  }
}

/** Distance to `other` if it sits ahead of `car` in its lane, else -1. */
function aheadDistance(car, other) {
  const dx = other.x - car.x;
  const dy = other.y - car.y;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const ahead = dx * fx + dy * fy;
  const side = Math.abs(dx * -fy + dy * fx);
  if (ahead > 0 && side < 26) return ahead;
  return -1;
}

function nextCrossing(car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const rx of ROAD_XS) {
    for (const ry of ROAD_YS) {
      const dx = rx - car.x;
      const dy = ry - car.y;
      const ahead = dx * fx + dy * fy;
      const side = Math.abs(dx * -fy + dy * fx);
      if (ahead > 6 && ahead < 30 && side < ROAD_W / 2) return { x: rx, y: ry };
    }
  }
  return null;
}

/** Car-to-car bumps and cars running into pedestrians (any driver). */
export function updateCarContacts(state) {
  const all = [...state.cars, ...state.police];
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i];
      const b = all[j];
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > 0.01 && d < 42) {
        const push = (42 - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 120) {
          a.damage = Math.min(100, (a.damage || 0) + impact * 0.03);
          b.damage = Math.min(100, (b.damage || 0) + impact * 0.03);
          if (a.driver === 'player' || b.driver === 'player') {
            emit(state, 'crash');
            emit(state, 'hitcar');
          }
          a.speed *= 0.55;
          b.speed *= 0.55;
        }
      }
    }
  }
  for (const car of all) {
    if (Math.abs(car.speed) < 55) continue;
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 26) {
        ped.down = 7;
        scarePeds(state, ped.x, ped.y, 240);
        car.speed *= 0.7;
        if (car.driver === 'player') emit(state, 'hitped');
      }
    }
  }
  // A police car brushing the player on foot hurts.
  const p = state.player;
  if (p.mode === 'foot') {
    for (const cop of state.police) {
      if (Math.abs(cop.speed) > 120 && dist(cop.x, cop.y, p.x, p.y) < 30 && (p.hurtCooldown || 0) <= 0) {
        p.health -= 12;
        p.hurtCooldown = 1;
        emit(state, 'crash');
      }
    }
  }
  if ((p.hurtCooldown || 0) > 0) p.hurtCooldown -= 1 / 60;
}
