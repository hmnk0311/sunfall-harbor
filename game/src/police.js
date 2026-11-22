// The wanted system and the Sunfall Harbor police. Crimes add heat when someone
// sees them; heat becomes stars; stars decide how many patrol cars hunt the
// player. Hide from every badge long enough and the heat drains away.
import { POLICE, ROAD_XS, ROAD_YS, WANTED } from './config.js';
import { collideWorld, dist, makeCar, witnessedBy } from './world.js';
import { emit } from './vehicles.js';

export function starsForHeat(heat) {
  let stars = 0;
  for (let i = 1; i < WANTED.thresholds.length; i += 1) {
    if (heat >= WANTED.thresholds[i]) stars = i;
  }
  return stars;
}

/** A crime at (x, y): only adds heat when witnessed, unless `always` is set. */
export function commitCrime(state, points, x, y, always = false) {
  if (!always && !witnessedBy(state, x, y)) return false;
  state.wantedHeat += points;
  state.stats.crimes += 1;
  state.hiddenTimer = 0;
  return true;
}

export function updateWanted(state, dt) {
  const p = state.player;
  let anyCopNear = false;
  for (const cop of state.police) {
    if (dist(cop.x, cop.y, p.x, p.y) < 300) {
      anyCopNear = true;
      break;
    }
  }
  if (anyCopNear) {
    state.hiddenTimer = 0;
  } else {
    state.hiddenTimer += dt;
  }
  const escaping = state.hiddenTimer > 1.2 && state.wanted > 0;
  const rate = escaping ? WANTED.escapeDecayPerSecond : WANTED.decayPerSecond;
  state.wantedHeat = Math.max(0, state.wantedHeat - rate * dt);
  state.wanted = starsForHeat(state.wantedHeat);
}

function spawnCop(state) {
  const p = state.player;
  const { random } = state;
  for (let tries = 0; tries < 12; tries += 1) {
    const rx = ROAD_XS.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
    const ry = ROAD_YS.reduce((a, b) => (Math.abs(b - p.y) < Math.abs(a - p.y) ? b : a));
    const angle = random.range(0, Math.PI * 2);
    const x = Math.max(50, Math.min(2950, p.x + Math.cos(angle) * POLICE.spawnDistance));
    const y = Math.max(50, Math.min(2000, p.y + Math.sin(angle) * POLICE.spawnDistance));
    // Snap the spawn onto the nearest road so the chase starts on tarmac.
    const onX = Math.abs(x - rx) < Math.abs(y - ry);
    const cop = makeCar(onX ? rx : x, onX ? y : ry, 0, '#e8ecf2', 'police');
    cop.speed = 200;
    state.police.push(cop);
    return;
  }
}

export function updatePolice(state, dt) {
  const p = state.player;
  const wanted = state.wanted;
  const desired = wanted === 0 ? 0 : Math.min(1 + wanted, 6);
  if (state.police.length < desired) {
    state.spawnCooldown = (state.spawnCooldown || 0) - dt;
    if (state.spawnCooldown <= 0) {
      spawnCop(state);
      state.spawnCooldown = 1.4;
    }
  } else if (state.police.length > desired) {
    // Extra units peel off when the heat drops.
    state.police.length = desired;
  }

  const playerSpeed = p.mode === 'car' && p.car ? Math.abs(p.car.speed) : (p.moving ? 170 : 0);
  let pinning = false;
  for (const cop of state.police) {
    const targetA = Math.atan2(p.y - cop.y, p.x - cop.x);
    let diff = targetA - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    const d = dist(cop.x, cop.y, p.x, p.y);
    const topSpeed = d > 260 ? POLICE.maxSpeed : POLICE.maxSpeed * 0.82;
    cop.speed += Math.max(-380 * dt, Math.min(POLICE.accel * dt, topSpeed - cop.speed));
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    const pushed = collideWorld(state, cop, 20);
    if (pushed > 0.3) cop.speed *= 0.45;
    if (d < POLICE.bustRadius && playerSpeed < 55) pinning = true;
    // Ramming the player's car: a shove and a crunch.
    if (p.mode === 'car' && p.car && d < 44 && Math.abs(cop.speed) > 130) {
      p.car.damage = Math.min(100, p.car.damage + 4);
      cop.speed *= 0.6;
      emit(state, 'crash');
    }
  }
  if (pinning && wanted > 0) {
    state.bustTimer += dt;
    if (state.bustTimer >= POLICE.bustSeconds) {
      state.screen = 'busted';
      emit(state, 'busted');
    }
  } else {
    state.bustTimer = Math.max(0, state.bustTimer - dt * 1.6);
  }
}
