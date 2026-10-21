// Игровое состояние мира: карта, экономика, население, рендер
import * as Grid from "./Collision.js";

export const MAP_W = 20;
export const MAP_H = 15;

const TILE_W = 64;
const TILE_H = 32;
const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

const COSTS = {
  house: 1000,
  office: 5000,
  factory: 3000,
  school: 8000,
  hospital: 12000,
  road: 200,
};

const REFUND_RATE = 0.75;

const START_BUDGET = 20000;
const START_POPULATION = 10;
const WIN_TARGET = 5000000;
const LOSE_DEBT = -10000;
const LOW_DEBT = -5000;

export class Game {
  constructor(canvas, player) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;

    this.player = player;
    this.input = null;
    this.sound = null;

    this.resizeHandler = () => this.resize();
    window.addEventListener("resize", this.resizeHandler);
    this.resize();

    this.cells = [];
    this.budget = START_BUDGET;
    this.population = START_POPULATION;
    this.level = 1;
    this.record = this.loadRecord();
    this.everHadHouse = true;
    this.isPaused = false;
    this.isOver = false;
    this.isWin = false;
    this.isMenuOpen = true;

    this.inflowTimer = 0;
    this.outflowTimer = 0;
    this.subsidyTimer = 0;
    this.time = 0;

    this.toastTimer = 0;
    this.toastEl = document.getElementById("toast");

    this.lastFlow = 0;
    this.animTime = 0;
    this.smokeParticles = [];

