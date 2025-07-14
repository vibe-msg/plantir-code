import { App } from "../../app/app"
import { Bus } from "../../bus"
import { Session } from "../../session"
import { Log } from "../../util/log"
import { Config } from "../../config/config"

export const plantirExtensionConfigHooks = ({
  app,
  log
}: {
  app: App.Info
  log: Log.Logger
}) => {
  Bus.subscribe(Session.Event.PreSendMessage, async (payload) => {
    const cfg = await Config.get()
    const { sessionID, text } = payload.properties
    
    log.info("pre_send_message", {
      sessionID,
      text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
    })

    const replaceVariables = (str: string) => 
      str.replace("$TEXT", text).replace("$SESSION_ID", sessionID)

    try {
      if (cfg.experimental?.hook?.pre_send_message) {
        for (const item of cfg.experimental.hook.pre_send_message) {
          log.info("executing pre_send_message hook", {
            command: item.command,
          })
          
          const proc = Bun.spawn({
            cmd: item.command.map(replaceVariables),
            env: {
              ...process.env,
              ...Object.fromEntries(
                Object.entries(item.environment || {}).map(([key, value]) => [
                  key,
                  replaceVariables(value),
                ])
              ),
            },
            cwd: app.path.cwd,
            stdout: "pipe",
            stderr: "pipe",
          })

          const [exitCode, errorOutput] = await Promise.all([
            proc.exited,
            new Response(proc.stderr).text(),
            new Response(proc.stdout).text(), // Consume stdout to prevent deadlocks
          ])

          if (exitCode !== 0) {
            log.error("pre_send_message hook failed", {
              command: item.command,
              exitCode,
              error: errorOutput,
            })

            await Bus.publish(Session.Event.HookCompleted, {
              sessionID,
              hookType: "pre_send_message",
              success: false,
              error: errorOutput,
            })
            return
          }
        }
      }
      
      await Bus.publish(Session.Event.HookCompleted, {
        sessionID,
        hookType: "pre_send_message",
        success: true,
      })
    } catch (error) {
      log.error("pre_send_message hook error", { error })
      await Bus.publish(Session.Event.HookCompleted, {
        sessionID,
        hookType: "pre_send_message",
        success: false,
        error: error?.toString(),
      })
    }
  })
}