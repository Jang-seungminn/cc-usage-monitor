# cc-usage-monitor

Claude API/구독 사용량을 모니터링하는 크로스플랫폼 데스크톱 앱 (macOS + Windows).

## 주요 기능

### 로그인 유형
- **구독형 (Pro/Team)**: API 키 없이 로컬 데이터 기반 사용량 확인
- **Personal API 키** (`sk-ant-`): 개인 API 사용량 및 비용 모니터링
- **Admin API 키** (`sk-ant-admin`): 조직 전체 멤버 사용량 경마 대시보드

### 구독형 대시보드
- 세션 사용률 + 리셋 카운트다운
- 주간 한도 사용률 + 리셋 카운트다운
- 번 레이트 (사용량/시간)
- 사용량 추이 차트 (세션 + 주간)
- 활동 히트맵

### Admin 대시보드 (경마 뷰)
- 조직 멤버 자동 조회 (Admin API 연동)
- 멤버별 API 사용량을 경마 형식으로 시각화
- 멤버 관리 (사용자 추가/제거)

### Personal 대시보드
- 일간/월간 API 비용
- 토큰 사용량

## 기술 스택

- **프레임워크**: Tauri v2 + React + TypeScript + Vite
- **백엔드**: Rust (Tauri IPC)
- **데이터 소스**:
  - 구독형: `~/.claude/cc-usage-monitor/statusline-state.json` (Claude Code 실시간 데이터)
  - API형: Anthropic API 직접 호출

## 개발 환경 설정

### 필수 요건
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (rustup)
- Tauri CLI: `cargo install tauri-cli`

### 실행

```bash
npm install
npm run tauri dev
```

### 빌드 (배포용)

```bash
npm run tauri build
```

빌드 결과물: `src-tauri/target/release/bundle/`

## CI/CD

GitHub Actions로 macOS (`.dmg`, `.app`) 및 Windows (`.msi`, `.exe`) 바이너리를 자동 빌드합니다.
태그 푸시 시 자동 릴리즈: `git tag v1.0.0 && git push --tags`

## IDE 설정

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
