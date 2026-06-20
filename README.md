# Ball Crown Arena

먹이를 먹어 레벨을 올리고, 자신보다 레벨이 낮은 공을 잡아먹어 왕관을 차지하는 Vite + Firebase 웹 게임입니다.

## 실행

```bash
npm install
npm run dev
```

Firebase 설정이 없어도 22개의 AI 공과 함께 로컬 모드로 바로 플레이할 수 있습니다.

## Firebase 연결

1. Firebase 콘솔에서 웹 앱을 추가합니다.
2. Authentication에서 **익명 로그인**을 활성화합니다.
3. Realtime Database를 생성합니다.
4. `.env.example`을 `.env`로 복사하고 프로젝트 값을 채웁니다.

프로젝트에 포함된 `database.rules.json`은 인증한 사용자에게 전체 플레이어 목록 읽기를 허용하고, 자신의 데이터만 쓰도록 제한합니다. 아래 명령으로 Hosting과 Database 규칙을 함께 배포할 수 있습니다.

```bash
npm run build
firebase deploy
```

환경 변수가 준비되면 접속 중인 플레이어의 이름, 위치, 레벨과 색상이 실시간으로 동기화됩니다. 연결이 실패하면 게임은 자동으로 로컬 모드로 전환됩니다.

## 조작

- 키보드: `WASD` 또는 방향키
- 마우스/터치: 움직일 방향으로 포인터 이동
- 같은 레벨끼리는 서로 먹을 수 없으며, 높은 레벨의 공만 낮은 레벨의 공을 먹을 수 있습니다.
