import type { GrowthEntry } from '../types'
import type { SerpentBody } from '../entities/SerpentBody'
import { GROWTH_PER_FOOD, GROWTH_DELAY_MS } from '../config'

export interface ActivePulse {
  startTime: number     // ms when food was eaten
  resolveTime: number   // ms when tail extends
  resolved: boolean
}

export class GrowthSystem {
  private queue: GrowthEntry[] = []
  pulses: ActivePulse[] = []

  onFoodEaten(nowMs: number): void {
    this.queue.push({
      samplesRemaining: GROWTH_PER_FOOD,
      triggerTime: nowMs + GROWTH_DELAY_MS,
    })
    this.pulses.push({
      startTime: nowMs,
      resolveTime: nowMs + GROWTH_DELAY_MS,
      resolved: false,
    })
  }

  update(nowMs: number, body: SerpentBody): void {
    // Resolve growth entries
    for (const entry of this.queue) {
      if (nowMs >= entry.triggerTime && entry.samplesRemaining > 0) {
        body.visibleSampleCount += entry.samplesRemaining
        entry.samplesRemaining = 0
      }
    }
    // Remove resolved entries
    this.queue = this.queue.filter(e => e.samplesRemaining > 0)

    // Mark resolved pulses
    for (const pulse of this.pulses) {
      if (!pulse.resolved && nowMs >= pulse.resolveTime) {
        pulse.resolved = true
      }
    }
    // Clean up old resolved pulses (keep for 200ms after resolve for fade-out)
    this.pulses = this.pulses.filter(p => !p.resolved || nowMs - p.resolveTime < 200)
  }

  /** 0 = at head, 1 = at tail */
  getPulseProgress(pulse: ActivePulse, nowMs: number): number {
    const elapsed = nowMs - pulse.startTime
    return Math.min(1, elapsed / GROWTH_DELAY_MS)
  }

  reset(): void {
    this.queue = []
    this.pulses = []
  }
}
