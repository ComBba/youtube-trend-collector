# YouTube Trend Collector - Architecture

> 프로젝트 아키텍처 설계 문서  
> 버전: 1.0.0  
> 작성일: 2026-02-03

---

## 1. 개요

### 1.1 프로젝트 목표
- YouTube 트렌드 키워드 자동 수집 (yt-dlp 활용)
- SQLite 기반 데이터 영구 저장
- REST API 제공 (Fastify)
- Docker Compose 기반 배포
- 기존 Telegram 알림 유지

### 1.2 기술 스택 확정

| 영역 | 기술 | 선택 이유 |
|:---|:---|:---|
| 런타임 | Node.js 20+ LTS | 안정성, yt-dlp 친화적 |
| 언어 | TypeScript 5.x | 타입 안전성, 유지보수성 |
| DB | SQLite 3 | 파일 기반, 경량, 백업 용이 |
| ORM | **Drizzle ORM** | 타입 안전, SQL-like 문법, 번들 사이즈 작음 |
| API Framework | **Fastify** | Express 대비 20% 빠름, JSON 스키마 유효성 검증 |
| 크롤링 | yt-dlp (child_process) | 검증된 솔루션 |
| 스케줄링 | **node-cron** | BullMQ 대비 Redis 불필요, 단일 인스턴스에 적합 |
| 로깅 | pino (Fastify 기본) | 고성능 JSON 로깅 |
| 검증 | Zod | 런타입 타입 검증, OpenAPI 연동 가능 |

### 1.3 Drizzle vs Prisma 선정 이유

| 항목 | Drizzle | Prisma |
|:---|:---|:---|
| 마이그레이션 | SQL 기반, 제어 가능 | 자동, 블랙박스 |
| 번들 사이즈 | ~50KB | ~15MB |
| 쿼리 제어 | SQL-like, 투명 | ORM 레이어 추상화 |
| SQLite 성능 | Native driver 직접 사용 | Prisma 엔진 오버헤드 |

→ **SQLite 단일 파일 환경에 최적화된 Drizzle 선택**

---

## 2. 시스템 아키텍처

### 2.1 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Container                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Fastify   │  │ node-cron   │  │    yt-dlp (CLI)     │ │
│  │   Server    │  │ Scheduler   │  │                     │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘ │
│         │                │                                  │
│         └────────────────┼────────────────┐                 │
│                          ▼                ▼                 │
│                   ┌─────────────┐  ┌─────────────┐         │
│                   │   Drizzle   │  │    pino     │         │
│                   │    ORM      │  │   Logger    │         │
│                   └──────┬──────┘  └─────────────┘         │
│                          │                                  │
│                   ┌──────┴──────┐                          │
│                   │   SQLite    │                          │
│                   │  (/data/)   │                          │
│                   └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Telegram Bot   │
                    │  (Notification) │
                    └─────────────────┘
```

### 2.2 데이터 흐름

```
1. 수동/자동 트리거 ──► Collector Service
                              │
                              ▼
2. yt-dlp 실행 ────► JSON 파싱 ────► Video DTO
                              │
                              ▼
3. Drizzle ORM ────► SQLite INSERT/UPDATE
                              │
                              ▼
4. Notifier Service ────► Telegram 메시지 전송
```

---

## 3. 데이터베이스 스키마

### 3.1 ERD

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    keywords     │────<│     videos      │────>│     trends      │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ name (UQ)       │     │ video_id (UQ)   │     │ keyword_id (FK) │
│ category        │     │ keyword_id (FK) │     │ date            │
│ is_active       │     │ title           │     │ video_count     │
│ created_at      │     │ url             │     │ total_views     │
└─────────────────┘     │ channel_name    │     │ top_video_id(FK)│
                        │ view_count      │     │ created_at      │
                        │ published_at    │     └─────────────────┘
                        │ collected_at    │
                        └─────────────────┘

┌─────────────────┐
│collection_logs  │
├─────────────────┤
│ id (PK)         │
│ started_at      │
│ completed_at    │
│ keyword_count   │
│ video_count     │
│ status          │
│ error_message   │
└─────────────────┘
```

### 3.2 Drizzle Schema 정의

