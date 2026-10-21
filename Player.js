// Игрок-мэр: камера и выбор инструмента
export class Player {
  constructor() {
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.hover = { gx: -1, gy: -1 };
    this.tool = null;
    this.game = null;
  }

  attachGame(game) { this.game = game; }

  setTool(tool) {
    this.tool = tool;
  }

  setHover(gx, gy) {
    this.hover.gx = gx;
    this.hover.gy = gy;
  }

  pan(dx, dy) {
    this.camera.x += dx;
    this.camera.y += dy;
    this.clampCamera();
  }

  zoomAt(mx, my, factor) {
    const cam = this.camera;
    const oldZoom = cam.zoom;
    let newZoom = oldZoom * factor;
    newZoom = Math.max(0.5, Math.min(2.5, newZoom));
    if (newZoom === oldZoom) return;

    // зум относительно курсора
    const ox = mx - cam.x - this.game.viewW / 2;
    const oy = my - cam.y - this.game.viewH / 2 + 120 * oldZoom;
    const k = newZoom / oldZoom;
    cam.x -= ox * (k - 1);
    cam.y -= oy * (k - 1);
    cam.zoom = newZoom;
    this.clampCamera();
  }

  clampCamera() {
    const cam = this.camera;
    const maxX = 1200;
    const maxY = 1200;
    cam.x = Math.max(-maxX, Math.min(maxX, cam.x));
    cam.y = Math.max(-maxY, Math.min(maxY, cam.y));
  }
}