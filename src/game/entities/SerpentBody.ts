import type { BodySample } from '../types'
import { PATH_BUFFER_SIZE, BODY_SAMPLE_SPACING, INITIAL_BODY_SAMPLES } from '../config'

export class SerpentBody {
  private pathX: Float32Array
  private pathY: Float32Array
  private writePtr = 0
  private bufferedCount = 0  // how many valid entries exist

  visibleSampleCount: number = INITIAL_BODY_SAMPLES

  constructor() {
    this.pathX = new Float32Array(PATH_BUFFER_SIZE)
    this.pathY = new Float32Array(PATH_BUFFER_SIZE)
  }

  /** Push the current head position into the ring buffer each frame */
  push(x: number, y: number): void {
    this.pathX[this.writePtr] = x
    this.pathY[this.writePtr] = y
    this.writePtr = (this.writePtr + 1) % PATH_BUFFER_SIZE
    if (this.bufferedCount < PATH_BUFFER_SIZE) this.bufferedCount++
  }

  /**
   * Reconstruct body sample positions by walking backwards through the path buffer.
   * Returns positions at fixed spacing along the path, starting from closest to head.
   */
  getSamples(count: number): BodySample[] {
    const samples: BodySample[] = []
    if (this.bufferedCount < 2) return samples

    let accumulated = 0
    let needed = BODY_SAMPLE_SPACING
    const maxSteps = this.bufferedCount - 1

    for (let i = 0; i < maxSteps && samples.length < count; i++) {
      const curIdx = (this.writePtr - 1 - i + PATH_BUFFER_SIZE) % PATH_BUFFER_SIZE
      const nxtIdx = (this.writePtr - 2 - i + PATH_BUFFER_SIZE) % PATH_BUFFER_SIZE

      const curX = this.pathX[curIdx]
      const curY = this.pathY[curIdx]
      const nxtX = this.pathX[nxtIdx]
      const nxtY = this.pathY[nxtIdx]

      const dx = nxtX - curX
      const dy = nxtY - curY
      const segLen = Math.sqrt(dx * dx + dy * dy)
      if (segLen === 0) continue

      // Place all samples that fall within this segment
      while (accumulated + segLen >= needed && samples.length < count) {
        const t = (needed - accumulated) / segLen
        samples.push({ x: curX + dx * t, y: curY + dy * t })
        needed += BODY_SAMPLE_SPACING
      }

      accumulated += segLen
    }

    return samples
  }

  reset(): void {
    this.writePtr = 0
    this.bufferedCount = 0
    this.visibleSampleCount = INITIAL_BODY_SAMPLES
  }
}
