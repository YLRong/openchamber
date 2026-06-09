import { runtimeFetch } from "@/lib/runtime-fetch"

const RUNTIME_TIME_CACHE_TTL_MS = 30_000
const RUNTIME_TIME_TIMEOUT_MS = 1_000

let cachedOffsetMs = 0
let cachedUntilMs = 0

function timeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs)
  }
  if (typeof AbortController === "undefined") return undefined

  const controller = new AbortController()
  setTimeout(() => controller.abort(), timeoutMs)
  return controller.signal
}

export async function getRuntimeMessageNow(): Promise<number> {
  const startedAt = Date.now()
  if (cachedUntilMs > startedAt) {
    return startedAt + cachedOffsetMs
  }

  try {
    const response = await runtimeFetch("/api/openchamber/runtime-message/time", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: timeoutSignal(RUNTIME_TIME_TIMEOUT_MS),
    })
    if (!response.ok) return startedAt

    const receivedAt = Date.now()
    const payload = await response.json().catch(() => null) as { serverTimeMs?: unknown } | null
    const serverTimeMs = payload?.serverTimeMs
    if (typeof serverTimeMs !== "number" || !Number.isFinite(serverTimeMs)) {
      return startedAt
    }

    // 用请求往返的中点估算 runtime 与浏览器的时钟偏移，避免浏览器时钟直接决定消息时间。
    const midpoint = Math.round((startedAt + receivedAt) / 2)
    cachedOffsetMs = serverTimeMs - midpoint
    cachedUntilMs = receivedAt + RUNTIME_TIME_CACHE_TTL_MS
    return receivedAt + cachedOffsetMs
  } catch {
    return startedAt
  }
}
