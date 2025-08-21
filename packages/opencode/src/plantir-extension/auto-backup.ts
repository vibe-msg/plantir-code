import { execSync } from "child_process"
import { existsSync, writeFileSync } from "fs"
import { join } from "path"
import { ServerGlobals } from "../server/globals"

interface BackupOptions {
  taskType: string // feature, fix, refactor, bugfix, enhancement 등
  nonGitDir?: string
}

interface GitStatus {
  hasChanges: boolean
  stagedFiles: string[]
  unstagedFiles: string[]
}

class AutoBackupScript {
  private taskType: string
  private nonGitDir?: string
  private readonly gitignoreContent = `# 로그 파일 제외
logs/
*.log

# 빌드 결과물 제외
/build/
/dist/
*.o
*.class

# 환경 설정 파일 제외
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
config/local.json

# 임시 파일 제외
*.tmp
*.temp

# 의존성 디렉터리 제외
node_modules/
venv/
.venv/

# IDE 설정 파일 제외
.vscode/
.idea/
*.swp
*.swo

# OS 생성 파일 제외
.DS_Store
Thumbs.db

# 커버리지 및 테스트 결과 제외
coverage/
.nyc_output/

# 캐시 디렉터리 제외
.cache/
.parcel-cache/
`

  constructor(options: BackupOptions) {
    this.taskType = options.taskType
    this.nonGitDir = options.nonGitDir
  }

  public async run(): Promise<void> {
    try {
      await this.toast("🚀 자동 백업 스크립트 시작...")
      await this.toast(`📝 작업 유형: ${this.taskType}`)
      if (this.nonGitDir) {
        await this.toast(`📁 비Git 디렉터리: ${this.nonGitDir}`)
      }

      // 현재 디렉터리가 Git 저장소인지 확인
      if (this.isGitRepository(".")) {
        await this.backupGitRepository()
      } else {
        await this.toast("⚠️ 현재 디렉터리가 Git 저장소가 아닙니다. Git 저장소를 초기화합니다.")
        await this.initializeGitRepository(".")
        await this.backupGitRepository()
      }

      // 비Git 디렉터리 백업 (nonGitDir이 설정된 경우에만)
      if (this.nonGitDir) {
        await this.backupNonGitDirectory()
      }

      await this.toast("✅ 백업 작업이 완료되었습니다.")
    } catch (error) {
      await this.toast(`❌ 백업 중 오류가 발생했습니다: ${error}`)
      throw new Error(`백업 중 오류가 발생했습니다: ${error}`)
    }
  }

