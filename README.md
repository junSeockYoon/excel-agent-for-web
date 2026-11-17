# excel-helper (excel_agent)

Excel/CSV를 올리면 시트를 화면 테이블로 보고, DeepSeek 사이드 챗으로 질문하는 로컬 워크벤치입니다.

**현재: Phase 2** — 업로드 · 세션 · 시트 테이블 · DeepSeek 시트 챗

## 요구 사항

- Node.js LTS (권장 20+)
- Windows 10/11 (PowerShell 또는 cmd)
- 챗 사용 시 DeepSeek API 키

## 빠른 시작 (Windows)

```powershell
cd c:\Project\excel-helper
copy .env.example .env
notepad .env
npm install
npm run dev
```

- API 서버: http://localhost:3000  
- Vite 프론트(개발): http://localhost:5173 (API는 `/api`로 프록시)

브라우저에서 http://localhost:5173 을 열고 `.xlsx` / `.xls` / `.csv`를 올린 뒤 오른쪽 챗에 질문하세요.

### DeepSeek API 키 설정

1. [DeepSeek Platform](https://platform.deepseek.com/)에서 API 키를 발급합니다.
2. 프로젝트 루트 `.env`를 열고 **로컬에서만** 다음을 채웁니다.

```env
DEEPSEEK_API_KEY=sk-여기에_본인_키
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

3. **서버를 반드시 재시작**합니다 (`npm run dev` 또는 `npm run dev:server`).  
   `node --watch`는 `.js` 변경만 감지합니다. `.env`만 고치면 프로세스가 옛 키 상태를 유지할 수 있습니다.
4. 키가 없으면 업로드·테이블은 동작하고, 챗은 `DEEPSEEK_NOT_CONFIGURED` / 안내 문구로 거절합니다.

**주의:** 실제 키를 git에 커밋하지 마세요. `.env`는 `.gitignore`에 포함되어 있습니다. 채팅창에 키를 붙여 넣지 마세요.

### 프로덕션 빌드

```powershell
npm run build
npm start
```

`npm start`는 `client/dist`를 Express가 함께 서빙합니다 (포트 `PORT`, 기본 3000).

## API

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/upload` | multipart `file` → 파싱·세션 |
| GET | `/api/sheets` | 시트 목록·컬럼·행수 |
| GET | `/api/sheets/:sheetId` | 단일 시트 meta |
| GET | `/api/sheets/:sheetId/rows?offset=&limit=&q=` | 페이지 행 |
| PUT | `/api/session/active-sheet` | 활성 시트 전환 |
| GET | `/api/session` | 세션 조회 |
| DELETE | `/api/session` | 세션·업로드 삭제 |
| GET | `/api/chat/status` | DeepSeek 설정 여부 |
| POST | `/api/chat` | `{ message, sheetId? }` → `{ answer, grounding }` |

세션은 `X-Session-Id` 헤더 또는 `sessionId` HttpOnly 쿠키로 식별합니다.

## 환경 변수

`.env.example`을 참고하세요. 테이블만 쓰려면 키 없이도 기동됩니다. 챗은 `DEEPSEEK_API_KEY`가 필요합니다.

## 한도 (기본)

- 파일 ≤ 10 MB
- 세션 TTL 2시간 (유휴)
- 시트당 최대 5,000행 메모리 보관 (초과 시 truncate)
- 챗 컨텍스트: 스키마 + 통계 + 샘플 행(기본 30)만 전송 (전체 시트 덤프 금지)

## 프라이버시

업로드 원본은 `uploads/<sessionId>/`에 잠시 보관되며 TTL 후 삭제됩니다. 챗 사용 시 질문과 시트 샘플·요약이 **DeepSeek 외부 API**로 전송됩니다. 키는 서버 `.env`에만 두고 클라이언트에 노출하지 않습니다.

## 스모크 테스트

```powershell
node scripts/smoke-upload.mjs
node scripts/smoke-chat.mjs
node scripts/smoke-evidence.mjs
```

키가 없으면 `smoke-chat.mjs`는 설정 누락(503) 경로를 확인합니다.

### 근거 하이라이트 사용법

1. 파일을 업로드합니다.
2. 챗에서 「매출이 가장 큰 행은?」처럼 묻습니다.
3. 답변 아래 **근거** 칩(예: `행 3 · 매출`)을 클릭하면 테이블이 해당 행으로 스크롤되며 강조됩니다.

### 챗 품질 기능 (Phase 2+)

- 합계/평균/순위/이상치는 **서버가 계산**한 뒤 모델이 설명합니다.
- 모호하면 한 번 확인 질문을 합니다. 없는 컬럼은 “데이터에 없습니다”.
- 후속 질문(예: 「그건 상위 3개만」)은 이전 맥락을 이어받습니다.
- 시트 스키마 기반 **추천 질문 칩**을 클릭해 바로 보낼 수 있습니다.

```powershell
node scripts/smoke-chat-quality.mjs
node scripts/smoke-charts.mjs
```

### 분석 차트

업로드/시트 전환 후 테이블 위에 **분포 미리보기** 막대·도넛 차트가 뜹니다 (구분·경로·부서 등 범주 열 1–3개).  
챗의 순위/빈도 답변에도 작은 막대 차트가 붙습니다.

### 보기 탭 (표 / 분석)

업로드 후 본문은 **표** | **분석** 탭으로 나뉩니다.  
기본은 **표**(데이터 바로 확인). **분석**에서 시트 개요·분포 차트를 봅니다.  
챗 근거 칩을 누르면 자동으로 **표** 탭으로 전환한 뒤 해당 행을 강조합니다.

### 여러 시트

- 상단 시트 탭·개요에서 전환하면 차트/테이블이 활성 시트를 따릅니다.
- 챗 기본 범위는 **활성 시트**입니다.
- 「매출 시트 요약」, 「모든 시트 요약」, 「다른 시트도 요약」처럼 범위를 말할 수 있습니다.
- 시트가 2개 이상이면 근거 칩에 시트명이 붙습니다.

```powershell
node scripts/smoke-multi-sheet.mjs
```
