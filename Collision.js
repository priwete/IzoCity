// Логика сетки: проверка занятости, дорог, зон, размещения
import { MAP_W, MAP_H } from "./Game.js";

// Требуемая зона для зданий
const ZONE_FOR = {
  house: "R",
  office: "C",
  factory: "I",
  school: null,
  hospital: null,
};

const BUILDING_NAMES = {
  house: "Жилой дом",
  office: "Офис",
  factory: "Завод",
  school: "Школа",
  hospital: "Больница",
};

// Есть ли у клетки (x,y) сосед-дорога (ортогонально по сетке)
export function hasAdjacentRoad(cells, x, y) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
    if (cells[ny][nx].road) return true;
  }
  return false;
}

// Проверка возможности поставить здание
export function canPlaceBuilding(cells, x, y, type) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) {
    return { ok: false, reason: "За пределами карты" };
  }
  const cell = cells[y][x];

  if (cell.road) {
    return { ok: false, reason: "Нельзя строить на дороге" };
  }
  if (cell.building) {
    return { ok: false, reason: "Клетка уже занята" };
  }

  const requiredZone = ZONE_FOR[type];
  if (requiredZone && cell.zone !== requiredZone) {
    const zoneNames = { R: "жилая", C: "коммерческая", I: "промышленная" };
    return {
      ok: false,
      reason: `Нужна ${zoneNames[requiredZone]} зона (${requiredZone})`,
    };
  }

  if (!hasAdjacentRoad(cells, x, y)) {
    return { ok: false, reason: "Нужна дорога рядом с клеткой" };
  }

  return { ok: true, reason: "" };
}

// Можно ли красить зону
export function canPaintZone(cells, x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  const cell = cells[y][x];
  return !cell.road && !cell.building;
}

// Можно ли проложить дорогу
export function canBuildRoad(cells, x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  const cell = cells[y][x];
  return !cell.building && !cell.road;
}