// Boot and the one loop for Sunfall Harbor. Input is read every fixed 1/60 s step,
// the city advances (player, traffic, pedestrians, police, missions), events the
// modules queued become sound and wanted heat, and the renderer paints the frame.
// Screens: title, play, paused, busted, wasted and campaign complete.
//
// ?seed=N fixes the city. ?shot=chase|foot|combat|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { CAR, PISTOL, SAVE_KEY, STEP, WANTED, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createGame, scarePeds, updatePeds } from './world.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, ACTION_RELOAD, ACTION_SHOOT_KEY, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  damageCar, enterCar, exitCar, nearestEnterableCar, updateCarContacts, updatePlayerCar, updatePlayerFoot, updateTraffic,
} from './vehicles.js';
import { commitCrime, updatePolice, updateWanted } from './police.js';
import { onEnterCar, startCampaign, startMissionAt, updateMissions } from './missions.js';
import { createRenderer } from './render.js';
import { stageShot } from './screenshot-scenes.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const audio = createAudio();

let state = createGame(createRandom(seed));
state.events = [];

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || typeof save !== 'object' || Array.isArray(save)) return null;
    // Validate the whole save, not just two types: a fractional mission index
    // used to index mission tables with 1.5 and freeze or corrupt the run,
    // and non-finite cash or coordinates poisoned everything they touched.
    if (!Number.isFinite(save.cash) || save.cash < 0) return null;
    if (!Number.isInteger(save.missionIndex) || save.missionIndex < 0 || save.missionIndex > 4) return null;
    if (!Number.isFinite(save.x) || save.x < 0 || save.x > WORLD.width) return null;
    if (!Number.isFinite(save.y) || save.y < 0 || save.y > WORLD.height) return null;
    return {
      cash: save.cash,
      missionIndex: save.missionIndex,
      x: save.x,
      y: save.y,
    };
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.mission ? state.mission.index : 0,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
    }));
    state.saveExists = true;
  } catch {
    // Storage can be off: the run then lasts this visit only.
  }
}

state.saveExists = Boolean(readSave());

function newGame() {
  const keepSaveFlag = state.saveExists;
  state = createGame(createRandom(seed));
  state.events = [];
  state.saveExists = keepSaveFlag;
  state.screen = 'play';
  startCampaign(state);
  audio.setSiren(false);
  audio.setEngine(false);
  audio.unlock();
}

function continueGame() {
  const save = readSave();
  if (!save) return newGame();
  newGame();
  state.cash = save.cash;
  if (save.missionIndex > 0) startMissionAt(state, save.missionIndex);
  // An index-4 save is a finished campaign: restore that fact explicitly, or
  // a later bust would restart Mission 4 and pay its $2,000 a second time.
  state.campaignDone = save.missionIndex >= 4;
  state.player.x = save.x;
  state.player.y = save.y;
  return undefined;
}

function resetAfterEnd() {
  const missionIndex = state.mission ? Math.min(state.mission.index, 3) : 0;
  const cash = state.cash;
  state.wantedHeat = 0;
  state.wanted = 0;
  state.police = [];
  state.bustTimer = 0;
  state.player.health = 100;
  state.player.dead = false;
  state.player.speed = 0;
  state.player.moving = false;
  if (state.player.car) exitCar(state);
  audio.setSiren(false);
  audio.setEngine(false);
  state.player.x = 330;
  state.player.y = 330;
  state.cash = cash;
  state.screen = 'play';
  if (state.campaignDone) {
    state.mission = { index: 4, stage: 'roam', timer: 0 };
  } else {
    startMissionAt(state, missionIndex);
  }
}

