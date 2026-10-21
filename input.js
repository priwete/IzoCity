// Обработка мыши, тача и клавиатуры
export class Input {
  constructor(canvas, game, player) {
    this.canvas = canvas;
    this.game = game;
    this.player = player;

    this.held = new Set();
    this.keys = new Set();
    this.pointer = { down: false, x: 0, y: 0 };
    this.drag = { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false };

    this.bind();
  }

  bind() {
    const c = this.canvas;

    // ---- Мышь ----
    c.addEventListener("mousemove", (e) => {
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.updateHover(mx, my);

      if (this.drag.active && this.pointer.down) {
        const dx = mx - this.drag.lastX;
        const dy = my - this.drag.lastY;
        if (Math.abs(mx - this.drag.startX) + Math.abs(my - this.drag.startY) > 4) {
          this.drag.moved = true;
        }
        this.player.pan(dx, dy);
        this.drag.lastX = mx;
        this.drag.lastY = my;
      }
    });

    c.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.pointer.down = true;
      this.pointer.x = mx;
      this.pointer.y = my;
      this.drag.active = true;
      this.drag.startX = mx;
      this.drag.startY = my;
      this.drag.lastX = mx;
      this.drag.lastY = my;
      this.drag.moved = false;
    });

    c.addEventListener("mouseup", (e) => {
      if (e.button !== 0) return;
      this.pointer.down = false;
      this.drag.active = false;
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (!this.drag.moved) {
        this.click(mx, my);
      }
    });

    c.addEventListener("mouseleave", () => {
      this.pointer.down = false;
      this.drag.active = false;
      this.player.setHover(-1, -1);
    });

    // колесо — зум
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.player.zoomAt(mx, my, factor);
    }, { passive: false });

    // ---- Тач ----
    c.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const rect = c.getBoundingClientRect();
        const mx = t.clientX - rect.left;
        const my = t.clientY - rect.top;
        this.pointer.down = true;
        this.drag.active = true;
        this.drag.startX = mx;
        this.drag.startY = my;
        this.drag.lastX = mx;
        this.drag.lastY = my;
        this.drag.moved = false;
        this.updateHover(mx, my);
      } else if (e.touches.length === 2) {
        // пинч-зум
        this.pinch = {
          dist: this.touchDist(e.touches),
        };
      }
      e.preventDefault();
    }, { passive: false });

    c.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && this.pinch) {
        const d = this.touchDist(e.touches);
        const factor = d / this.pinch.dist;
        this.pinch.dist = d;
        const rect = c.getBoundingClientRect();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        this.player.zoomAt(cx, cy, factor);
        e.preventDefault();
        return;
      }
      if (e.touches.length === 1 && this.pointer.down) {
        const t = e.touches[0];
        const rect = c.getBoundingClientRect();
        const mx = t.clientX - rect.left;
        const my = t.clientY - rect.top;
        const dx = mx - this.drag.lastX;
        const dy = my - this.drag.lastY;
        if (Math.abs(mx - this.drag.startX) + Math.abs(my - this.drag.startY) > 6) {
          this.drag.moved = true;
        }
        this.player.pan(dx, dy);
        this.drag.lastX = mx;
        this.drag.lastY = my;
        this.updateHover(mx, my);
        e.preventDefault();
      }
    }, { passive: false });

    c.addEventListener("touchend", (e) => {
      if (this.pointer.down && !this.drag.moved && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const rect = c.getBoundingClientRect();
        const mx = t.clientX - rect.left;
        const my = t.clientY - rect.top;
        this.click(mx, my);
      }
      if (e.touches.length === 0) {
        this.pointer.down = false;
        this.drag.active = false;
        this.pinch = null;
      }
    });

    // ---- Клавиатура ----
    window.addEventListener("keydown", (e) => {
      const code = e.code;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(code)) {
        this.keys.add(code);
        e.preventDefault();
      }
      if (code === "KeyP") { this.game.togglePause(); e.preventDefault(); }
      if (code === "Escape" || code === "Space") {
        this.game.player.setTool(null);
        this.game.refreshToolbar();
        e.preventDefault();
      }
      if (code === "Digit1") { this.selectTool("zoneR"); }
      if (code === "Digit2") { this.selectTool("zoneC"); }
      if (code === "Digit3") { this.selectTool("zoneI"); }
      if (code === "Digit4") { this.selectTool("road"); }
      if (code === "Digit5") { this.selectTool("bulldoze"); }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
  }

  selectTool(tool) {
    this.game.player.setTool(tool);
    this.game.refreshToolbar();
  }

  touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  clearHeld() {
    this.keys.clear();
    this.held.clear();
    this.pointer.down = false;
    this.drag.active = false;
    this.pinch = null;
  }

  updateHover(mx, my) {
    const { gx, gy } = this.game.screenToGrid(mx, my);
    this.player.setHover(gx, gy);
  }

  click(mx, my) {
    const { gx, gy } = this.game.screenToGrid(mx, my);
    this.game.applyAction(gx, gy);
  }

  // Вызывать каждый кадр для панорамирования клавишами
  update(dt) {
    if (this.keys.size === 0) return;
    const speed = 400 * dt;
    let dx = 0, dy = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) dy += speed;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) dy -= speed;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) dx += speed;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) dx -= speed;
    if (dx || dy) this.player.pan(dx, dy);
  }
}