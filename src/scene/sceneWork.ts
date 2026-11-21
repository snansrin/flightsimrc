type Work = { advance: () => boolean }
const queue: Work[] = []
let pending = false

function schedule() {
  if (pending || !queue.length) return
  pending = true
  requestAnimationFrame(() => {
    pending = false
    const deadline = performance.now() + 2.5
    while (queue.length) {
      const work = queue.shift()!
      if (work.advance()) queue.push(work)
      if (performance.now() >= deadline) break
    }
    schedule()
  })
}

/** Run CPU-side scenery jobs in small slices alongside the render loop. */
export function sliceSceneWork<T>(work: Generator<void, T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    queue.push({ advance() {
      try {
        if (signal.aborted) {
          work.return(undefined as never)
          reject(signal.reason)
          return false
        }
        const step = work.next()
        if (!step.done) return true
        resolve(step.value)
      } catch (error) { reject(error) }
      return false
    } })
    schedule()
  })
}
