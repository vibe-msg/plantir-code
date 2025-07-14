import { z } from "zod"

import { MessageV2 } from "../session/message-v2"
import { Bus } from "../bus"

export const PlantirEvent = {
  PreSendMessage: Bus.event(
    "session.pre_send_message",
    z.object({
      sessionID: z.string(),
      text: z.string(),
      attachments: z.array(z.any()).optional(),
    }),
  ),
  HookCompleted: Bus.event(
    "session.hook_completed",
    z.object({
      sessionID: z.string(),
      hookType: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    }),
  ),
}

export const preSendMessageHook = async ({ input }: {
  input: {
    sessionID: string
    providerID: string
    modelID: string
    mode?: string
    parts: (MessageV2.TextPart | MessageV2.FilePart)[]
  }
}) => {
  const textPart = input.parts.find((p) => p.type === "text")

  if (!textPart) return;

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsub()
      reject(new Error("pre_send_message hook timeout"))
    }, 3000)

    const unsub = Bus.subscribe(PlantirEvent.HookCompleted, (evt) => {
      if (evt.properties.sessionID === input.sessionID && evt.properties.hookType === "pre_send_message") {
        clearTimeout(timeout)
        unsub()
        if (evt.properties.success) {
          resolve()
        } else {
          reject(new Error(evt.properties.error || "Hook failed"))
        }
      }
    })

    Bus.publish(PlantirEvent.PreSendMessage, {
      sessionID: input.sessionID,
      text: textPart.text,
      attachments: input.parts.filter((p) => p.type === "file"),
    })
  })
}