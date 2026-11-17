# excel_agent

**엑셀을 올리면 표·차트로 보고, DeepSeek 챗으로 근거 있는 답을 받는 업무 자동화 워크벤치**

업무용 스프레드시트를 “열어 찾기” 대신 **업로드 → 탐색 → 질문 → 행 근거 확인** 흐름으로 줄이는 풀스택 웹 앱입니다.  
(바이브코딩으로 구현한 업무 자동화 경험용 포트폴리오 프로젝트)

---

## Features

- **파일 업로드** — `.xlsx` / `.xls` / `.csv` → 시트 파싱·세션 생성 (SheetJS). 제목행·병합·다중 헤더가 있는 업무용 엑셀도 헤더 행을 자동 탐지
- **멀티 시트** — 시트 탭·개요 전환, 챗에서 활성/지정/전체 시트 범위 질의
- **표 / 분석 탭** — **표**는 전체 viewport 테이블, **분석**은 시트 개요 + 분포 차트
- **차트** — Recharts 범주 분포(막대·도넛), 챗 순위/빈도 미니 차트
- **DeepSeek 챗** — 사이드 패널 Q&A, 추천 질문 칩, 후속 맥락 유지
- **서버 집계** — 합계·평균·순위 등은 서버가 계산 후 모델이 설명 (환각 완화)
- **근거(Evidence) 하이라이트** — 답변 칩 클릭 → **표** 탭 전환 + 해당 행 스크롤/강조
- **Markdown 답변** — 안전한 렌더링(`react-markdown` + GFM, HTML skip)

---

## Stack

| 영역 | 기술 |
|------|------|
| Backend | Node.js, Express (MVC: routes / controllers / services) |
| Frontend | Vite + React SPA |
| Excel | SheetJS (`xlsx`), Multer 업로드 |
| LLM | DeepSeek OpenAI-compatible Chat API |
| Charts | Recharts |
| Deploy | Vercel 설정 포함 (`dist` + serverless API 래퍼) · 안정형은 Railway/Render/Fly 권장 |

---

## Screenshots

> 스크린샷을 추가하려면 `docs/`에 이미지를 넣고 아래 경로를 채우세요.

| 화면 | 미리보기 |
|------|----------|
| 업로드 / 랜딩 | *(add screenshot: `docs/shot-landing.png`)* |
| 표 탭 + 챗 | *(add screenshot: `docs/shot-table-chat.png`)* |
| 분석 탭 차트 | *(add screenshot: `docs/shot-analysis.png`)* |
| 근거 하이라이트 | *(add screenshot: `docs/shot-evidence.png`)* |

---

## Local setup

**요구:** Node.js **20+** (개발 환경 예시: v24), npm

```powershell
git clone https://github.com/junSeockYoon/excel-agent-for-web.git
cd excel-agent-for-web
copy .env.example .env
npm install
npm run dev
```

- 프론트(개발): http://localhost:5173 (`/api` → 3000 프록시)
- API: http://localhost:3000

### `.env`

```env
DEEPSEEK_API_KEY=sk-your-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

키는 [DeepSeek Platform](https://platform.deepseek.com/)에서 발급합니다.  
없으면 업로드·표는 되고, 챗만 설정 안내로 거절됩니다.  
`.env`만 바꾼 뒤에는 **서버 재시작**이 필요합니다 (`node --watch`는 `.js` 변경만 감지).

### 프로덕션(로컬)

```powershell
npm run build   # → 루트 dist/
npm start       # Express가 dist + API 서빙 (PORT, 기본 3000)
```

---

## Scripts

| 명령 | 설명 |
|------|------|
| `npm run dev` | API + Vite 동시 실행 |
| `npm run build` | Vite → `dist/` |
| `npm start` | 프로덕션 Express |

스모크 (서버 기동 후):

```powershell
node scripts/smoke-upload.mjs
node scripts/smoke-chat.mjs
node scripts/smoke-evidence.mjs
node scripts/smoke-chat-quality.mjs
node scripts/smoke-charts.mjs
node scripts/smoke-multi-sheet.mjs
node scripts/smoke-main-tabs.mjs
```

---

## Deploy

### Vercel

| 설정 | 값 |
|------|-----|
| Root Directory | `.` |
| Build Command | `npm run build` |
| Output Directory | **`dist`** |
| Install | `npm install` |
| Environment | `DEEPSEEK_API_KEY` (선택: `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`) |

`vercel.json`이 build/output과 `/api` 리라이트를 지정합니다.  
정적 프론트 + `api/index.js`로 Express를 서버리스에 감쌉니다.

**주의:** 세션은 **인메모리**, 업로드는 Vercel에서 **`/tmp`(비영속)** 입니다.  
콜드스타트·인스턴스 분산 시 세션이 끊길 수 있고, 요청 크기·실행 시간 한도가 있습니다.

### 더 안정적인 호스팅

장수명 Node 프로세스에 맞게 **Railway / Render / Fly.io** 등에서:

```bash
npm run build && npm start
```

환경 변수에 `DEEPSEEK_API_KEY`를 넣으면 됩니다.

---

## Architecture

```
excel-helper/
├── api/                 # Vercel serverless 엔트리 (Express 래퍼)
├── client/              # Vite React SPA
│   └── src/
│       ├── components/  # DataTable, ChatPanel, Charts, …
│       ├── hooks/       # useSession, useChat
│       └── styles/
├── server/              # Express MVC
│   ├── controllers/
│   ├── routes/
│   ├── services/        # parse, aggregates, DeepSeek, evidence, …
│   └── middleware/
├── scripts/             # smoke-*.mjs
├── dist/                # build 산출물 (gitignore)
├── vercel.json
└── package.json
```

**흐름:** Upload → in-memory session + sheet rows → 표/분석 UI  
Chat → intent/context pack → (서버 aggregates) → DeepSeek → evidence chips → 표 하이라이트

---

## Security & privacy

- **`.env`는 절대 커밋하지 마세요** (`.gitignore`에 포함). 키를 채팅/이슈에 붙이지 마세요.
- API 키는 서버에서만 읽고 클라이언트로 내려보내지 않습니다.
- 업로드는 세션 디렉터리에 잠시 보관 후 TTL 정리됩니다.
- 챗 시 질문·시트 샘플/요약이 **DeepSeek 외부 API**로 전송됩니다. 민감 데이터는 주의하세요.

---

## License

개인/포트폴리오 용도로 공개된 프로젝트입니다.  
별도 라이선스 파일이 없으면 **사용·참고 전 저장소 소유자에게 확인**하세요.
