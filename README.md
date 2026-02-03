# YouTube Trend Collector

YouTube 트렌드 키워드 수집기 - Node.js + SQLite + yt-dlp 기반

## 기능

- ✅ yt-dlp를 활용한 YouTube 트렌드 키워드 자동 수집
- ✅ SQLite에 데이터 영구 저장
- ✅ Docker Compose로 배포 환경 구성
- ✅ REST API 제공 (Fastify)
- ✅ 텔레그램 알림 연동
- ✅ node-cron 기반 스케줄링

## 기술 스택

- **Runtime**: Node.js 20+
- **Database**: SQLite + better-sqlite3
- **ORM**: Drizzle ORM
- **Crawling**: yt-dlp
- **Scheduling**: node-cron
- **API**: Fastify
- **Container**: Docker + Docker Compose

## 설치 및 실행

### 1. 환경변수 설정

```bash
cp .env.example .env
# .env 파일에 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 설정
```

### 2. Docker Compose로 실행

```bash
docker-compose up -d
```

### 3. 개발 모드로 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 수집 스크립트 실행
npm run collect
```

## API 엔드포인트

### Health Check
```
GET /api/health
```

### Keywords
```
GET  /api/keywords           # 키워드 목록
POST /api/keywords           # 키워드 추가
DELETE /api/keywords/:id     # 키워드 삭제
PATCH /api/keywords/:id/toggle  # 활성화/비활성화 토글
```

### Videos
```
GET /api/videos?keyword=xxx&days=7&limit=20  # 비디오 목록
```

### Trends
```
GET /api/trends?keyword=xxx&period=daily  # 트렌드 요약
```

### Collection
```
POST /api/collect/manual     # 수동 수집 트리거
GET  /api/summary?days=7     # 최근 요약
GET  /api/logs               # 수집 로그
GET  /api/scheduler/status   # 스케줄러 상태
```

## 프로젝트 구조

```
youtube-trend-collector/
├── src/
│   ├── index.ts              # 서버 진입점
│   ├── db/
│   │   ├── index.ts          # DB 연결
│   │   └── schema.ts         # 스키마 정의
│   ├── services/
│   │   ├── youtube.ts        # yt-dlp 래퍼
│   │   ├── collector.ts      # 수집 로직
│   │   ├── scheduler.ts      # 스케줄러
│   │   └── notifier.ts       # 텔레그램 알림
│   ├── routes/
│   │   └── index.ts          # API 라우트
│   └── scripts/
│       └── collect.ts        # 수집 스크립트
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| NODE_ENV | 실행 환경 | development |
| DATABASE_PATH | SQLite DB 경로 | ./data/trends.db |
| TELEGRAM_BOT_TOKEN | 텔레그램 봇 토큰 | - |
| TELEGRAM_CHAT_ID | 텔레그램 채팅 ID | - |
| PORT | 서버 포트 | 3000 |
| TZ | 시간대 | Asia/Seoul |

## 라이선스

MIT