```typescript
// src/db/schema.ts

export const keywords = sqliteTable('keywords', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
  category: text('category'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const videos = sqliteTable('videos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  videoId: text('video_id').unique().notNull(),
  keywordId: integer('keyword_id').references(() => keywords.id),
  title: text('title').notNull(),
  url: text('url').notNull(),
  channelName: text('channel_name'),
  viewCount: integer('view_count'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  collectedAt: integer('collected_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const trends = sqliteTable('trends', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  keywordId: integer('keyword_id').references(() => keywords.id),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  videoCount: integer('video_count').default(0),
  totalViews: integer('total_views').default(0),
  topVideoId: integer('top_video_id').references(() => videos.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const collectionLogs = sqliteTable('collection_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  keywordCount: integer('keyword_count'),
  videoCount: integer('video_count'),
  status: text('status').$type<'success' | 'partial' | 'failed'>(),
  errorMessage: text('error_message'),
});
```

---

## 4. API 설계

### 4.1 엔드포인트 목록

| Method | Path | 설명 |
|:---|:---|:---|
| GET | `/health` | 헬스 체크 |
| GET | `/api/keywords` | 키워드 목록 조회 |
| POST | `/api/keywords` | 키워드 추가 |
| DELETE | `/api/keywords/:id` | 키워드 삭제 (soft delete 고려) |
| GET | `/api/videos` | 비디오 목록 (필터: keyword, days, limit) |
| GET | `/api/videos/:id` | 비디오 상세 조회 |
| GET | `/api/trends` | 트렌드 요약 (daily/weekly) |
| POST | `/api/collect` | 수동 수집 트리거 |
| GET | `/api/collect/status` | 수집 상태 조회 |
| GET | `/api/logs` | 수집 로그 조회 |

### 4.2 주요 요청/응답 예시

```typescript
// POST /api/keywords
interface CreateKeywordRequest {
  name: string;
  category?: string;
}

// GET /api/videos?keyword=react&days=7&limit=50
interface ListVideosQuery {
  keyword?: string;
  days?: number;      // 기본: 7
  limit?: number;     // 기본: 50, 최대: 200
  offset?: number;    // 기본: 0
}

// GET /api/trends?keyword=react&period=weekly
interface GetTrendsQuery {
  keyword: string;
  period: 'daily' | 'weekly' | 'monthly';
}
```

---

## 5. 프로젝트 구조

```
youtube-trend-collector/
├── 📄 Dockerfile                 # 멀티 스테이지 빌드
├── 📄 docker-compose.yml         # 프로덕션 배포 구성
├── 📄 docker-compose.dev.yml     # 개발 환경 구성
├── 📄 package.json
├── 📄 tsconfig.json
├── 📄 .env.example
│
├── 📁 src/
│   ├── 📄 index.ts               # 진입점: 서버 + 스케줄러 초기화
│   │
│   ├── 📁 config/
│   │   ├── 📄 env.ts             # 환경 변수 검증 (Zod)
│   │   └── 📄 database.ts        # Drizzle 연결 설정
│   │
│   ├── 📁 db/
│   │   ├── 📄 schema.ts          # 테이블 정의
│   │   ├── 📄 migrations/        # 마이그레이션 파일
│   │   └── 📄 seed.ts            # 초기 데이터 시드
│   │
│   ├── 📁 services/
│   │   ├── 📄 collector.ts       # yt-dlp 수집 로직
│   │   ├── 📄 scheduler.ts       # node-cron 래퍼
│   │   ├── 📄 notifier.ts        # Telegram 알림
│   │   └── 📄 trend-analyzer.ts  # 트렌드 집계 계산
│   │
│   ├── 📁 routes/
│   │   ├── 📄 health.ts          # 헬스 체크
│   │   ├── 📄 keywords.ts        # 키워드 CRUD
│   │   ├── 📄 videos.ts          # 비디오 조회
│   │   ├── 📄 trends.ts          # 트렌드 조회
│   │   └── 📄 collect.ts         # 수집 트리거/상태
│   │
│   ├── 📁 models/
│   │   ├── 📄 types.ts           # 공통 타입 정의
│   │   └── 📄 dto.ts             # API DTO (Zod 스키마)
│   │
│   └── 📁 utils/
│       ├── 📄 logger.ts          # pino 로거 설정
│       ├── 📄 errors.ts          # 커스텀 에러 클래스
│       └── 📄 validators.ts      # 유효성 검증 헬퍼
│
├── 📁 scripts/
│   ├── 📄 migrate.ts             # 마이그레이션 실행
│   └── 📄 seed-keywords.ts       # 초기 키워드 삽입
│
└── 📁 data/                      # SQLite DB 저장소 (.gitignore)
    └── 📄 .gitkeep
```

