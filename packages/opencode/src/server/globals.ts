// 서버 전역 상태 관리
let serverUrl: string | null = null

export const ServerGlobals = {
  setServerUrl(url: string) {
    serverUrl = url
  },
  
  getServerUrl(): string | null {
    return serverUrl
  }
}
