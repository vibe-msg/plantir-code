#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

interface BackupOptions {
  taskType: string; // feature, fix, refactor, bugfix, enhancement 등
  nonGitDir?: string;
}

interface GitStatus {
  hasChanges: boolean;
  stagedFiles: string[];
  unstagedFiles: string[];
}

class AutoBackupScript {
  private taskType: string;
  private nonGitDir?: string;
  private commitCounter: number = 0;
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
`;

  constructor(options: BackupOptions) {
    this.taskType = options.taskType;
    this.nonGitDir = options.nonGitDir;
    this.loadCommitCounter();
  }

  private executeCommand(command: string, cwd?: string): string {
    try {
      return execSync(command, {
        cwd,
        encoding: 'utf8',
        stdio: 'inherit',
      });
    } catch (error) {
      throw new Error(`명령어 실행 실패: ${command} - ${error}`);
    }
  }

  private isGitRepository(dir: string): boolean {
    return existsSync(join(dir, '.git'));
  }

  private createGitignoreIfNotExists(dir: string): void {
    const gitignorePath = join(dir, '.gitignore');

    if (!existsSync(gitignorePath)) {
      try {
        writeFileSync(gitignorePath, this.gitignoreContent, 'utf8');
        console.log(`✅ .gitignore 파일이 생성되었습니다: ${gitignorePath}`);
      } catch (error) {
        console.error(`❌ .gitignore 파일 생성 실패: ${error}`);
      }
    } else {
      console.log(`ℹ️ .gitignore 파일이 이미 존재합니다: ${gitignorePath}`);
    }
  }

  private getGitStatus(dir: string): GitStatus {
    try {
      const status = this.executeCommand('git status --porcelain', dir);
      const lines = status.split('\n').filter(line => line.trim());

      const stagedFiles: string[] = [];
      const unstagedFiles: string[] = [];

      lines.forEach(line => {
        const statusCode = line.substring(0, 2);
        const fileName = line.substring(3);

        if (
          statusCode.startsWith('M') ||
          statusCode.startsWith('A') ||
          statusCode.startsWith('D') ||
          statusCode.startsWith('??')
        ) {
          if (statusCode.charAt(1) === ' ') {
            unstagedFiles.push(fileName);
          } else {
            stagedFiles.push(fileName);
          }
        }
      });

      return {
        hasChanges: lines.length > 0,
        stagedFiles,
        unstagedFiles,
      };
    } catch {
      return {
        hasChanges: false,
        stagedFiles: [],
        unstagedFiles: [],
      };
    }
  }

  private getCommitCount(dir: string): number {
    try {
      const count = this.executeCommand('git rev-list --count HEAD', dir);
      return parseInt(count.trim(), 10);
    } catch {
      return 0;
    }
  }

  private getCurrentBranch(dir: string): string {
    try {
      return this.executeCommand('git rev-parse --abbrev-ref HEAD', dir).trim();
    } catch {
      return 'main';
    }
  }

  private getLastCommitDate(): string {
    try {
      const date = this.executeCommand('git log -1 --format=%cd --date=short');
      return date.trim();
    } catch {
      return '';
    }
  }

  private getTodayDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD 형식
  }

  private loadCommitCounter(): void {
    const counterFile = '.auto-backup-counter';
    if (existsSync(counterFile)) {
      try {
        const content = readFileSync(counterFile, 'utf8');
        this.commitCounter = parseInt(content.trim(), 10);
      } catch {
        this.commitCounter = 0;
      }
    }
  }

  private saveCommitCounter(): void {
    const counterFile = '.auto-backup-counter';
    writeFileSync(counterFile, this.commitCounter.toString(), 'utf8');
  }

  private incrementCommitCounter(): void {
    this.commitCounter++;
    this.saveCommitCounter();
  }

  private backupGitRepository(): void {
    console.log('🔄 Git 저장소 백업 시작...');

    // .gitignore 파일 생성 확인
    this.createGitignoreIfNotExists('.');

    const gitStatus = this.getGitStatus('.');

    // 변경사항이 있으면 백업 진행
    console.log(`📝 변경사항 감지: ${gitStatus.unstagedFiles.length}개 파일`);

    const curBranch = this.getCurrentBranch('.');
    const today = this.getTodayDate();
    const lastCommitDate = this.getLastCommitDate();

    // backup-branch가 존재하는지 확인하고 없으면 생성
    try {
      this.executeCommand('git show-branch backup-branch');
    } catch {
      // backup-branch가 없으면 생성
      this.executeCommand('git checkout -b backup-branch');
      this.executeCommand(`git checkout ${curBranch}`);
    }

    // backup-branch로 체크아웃
    this.executeCommand('git checkout backup-branch');

    // 변경사항 스테이징
    this.executeCommand('git add .');

    // 커밋 카운터 증가
    this.incrementCommitCounter();

    // 커밋 메시지 생성 - 같은 날짜면 생략, 아니면 날짜+번호+기능
    let commitMessage: string;
    if (lastCommitDate === today) {
      commitMessage = `Backup #${this.commitCounter} - ${this.taskType}`;
    } else {
      commitMessage = `${today} #${this.commitCounter} - ${this.taskType}`;
    }

    this.executeCommand(`git commit -m "${commitMessage}"`);

    // 원래 브랜치로 복귀 (충돌 무시)
    try {
      this.executeCommand(`git checkout ${curBranch}`);
    } catch {
      this.executeCommand('git checkout main');
    }

    console.log(`✅ Git 백업 완료: 브랜치 backup-branch, 커밋 #${this.commitCounter}`);
    console.log(`📝 커밋 메시지: ${commitMessage}`);
  }

  private backupNonGitDirectory(): void {
    if (!this.nonGitDir || !existsSync(this.nonGitDir)) {
      console.log(`ℹ️ 비Git 디렉터리가 지정되지 않았거나 존재하지 않습니다.`);
      return;
    }

    console.log(`🔄 비Git 디렉터리 백업 시작: ${this.nonGitDir}`);

    // Git 초기화 (이미 초기화되어 있지 않은 경우)
    if (!this.isGitRepository(this.nonGitDir)) {
      this.executeCommand('git init', this.nonGitDir);
      console.log(`✅ Git 저장소가 초기화되었습니다: ${this.nonGitDir}`);
    }

    // .gitignore 파일 생성 확인
    this.createGitignoreIfNotExists(this.nonGitDir);

    // 전체 파일을 스테이징
    this.executeCommand('git add .', this.nonGitDir);

    // 커밋 개수 구하기 (초기 커밋인 경우 1로 설정)
    let commitCount = this.getCommitCount(this.nonGitDir);
    if (commitCount === 0) {
      commitCount = 1;
    }

    // 커밋 메시지에 작업 유형 포함
    const commitMessage = `Backup #${commitCount} (${this.taskType}) - 전체 저장 후 작업 상태`;
    this.executeCommand(`git commit -m "${commitMessage}"`, this.nonGitDir);

    console.log(`✅ Git 관리되지 않는 디렉터리가 백업되었습니다: ${this.nonGitDir}`);
    console.log(`📝 커밋 번호: ${commitCount}, 작업 유형: ${this.taskType}`);
  }

  public async run(): Promise<void> {
    try {
      console.log('🚀 자동 백업 스크립트 시작...');
      console.log(`📝 작업 유형: ${this.taskType}`);
      if (this.nonGitDir) {
        console.log(`📁 비Git 디렉터리: ${this.nonGitDir}`);
      }

      // 현재 디렉터리가 Git 저장소인지 확인
      if (this.isGitRepository('.')) {
        this.backupGitRepository();
      } else {
        console.log('⚠️ 이 스크립트는 git 저장소 내에서 실행해야 합니다.');
        return;
      }

      // 비Git 디렉터리 백업
      this.backupNonGitDirectory();

      console.log('✅ 백업 작업이 완료되었습니다.');
    } catch (error) {
      console.error('❌ 백업 중 오류가 발생했습니다:', error);
      process.exit(1);
    }
  }
}

// 메인 실행 부분
function main(): void {
  const args = process.argv.slice(2);
  const taskType = args[0] || 'New Chat';
  const nonGitDir = args[1];

  const backupScript = new AutoBackupScript({
    taskType,
    nonGitDir,
  });

  backupScript.run().catch(error => {
    console.error('❌ 스크립트 실행 중 오류:', error);
    process.exit(1);
  });
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
  main();
}

export { AutoBackupScript };