    this.initMap();
    this.updateHud();
  }

  attachGame(game) {}

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.viewW = w;
    this.viewH = h;
  }

  initMap() {
    this.cells = [];
    for (let y = 0; y < MAP_H; y++) {
      const row = [];
      for (let x = 0; x < MAP_W; x++) {
        row.push({ zone: null, building: null, road: false, seed: (x * 73856093 ^ y * 19349663) >>> 0 });
      }
      this.cells.push(row);
    }

    const roadY = Math.floor(MAP_H / 2);
    const roadX = Math.floor(MAP_W / 2) - 1;
    this.cells[roadY][roadX].road = true;
    this.cells[roadY][roadX + 1].road = true;
    this.cells[roadY][roadX + 2].road = true;

    const houseX = roadX + 1;
    const houseY = roadY - 1;
    this.cells[houseY][houseX].building = "house";
  }

  getCell(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
    return this.cells[y][x];
  }

  loadRecord() {
    try {
      const v = localStorage.getItem("isocity_record");
      return v ? parseInt(v, 10) || 0 : 0;
    } catch (e) {
      return 0;
    }
  }
  saveRecord(value) {
    try {
      localStorage.setItem("isocity_record", String(value));
    } catch (e) {}
  }

  togglePause() {
    if (this.isOver || this.isMenuOpen) return;
    this.isPaused = !this.isPaused;
    document.getElementById("btn-pause").textContent = this.isPaused ? "▶" : "⏸";
    if (this.isPaused && this.input) this.input.clearHeld();
    if (this.sound) this.sound.uiClick();
  }
  pause() {
    if (!this.isOver && !this.isMenuOpen) {
      this.isPaused = true;
      document.getElementById("btn-pause").textContent = "▶";
    }
  }

  restart() {
    this.initMap();
    this.budget = START_BUDGET;
    this.population = START_POPULATION;
    this.level = 1;
    this.everHadHouse = true;
    this.isPaused = false;
    this.isOver = false;
    this.isWin = false;
    this.isMenuOpen = false;
    this.inflowTimer = 0;
    this.outflowTimer = 0;
    this.subsidyTimer = 0;
    this.time = 0;
    this.smokeParticles = [];
    this.player.setTool(null);
    this.refreshToolbar();
    document.getElementById("btn-pause").textContent = "⏸";
    document.getElementById("overlay").classList.add("hidden");
    if (this.sound) this.sound.uiClick();
    this.updateHud();
  }

  gameOver(title, sub) {
    this.isOver = true;
    this.isPaused = true;
    if (this.sound) {
      if (title.includes("МИЛЛИАРДЕР")) this.sound.win();
      else this.sound.lose();
    }
    const ov = document.getElementById("overlay");
    document.getElementById("overlay-title").textContent = title;
    document.getElementById("overlay-sub").textContent = sub;
    const stats = document.getElementById("overlay-stats");
    stats.innerHTML = `
      Бюджет: <span>${this.formatMoney(this.budget)}</span><br>
      Население: <span>${this.population}</span><br>
      Уровень: <span>${this.level}</span><br>
      Время игры: <span>${this.formatTime(this.time)}</span><br>
      Рекорд населения: <span>${this.record}</span>
    `;
    ov.classList.remove("hidden");
    if (this.input) this.input.clearHeld();
  }

  win() {
    this.isWin = true;
    this.gameOver("ГОРОД-МИЛЛИАРДЕР", "Вы достигли бюджета в $5,000,000,000!");
  }

  applyAction(gx, gy) {
    if (this.isOver || this.isPaused || this.isMenuOpen) return;
    const tool = this.player.tool;
    if (!tool) return;
    const cell = this.getCell(gx, gy);
    if (!cell) return;

    if (tool === "bulldoze") {
      this.bulldoze(cell, gx, gy);
      return;
    }
    if (tool === "road") {
      this.buildRoad(cell);
      return;
    }
    if (tool.startsWith("zone")) {
      this.paintZone(cell, tool.slice(4));
      return;
    }
    this.buildBuilding(cell, tool, gx, gy);
  }

  buildRoad(cell) {
    if (cell.road) { this.toast("Здесь уже дорога", false); if (this.sound) this.sound.buildErr(); return; }
    if (cell.building) { this.toast("Сначала снесите здание", false); if (this.sound) this.sound.buildErr(); return; }
    if (this.budget < COSTS.road) { this.toast("Недостаточно средств", false); if (this.sound) this.sound.buildErr(); return; }
    cell.road = true;
    cell.zone = null;
    this.budget -= COSTS.road;
    if (this.sound) this.sound.road();
    this.updateHud();
  }

  paintZone(cell, zone) {
    if (cell.road) { this.toast("Дорогу нельзя красить", false); if (this.sound) this.sound.buildErr(); return; }
    if (cell.building) { this.toast("Клетка занята зданием", false); if (this.sound) this.sound.buildErr(); return; }
    if (this.budget < 50) { this.toast("Недостаточно средств ($50)", false); if (this.sound) this.sound.buildErr(); return; }
    cell.zone = zone;
    this.budget -= 50;
    if (this.sound) this.sound.uiClick();
    this.updateHud();
  }

  buildBuilding(cell, type, gx, gy) {
    const cost = COSTS[type];
    if (this.budget < cost) { this.toast(`Нужно ${this.formatMoney(cost)}`, false); if (this.sound) this.sound.buildErr(); return; }

    const check = Grid.canPlaceBuilding(this.cells, gx, gy, type);
    if (!check.ok) {
      this.toast(check.reason, false);
      if (this.sound) this.sound.buildErr();
      return;
    }

    cell.building = type;
    cell.zone = null;
    this.budget -= cost;
    if (type === "house") this.everHadHouse = true;
    if (this.sound) this.sound.buildOk();
    this.updateHud();
    this.toast(`Построено: ${this.buildingName(type)}`, true);
  }

  bulldoze(cell, gx, gy) {
    if (cell.building) {
      const refund = COSTS[cell.building] * REFUND_RATE;
      this.budget += refund;
      this.toast(`Снесено, страховка +${this.formatMoney(refund)}`, true);
      cell.building = null;
    } else if (cell.road) {
      cell.road = false;
      this.toast("Дорога снесена", true);
    } else if (cell.zone) {
      cell.zone = null;
      this.toast("Зона убрана", true);
    } else {
      return;
    }
    if (this.sound) this.sound.bulldoze();
    this.updateHud();
  }

  buildingName(type) {
    return {
      house: "жилой дом", office: "офис", factory: "завод",
      school: "школа", hospital: "больница",
    }[type] || type;
  }

  countBuildings(type) {
    let n = 0;
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++)
        if (this.cells[y][x].building === type) n++;
    return n;
  }
  countRoads() {
    let n = 0;
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++)
        if (this.cells[y][x].road) n++;
    return n;
  }

  computeLevel(pop) {
    const l = Math.floor(Math.sqrt(pop / 50)) + 1;
    return Math.min(10, Math.max(1, l));
  }

  update(dt) {
    this.animTime += dt;
    if (this.isOver || this.isPaused || this.isMenuOpen) {
      return;
    }

    this.time += dt;
    this.level = this.computeLevel(this.population);
    const levelMult = 1 + this.level * 0.05;

    const houses = this.countBuildings("house");
    const offices = this.countBuildings("office");
    const factories = this.countBuildings("factory");
    const schools = this.countBuildings("school");
    const hospitals = this.countBuildings("hospital");
    const roads = this.countRoads();

    let income = this.population * 10 * levelMult;
    income += factories * 100 * levelMult;
    income += offices * 100 * levelMult;

    let expense = schools * 50 + hospitals * 100;

    const net = income - expense;
    this.lastFlow = net;
    this.budget += net * dt;

    this.subsidyTimer += dt;
    if (this.subsidyTimer >= 60) {
      this.subsidyTimer -= 60;
      if (this.population > 0) {
        const subsidy = this.population * 5;
        this.budget -= subsidy;
        this.toast(`Субсидии жителям: −${this.formatMoney(subsidy)}`, false);
      }
    }

    this.inflowTimer += dt;
    if (this.inflowTimer >= 10) {
      this.inflowTimer -= 10;
      const canInflow = this.budget > LOW_DEBT && houses >= 1 && roads >= 1;
      if (canInflow) {
        const baseInflow = 1 + Math.floor(houses * 0.5) + Math.floor(this.level * 0.3);
        this.population += baseInflow;
      }
    }

    this.outflowTimer += dt;
    if (this.outflowTimer >= 10) {
      this.outflowTimer -= 10;
      const badInfra = schools < houses / 3 || hospitals < houses / 4;
      const inDebt = this.budget < LOW_DEBT;
      if ((inDebt || badInfra) && this.population > 0) {
        const leave = Math.floor(this.population * 0.05) + 1;
        this.population = Math.max(0, this.population - leave);
      }
    }

    if (this.population > this.record) {
      this.record = this.population;
      this.saveRecord(this.record);
    }

    if (this.budget < LOSE_DEBT) {
      this.updateHud();
      this.gameOver("ГОРОД РАЗОРЁН", "Бюджет ушёл ниже −$10,000");
      return;
    }
    if (this.everHadHouse && this.population <= 0) {
      this.updateHud();
      this.gameOver("ГОРОД ОПУСТЕЛ", "Все жители уехали из города");
      return;
    }
    if (this.budget >= WIN_TARGET) {
      this.updateHud();
      this.win();
      return;
    }

    this.updateSmoke(dt, factories);

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove("show");
    }

    this.updateHud();
  }

  updateSmoke(dt, factories) {
    if (factories > 0 && Math.random() < 0.5) {
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          if (this.cells[y][x].building === "factory" && Math.random() < 0.03) {
            this.smokeParticles.push({
              gx: x + 0.1, gy: y - 0.15,
              life: 0, maxLife: 2.2 + Math.random() * 1.2,
              size: 3 + Math.random() * 2,
              drift: (Math.random() - 0.5) * 6,
            });
          }
        }
      }
    }
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += dt;
      if (p.life > p.maxLife) this.smokeParticles.splice(i, 1);
    }
  }

  formatMoney(v) {
    const neg = v < 0;
    v = Math.abs(Math.round(v));
    let s = v.toLocaleString("en-US");
    return (neg ? "-$" : "$") + s;
  }
  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  updateHud() {
    document.getElementById("hud-budget").textContent = this.formatMoney(this.budget);
    document.getElementById("hud-pop").textContent = this.population;
    document.getElementById("hud-level").textContent = this.level;
    document.getElementById("hud-record").textContent = this.record > 0 ? this.record : "—";
    const flowEl = document.getElementById("hud-flow");
    const f = this.lastFlow;
    flowEl.textContent = (f >= 0 ? "+" : "") + this.formatMoney(f);
    flowEl.classList.toggle("neg", f < 0);
  }

  refreshToolbar() {
    document.querySelectorAll(".tool").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === this.player.tool);
    });
  }

  toast(msg, ok) {
    const el = this.toastEl;
    el.textContent = msg;
    el.classList.toggle("ok", !!ok);
    el.classList.add("show");
    this.toastTimer = 2.2;
  }

  // ===== Изометрия =====
  gridToScreen(gx, gy) {
    const cam = this.player.camera;
    const sx = (gx - gy) * HALF_W * cam.zoom;
    const sy = (gx + gy) * HALF_H * cam.zoom;
    return {
      x: sx + cam.x + this.viewW / 2,
      y: sy + cam.y + this.viewH / 2 - 120 * cam.zoom,
    };
  }

  screenToGrid(mx, my) {
    const cam = this.player.camera;
    const x = mx - cam.x - this.viewW / 2;
    const y = my - cam.y - this.viewH / 2 + 120 * cam.zoom;
    const z = cam.zoom;
    const gx = (x / (HALF_W * z) + y / (HALF_H * z)) / 2;
    const gy = (y / (HALF_H * z) - x / (HALF_W * z)) / 2;
    return { gx: Math.floor(gx + 0.5), gy: Math.floor(gy + 0.5) };
  }

  // ===== Рендер =====
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    this.drawBackground(ctx);

    const cam = this.player.camera;

    for (let sum = 0; sum <= MAP_W + MAP_H - 2; sum++) {
      for (let gx = 0; gx < MAP_W; gx++) {
        const gy = sum - gx;
        if (gy < 0 || gy >= MAP_H) continue;
        this.drawTile(ctx, gx, gy, cam);
      }
    }

    this.drawSmoke(ctx, cam);
    this.drawHover(ctx, cam);
  }

  drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, "#15241a");
    g.addColorStop(1, "#0c1610");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  drawTile(ctx, gx, gy, cam) {
    const cell = this.cells[gy][gx];
    const p = this.gridToScreen(gx, gy);
    const z = cam.zoom;

    this.drawGround(ctx, p.x, p.y, z, cell.seed);
    if (cell.zone) this.drawZone(ctx, p.x, p.y, z, cell.zone);
    if (cell.road) this.drawRoad(ctx, gx, gy, p.x, p.y, z);
    if (cell.building) this.drawBuilding(ctx, cell.building, p.x, p.y, z, gx, gy, cell);
  }

  drawGround(ctx, x, y, z, seed) {
    const hw = HALF_W * z;
    const hh = HALF_H * z;
    const v = ((seed >>> 8) & 15) / 15;
    const r = Math.floor(58 + v * 18);
    const g = Math.floor(102 + v * 26);
    const b = Math.floor(52 + v * 14);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();
    ctx.fill();

    const rnd = (seed % 7);
    if (v > 0.55) {
      ctx.fillStyle = `rgba(${r + 20},${g + 20},${b + 10},0.35)`;
      const ox = (rnd - 3) * 1.2 * z;
      const oy = (rnd % 3) * 0.8 * z;
      ctx.fillRect(x + ox - 1, y + oy - 1, Math.max(1, 2 * z), Math.max(1, 1 * z));
    }
  }

  drawZone(ctx, x, y, z, zone) {
    const hw = HALF_W * z;
    const hh = HALF_H * z;
    const colors = {
      R: "rgba(90,255,120,0.28)",
      C: "rgba(90,170,255,0.28)",
      I: "rgba(255,210,80,0.28)",
    };
    ctx.fillStyle = colors[zone];
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();
    ctx.fill();
  }

  drawRoad(ctx, gx, gy, x, y, z) {
    const hw = HALF_W * z;
    const hh = HALF_H * z;

    ctx.fillStyle = "#4a4f55";
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();
    ctx.fill();

    const N = this.getCell(gx - 1, gy);
    const S = this.getCell(gx + 1, gy);
    const W = this.getCell(gx, gy - 1);
    const E = this.getCell(gx, gy + 1);
    const nRoad = N && N.road;
    const sRoad = S && S.road;
    const wRoad = W && W.road;
    const eRoad = E && E.road;

    ctx.strokeStyle = "#e8e8c0";
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.lineCap = "butt";
    const dashLen = 4 * z;
    const gap = 4 * z;
    const top = [x, y - hh];
    const bottom = [x, y + hh];
    const left = [x - hw, y];
    const right = [x + hw, y];

    ctx.beginPath();
    if (nRoad) { ctx.moveTo(x, y); ctx.lineTo((top[0] + left[0]) / 2, (top[1] + left[1]) / 2); }
    if (sRoad) { ctx.moveTo(x, y); ctx.lineTo((bottom[0] + right[0]) / 2, (bottom[1] + right[1]) / 2); }
    if (wRoad) { ctx.moveTo(x, y); ctx.lineTo((top[0] + right[0]) / 2, (top[1] + right[1]) / 2); }
    if (eRoad) { ctx.moveTo(x, y); ctx.lineTo((bottom[0] + left[0]) / 2, (bottom[1] + left[1]) / 2); }

    ctx.setLineDash([dashLen, gap]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!nRoad && !sRoad && !wRoad && !eRoad) {
      ctx.fillStyle = "#e8e8c0";
      ctx.fillRect(x - 1 * z, y - 1 * z, 2 * z, 2 * z);
    }
  }

  // ===== Изометрические здания =====

  drawBuilding(ctx, type, x, y, z, gx, gy, cell) {
    switch (type) {
      case "house": this.drawHouse(ctx, x, y, z); break;
      case "office": this.drawOffice(ctx, x, y, z); break;
      case "factory": this.drawFactory(ctx, x, y, z); break;
      case "school": this.drawSchool(ctx, x, y, z); break;
      case "hospital": this.drawHospital(ctx, x, y, z); break;
    }
  }

  isoFloor(ctx, x, y, z, hw, hh, color = "rgba(0,0,0,0.45)") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();
    ctx.fill();
  }

  isoBox(ctx, x, y, z, hInset, height, colLeft, colRight) {
    const hw = (HALF_W - hInset) * z;
    const hh = (HALF_H - hInset * 0.5) * z;
    const H = height * z;

    this.isoFloor(ctx, x, y, z, hw, hh);

    ctx.fillStyle = colLeft;
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.lineTo(x - hw, y - H);
    ctx.lineTo(x, y + hh - H);
    ctx.lineTo(x, y + hh);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colRight;
    ctx.beginPath();
    ctx.moveTo(x + hw, y);
    ctx.lineTo(x + hw, y - H);
    ctx.lineTo(x, y + hh - H);
    ctx.lineTo(x, y + hh);
    ctx.closePath();
    ctx.fill();

    const baseH = 2.2 * z;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.lineTo(x - hw, y - baseH);
    ctx.lineTo(x, y + hh - baseH);
    ctx.lineTo(x, y + hh);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + hw, y);
    ctx.lineTo(x + hw, y - baseH);
    ctx.lineTo(x, y + hh - baseH);
    ctx.lineTo(x, y + hh);
    ctx.closePath();
    ctx.fill();

    return { hw, hh, H };
  }

  isoShadow(ctx, x, y, z, w, d) {
    const hw = (HALF_W * 0.85) * z * w;
    const hh = (HALF_H * 0.85) * z * d;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.moveTo(x + 3 * z, y - hh + 2 * z);
    ctx.lineTo(x + hw + 3 * z, y + 2 * z);
    ctx.lineTo(x + 3 * z, y + hh + 2 * z);
    ctx.lineTo(x - hw + 3 * z, y + 2 * z);
    ctx.closePath();
    ctx.fill();
  }

  isoFlatRoof(ctx, x, y, z, hw, hh, H, colorTop) {
    ctx.fillStyle = colorTop;
    ctx.beginPath();
    ctx.moveTo(x, y - hh - H);
    ctx.lineTo(x + hw, y - H);
    ctx.lineTo(x, y + hh - H);
    ctx.lineTo(x - hw, y - H);
    ctx.closePath();
    ctx.fill();
  }

  isoGableRoof(ctx, x, y, z, hw, hh, H, ridgeRise, colorL, colorR) {
    const rr = ridgeRise * z;
    const ridgeA = { x: x - hw * 0.5, y: y + hh * 0.5 - H - rr };
    const ridgeB = { x: x + hw * 0.5, y: y - hh * 0.5 - H - rr };

    ctx.fillStyle = colorL;
    ctx.beginPath();
    ctx.moveTo(x - hw, y - H);
    ctx.lineTo(x, y - hh - H);
    ctx.lineTo(ridgeB.x, ridgeB.y);
    ctx.lineTo(ridgeA.x, ridgeA.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colorR;
    ctx.beginPath();
    ctx.moveTo(x + hw, y - H);
    ctx.lineTo(x, y + hh - H);
    ctx.lineTo(ridgeA.x, ridgeA.y);
    ctx.lineTo(ridgeB.x, ridgeB.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colorL;
    ctx.beginPath();
    ctx.moveTo(x - hw * 0.5, y - H - rr * 0.5);
    ctx.lineTo(x, y + hh - H);
    ctx.lineTo(x - hw, y - H);
    ctx.closePath();
    ctx.fill();
  }

  isoWindows(ctx, x, y, z, hw, hh, H, side, rows, cols, color, lit) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u0 = c / cols;
        const u1 = (c + 0.85) / cols;
        const v0 = r / rows;
        const v1 = (r + 0.7) / rows;

        const pointAt = (u, v) => {
          let px, py;
          if (side === 'L') {
            px = x - hw + u * hw;
            py = y + u * hh;
          } else {
            px = x + hw - u * hw;
            py = y + u * hh;
          }
          return { px, py: py - v * H };
        };

        const p00 = pointAt(u0, v0);
        const p10 = pointAt(u1, v0);
        const p11 = pointAt(u1, v1);
        const p01 = pointAt(u0, v1);

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(p00.px, p00.py);
        ctx.lineTo(p10.px, p10.py);
        ctx.lineTo(p11.px, p11.py);
        ctx.lineTo(p01.px, p01.py);
        ctx.closePath();
        ctx.fill();

        if (lit && Math.random() < 0.15) {
          const q0 = pointAt(u0 + (u1 - u0) * 0.15, v0 + (v1 - v0) * 0.4);
          const q1 = pointAt(u0 + (u1 - u0) * 0.55, v0 + (v1 - v0) * 0.4);
          const q2 = pointAt(u0 + (u1 - u0) * 0.55, v0 + (v1 - v0) * 0.8);
          const q3 = pointAt(u0 + (u1 - u0) * 0.15, v0 + (v1 - v0) * 0.8);
          ctx.fillStyle = "rgba(255,255,220,0.8)";
          ctx.beginPath();
          ctx.moveTo(q0.px, q0.py);
          ctx.lineTo(q1.px, q1.py);
          ctx.lineTo(q2.px, q2.py);
          ctx.lineTo(q3.px, q3.py);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // Маленькая изометрическая коробка для деталей на крыше
  isoSmallBox(ctx, x, y, halfW, height, colL, colR) {
    ctx.fillStyle = colL;
    ctx.beginPath();
    ctx.moveTo(x - halfW, y);
    ctx.lineTo(x - halfW, y - height);
    ctx.lineTo(x, y - height + halfW * 0.5);
    ctx.lineTo(x, y + halfW * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colR;
    ctx.beginPath();
    ctx.moveTo(x + halfW, y);
    ctx.lineTo(x + halfW, y - height);
    ctx.lineTo(x, y - height + halfW * 0.5);
    ctx.lineTo(x, y + halfW * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#3a342c";
    ctx.beginPath();
    ctx.moveTo(x, y - height - halfW * 0.5);
    ctx.lineTo(x + halfW, y - height);
    ctx.lineTo(x, y - height + halfW * 0.5);
    ctx.lineTo(x - halfW, y - height);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- ЖИЛОЙ ДОМ ----------
  drawHouse(ctx, x, y, z) {
    const H = 16;
    const wallL = "#b8905e";
    const wallR = "#d1a876";
    const roofL = "#8a4b3a";
    const roofR = "#a55c48";

    this.isoShadow(ctx, x, y, z, 1, 1);
    const { hw, hh } = this.isoBox(ctx, x, y, z, 4, H, wallL, wallR);

    // ОДНО окно по центру ЛЕВОЙ стены
    const winCenterU = 0.5;
    const winW = 0.22;
    const winVB = 0.35;
    const winVT = 0.7;
    const u0 = winCenterU - winW / 2;
    const u1 = winCenterU + winW / 2;

    const pointAtL = (u, v) => {
      const px = x - hw + u * hw;
      const py = y + u * hh - v * H * z;
      return { px, py };
    };
    const w0 = pointAtL(u0, winVB);
    const w1 = pointAtL(u1, winVB);
    const w2 = pointAtL(u1, winVT);
    const w3 = pointAtL(u0, winVT);
    ctx.fillStyle = "#ffe07a";
    ctx.beginPath();
    ctx.moveTo(w0.px, w0.py);
    ctx.lineTo(w1.px, w1.py);
    ctx.lineTo(w2.px, w2.py);
    ctx.lineTo(w3.px, w3.py);
    ctx.closePath();
    ctx.fill();

    // блик внутри окна
    ctx.fillStyle = "rgba(255,255,220,0.7)";
    const b0 = pointAtL(u0 + (u1 - u0) * 0.15, winVB + (winVT - winVB) * 0.45);
    const b1 = pointAtL(u0 + (u1 - u0) * 0.55, winVB + (winVT - winVB) * 0.45);
    const b2 = pointAtL(u0 + (u1 - u0) * 0.55, winVB + (winVT - winVB) * 0.8);
    const b3 = pointAtL(u0 + (u1 - u0) * 0.15, winVB + (winVT - winVB) * 0.8);
    ctx.beginPath();
    ctx.moveTo(b0.px, b0.py);
    ctx.lineTo(b1.px, b1.py);
    ctx.lineTo(b2.px, b2.py);
    ctx.lineTo(b3.px, b3.py);
    ctx.closePath();
    ctx.fill();

    // ПРАВАЯ стена — только дверь по центру, без окон
    const du0 = 0.4, du1 = 0.6;
    const dv0 = 0, dv1 = 0.5;
    const pointAtR = (u, v) => {
      const px = x + hw - u * hw;
      const py = y + u * hh - v * H * z;
      return { px, py };
    };
    const d0 = pointAtR(du0, dv0);
    const d1 = pointAtR(du1, dv0);
    const d2 = pointAtR(du1, dv1);
    const d3 = pointAtR(du0, dv1);
    ctx.fillStyle = "#5a3a22";
    ctx.beginPath();
    ctx.moveTo(d0.px, d0.py);
    ctx.lineTo(d1.px, d1.py);
    ctx.lineTo(d2.px, d2.py);
    ctx.lineTo(d3.px, d3.py);
    ctx.closePath();
    ctx.fill();

    this.isoGableRoof(ctx, x, y, z, hw * 1.05, hh * 1.05, H * z, 8, roofL, roofR);
  }

  // ---------- ОФИС ----------
  drawOffice(ctx, x, y, z) {
    const H = 34;
    const wallL = "#4f6f8a";
    const wallR = "#6f93b0";
    const roof = "#3a5266";

    this.isoShadow(ctx, x, y, z, 1, 1);
    const { hw, hh } = this.isoBox(ctx, x, y, z, 5, H, wallL, wallR);

    this.isoWindows(ctx, x, y, z, hw, hh, H * z, 'L', 6, 3, "#a8e0ff", true);
    this.isoWindows(ctx, x, y, z, hw, hh, H * z, 'R', 6, 3, "#a8e0ff", true);

    this.isoFlatRoof(ctx, x, y, z, hw, hh, H * z, roof);

    const topX = x;
    const topY = y - hh - H * z;
    ctx.strokeStyle = "#c0d8e8";
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.beginPath();
    ctx.moveTo(topX + 3 * z, topY + 2 * z);
    ctx.lineTo(topX + 3 * z, topY - 10 * z);
    ctx.stroke();
    if (Math.floor(this.animTime * 2) % 2 === 0) {
      ctx.fillStyle = "#ff4444";
      ctx.fillRect(topX + 2 * z, topY - 11 * z, 2 * z, 2 * z);
    }
  }

   // ---------- ЗАВОД ----------
  drawFactory(ctx, x, y, z) {
    const H = 18;
    const wallL = "#5a4a3a";
    const wallR = "#7a6650";
    const roof = "#3f342b";

    this.isoShadow(ctx, x, y, z, 1, 1);
    const { hw, hh } = this.isoBox(ctx, x, y, z, 3, H, wallL, wallR);

    this.isoWindows(ctx, x, y, z, hw, hh, H * z, 'L', 2, 3, "#ffcc66", false);
    this.isoWindows(ctx, x, y, z, hw, hh, H * z, 'R', 2, 3, "#ffcc66", false);

    // КРЫША
    this.isoFlatRoof(ctx, x, y, z, hw, hh, H * z, roof);

    const roofCenterY = y - H * z;

    // 1. Маленький кубик слева (правильная изометрия)
    const b1x = x - 10 * z;
    const b1y = roofCenterY + 3 * z;
    const b1w = 3 * z;
    const b1h = 3 * z;
    this.isoSmallBox(ctx, b1x, b1y, b1w, b1h, "#4a3c30", "#685544");

    // 2. Маленький кубик справа (правильная изометрия)
    const b2x = x + 6 * z;
    const b2y = roofCenterY + 6 * z;
    const b2w = 2.5 * z;
    const b2h = 2.5 * z;
    this.isoSmallBox(ctx, b2x, b2y, b2w, b2h, "#4a3c30", "#685544");

    // 3. Люк (вентиляция) на крыше — ровный изометрический ромб
    const lx = x - 1 * z;
    const ly = roofCenterY + 8 * z;
    const lw = 2.5 * z;
    const lh = 1.25 * z;
    ctx.fillStyle = "#1f1813";
    ctx.beginPath();
    ctx.moveTo(lx, ly - lh);
    ctx.lineTo(lx + lw, ly);
    ctx.lineTo(lx, ly + lh);
    ctx.lineTo(lx - lw, ly);
    ctx.closePath();
    ctx.fill();

    // ===== ТРУБА =====
    const tx = x + 5 * z;
    const ty = roofCenterY + 1 * z; // точка стыка с крышей
    const tw = 3.5 * z;
    const th = 22 * z;

    // Правильная геометрия основания трубы (темный изометрический эллипс, сливающийся с крышей)
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.ellipse(tx, ty, tw, tw * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Тело трубы: Левая половина (тёмная)
    ctx.fillStyle = "#3a3a3a";
    ctx.beginPath();
    ctx.moveTo(tx - tw, ty);
    ctx.lineTo(tx - tw, ty - th);
    ctx.lineTo(tx, ty - th - tw * 0.4); // верхний левый край
    ctx.lineTo(tx, ty - tw * 0.4);      // нижний левый край
    ctx.closePath();
    ctx.fill();

    // Тело трубы: Правая половина (светлая)
    ctx.fillStyle = "#5a5a5a";
    ctx.beginPath();
    ctx.moveTo(tx + tw, ty);
    ctx.lineTo(tx + tw, ty - th);
    ctx.lineTo(tx, ty - th - tw * 0.4); // верхний правый край
    ctx.lineTo(tx, ty - tw * 0.4);      // нижний правый край
    ctx.closePath();
    ctx.fill();

    // Верхний срез (эллипс)
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.ellipse(tx, ty - th, tw, tw * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Внутреннее отверстие
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(tx, ty - th, tw * 0.6, tw * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- ШКОЛА ----------
    drawSchool(ctx, x, y, z) {
    const H = 22;
    const wallL = "#c4b48c";
    const wallR = "#e0d0a8";
    const roof = "#a84040";

    this.isoShadow(ctx, x, y, z, 1, 1);
    
    const hw = (HALF_W - 4) * z;
    const hh = (HALF_H - 2) * z;
    const Hpix = H * z;
    this.isoFloor(ctx, x, y, z, hw, hh);
    
    // стены
    ctx.fillStyle = wallL;
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.lineTo(x - hw, y - Hpix);
    ctx.lineTo(x, y + hh - Hpix);
    ctx.lineTo(x, y + hh);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = wallR;
    ctx.beginPath();
    ctx.moveTo(x + hw, y);
    ctx.lineTo(x + hw, y - Hpix);
    ctx.lineTo(x, y + hh - Hpix);
    ctx.lineTo(x, y + hh);
    ctx.closePath();
    ctx.fill();

    this.isoWindows(ctx, x, y, z, hw, hh, Hpix, 'L', 3, 4, "#88c8e8", false);
    this.isoWindows(ctx, x, y, z, hw, hh, Hpix, 'R', 3, 4, "#88c8e8", false);

    this.isoFlatRoof(ctx, x, y, z, hw, hh, Hpix, roof);

    // ФЛАГ (основание точно на крыше, опущен ниже)
    const fx = x - hw * 0.5;
    // Опускаем флаг ближе к центру крыши по оси Y (добавляем смещение вниз)
    const fy = y - hh * 0.5 - Hpix + 3 * z; 
    const poleH = 14 * z;           // высота флагштока
    
    // Флагшток
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - poleH);
    ctx.stroke();
    
    // Флаг
    ctx.fillStyle = "#e8e840";
    ctx.beginPath();
    ctx.moveTo(fx, fy - poleH);
    ctx.lineTo(fx + 8 * z, fy - poleH + 1.5 * z);
    ctx.lineTo(fx, fy - poleH + 4 * z);
    ctx.closePath();
    ctx.fill();
  }
    // ---------- БОЛЬНИЦА ----------
  drawHospital(ctx, x, y, z) {
    const H = 26;
    const wallL = "#d0dae0";
    const wallR = "#eef4f8";
    const roof = "#e8eef2";

    this.isoShadow(ctx, x, y, z, 1, 1);
    
    // Стены без серого цоколя
    const hw = (HALF_W - 4) * z;
    const hh = (HALF_H - 2) * z;
    const Hpix = H * z;
    this.isoFloor(ctx, x, y, z, hw, hh);
    
    ctx.fillStyle = wallL;
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.lineTo(x - hw, y - Hpix);
    ctx.lineTo(x, y + hh - Hpix);
    ctx.lineTo(x, y + hh);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = wallR;
    ctx.beginPath();
    ctx.moveTo(x + hw, y);
    ctx.lineTo(x + hw, y - Hpix);
    ctx.lineTo(x, y + hh - Hpix);
    ctx.lineTo(x, y + hh);
    ctx.closePath();
    ctx.fill();

    this.isoWindows(ctx, x, y, z, hw, hh, Hpix, 'L', 4, 3, "#8ac8e0", false);
    this.isoWindows(ctx, x, y, z, hw, hh, Hpix, 'R', 4, 3, "#8ac8e0", false);

    this.isoFlatRoof(ctx, x, y, z, hw, hh, Hpix, roof);

    // ===== КРАСНЫЙ КРЕСТ (ИДЕАЛЬНАЯ ИЗОМЕТРИЯ) =====
    ctx.save();
    
    // Переносим начало координат в центр крыши
    const cx = x;
    const cy = y - Hpix;
    ctx.translate(cx, cy);
    
    // Изометрическая проекция (сжимаем по Y и поворачиваем на 45 градусов)
    ctx.scale(1, 0.5);
    ctx.rotate(Math.PI / 4);

    // Размеры креста (квадратные)
    const size = hw * 0.55;
    const thickness = size * 0.35;

    // Теперь рисуем 2 обычных прямоугольника (они автоматически лягут в изометрию)
    ctx.fillStyle = "#e03030";
    
    // Горизонтальная полоса
    ctx.fillRect(-size / 2, -thickness / 2, size, thickness);
    
    // Вертикальная полоса
    ctx.fillRect(-thickness / 2, -size / 2, thickness, size);

    ctx.restore();
    // ===============================================
  }
  // ---------- Дым ----------
  drawSmoke(ctx, cam) {
    for (const p of this.smokeParticles) {
      const t = p.life / p.maxLife;
      const sp = this.gridToScreen(p.gx, p.gy);
      const baseY = sp.y - 22 * cam.zoom;
      const px = sp.x + p.drift * t * cam.zoom + 6 * cam.zoom;
      const py = baseY - t * 30 * cam.zoom;
      const alpha = (1 - t) * 0.45;
      const size = p.size * (0.6 + t * 1.2) * cam.zoom;
      ctx.fillStyle = `rgba(160,160,160,${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- Подсветка ----------
  drawHover(ctx, cam) {
    const { gx, gy } = this.player.hover;
    if (gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H) return;
    const p = this.gridToScreen(gx, gy);
    const hw = HALF_W * cam.zoom;
    const hh = HALF_H * cam.zoom;
    const pulse = 0.35 + 0.2 * Math.sin(this.animTime * 5);

    let color = `rgba(255,255,255,${pulse})`;
    const tool = this.player.tool;
    if (tool === "bulldoze") color = `rgba(255,90,90,${pulse + 0.15})`;
    else if (tool === "road") color = `rgba(220,220,220,${pulse + 0.1})`;
    else if (tool && tool.startsWith("zone")) color = `rgba(120,255,160,${pulse})`;
    else if (tool) {
      const check = Grid.canPlaceBuilding(this.cells, gx, gy, tool);
      color = check.ok ? `rgba(120,255,120,${pulse + 0.15})` : `rgba(255,80,80,${pulse + 0.15})`;
    }

    ctx.strokeStyle = color;
    ctx.fillStyle = color.replace(/[\d.]+\)$/, "0.12)");
    ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - hh);
    ctx.lineTo(p.x + hw, p.y);
    ctx.lineTo(p.x, p.y + hh);
    ctx.lineTo(p.x - hw, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
