// Точка входа: единый цикл, связывание модулей
import { Game } from "./Game.js";
import { Player } from "./Player.js";
import { Input } from "./input.js";
import { Sound } from "./sound.js";

const canvas = document.getElementById("game");

// ==== Создание сущностей ====
const player = new Player();
const game = new Game(canvas, player);
player.attachGame(game);

const sound = new Sound();
game.sound = sound;

const input = new Input(canvas, game, player);
input.sound = sound;
game.input = input;

// ==== Элементы UI ====
const startMenu = document.getElementById("startmenu");
const pauseMenu = document.getElementById("pause-menu");
const soundBtn = document.getElementById("btn-sound");
const btnMenuSound = document.getElementById("btn-menu-sound");
const btnPause = document.getElementById("btn-pause");

// ==== Звук: восстановление mute ====
const savedMute = (() => {
  try { return localStorage.getItem("isocity_mute") === "1"; }
  catch (e) { return false; }
})();
if (savedMute) sound.toggleMute();
soundBtn.textContent = sound.muted ? "🔇" : "🔊";
btnMenuSound.textContent = `ЗВУК: ${sound.muted ? "ВЫКЛ" : "ВКЛ"}`;

function syncSoundUI() {
  soundBtn.textContent = sound.muted ? "🔇" : "🔊";
  btnMenuSound.textContent = `ЗВУК: ${sound.muted ? "ВЫКЛ" : "ВКЛ"}`;
}

soundBtn.addEventListener("click", () => {
  sound.toggleMute();
  syncSoundUI();
  if (!sound.muted) {
    sound.unlock();
    sound.uiClick();
  }
});

btnMenuSound.addEventListener("click", () => {
  sound.toggleMute();
  syncSoundUI();
  if (!sound.muted) {
    sound.unlock();
    sound.uiClick();
  }
});

// ==== Стартовое меню ====
document.getElementById("menu-play").addEventListener("click", () => {
  startMenu.classList.add("hidden");
  game.isMenuOpen = false;
  sound.unlock();
  sound.startMusic();
  sound.uiClick();
});

// ==== Мини-меню паузы ====
function openPauseMenu() {
  if (game.isOver || game.isMenuOpen) return;
  pauseMenu.classList.remove("hidden");
  game.isPaused = true;
  btnPause.textContent = "▶";
  if (sound.ctx) sound.uiClick();
  input.clearHeld();
}

function closePauseMenu() {
  pauseMenu.classList.add("hidden");
  game.isPaused = false;
  btnPause.textContent = "⏸";
  if (sound.ctx) sound.uiClick();
}

btnPause.addEventListener("click", () => {
  if (game.isPaused) {
    closePauseMenu();
  } else {
    openPauseMenu();
  }
});

document.getElementById("btn-resume").addEventListener("click", closePauseMenu);

document.getElementById("btn-menu-restart").addEventListener("click", () => {
  pauseMenu.classList.add("hidden");
  game.restart();
  if (sound.ctx && !sound.muted) sound.startMusic();
  sound.uiClick();
});

// ==== Единый цикл на всё время жизни страницы ====
let lastTimestamp = 0;
let rafId = null;

function loop(ts) {
  let dt = (ts - lastTimestamp) / 1000;
  lastTimestamp = ts;
  if (!isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(dt, 0.05);

  game.update(dt);
  game.render();

  rafId = requestAnimationFrame(loop);
}

function start() {
  lastTimestamp = performance.now();
  if (rafId === null) {
    rafId = requestAnimationFrame(loop);
  }
}

// ==== Автопауза при скрытии вкладки ====
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.pause();
    input.clearHeld();
    if (!game.isMenuOpen && !game.isOver && !game.isPaused) {
      openPauseMenu();
    }
  }
});

// ==== Обработчик клавиш для паузы ====
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP" || e.code === "Escape") {
    if (game.isMenuOpen || game.isOver) return;

    // Если выбран инструмент, Esc сначала сбрасывает его
    if (e.code === "Escape" && game.player.tool && !game.isPaused) {
      game.player.setTool(null);
      game.refreshToolbar();
      return;
    }

    e.preventDefault();
    if (game.isPaused) {
      closePauseMenu();
    } else {
      openPauseMenu();
    }
  }
});

// ==== Верхние кнопки ====
document.getElementById("btn-restart").addEventListener("click", () => {
  pauseMenu.classList.add("hidden");
  game.restart();
  if (sound.ctx && !sound.muted) sound.startMusic();
});

document.getElementById("btn-fullscreen").addEventListener("click", () => {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

document.getElementById("overlay-restart").addEventListener("click", () => {
  pauseMenu.classList.add("hidden");
  game.restart();
  if (sound.ctx && !sound.muted) sound.startMusic();
});

// ==== Панель инструментов ====
document.querySelectorAll(".tool").forEach((btn) => {
  btn.addEventListener("click", () => {
    game.player.setTool(btn.dataset.tool);
    game.refreshToolbar();
    if (sound.ctx && !sound.muted) sound.uiClick();
  });
});

start();