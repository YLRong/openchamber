import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { useCallback } from "react"
import { opencodeClient } from "@/lib/opencode/client"
import { useDirectoryStore, useSyncDirectory } from "./sync-context"
import { useSync } from "./use-sync"

// ---------------------------------------------------------------------------
// 仅本地使用的 optimistic identity。规范 OpenCode ID 来自 OpenCode 或
// Runtime message adapter，而不是浏览器时间。
// ---------------------------------------------------------------------------

const ID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

function randomBase62(length: number): string {
  const bytes = new Uint8Array(length)
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  let result = ""
  for (let index = 0; index < length; index += 1) {
    result += ID_CHARS[bytes[index] % ID_CHARS.length]
  }
  return result
}

function localId(prefix: string): string {
  return `${prefix}_${randomBase62(24)}`
}

function clientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `req_${randomBase62(32)}`
}

// ---------------------------------------------------------------------------
// 带 optimistic 插入的 prompt 提交。
// ---------------------------------------------------------------------------

export type SubmitInput = {
  sessionID: string
  text: string
  parts?: Part[]
  agent: string
  model: { providerID: string; modelID: string }
  variant?: string
  command?: { name: string; arguments: string }
  images?: Array<{ id?: string; type: "file"; mime: string; url: string; filename: string }>
}

export function usePromptSubmit() {
  const store = useDirectoryStore()
  const directory = useSyncDirectory()
  const sync = useSync()

  const submit = useCallback(
    async (input: SubmitInput) => {
      const messageID = localId("optimistic_msg")
      const requestID = clientRequestId()

      // 构造 optimistic 用户消息。
      const message: Message = {
        id: messageID,
        sessionID: input.sessionID,
        role: "user",
        time: { created: Date.now() },
        agent: input.agent,
        model: input.model,
        variant: input.variant,
      } as Message

      // 构造 optimistic parts。
      const textPart: Part = {
        id: localId("optimistic_prt"),
        sessionID: input.sessionID,
        messageID,
        type: "text",
        text: input.text,
      } as Part

      const optimisticParts: Part[] = [textPart, ...(input.parts ?? [])]

      // optimistic 设置 busy 状态。
      store.setState((prev) => ({
        ...prev,
        session_status: {
          ...prev.session_status,
          [input.sessionID]: { type: "busy" },
        },
      }))

      // 立即加入 optimistic 消息。
      sync.optimistic.add({
        sessionID: input.sessionID,
        message,
        parts: optimisticParts,
      })

      try {
        let canonicalMessageID: string
        if (input.command) {
          // Slash command。
          canonicalMessageID = await opencodeClient.sendCommand({
            id: input.sessionID,
            command: input.command?.name ?? "",
            arguments: input.command?.arguments ?? "",
            agent: input.agent,
            providerID: input.model.providerID,
            modelID: input.model.modelID,
            variant: input.variant,
            files: input.images,
            messageId: messageID,
            clientRequestId: requestID,
            directory,
          })
        } else {
          // 常规 prompt。
          canonicalMessageID = await opencodeClient.sendMessage({
            id: input.sessionID,
            agent: input.agent,
            providerID: input.model.providerID,
            modelID: input.model.modelID,
            messageId: messageID,
            clientRequestId: requestID,
            text: input.text,
            files: input.images,
            variant: input.variant,
            directory,
          })
        }
        if (canonicalMessageID && canonicalMessageID !== messageID) {
          sync.optimistic.confirm({
            sessionID: input.sessionID,
            optimisticMessageID: messageID,
            canonicalMessageID,
          })
        }
        return true
      } catch (error) {
        // 失败时回滚 optimistic 内容。
        sync.optimistic.remove({
          sessionID: input.sessionID,
          messageID,
        })
        // 重置状态。
        store.setState((prev) => ({
          ...prev,
          session_status: {
            ...prev.session_status,
            [input.sessionID]: { type: "idle" },
          },
        }))
        throw error
      }
    },
    [directory, store, sync],
  )

  return submit
}
