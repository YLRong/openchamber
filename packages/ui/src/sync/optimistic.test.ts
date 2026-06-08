import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { mergeOptimisticPage } from "./optimistic"

const message = (id: string): Message => ({
  id,
  sessionID: "ses_1",
  role: "user",
  time: { created: 1 },
}) as Message

const part = (id: string, messageID: string, text: string): Part => ({
  id,
  sessionID: "ses_1",
  messageID,
  type: "text",
  text,
}) as Part

describe("mergeOptimisticPage", () => {
  test("confirms canonical server message without merging local optimistic parts", () => {
    const page = {
      session: [message("msg_server")],
      part: [{ id: "msg_server", part: [part("prt_server", "msg_server", "hello")] }],
      complete: true,
    }

    const result = mergeOptimisticPage(page, [
      {
        message: message("msg_server"),
        parts: [part("optimistic_prt_local", "msg_server", "hello")],
      },
    ])

    expect(result.confirmed).toEqual(["msg_server"])
    expect(result.session.map((item) => item.id)).toEqual(["msg_server"])
    expect(result.part).toEqual([{ id: "msg_server", part: [part("prt_server", "msg_server", "hello")] }])
  })

  test("keeps local-only optimistic message until canonical server message arrives", () => {
    const page = {
      session: [] as Message[],
      part: [] as { id: string; part: Part[] }[],
      complete: true,
    }

    const result = mergeOptimisticPage(page, [
      {
        message: message("optimistic_msg_local"),
        parts: [part("optimistic_prt_local", "optimistic_msg_local", "hello")],
      },
    ])

    expect(result.confirmed).toEqual([])
    expect(result.session.map((item) => item.id)).toEqual(["optimistic_msg_local"])
    expect(result.part.map((item) => item.id)).toEqual(["optimistic_msg_local"])
  })
})