function firePistol(fromKey) {
  const p = state.player;
  if (p.shootCooldown > 0 || p.reloading > 0) return;
  if (p.ammo <= 0) {
    audio.dryFire();
    startReload();
    return;
  }
  p.ammo -= 1;
  p.shootCooldown = PISTOL.cooldown;
  p.muzzle = 0.07;
  state.stats.shots += 1;
  let angle = p.angle;
  if (!fromKey) {
    const wx = state.camera.x + input.mouse.x;
    const wy = state.camera.y + input.mouse.y;
    angle = Math.atan2(wy - p.y, wx - p.x);
    p.angle = angle;
  }
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let endX = p.x + dx * PISTOL.range;
  let endY = p.y + dy * PISTOL.range;
  let bestT = PISTOL.range;
  // One bullet stops in the first target it reaches: scan for the nearest
  // pedestrian or police car along the line first, then apply that single
  // hit. (Applying the effects while scanning let one shot drop a far target
  // and a near one alike, whenever the far one happened to be listed first.)
  let hitPed = null;
  let hitCop = null;
  for (const ped of state.peds) {
    if (ped.down > 0) continue;
    const t = (ped.x - p.x) * dx + (ped.y - p.y) * dy;
    if (t < 0 || t >= bestT) continue;
    const side = Math.abs((ped.x - p.x) * -dy + (ped.y - p.y) * dx);
    if (side < 15) {
      bestT = t;
      hitPed = ped;
      hitCop = null;
    }
  }
  for (const cop of state.police) {
    const t = (cop.x - p.x) * dx + (cop.y - p.y) * dy;
    if (t < 0 || t >= bestT) continue;
    const side = Math.abs((cop.x - p.x) * -dy + (cop.y - p.y) * dx);
    if (side < 26) {
      bestT = t;
      hitCop = cop;
      hitPed = null;
    }
  }
  if (hitPed) {
    endX = hitPed.x;
    endY = hitPed.y;
    hitPed.down = 8;
    scarePeds(state, hitPed.x, hitPed.y, 260);
    commitCrime(state, WANTED.hitPed, p.x, p.y, state.police.length > 0);
  } else if (hitCop) {
    endX = hitCop.x;
    endY = hitCop.y;
    damageCar(hitCop, 26);
    if (hitCop.damage >= 100) {
      hitCop.wrecked = true;
      hitCop.speed = 0;
    }
    commitCrime(state, WANTED.hitPolice, p.x, p.y, true);
  }
  state.tracers.push({ x1: p.x + dx * 20, y1: p.y + dy * 20, x2: endX, y2: endY, life: 0.14 });
  commitCrime(state, WANTED.gunshot, p.x, p.y);
  scarePeds(state, p.x, p.y, 200);
  audio.shot();
  if (p.ammo === 0) startReload();
}

function startReload() {
  const p = state.player;
  if (p.reloading > 0 || p.ammo === PISTOL.ammo) return;
  p.reloading = PISTOL.reloadSeconds;
  audio.reload();
}

function processEvents() {
  const p = state.player;
  for (const event of state.events) {
    switch (event) {
      case 'crash': audio.crash(); break;
      case 'door': audio.door(); break;
      case 'pickup': audio.pickup(); break;
      case 'cash': audio.cash(); break;
      case 'missiondone': audio.missionDone(); break;
      case 'busted': audio.busted(); audio.setSiren(false); break;
      case 'save': writeSave(); break;
      case 'hitcar':
        commitCrime(state, WANTED.hitCar, p.x, p.y);
        break;
      case 'hitped':
        commitCrime(state, WANTED.hitPed, p.x, p.y, state.police.length > 0);
        audio.crash(0.6);
        break;
      case 'wrecked':
        state.banner = 'YOUR RIDE IS WRECKED';
        state.bannerTimer = 2.4;
        if (p.car) exitCar(state);
        break;
      default: break;
    }
  }
  state.events.length = 0;
}

let saveTimer = 0;
let lastScreen = state.screen;
let lastMode = state.player.mode;

