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

let geminiSandbox = process.env["GEMINI_SANDBOX"]

if (!geminiSandbox) {
  const userSettingsFile = join(os.homedir(), ".gemini", "settings.json")
  if (existsSync(userSettingsFile)) {
    const settings = JSON.parse(stripJsonComments(readFileSync(userSettingsFile, "utf-8")))
    if (settings.sandbox) {
      geminiSandbox = settings.sandbox
    }
  }
}

if (!geminiSandbox) {
  let currentDir = process.cwd()
  while (true) {
    const geminiEnv = join(currentDir, ".gemini", ".env")
    const regularEnv = join(currentDir, ".env")
    if (existsSync(geminiEnv)) {
      dotenv.config({ path: geminiEnv, quiet: true })
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
  geminiSandbox = process.env["GEMINI_SANDBOX"]
}

geminiSandbox = (geminiSandbox || "").toLowerCase()

const commandExists = (cmd: string) => {
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
if (["1", "true"].includes(geminiSandbox)) {
  if (commandExists("docker")) {
    command = "docker"
  } else if (commandExists("podman")) {
    command = "podman"
  } else {
    console.error("ERROR: install docker or podman or specify command in GEMINI_SANDBOX")
    process.exit(1)
  }
} else if (geminiSandbox && !["0", "false"].includes(geminiSandbox)) {
  if (commandExists(geminiSandbox)) {
    command = geminiSandbox
  } else {
    console.error(`ERROR: missing sandbox command '${geminiSandbox}' (from GEMINI_SANDBOX)`)
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
