// Drawing only: the game state in, pixels out. A camera follows the player across
// the 3000x2300 city; the HUD (minimap, wanted stars, cash, health, mission text)
// is painted in screen space on top. Screens: title, play, paused, busted, over
// (wasted) and complete.
import {
  FONT, PALETTE, PIERS, ROAD_W, ROAD_XS, ROAD_YS, WATER_Y, WORLD,
} from './config.js';
import { districtAt } from './world.js';
import { currentObjective, missionText } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_OVER = 'over';
export const SCREEN_COMPLETE = 'complete';

export function computeCamera(state, viewW, viewH) {
  const p = state.player;
  let cx = p.x - viewW / 2;
  let cy = p.y - viewH / 2;
  if (state.screen === SCREEN_TITLE) {
    // A slow pan across Neon Row behind the title.
    cx = 1150 + Math.sin(state.time * 0.07) * 260 - viewW / 2 + 400;
    cy = 900 + Math.cos(state.time * 0.05) * 160 - viewH / 2 + 300;
  }
  cx = Math.max(0, Math.min(WORLD.width - viewW, cx));
  cy = Math.max(0, Math.min(WORLD.height - viewH, cy));
  state.camera.x = cx;
  state.camera.y = cy;
  return state.camera;
}

/** Deterministic 0..1 from an integer seed and an index (for window lights). */
function hash01(seed, i) {
  let h = (seed * 374761393 + i * 668265263) >>> 0;
  h = (h ^ (h >> 13)) >>> 0;
  return ((h * 1274126177) >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function draw(state) {
    resize();
    const W = canvas.width;
    const H = canvas.height;
    const cam = computeCamera(state, W, H);
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawCity(state);
    drawObjective(state);
    for (const car of state.cars) drawCar(state, car, false);
    for (const cop of state.police) drawCar(state, cop, true);
    if (state.player.mode === 'car' && state.player.car) {
      // A bobbing gold chevron so the player can always find their own car.
      const car = state.player.car;
      const bob = Math.sin(state.time * 6) * 4;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(car.x - 9, car.y - 34 + bob);
      ctx.lineTo(car.x + 9, car.y - 34 + bob);
      ctx.lineTo(car.x, car.y - 24 + bob);
      ctx.closePath();
      ctx.fill();
    }
    drawPeds(state);
    if (state.player.mode === 'foot') drawPlayer(state);
    drawTracers(state);
    ctx.restore();
    drawHud(state, W, H);
    if (state.screen === SCREEN_TITLE) drawTitle(state, W, H);
    if (state.screen === SCREEN_PAUSED) drawCenterPanel(state, W, H, 'PAUSED', ['The harbour waits.', 'P or Esc — back to the streets']);
    if (state.screen === SCREEN_BUSTED) drawCenterPanel(state, W, H, 'BUSTED', ['Sunfall PD pins you at the kerb.', `Cash kept: $${state.cash}`, 'ENTER — try again']);
    if (state.screen === SCREEN_OVER) drawCenterPanel(state, W, H, 'WASTED', ['The tide takes another driver.', `Cash kept: $${state.cash}`, 'ENTER — try again']);
    if (state.screen === SCREEN_COMPLETE) {
      drawCenterPanel(state, W, H, 'CAMPAIGN COMPLETE', [
        'Marisol Vega: "Four jobs, no scratches that matter. The harbour is yours now."',
        `Final cash: $${state.cash}`,
        'ENTER — free roam',
      ]);
    }
  }

  function drawCity(state) {
    const cam = state.camera;
    const x0 = cam.x - 80;
    const y0 = cam.y - 80;
    const x1 = cam.x + canvas.width + 80;
    const y1 = cam.y + canvas.height + 80;
    // Water and piers.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, WATER_Y, WORLD.width, WORLD.height - WATER_Y);
    ctx.strokeStyle = PALETTE.waterLight;
    ctx.lineWidth = 2;
    for (let x = 0; x < WORLD.width; x += 90) {
      const wy = WATER_Y + 40 + ((x * 7) % 120);
      if (wy > y0 && wy < y1) {
        ctx.beginPath();
        ctx.moveTo(x, wy);
        ctx.lineTo(x + 46, wy);
        ctx.stroke();
      }
    }
    for (const pier of PIERS) {
      ctx.fillStyle = PALETTE.pier;
      ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = pier.y + 14; y < pier.y + pier.h; y += 28) ctx.fillRect(pier.x, y, pier.w, 3);
    }
    // Parks and parking lots.
    for (const park of state.parks) {
      if (!overlaps(park, x0, y0, x1, y1)) continue;
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      for (const tree of park.trees) {
        ctx.fillStyle = '#3f7d4c';
        ctx.beginPath();
        ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2c5a36';
        ctx.beginPath();
        ctx.arc(tree.x - 3, tree.y - 3, tree.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const lot of state.lots) {
      if (!overlaps(lot, x0, y0, x1, y1)) continue;
      ctx.fillStyle = PALETTE.parking;
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(230,230,230,0.35)';
      ctx.lineWidth = 2;
      for (let x = lot.x + 34; x < lot.x + lot.w - 10; x += 68) {
        ctx.strokeRect(x, lot.y + 12, 52, lot.h - 24);
      }
    }
    // Sidewalks, then roads, then dashes.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of ROAD_XS) ctx.fillRect(rx - ROAD_W / 2 - 16, 0, ROAD_W + 32, WORLD.height);
    for (const ry of ROAD_YS) ctx.fillRect(0, ry - ROAD_W / 2 - 16, WORLD.width, ROAD_W + 32);
    ctx.fillStyle = PALETTE.road;
    for (const rx of ROAD_XS) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.height);
    for (const ry of ROAD_YS) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
    ctx.strokeStyle = PALETTE.lane;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    for (const rx of ROAD_XS) {
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, WORLD.height); ctx.stroke();
    }
    for (const ry of ROAD_YS) {
      ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(WORLD.width, ry); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Skid marks.
    ctx.fillStyle = 'rgba(10,10,12,0.5)';
    for (const mark of state.skidmarks) ctx.fillRect(mark.x - 3, mark.y - 3, 6, 6);
    // Buildings.
    for (const b of state.buildings) {
      if (!overlaps(b, x0, y0, x1, y1)) continue;
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Lit windows.
      const cols = Math.max(2, (b.w / 34) | 0);
      const rows = Math.max(2, (b.h / 34) | 0);
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if (hash01(b.windowsSeed, i * 31 + j) > 0.42) {
            ctx.fillStyle = 'rgba(255,214,120,0.75)';
            ctx.fillRect(b.x + 10 + i * 30, b.y + 10 + j * 30, 13, 9);
          }
        }
      }
      if (b.w > 92 && b.h > 54) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `bold 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
      }
    }
  }

  function drawObjective(state) {
    const obj = currentObjective(state);
    if (!obj || state.screen === SCREEN_TITLE) return;
    const pulse = 26 + Math.sin(state.time * 5) * 6;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,185,33,0.25)';
    ctx.beginPath();
    ctx.moveTo(obj.x - 16, obj.y - 210);
    ctx.lineTo(obj.x + 16, obj.y - 210);
    ctx.lineTo(obj.x, obj.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(obj.label, obj.x, obj.y - 44);
  }

  function drawCar(state, car, isPolice) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Headlight glow ahead of a moving car.
    if (Math.abs(car.speed) > 30) {
      const grad = ctx.createLinearGradient(23, 0, 120, 0);
      grad.addColorStop(0, 'rgba(255,240,180,0.20)');
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(23, -13);
      ctx.lineTo(120, -30);
      ctx.lineTo(120, 30);
      ctx.lineTo(23, 13);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = isPolice ? PALETTE.police : car.color;
    roundRect(-23, -11, 46, 22, 6);
    ctx.fill();
    if (isPolice) {
      ctx.fillStyle = PALETTE.policeBlue;
      ctx.fillRect(-8, -11, 15, 22);
      const flash = Math.sin(state.time * 10) > 0;
      ctx.fillStyle = flash ? '#ff4444' : '#4466ff';
      ctx.fillRect(-4, -8, 8, 6);
      ctx.fillStyle = flash ? '#4466ff' : '#ff4444';
      ctx.fillRect(-4, 2, 8, 6);
      ctx.fillStyle = '#10131a';
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('PD', 12, 3);
    } else {
      ctx.fillStyle = 'rgba(16,20,28,0.85)';
      roundRect(-6, -9, 17, 18, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(180,220,255,0.5)';
      ctx.fillRect(6, -8, 4, 16);
    }
    if (car.missionTarget) {
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 2.5;
      roundRect(-25, -13, 50, 26, 7);
      ctx.stroke();
    }
    ctx.restore();
    // Damage smoke, in world space so it drifts up.
    if (car.damage > 45) {
      const n = car.damage > 80 ? 3 : 2;
      for (let i = 0; i < n; i += 1) {
        const off = hash01((car.x | 0) + i * 77, (state.time * 2 | 0) + i) * 14;
        ctx.fillStyle = 'rgba(60,60,66,0.55)';
        ctx.beginPath();
        ctx.arc(car.x - 8 + off, car.y - 14 - i * 9 - (state.time * 12 + i * 7) % 12, 5 + i * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPeds(state) {
    for (const ped of state.peds) {
      if (ped.down > 0) {
        ctx.fillStyle = ped.color;
        ctx.save();
        ctx.translate(ped.x, ped.y);
        ctx.rotate(1.2);
        ctx.fillRect(-11, -4, 22, 8);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, ped.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.fillRect(6, -2.5, 13, 5); // the pistol
    if (p.muzzle > 0) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(24, 0, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTracers(state) {
    for (const t of state.tracers) {
      ctx.strokeStyle = `rgba(255,220,130,${Math.max(0, t.life * 6)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
  }

  function drawHud(state, W, H) {
    if (state.screen === SCREEN_TITLE) return;
    const p = state.player;
    ctx.textAlign = 'left';
    // Cash and health, top-left.
    panel(14, 14, 208, 64);
    ctx.fillStyle = PALETTE.good;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`$${state.cash}`, 26, 42);
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(26, 52, 180, 10);
    ctx.fillStyle = PALETTE.good;
    ctx.fillRect(26, 52, 180 * Math.max(0, p.health) / 100, 10);
    // Wanted stars, top-centre.
    ctx.font = `26px ${FONT}`;
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < state.wanted ? PALETTE.gold : 'rgba(255,255,255,0.22)';
      ctx.fillText('★', W / 2 - 56 + i * 28, 40);
    }
    if (state.bustTimer > 0.15) {
      ctx.fillStyle = PALETTE.danger;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('THEY ARE PINNING YOU — MOVE!', W / 2, 64);
    }
    drawMinimap(state, W - 232, 14);
    // Mission panel, bottom-left.
    const text = missionText(state);
    panel(14, H - 118, Math.min(560, W - 28), state.briefTimer > 0 ? 104 : 58);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(text, 26, H - 88);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    const inCar = p.mode === 'car';
    ctx.fillText(inCar ? 'E/F exit · Space handbrake · R is for on foot' : 'E steal/enter car · Click/J shoot · R reload · Shift sprint', 26, H - 66);
    if (state.briefTimer > 0 && state.brief) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `italic 14px ${FONT}`;
      wrapText(state.brief, 26, H - 44, 520, 17);
    }
    // District, speed and ammo, bottom-right.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(districtAt(p.x, p.y), W - 20, H - 58);
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    if (inCar && p.car) {
      ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.24)} km/h · car health ${Math.max(0, 100 - Math.round(p.car.damage))}%`, W - 20, H - 36);
    } else if (p.reloading > 0) {
      ctx.fillText('RELOADING…', W - 20, H - 36);
    } else {
      ctx.fillText(`PISTOL ${p.ammo}/12`, W - 20, H - 36);
    }
    // Centre banner.
    if (state.bannerTimer > 0 && state.banner) {
      ctx.textAlign = 'center';
      ctx.font = `bold 30px ${FONT}`;
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText(state.banner, W / 2, 120);
    }
  }

  function drawMinimap(state, mx, my) {
    const mw = 218;
    const mh = 168;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    panel(mx - 6, my - 6, mw + 12, mh + 12);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(mx, my + WATER_Y * sy, mw, (WORLD.height - WATER_Y) * sy);
    ctx.strokeStyle = 'rgba(200,200,200,0.4)';
    ctx.lineWidth = 2;
    for (const rx of ROAD_XS) {
      ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + mh); ctx.stroke();
    }
    for (const ry of ROAD_YS) {
      ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke();
    }
    const obj = currentObjective(state);
    if (obj && Math.sin(state.time * 5) > -0.4) {
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(mx + obj.x * sx, my + obj.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cop of state.police) {
      ctx.fillStyle = Math.sin(state.time * 9) > 0 ? '#ff5555' : '#5577ff';
      ctx.beginPath();
      ctx.arc(mx + cop.x * sx, my + cop.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = state.player;
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4.5);
    ctx.lineTo(-5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTitle(state, W, H) {
    ctx.fillStyle = 'rgba(8,10,16,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 64px ${FONT}`;
    ctx.fillText('SUNFALL HARBOR', W / 2, H * 0.3);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `18px ${FONT}`;
    ctx.fillText('An original open-world crime story in a harbour city that never dries out.', W / 2, H * 0.3 + 38);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    wrapText('Fixer Marisol Vega has four jobs for a driver with steady hands. The Sunfall PD has other plans.', W / 2 - 330, H * 0.3 + 80, 660, 21, true);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `15px ${FONT}`;
    const lines = [
      'WASD / arrows — move & drive · Shift — sprint · Space — handbrake',
      'E / F — steal or enter a car, exit · Mouse click or J — shoot · R — reload',
      'P / Esc — pause · Stars bring the PD: hide to cool the heat',
    ];
    lines.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.3 + 148 + i * 24));
    ctx.fillStyle = PALETTE.good;
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText('ENTER — NEW GAME', W / 2, H * 0.3 + 244);
    if (state.saveExists) {
      ctx.fillStyle = PALETTE.text;
      ctx.fillText('C — CONTINUE', W / 2, H * 0.3 + 276);
    }
  }

  function drawCenterPanel(state, W, H, title, lines) {
    ctx.fillStyle = 'rgba(8,10,16,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = title === 'BUSTED' || title === 'WASTED' ? PALETTE.danger : PALETTE.gold;
    ctx.font = `bold 52px ${FONT}`;
    ctx.fillText(title, W / 2, H * 0.42);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `16px ${FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.42 + 42 + i * 26));
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
  }

  function wrapText(text, x, y, maxWidth, lineHeight, center = false) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (ctx.measureText(trial).width > maxWidth && line) {
        ctx.fillText(line, center ? x + maxWidth / 2 : x, yy);
        line = word;
        yy += lineHeight;
      } else {
        line = trial;
      }
    }
    if (line) ctx.fillText(line, center ? x + maxWidth / 2 : x, yy);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function overlaps(rect, x0, y0, x1, y1) {
    return rect.x + rect.w >= x0 && rect.x <= x1 && rect.y + rect.h >= y0 && rect.y <= y1;
  }

  return { draw };
}
