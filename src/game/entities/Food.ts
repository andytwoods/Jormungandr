import type { FoodItem } from '../types'

let nextId = 0

export function createFood(x: number, y: number): FoodItem {
  return { x, y, id: nextId++ }
}
