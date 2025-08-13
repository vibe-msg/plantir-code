import { execSync } from "child_process"
import { join } from "path"
import "zod-openapi/extend"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { RunCommand } from "./cli/cmd/run"
import { GenerateCommand } from "./cli/cmd/generate"
import { Log } from "./util/log"
import { AuthCommand } from "./cli/cmd/auth"
import { AgentCommand } from "./cli/cmd/agent"
import { UpgradeCommand } from "./cli/cmd/upgrade"
import { ModelsCommand } from "./cli/cmd/models"
import { UI } from "./cli/ui"
import { Installation } from "./installation"
import { NamedError } from "./util/error"
import { FormatError } from "./cli/error"
import { ServeCommand } from "./cli/cmd/serve"
import { TuiCommand } from "./cli/cmd/tui"
import { DebugCommand } from "./cli/cmd/debug"
import { StatsCommand } from "./cli/cmd/stats"
import { McpCommand } from "./cli/cmd/mcp"
import { SandboxCommand } from "./cli/cmd/sandbox"
import { chmodSync, readFileSync, rmSync } from "fs"
import { GithubCommand } from "./cli/cmd/github"
import { Trace } from "./trace"

Trace.init()

const cancel = new AbortController()

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: e instanceof Error ? e.message : e,
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: e instanceof Error ? e.message : e,
  })
})

const argv = yargs(hideBin(process.argv))
  .scriptName("opencode")
  .help("help", "show help")
  .version("version", "show version number", Installation.VERSION)
  .alias("version", "v")
  .option("s", {
    alias: "sandbox",
    describe: "use sandbox mode",
    type: "string",
  })
  .option("skip", {
    describe: "커맨드 실행을 미들웨어에서 막아봄",
    type: "boolean",
  })
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .middleware(async (opts) => {
    await Log.init({
      print: process.argv.includes("--print-logs"),
      dev: Installation.isDev(),
      level: (() => {
        if (opts.logLevel) return opts.logLevel as Log.Level
        if (Installation.isDev()) return "DEBUG"
        return "INFO"
      })(),
    })

    Log.Default.info("opencode", {
      version: Installation.VERSION,
      args: process.argv.slice(2),
    })
  })

const useSandbox = process.argv.find((arg) => arg.includes("--sandbox") || arg.includes("-s"))
if (useSandbox) {
  let sandboxCommand: string
  try {
    sandboxCommand = execSync(`node scripts/sandbox_command.js ${useSandbox}`).toString().trim()
  } catch {
    console.warn("ERROR: could not detect sandbox container command")
    process.exit(0)
  }
  console.log(`using ${sandboxCommand} for sandboxing`)

  const baseImage = "us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.15"
  const baseDockerfile = "Dockerfile"

  execSync("bun install --registry=https://registry.npmjs.org", { stdio: "inherit" })
  // execSync("npm run build --workspaces", { stdio: "inherit" })

  console.log("packing opencode ...")
  const cliPackageDir = join("packages", "opencode")
  rmSync(join(cliPackageDir, "opencode-*.tgz"), { force: true })
  execSync(`npm pack -w opencode --pack-destination ./packages/opencode`, {
    stdio: "ignore",
  })

  const packageVersion = JSON.parse(
    readFileSync(join(process.cwd(), "/packages/opencode/package.json"), "utf-8"),
  ).version
  chmodSync(join(cliPackageDir, `opencode-${packageVersion}.tgz`), 0o755)

  const buildStdout = process.env["VERBOSE"] ? "inherit" : "ignore"

  function buildImage(imageName: string, dockerfile: string) {
    console.log(`building ${imageName} ... (can be slow first time)`)
    const buildCommand =
      sandboxCommand === "podman" ? `${sandboxCommand} build --authfile=<(echo '{}')` : `${sandboxCommand} build`

    // const npmPackageVersion = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")).version

    const imageTag = process.env["PLANTIR_SANDBOX_IMAGE_TAG"] || imageName.split(":")[1]
    const finalImageName = `${imageName.split(":")[0]}:${imageTag}`

    execSync(
      `${buildCommand} ${
        process.env["BUILD_SANDBOX_FLAGS"] || ""
      } --build-arg CLI_VERSION_ARG=${packageVersion} -f "${dockerfile}" -t "${finalImageName}" .`,
      { stdio: buildStdout, shell: "/bin/bash" },
    )
    console.log(`built ${finalImageName}`)

    const runCommand = sandboxCommand === "podman" ? "" : `${sandboxCommand} run`
    execSync(`${runCommand} --name plantir_sandbox_${sandboxCommand} ${finalImageName}`)
    const execCommand = sandboxCommand === "podman" ? "" : `${sandboxCommand} exec`
    execSync(`${execCommand} -it plantir_sandbox_${sandboxCommand} bash`)
  }

  buildImage(baseImage, baseDockerfile)
  execSync(`${sandboxCommand} image prune -f`, { stdio: "ignore" })
} else {
  const cli = argv
    .usage("\n" + UI.logo())
    .command(McpCommand)
    .command(TuiCommand)
    .command(RunCommand)
    .command(GenerateCommand)
    .command(DebugCommand)
    .command(AuthCommand)
    .command(AgentCommand)
    .command(SandboxCommand)
    .command(UpgradeCommand)
    .command(ServeCommand)
    .command(ModelsCommand)
    .command(StatsCommand)
    .command(GithubCommand)
    .fail((msg) => {
      if (msg.startsWith("Unknown argument") || msg.startsWith("Not enough non-option arguments")) {
        cli.showHelp("log")
      }
    })
    .strict()

  try {
    await cli.parse()
  } catch (e) {
    let data: Record<string, any> = {}
    if (e instanceof NamedError) {
      const obj = e.toObject()
      Object.assign(data, {
        ...obj.data,
      })
    }

    if (e instanceof Error) {
      Object.assign(data, {
        name: e.name,
        message: e.message,
        cause: e.cause?.toString(),
      })
    }

    if (e instanceof ResolveMessage) {
      Object.assign(data, {
        name: e.name,
        message: e.message,
        code: e.code,
        specifier: e.specifier,
        referrer: e.referrer,
        position: e.position,
        importKind: e.importKind,
      })
    }
    Log.Default.error("fatal", data)
    const formatted = FormatError(e)
    if (formatted) UI.error(formatted)
    if (formatted === undefined) UI.error("Unexpected error, check log file at " + Log.file() + " for more details")
    process.exitCode = 1
  }
}

cancel.abort()
