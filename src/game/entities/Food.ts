import type { FoodItem } from '../types'
import { FOOD_TYPES } from '../config'

let nextId = 0

const TOTAL_WEIGHT = FOOD_TYPES.reduce((s, f) => s + f.weight, 0)

function pickFoodType() {
  let r = Math.random() * TOTAL_WEIGHT
  for (const ft of FOOD_TYPES) {
    r -= ft.weight
    if (r <= 0) return ft
  }
  return FOOD_TYPES[0]
}

export function createFood(x: number, y: number, nowMs: number): FoodItem {
  const ft = pickFoodType()
  return { x, y, id: nextId++, spawnTime: nowMs, foodType: ft.type, radius: ft.radius, nutrition: ft.nutrition }
}
