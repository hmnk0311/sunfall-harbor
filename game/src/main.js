// Boot and the one loop for Sunfall Harbor. Input is read every fixed 1/60 s step,
// the city advances (player, traffic, pedestrians, police, missions), events the
// modules queued become sound and wanted heat, and the renderer paints the frame.
// Screens: title, play, paused, busted, wasted and campaign complete.
//
// ?seed=N fixes the city. ?shot=title|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { PISTOL, SAVE_KEY, STEP, WANTED } from './config.js';
import { createRandom } from './random.js';
import { createGame, scarePeds, updatePeds } from './world.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, ACTION_RELOAD, ACTION_SHOOT_KEY, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  enterCar, exitCar, nearestEnterableCar, updateCarContacts, updatePlayerCar, updatePlayerFoot, updateTraffic,
} from './vehicles.js';
import { commitCrime, updatePolice, updateWanted } from './police.js';
import { onEnterCar, startCampaign, startMissionAt, updateMissions } from './missions.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

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
    if (typeof save.cash !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
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
  audio.unlock();
}

function continueGame() {
  const save = readSave();
  if (!save) return newGame();
  newGame();
  state.cash = save.cash;
  if (save.missionIndex > 0) startMissionAt(state, Math.min(save.missionIndex, 4));
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
  if (state.player.car) exitCar(state);
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
  // Pedestrians along the line fall; police cars take damage and answer back.
  for (const ped of state.peds) {
    if (ped.down > 0) continue;
    const t = (ped.x - p.x) * dx + (ped.y - p.y) * dy;
    if (t < 0 || t > bestT) continue;
    const side = Math.abs((ped.x - p.x) * -dy + (ped.y - p.y) * dx);
    if (side < 15) {
      bestT = t;
      endX = ped.x;
      endY = ped.y;
      ped.down = 8;
      scarePeds(state, ped.x, ped.y, 260);
      commitCrime(state, WANTED.hitPed, p.x, p.y, state.police.length > 0);
    }
  }
  for (const cop of state.police) {
    const t = (cop.x - p.x) * dx + (cop.y - p.y) * dy;
    if (t < 0 || t > bestT) continue;
    const side = Math.abs((cop.x - p.x) * -dy + (cop.y - p.y) * dx);
    if (side < 26) {
      bestT = t;
      endX = cop.x;
      endY = cop.y;
      cop.damage = Math.min(100, (cop.damage || 0) + 26);
      commitCrime(state, WANTED.hitPolice, p.x, p.y, true);
    }
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

function step(dt) {
  state.time += dt;
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
  if (input.consume(ACTION_PAUSE)) {
    state.screen = 'paused';
    return;
  }
  const p = state.player;
  if (input.consume(ACTION_INTERACT)) {
    if (p.mode === 'foot') {
      const car = nearestEnterableCar(state);
      if (car) {
        enterCar(state, car);
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
  updateWanted(state, dt);
  updateCarContacts(state);
  updateMissions(state, dt);
  processEvents();
  // Timers and fading things.
  if (state.bannerTimer > 0) state.bannerTimer -= dt;
  if (state.briefTimer > 0) state.briefTimer -= dt;
  for (const t of state.tracers) t.life -= dt;
  state.tracers = state.tracers.filter((t) => t.life > 0);
  for (const m of state.skidmarks) m.life -= dt;
  state.skidmarks = state.skidmarks.filter((m) => m.life > 0);
  if (p.health <= 0 && state.screen === 'play') {
    state.screen = 'over';
    audio.busted();
    audio.setSiren(false);
  }
  saveTimer += dt;
  if (saveTimer > 5) {
    saveTimer = 0;
    writeSave();
  }
  audio.setSiren(state.wanted > 0);
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
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
    }
    renderer.draw(state);
    input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
