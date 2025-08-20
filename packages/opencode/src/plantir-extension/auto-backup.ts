#!/usr/bin/env node

import { execSync } from "child_process"
import { existsSync, writeFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"

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
      this.logWithBreak("🚀 자동 백업 스크립트 시작...")
      this.logWithBreak(`📝 작업 유형: ${this.taskType}`)
      if (this.nonGitDir) {
        this.logWithBreak(`📁 비Git 디렉터리: ${this.nonGitDir}`)
      }

      // 현재 디렉터리가 Git 저장소인지 확인
      if (this.isGitRepository(".")) {
        this.backupGitRepository()
      } else {
        this.logWithBreak("⚠️ 현재 디렉터리가 Git 저장소가 아닙니다. Git 저장소를 초기화합니다.")
        this.initializeGitRepository(".")
        this.backupGitRepository()
      }

      // 비Git 디렉터리 백업
      this.backupNonGitDirectory()

      this.logWithBreak("✅ 백업 작업이 완료되었습니다.")

      // 백업 완료 후 터미널 클리어
      setTimeout(() => {
        process.stdout.write("\x1B[2J\x1B[0f") // 터미널 클리어
      }, 2000)
    } catch (error) {
      this.logWithBreak(`❌ 백업 중 오류가 발생했습니다: ${error}`)
      process.exit(1)
    }
  }

  private logWithBreak(message: string): void {
    console.log(message + "</br>")
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

  private createGitignoreIfNotExists(dir: string): void {
    const gitignorePath = join(dir, ".gitignore")

    if (!existsSync(gitignorePath)) {
      try {
        writeFileSync(gitignorePath, this.gitignoreContent, "utf8")
        this.logWithBreak(`✅ .gitignore 파일이 생성되었습니다: ${gitignorePath}`)
      } catch (error) {
        this.logWithBreak(`❌ .gitignore 파일 생성 실패: ${error}`)
      }
    } else {
      this.logWithBreak(`ℹ️ .gitignore 파일이 이미 존재합니다: ${gitignorePath}`)
    }
  }

  private initializeGitRepository(dir: string): void {
    this.logWithBreak(`🔄 Git 저장소 초기화: ${dir}`)

    // Git 초기화
    this.executeCommand("git init", dir)

    // 기본 브랜치를 main으로 설정
    try {
      this.executeCommand("git branch -M main", dir)
    } catch {
      // Git 버전이 낮아서 -M 옵션을 지원하지 않는 경우
      this.logWithBreak("ℹ️ Git 버전이 낮아 기본 브랜치 설정을 건너뜁니다.")
    }

    // .gitignore 파일 생성
    this.createGitignoreIfNotExists(dir)

    // 초기 커밋 생성 (빈 커밋으로 브랜치 생성을 위해)
    try {
      this.executeCommand("git add .gitignore", dir)
      this.executeCommand('git commit -m "Initial commit"', dir)
      this.logWithBreak("✅ 초기 커밋이 생성되었습니다.")
    } catch (error) {
      this.logWithBreak(`⚠️ 초기 커밋 생성 중 오류: ${error}`)
    }

    // backup-branch 생성
    try {
      this.executeCommand("git checkout -b backup-branch", dir)
      this.executeCommand("git checkout main", dir)
      this.logWithBreak("✅ main 브랜치와 backup-branch가 생성되었습니다.")
    } catch (error) {
      this.logWithBreak(`⚠️ backup-branch 생성 중 오류: ${error}`)
    }

    this.logWithBreak(`✅ Git 저장소가 초기화되었습니다: ${dir}`)
    this.logWithBreak("📝 현재 브랜치: main, 백업 브랜치: backup-branch")
  }

  private getGitStatus(dir: string): GitStatus {
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

      this.logWithBreak(`🔍 Git 상태 확인: ${lines.length}개 변경사항, ${unstagedFiles.length}개 unstaged 파일`)

      return {
        hasChanges: lines.length > 0,
        stagedFiles,
        unstagedFiles,
      }
    } catch (error) {
      this.logWithBreak(`❌ Git 상태 확인 중 오류: ${error}`)
      return {
        hasChanges: false,
        stagedFiles: [],
        unstagedFiles: [],
      }
    }
  }

  private getCommitCount(dir: string): number {
    try {
      const count = this.executeCommand("git rev-list --count HEAD", dir)
      return parseInt(count.trim(), 10)
    } catch {
      return 0
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

  private getTodayDate(): string {
    const today = new Date()
    return today.toISOString().split("T")[0] // YYYY-MM-DD 형식
  }

  private backupGitRepository(): void {
    this.logWithBreak("🔄 Git 저장소 백업 시작...")

    const gitStatus = this.getGitStatus(".")

    // 변경사항이 없으면 백업하지 않음
    if (!gitStatus.hasChanges) {
      this.logWithBreak("ℹ️ 변경사항이 없어 백업을 건너뜁니다.")
      return
    }

    this.logWithBreak(`📝 변경사항 감지: ${gitStatus.unstagedFiles.length}개 파일`)

    const curBranch = this.getCurrentBranch(".")
    const today = this.getTodayDate()

    // backup-branch가 존재하지 않으면 생성
    if (!this.branchExists("backup-branch", ".")) {
      try {
        this.executeCommand("git branch backup-branch")
        this.logWithBreak("✅ backup-branch가 생성되었습니다.")
      } catch (error) {
        this.logWithBreak(`❌ backup-branch 생성 실패: ${error}`)
        return
      }
    }

    try {
      // 1. 현재 변경사항을 스테이징
      this.executeCommand("git add .")
      this.logWithBreak("✅ 변경사항을 스테이징했습니다.")

      // 2. backup-branch의 커밋 카운트 가져오기
      let commitCount: number
      try {
        const backupCommitCount = this.executeCommand("git rev-list --count backup-branch").trim()
        commitCount = parseInt(backupCommitCount, 10) + 1
      } catch {
        commitCount = 1
      }

      // 3. 커밋 메시지 생성
      const commitMessage = `${today} #${commitCount} - ${this.taskType}`

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

      this.logWithBreak(`✅ backup-branch에 백업 완료: 커밋 #${commitCount}`)
      this.logWithBreak(`📝 커밋 메시지: ${commitMessage}`)
      this.logWithBreak(`📝 현재 브랜치(${curBranch}) 파일들은 그대로 유지됩니다.`)
    } catch (error) {
      this.logWithBreak(`❌ 백업 실패: ${error}`)
      // 실패 시 스테이징 해제
      try {
        this.executeCommand("git reset HEAD")
      } catch (resetError) {
        this.logWithBreak(`❌ 스테이징 해제 실패: ${resetError}`)
      }
    }
  }

  private backupNonGitDirectory(): void {
    if (!this.nonGitDir || !existsSync(this.nonGitDir)) {
      this.logWithBreak("ℹ️ 비Git 디렉터리가 지정되지 않았거나 존재하지 않습니다.")
      return
    }

    this.logWithBreak(`🔄 비Git 디렉터리 백업 시작: ${this.nonGitDir}`)

    // Git 초기화 (이미 초기화되어 있지 않은 경우)
    if (!this.isGitRepository(this.nonGitDir)) {
      this.initializeGitRepository(this.nonGitDir)
    }

    const gitStatus = this.getGitStatus(this.nonGitDir)

    // 변경사항이 없으면 백업하지 않음
    if (!gitStatus.hasChanges) {
      this.logWithBreak(`ℹ️ ${this.nonGitDir}에 변경사항이 없어 백업을 건너뜁니다.`)
      return
    }

    const curBranch = this.getCurrentBranch(this.nonGitDir)
    const today = this.getTodayDate()

    // backup-branch가 존재하지 않으면 생성
    if (!this.branchExists("backup-branch", this.nonGitDir)) {
      try {
        this.executeCommand("git branch backup-branch", this.nonGitDir)
        this.logWithBreak(`✅ ${this.nonGitDir}에 backup-branch가 생성되었습니다.`)
      } catch (error) {
        this.logWithBreak(`❌ ${this.nonGitDir}에서 backup-branch 생성 실패: ${error}`)
        return
      }
    }

    try {
      // 1. 현재 변경사항을 스테이징
      this.executeCommand("git add .", this.nonGitDir)
      this.logWithBreak(`✅ ${this.nonGitDir}의 변경사항을 스테이징했습니다.`)

      // 2. backup-branch의 커밋 카운트 가져오기
      let commitCount: number
      try {
        const backupCommitCount = this.executeCommand("git rev-list --count backup-branch", this.nonGitDir).trim()
        commitCount = parseInt(backupCommitCount, 10) + 1
      } catch {
        commitCount = 1
      }

      // 3. 커밋 메시지 생성
      const commitMessage = `${today} #${commitCount} - ${this.taskType}`

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

      this.logWithBreak(`✅ ${this.nonGitDir} 백업 완료: backup-branch에 커밋 #${commitCount}`)
      this.logWithBreak(`📝 커밋 메시지: ${commitMessage}`)
      this.logWithBreak(`📝 현재 브랜치(${curBranch}) 파일들은 그대로 유지됩니다.`)
    } catch (error) {
      this.logWithBreak(`❌ ${this.nonGitDir}에서 백업 실패: ${error}`)
      // 실패 시 스테이징 해제
      try {
        this.executeCommand("git reset HEAD", this.nonGitDir)
      } catch (resetError) {
        this.logWithBreak(`❌ ${this.nonGitDir}에서 스테이징 해제 실패: ${resetError}`)
      }
    }
  }
}

// 메인 실행 부분
function main(): void {
  const args = process.argv.slice(2) // node와 script 경로 제외
  const taskType = args[0] || "사용자 요청사항"
  const nonGitDir = args[1]

  const backupScript = new AutoBackupScript({
    taskType,
    nonGitDir,
  })

  backupScript.run().catch((error) => {
    console.log(`❌ 스크립트 실행 중 오류: ${error}</br>`)
    process.exit(1)
  })
}

// 스크립트가 직접 실행될 때만 main 함수 호출
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main()
}

// AI 자동 백업을 위한 함수 (코드 수정 전 실행)
function runAutoBackup(input: { parts?: { type: string; text?: string }[] }): Promise<void> {
  const textPart = input.parts?.find((p) => p.type === "text")
  const taskType = textPart?.text?.substring(0, 100) || "AI 자동 백업"

  console.log("🔄 AI 자동 백업 시작 - 코드 수정 전 현재 상태 백업...</br>")
  const backupScript = new AutoBackupScript({
    taskType,
  })
  return backupScript.run()
}

export { AutoBackupScript, runAutoBackup }
