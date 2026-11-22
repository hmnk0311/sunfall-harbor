// The campaign: four jobs from fixer Marisol Vega, then free roam. Each mission is
// a small state machine over state.mission = { index, stage, timer }; the renderer
// reads currentObjective() for the world marker and the minimap blip.
import { WANTED } from './config.js';
import { dist, makeCar } from './world.js';
import { emit } from './vehicles.js';

export const PACKAGE_POS = { x: 548, y: 2195 };
export const DELIVER_POS = { x: 2720, y: 1950 };
export const GOLD_POS = { x: 1798, y: 1300 };
export const GARAGE_POS = { x: 2720, y: 220 };
export const HIDEOUT_POS = { x: 220, y: 670 };

export const MISSIONS = [
  {
    title: 'Pier Pressure',
    brief: 'Marisol Vega: "A package washed up on Pier 9, cariño. Pick it up before the tide — or someone else — takes it."',
    pay: 500,
  },
  {
    title: 'Across the Bay',
    brief: 'Marisol Vega: "Now run it to the Marina, fast. My buyer does not wait, and neither does his money."',
    pay: 800,
  },
  {
    title: 'Golden Hour',
    brief: 'Marisol Vega: "A golden coupe sleeps on Neon Row. Borrow it. Bring it to the Hillcrest garage, shiny side up."',
    pay: 1200,
  },
  {
    title: 'Heat Check',
    brief: 'Marisol Vega: "The whole harbour will be watching now. Shake the law and reach the Old Market hideout."',
    pay: 2000,
  },
];

export function startCampaign(state) {
  state.mission = { index: 0, stage: 'pickup', timer: 0 };
  showBrief(state, 0);
}

export function startMissionAt(state, index) {
  if (index >= MISSIONS.length) {
    state.mission = { index: MISSIONS.length, stage: 'roam', timer: 0 };
    return;
  }
  state.mission = { index, stage: ['pickup', 'deliver', 'findgold', 'escape'][index], timer: index === 1 ? 80 : 0 };
  if (index === 2) spawnGoldCar(state);
  if (index === 3) raiseHeatToThreeStars(state);
  showBrief(state, index);
}

function showBrief(state, index) {
  state.brief = MISSIONS[index].brief;
  state.briefTimer = 9;
  state.banner = `MISSION ${index + 1}: ${MISSIONS[index].title}`;
  state.bannerTimer = 3.2;
}

function raiseHeatToThreeStars(state) {
  state.wantedHeat = Math.max(state.wantedHeat, WANTED.thresholds[3] + 4);
  state.wanted = 3;
}

export function spawnGoldCar(state) {
  if (state.cars.some((c) => c.missionTarget)) return;
  const gold = makeCar(GOLD_POS.x, GOLD_POS.y, Math.PI / 2, '#f5b921', 'civilian');
  gold.parked = true;
  gold.missionTarget = true;
  state.cars.push(gold);
  state.goldCar = gold;
}

export function currentObjective(state) {
  const m = state.mission;
  if (!m) return null;
  switch (m.stage) {
    case 'pickup': return { ...PACKAGE_POS, label: 'Pick up the package' };
    case 'deliver': return { ...DELIVER_POS, label: 'Deliver to the Marina' };
    case 'findgold': return { ...GOLD_POS, label: 'Steal the golden coupe' };
    case 'delivercar': return { ...GARAGE_POS, label: 'Deliver the coupe to the garage' };
    case 'escape': return { ...HIDEOUT_POS, label: 'Reach the hideout' };
    default: return null;
  }
}

export function missionText(state) {
  const m = state.mission;
  if (!m || m.index >= MISSIONS.length) return 'Free roam — the harbour is yours.';
  const obj = currentObjective(state);
  let text = `${MISSIONS[m.index].title}: ${obj ? obj.label : ''}`;
  if (m.stage === 'deliver') text += ` — ${Math.max(0, Math.ceil(m.timer))}s`;
  return text;
}

/** Called by the main loop when the player gets into a car. */
export function onEnterCar(state, car) {
  const m = state.mission;
  if (m && m.stage === 'findgold' && car.missionTarget) {
    m.stage = 'delivercar';
    state.banner = 'GOT THE COUPE — TO THE GARAGE';
    state.bannerTimer = 3;
    emit(state, 'pickup');
  }
}

function payAndAdvance(state, nextIndex) {
  const pay = MISSIONS[state.mission.index].pay;
  state.cash += pay;
  state.banner = `MISSION COMPLETE  +$${pay}`;
  state.bannerTimer = 3.4;
  emit(state, 'cash');
  emit(state, 'missiondone');
  if (nextIndex >= MISSIONS.length) {
    state.mission = { index: MISSIONS.length, stage: 'roam', timer: 0 };
    state.campaignDone = true;
    state.screen = 'complete';
    return;
  }
  state.mission = {
    index: nextIndex,
    stage: ['pickup', 'deliver', 'findgold', 'escape'][nextIndex],
    timer: nextIndex === 1 ? 80 : 0,
  };
  if (nextIndex === 2) spawnGoldCar(state);
  if (nextIndex === 3) raiseHeatToThreeStars(state);
  state.brief = MISSIONS[nextIndex].brief;
  state.briefTimer = 9;
  emit(state, 'save');
}

export function updateMissions(state, dt) {
  const m = state.mission;
  if (!m) return;
  const p = state.player;
  if (m.stage === 'deliver') {
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = 80;
      state.banner = 'TOO SLOW — THE CLOCK RESTARTS';
      state.bannerTimer = 2.6;
    }
  }
  const obj = currentObjective(state);
  if (!obj) return;
  const reach = m.stage === 'delivercar' || m.stage === 'deliver' ? 78 : 58;
  if (dist(p.x, p.y, obj.x, obj.y) > reach) return;
  if (m.stage === 'pickup') {
    emit(state, 'pickup');
    payAndAdvance(state, 1);
  } else if (m.stage === 'deliver') {
    payAndAdvance(state, 2);
  } else if (m.stage === 'delivercar') {
    if (p.mode === 'car' && p.car && p.car.missionTarget) payAndAdvance(state, 3);
  } else if (m.stage === 'escape') {
    payAndAdvance(state, 4);
  }
}
