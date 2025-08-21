import { Auth } from "../../auth"
import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { ModelsDev } from "../../provider/models"
import path from "path"
import os from "os"
import { Global } from "../../global"

export const SandboxCommand = cmd({
  command: "sandbox",
  describe: "list all available sandboxes",
  handler: async () => {
    await App.provide({ cwd: process.cwd() }, async () => {
      const sandboxes = [
        {
          label: "none",
          value: "0",
        },
        {
          label: "docker",
          value: "1",
        },
        {
          label: "podman",
          value: "2",
        },
      ]

      for (const { label, value } of Object.entries(sandboxes)) {
        for (const modelID of Object.keys(provider.info.models)) {
          console.log(`${providerID}/${modelID}`)
        }
      }
    })

    const sandbox = await prompts.select({
      message: "Select Sandbox",
      options: [
        {
          label: "docker",
          value: "1",
        },
        {
          label: "podman",
          value: "2",
        },
      ],
    })

    if (prompts.isCancel(sandbox)) throw new UI.CancelledError()

    await Auth.set(sandbox, {
      type: "sandbox",
      key: "sandbox",
    })
  },
})

export const SandboxListCommand = cmd({
  command: "sandbox",
  describe: "list providers",
  async handler() {
    UI.empty()
    const authPath = path.join(Global.Path.data, "auth.json")
    const homedir = os.homedir()
    const displayPath = authPath.startsWith(homedir) ? authPath.replace(homedir, "~") : authPath
    prompts.intro(`Credentials ${UI.Style.TEXT_DIM}${displayPath}`)
    const results = await Auth.all().then((x) => Object.entries(x))
    const database = await ModelsDev.get()

    for (const [providerID, result] of results) {
      const name = database[providerID]?.name || providerID
      prompts.log.info(`${name} ${UI.Style.TEXT_DIM}${result.type}`)
    }

    prompts.outro(`${results.length} credentials`)

    // Environment variables section
    const activeEnvVars: Array<{ provider: string; envVar: string }> = []

    for (const [providerID, provider] of Object.entries(database)) {
      for (const envVar of provider.env) {
        if (process.env[envVar]) {
          activeEnvVars.push({
            provider: provider.name || providerID,
            envVar,
          })
        }
      }
    }

    if (activeEnvVars.length > 0) {
      UI.empty()
      prompts.intro("Environment")

      for (const { provider, envVar } of activeEnvVars) {
        prompts.log.info(`${provider} ${UI.Style.TEXT_DIM}${envVar}`)
      }

      prompts.outro(`${activeEnvVars.length} environment variables`)
    }
  },
})