---

## 6. Docker 구성

### 6.1 Dockerfile (멀티 스테이지)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
RUN apk add --no-cache python3 py3-pip ffmpeg
RUN pip3 install yt-dlp --break-system-packages

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/trends.db

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### 6.2 docker-compose.yml (수정된 버전)

> ⚠️ **중요**: 명세의 cron 설정은 잘못된 문법입니다. 아래는 올바른 구성입니다.

```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: youtube-trend-collector
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/trends.db
      - TZ=Asia/Seoul
      # 스케줄링 설정 (앱 내부 node-cron에서 사용)
      - COLLECT_SCHEDULE=0 9 * * *  # 매일 오전 9시
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

---

## 7. 주요 개선사항 및 위험요소

### 7.1 명세 대비 개선사항

| # | 항목 | 개선 내용 | 우선순위 |
|:---|:---|:---|:---:|
| 1 | **Docker Compose cron** | 명세의 `cron:` 필드는 잘못된 문법. 앱 내부 node-cron 사용 | 🔴 High |
| 2 | **DB 마이그레이션** | Drizzle 마이그레이션 CLI 설정 필요 | 🔴 High |
| 3 | **에러 처리** | yt-dlp 실패 시 재시도 로직 + 로그 기록 | 🟡 Medium |
| 4 | **동시성** | SQLite는 동시 쓰기 제한 있음. 큐 기반 처리 권장 | 🟡 Medium |
| 5 | **로깅** | pino + 로테이션 설정 | 🟡 Medium |
| 6 | **백업** | SQLite 파일 백업 전략 (주기적 복사 또는 litestream) | 🟢 Low |

### 7.2 위험요소 및 대응

| 위험요소 | 영향도 | 대응 방안 |
|:---|:---:|:---|
| yt-dlp 구조 변경 | High | 파싱 로직 추상화, 테스트 커버리지 확보 |
| YouTube 차단 | High | User-Agent 로테이션, 요청 간격 설정 |
| SQLite WAL 파일 손상 | Medium | 주기적 백업, `PRAGMA integrity_check` |
| 메모리 누수 (장기 실행) | Medium | --max-old-space-size 설정, PM2 고려 |
| 타임존 문제 | Low | TZ=Asia/Seoul 고정, 모든 시간 UTC 저장 |

---

## 8. 구현 체크리스트

### Phase 1: 기본 구조 (Day 1)
- [ ] 프로젝트 초기화 (package.json, tsconfig.json)
- [ ] Drizzle ORM 설정 + 마이그레이션
- [ ] Docker 환경 구성
- [ ] 기본 Fastify 서버 + 헬스 체크

### Phase 2: 핵심 기능 (Day 2-3)
- [ ] yt-dlp 수집 서비스 구현
- [ ] 키워드 CRUD API
- [ ] 비디오 조회 API
- [ ] Telegram 알림 연동

### Phase 3: 스케줄링 & 개선 (Day 4)
- [ ] node-cron 스케줄러
- [ ] 트렌드 집계 로직
- [ ] 수집 로그 기록
- [ ] 에러 처리 및 재시도

### Phase 4: 배포 준비 (Day 5)
- [ ] docker-compose 테스트
- [ ] 환경 변수 문서화
- [ ] README 작성

---

## 9. 환경 변수

```bash
# .env.example
NODE_ENV=production
PORT=3000
DATABASE_PATH=/app/data/trends.db

# 스케줄링
COLLECT_SCHEDULE=0 9 * * *

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# yt-dlp 설정
YT_DLP_TIMEOUT_MS=60000
YT_DLP_MAX_RESULTS=50
```

---

## 10. 참고 자료

- [Drizzle ORM SQLite Docs](https://orm.drizzle.team/docs/get-started/sqlite-new)
- [Fastify Docs](https://fastify.dev/docs/latest/)
- [yt-dlp Options](https://github.com/yt-dlp/yt-dlp#usage-and-options)
- [node-cron](https://www.npmjs.com/package/node-cron)

---

**문서 버전 관리**
| 버전 | 날짜 | 작성자 | 변경 내용 |
|:---|:---|:---|:---|
| 1.0.0 | 2026-02-03 | architect | 초기 작성 |
