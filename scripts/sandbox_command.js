import { execSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import stripJsonComments from "strip-json-comments"
import os from "os"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import dotenv from "dotenv"

const argv = yargs(hideBin(process.argv)).option("q", {
  alias: "quiet",
  type: "boolean",
  default: false,
}).argv

const sandboxTypeArgv = yargs(hideBin(process.argv)).option("s", {
  alias: "sandbox",
  type: "string",
}).argv

let plantirSandbox = sandboxTypeArgv.sandbox || sandboxTypeArgv.s

if (!plantirSandbox) {
  const userSettingsFile = join(os.homedir(), ".plantir", "settings.json")
  if (existsSync(userSettingsFile)) {
    const settings = JSON.parse(stripJsonComments(readFileSync(userSettingsFile, "utf-8")))
    if (settings.sandbox) {
      plantirSandbox = settings.sandbox
    }
  }
}

if (!plantirSandbox) {
  let currentDir = process.cwd()
  while (true) {
    const plantirEnv = join(currentDir, ".plantir", ".env")
    const regularEnv = join(currentDir, ".env")
    if (existsSync(plantirEnv)) {
      dotenv.config({ path: plantirEnv, quiet: true })
      break
    } else if (existsSync(regularEnv)) {
      dotenv.config({ path: regularEnv, quiet: true })
      break
    }
    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }
  plantirSandbox = "docker"
}

plantirSandbox = (plantirSandbox || "")?.toLowerCase()

const commandExists = (cmd) => {
  const checkCommand = os.platform() === "win32" ? "where" : "command -v"
  try {
    execSync(`${checkCommand} ${cmd}`, { stdio: "ignore" })
    return true
  } catch {
    if (os.platform() === "win32") {
      try {
        execSync(`${checkCommand} ${cmd}.exe`, { stdio: "ignore" })
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

let command = ""
if (["1", "true"].includes(plantirSandbox)) {
  if (commandExists("docker")) {
    command = "docker"
  } else if (commandExists("podman")) {
    command = "podman"
  } else {
    console.error("ERROR: install docker or podman or specify command in PLANTIR_SANDBOX")
    process.exit(1)
  }
} else if (plantirSandbox && !["0", "false"].includes(plantirSandbox)) {
  if (commandExists(plantirSandbox)) {
    command = plantirSandbox
  } else {
    console.error(`ERROR: missing sandbox command '${plantirSandbox}' (from PLANTIR_SANDBOX)`)
    process.exit(1)
  }
} else {
  if (os.platform() === "darwin" && process.env["SEATBELT_PROFILE"] !== "none") {
    if (commandExists("sandbox-exec")) {
      command = "sandbox-exec"
    } else {
      process.exit(1)
    }
  } else {
    process.exit(1)
  }
}

if (!argv.q) {
  console.log(command)
}
process.exit(0)