function step(dt) {
  state.time += dt;
  if (state.screen !== lastScreen || state.player.mode !== lastMode) {
    // A one-shot press belongs to the context it was made in. Dropping the
    // pending actions at every screen or foot/car transition stops, say, an
    // Enter hit during play from dismissing the busted screen that replaced
    // play a step later, or an R hit in a car from reloading on foot.
    lastScreen = state.screen;
    lastMode = state.player.mode;
    input.clearActions();
  }
  if (state.screen !== 'play') {
    input.consumeBlur();
    audio.setSiren(false);
    audio.setEngine(false);
  }
  if (state.screen === 'title') {
    if (input.consume(ACTION_CONFIRM) || input.consumeClick()) newGame();
    return;
  }
  if (state.screen === 'paused') {
    if (input.consume(ACTION_PAUSE) || input.consume(ACTION_CONFIRM)) state.screen = 'play';
    return;
  }
  if (state.screen === 'busted' || state.screen === 'over') {
    if (input.consume(ACTION_CONFIRM)) resetAfterEnd();
    return;
  }
  if (state.screen === 'complete') {
    if (input.consume(ACTION_CONFIRM)) state.screen = 'play';
    return;
  }
  // Play.
  if (input.consume(ACTION_PAUSE) || input.consumeBlur()) {
    state.screen = 'paused';
    audio.setSiren(false);
    audio.setEngine(false);
    return;
  }
  const p = state.player;
  if (input.consume(ACTION_INTERACT)) {
    if (p.mode === 'foot') {
      const car = nearestEnterableCar(state);
      if (car && enterCar(state, car)) {
        commitCrime(state, WANTED.carjack, p.x, p.y);
        onEnterCar(state, car);
      }
    } else if (p.car && Math.abs(p.car.speed) < 170) {
      exitCar(state);
    }
  }
  if (p.mode === 'foot') {
    updatePlayerFoot(state, input, dt);
    if (input.consume(ACTION_RELOAD)) startReload();
    if (input.consume(ACTION_SHOOT_KEY)) firePistol(true);
    else if (input.consumeClick()) firePistol(false);
  } else {
    updatePlayerCar(state, input, dt);
  }
  if (p.shootCooldown > 0) p.shootCooldown -= dt;
  if (p.muzzle > 0) p.muzzle -= dt;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) p.ammo = PISTOL.ammo;
  }
  updateTraffic(state, dt);
  updatePeds(state, dt);
  updatePolice(state, dt);
  if (state.screen === 'busted') {
    // A bust is terminal for this step: missions must not pay out, advance or
    // replace it with the campaign-complete screen afterwards.
    processEvents();
    audio.setSiren(false);
    audio.setEngine(false);
    return;
  }
  updateWanted(state, dt);
  updateCarContacts(state);
  if (p.health <= 0) {
    state.screen = 'over';
    processEvents();
    audio.busted();
    audio.setSiren(false);
    audio.setEngine(false);
    return;
  }
  updateMissions(state, dt);
  processEvents();
  // Timers and fading things.
  if (state.bannerTimer > 0) state.bannerTimer -= dt;
  if (state.briefTimer > 0) state.briefTimer -= dt;
  for (const t of state.tracers) t.life -= dt;
  state.tracers = state.tracers.filter((t) => t.life > 0);
  for (const m of state.skidmarks) m.life -= dt;
  state.skidmarks = state.skidmarks.filter((m) => m.life > 0);
  saveTimer += dt;
  if (saveTimer > 5) {
    saveTimer = 0;
    writeSave();
  }
  // Sound follows the actual state, not wanted level alone: terminal and
  // complete screens are silent, and the engine only runs in a driven car.
  audio.setSiren(state.screen === 'play' && state.wanted > 0);
  audio.setEngine(
    state.screen === 'play' && p.mode === 'car' && Boolean(p.car) && !p.car.wrecked,
    p.car ? Math.abs(p.car.speed) / CAR.maxSpeed : 0,
  );
  if (status) status.textContent = `${state.cash} dollars, ${state.wanted} stars`;
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyC' && state.screen === 'title' && state.saveExists) continueGame();
});

if (shot) {
  stageShot(shot, state);
  let painted = 0;
  const paint = () => {
    renderer.draw(state);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  let last = performance.now();
  let accumulator = 0;
  const frame = (now) => {
    accumulator += Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    let stepped = false;
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
      stepped = true;
    }
    renderer.draw(state);
    if (stepped) input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