  private async toast(message: string): Promise<void> {
    // 서버에서 TUI로 toast 전송
    try {
      const serverUrl = ServerGlobals.getServerUrl()
      if (serverUrl) {
        await fetch(`${serverUrl}/tui/show-toast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            title: "자동 백업",
            type: "info",
            duration: 3
          })
        })
      }
    } catch {
      // 오류 발생 시 조용히 무시 (TUI 환경이 아닐 수 있음)
    }
  }

  private executeCommand(command: string, cwd?: string): string {
    try {
      return execSync(command, {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
      })
    } catch (error) {
      throw new Error(`명령어 실행 실패: ${command} - ${error}`)
    }
  }

  private isGitRepository(dir: string): boolean {
    return existsSync(join(dir, ".git"))
  }

  private async createGitignoreIfNotExists(dir: string): Promise<void> {
    const gitignorePath = join(dir, ".gitignore")

    if (!existsSync(gitignorePath)) {
      try {
        writeFileSync(gitignorePath, this.gitignoreContent, "utf8")
        await this.toast(`✅ .gitignore 파일이 생성되었습니다: ${gitignorePath}`)
      } catch (error) {
        await this.toast(`❌ .gitignore 파일 생성 실패: ${error}`)
      }
    } else {
      await this.toast(`ℹ️ .gitignore 파일이 이미 존재합니다: ${gitignorePath}`)
    }
  }

  private async initializeGitRepository(dir: string): Promise<void> {
    await this.toast(`🔄 Git 저장소 초기화: ${dir}`)

    // Git 초기화
    this.executeCommand("git init", dir)

    // 기본 브랜치를 main으로 설정
    try {
      this.executeCommand("git branch -M main", dir)
    } catch {
      // Git 버전이 낮아서 -M 옵션을 지원하지 않는 경우
      await this.toast("ℹ️ Git 버전이 낮아 기본 브랜치 설정을 건너뜁니다.")
    }

    // .gitignore 파일 생성
    await this.createGitignoreIfNotExists(dir)

    // 초기 커밋 생성 (빈 커밋으로 브랜치 생성을 위해)
    try {
      this.executeCommand("git add .gitignore", dir)
      this.executeCommand('git commit -m "Initial commit"', dir)
      await this.toast("✅ 초기 커밋이 생성되었습니다.")
    } catch (error) {
      await this.toast(`⚠️ 초기 커밋 생성 중 오류: ${error}`)
      // 커밋 생성에 실패했다면 빈 커밋이라도 생성
      try {
        this.executeCommand('git commit --allow-empty -m "Initial empty commit"', dir)
        await this.toast("✅ 빈 초기 커밋이 생성되었습니다.")
      } catch (emptyCommitError) {
        await this.toast(`❌ 빈 커밋 생성도 실패: ${emptyCommitError}`)
      }
    }

    await this.toast(`✅ Git 저장소가 초기화되었습니다: ${dir}`)
    await this.toast("📝 현재 브랜치: main")
  }

  private async getGitStatus(dir: string): Promise<GitStatus> {
    try {
      const status = this.executeCommand("git status --porcelain", dir)
      const lines = status.split("\n").filter((line) => line.trim())

      const stagedFiles: string[] = []
      const unstagedFiles: string[] = []

      lines.forEach((line) => {
        const statusCode = line.substring(0, 2)
        const fileName = line.substring(3)

        // 모든 변경사항을 감지 (수정, 추가, 삭제, 추적되지 않는 파일)
        if (
          statusCode.startsWith("M") ||
          statusCode.startsWith("A") ||
          statusCode.startsWith("D") ||
          statusCode.startsWith("R") ||
          statusCode.startsWith("C") ||
          statusCode.startsWith("U") ||
          statusCode.startsWith("T") ||
          statusCode.startsWith("X") ||
          statusCode.startsWith("??")
        ) {
          if (statusCode.charAt(0) !== " ") {
            stagedFiles.push(fileName)
          }
          if (statusCode.charAt(1) !== " ") {
            unstagedFiles.push(fileName)
          }
        }
      })

      await this.toast(`🔍 Git 상태 확인: ${lines.length}개 변경사항, ${unstagedFiles.length}개 unstaged 파일`)

      return {
        hasChanges: lines.length > 0,
        stagedFiles,
        unstagedFiles,
      }
    } catch (error) {
      await this.toast(`❌ Git 상태 확인 중 오류: ${error}`)
      return {
        hasChanges: false,
        stagedFiles: [],
        unstagedFiles: [],
      }
    }
  }

  private getCurrentBranch(dir: string): string {
    try {
      return this.executeCommand("git rev-parse --abbrev-ref HEAD", dir).trim()
    } catch {
      return "main"
    }
  }

  private branchExists(branchName: string, dir: string): boolean {
    try {
      this.executeCommand(`git show-ref --verify --quiet refs/heads/${branchName}`, dir)
      return true
    } catch {
      return false
    }
  }

  private hasCommits(dir: string): boolean {
    try {
      this.executeCommand("git rev-parse HEAD", dir)
      return true
    } catch {
      return false
    }
  }

  private getTodayDate(): string {
    const today = new Date()
    return today.toISOString().split("T")[0] // YYYY-MM-DD 형식
  }

  private async backupGitRepository(): Promise<void> {
    await this.toast("🔄 Git 저장소 백업 시작...")

    const gitStatus = await this.getGitStatus(".")

    // 변경사항이 없으면 백업하지 않음
    if (!gitStatus.hasChanges) {
      await this.toast("ℹ️ 변경사항이 없어 백업을 건너뜁니다.")
      return
    }

    await this.toast(`📝 변경사항 감지: ${gitStatus.unstagedFiles.length}개 파일`)

    const curBranch = this.getCurrentBranch(".")
    const today = this.getTodayDate()

    // 커밋이 없으면 먼저 빈 커밋을 생성
    if (!this.hasCommits(".")) {
      try {
        this.executeCommand('git commit --allow-empty -m "Empty commit for branch creation"')
        await this.toast("✅ 브랜치 생성을 위한 빈 커밋이 생성되었습니다.")
      } catch (error) {
        await this.toast(`❌ 빈 커밋 생성 실패: ${error}`)
        return
      }
    }

    // backup-branch가 존재하지 않으면 생성
    if (!this.branchExists("backup-branch", ".")) {
      try {
        this.executeCommand("git branch backup-branch")
        await this.toast("✅ backup-branch가 생성되었습니다.")
      } catch (error) {
        await this.toast(`❌ backup-branch 생성 실패: ${error}`)
        return
      }
    }

    try {
      // 1. 현재 변경사항을 스테이징
      this.executeCommand("git add .")
      await this.toast("✅ 변경사항을 스테이징했습니다.")

      // 2. backup-branch의 커밋 카운트 가져오기
      let commitCount: number
      try {
        const backupCommitCount = this.executeCommand("git rev-list --count backup-branch").trim()
        commitCount = parseInt(backupCommitCount, 10) + 1
      } catch {
        commitCount = 1
      }

      // 3. 커밋 메시지 생성
      const commitMessage = `${today} - ${commitCount} - ${this.taskType}`

      // 4. 현재 스테이징된 변경사항으로 새로운 트리 생성하고 backup-branch에 커밋
      const treeHash = this.executeCommand("git write-tree").trim()
      const parentCommit = this.branchExists("backup-branch", ".")
        ? this.executeCommand("git rev-parse backup-branch").trim()
        : ""

      const commitHash = parentCommit
        ? this.executeCommand(`git commit-tree ${treeHash} -p ${parentCommit} -m "${commitMessage}"`).trim()
        : this.executeCommand(`git commit-tree ${treeHash} -m "${commitMessage}"`).trim()

      // 5. backup-branch 참조 업데이트
      this.executeCommand(`git update-ref refs/heads/backup-branch ${commitHash}`)

      // 6. 스테이징 해제 (원본 파일들 유지)
      this.executeCommand("git reset HEAD")

      await this.toast(`✅ backup-branch에 백업 완료: 커밋 #${commitCount}`)
      await this.toast(`📝 커밋 메시지: ${commitMessage}`)
      await this.toast(`📝 현재 브랜치(${curBranch}) 파일들은 그대로 유지됩니다.`)
    } catch (error) {
      await this.toast(`❌ 백업 실패: ${error}`)
      // 실패 시 스테이징 해제
      try {
        this.executeCommand("git reset HEAD")
      } catch (resetError) {
        await this.toast(`❌ 스테이징 해제 실패: ${resetError}`)
      }
    }
  }

  private async backupNonGitDirectory(): Promise<void> {
    if (!this.nonGitDir || !existsSync(this.nonGitDir)) {
      await this.toast("ℹ️ 비Git 디렉터리가 지정되지 않았거나 존재하지 않습니다.")
      return
    }

    await this.toast(`🔄 비Git 디렉터리 백업 시작: ${this.nonGitDir}`)

    // Git 초기화 (이미 초기화되어 있지 않은 경우)
    if (!this.isGitRepository(this.nonGitDir)) {
      await this.initializeGitRepository(this.nonGitDir)
    }

    const gitStatus = await this.getGitStatus(this.nonGitDir)

    // 변경사항이 없으면 백업하지 않음
    if (!gitStatus.hasChanges) {
      await this.toast(`ℹ️ ${this.nonGitDir}에 변경사항이 없어 백업을 건너뜁니다.`)
      return
    }

    const curBranch = this.getCurrentBranch(this.nonGitDir)
    const today = this.getTodayDate()

    // 커밋이 없으면 먼저 빈 커밋을 생성
    if (!this.hasCommits(this.nonGitDir)) {
      try {
        this.executeCommand('git commit --allow-empty -m "Empty commit for branch creation"', this.nonGitDir)
        await this.toast(`✅ ${this.nonGitDir}에 브랜치 생성을 위한 빈 커밋이 생성되었습니다.`)
      } catch (error) {
        await this.toast(`❌ ${this.nonGitDir}에서 빈 커밋 생성 실패: ${error}`)
        return
      }
    }

    // backup-branch가 존재하지 않으면 생성
    if (!this.branchExists("backup-branch", this.nonGitDir)) {
      try {
        this.executeCommand("git branch backup-branch", this.nonGitDir)
        await this.toast(`✅ ${this.nonGitDir}에 backup-branch가 생성되었습니다.`)
      } catch (error) {
        await this.toast(`❌ ${this.nonGitDir}에서 backup-branch 생성 실패: ${error}`)
        return
      }
    }

    try {
      // 1. 현재 변경사항을 스테이징
      this.executeCommand("git add .", this.nonGitDir)
      await this.toast(`✅ ${this.nonGitDir}의 변경사항을 스테이징했습니다.`)

      // 2. backup-branch의 커밋 카운트 가져오기
      let commitCount: number
      try {
        const backupCommitCount = this.executeCommand("git rev-list --count backup-branch", this.nonGitDir).trim()
        commitCount = parseInt(backupCommitCount, 10) + 1
      } catch {
        commitCount = 1
      }

      // 3. 커밋 메시지 생성
      const commitMessage = `${today} - ${commitCount} - ${this.taskType}`

      // 4. 현재 스테이징된 변경사항으로 새로운 트리 생성하고 backup-branch에 커밋
      const treeHash = this.executeCommand("git write-tree", this.nonGitDir).trim()
      const parentCommit = this.branchExists("backup-branch", this.nonGitDir)
        ? this.executeCommand("git rev-parse backup-branch", this.nonGitDir).trim()
        : ""

      const commitHash = parentCommit
        ? this.executeCommand(
            `git commit-tree ${treeHash} -p ${parentCommit} -m "${commitMessage}"`,
            this.nonGitDir,
          ).trim()
        : this.executeCommand(`git commit-tree ${treeHash} -m "${commitMessage}"`, this.nonGitDir).trim()

      // 5. backup-branch 참조 업데이트
      this.executeCommand(`git update-ref refs/heads/backup-branch ${commitHash}`, this.nonGitDir)

      // 6. 스테이징 해제 (원본 파일들 유지)
      this.executeCommand("git reset HEAD", this.nonGitDir)

      await this.toast(`✅ ${this.nonGitDir} 백업 완료: backup-branch에 커밋 #${commitCount}`)
      await this.toast(`📝 커밋 메시지: ${commitMessage}`)
      await this.toast(`📝 현재 브랜치(${curBranch}) 파일들은 그대로 유지됩니다.`)
    } catch (error) {
      await this.toast(`❌ ${this.nonGitDir}에서 백업 실패: ${error}`)
      // 실패 시 스테이징 해제
      try {
        this.executeCommand("git reset HEAD", this.nonGitDir)
      } catch (resetError) {
        await this.toast(`❌ ${this.nonGitDir}에서 스테이징 해제 실패: ${resetError}`)
      }
    }
  }
}

// AI 자동 백업을 위한 함수 (코드 수정 전 실행)
function runAutoBackup(input: { parts?: { type: string; text?: string }[] }): Promise<void> {
  const textPart = input.parts?.find((p) => p.type === "text")
  const taskType = textPart?.text?.substring(0, 100) || "AI 자동 백업"

  // console.log("🔄 AI 자동 백업 시작 - 코드 수정 전 현재 상태 백업...")
  const backupScript = new AutoBackupScript({
    taskType,
  })
  return backupScript.run()
}

export { AutoBackupScript, runAutoBackup }
