# YouTube Trend Collector - 코드 리뷰 보고서

**리뷰 일자:** 2026-02-03  
**리뷰어:** OpenClaw Reviewer  
**버전:** 1.0.0

---

## 📊 요약

| 카테고리 | 등급 | 주요 이슈 |
|:---|:---:|:---|
| 코드 품질 | 🟡 Good | 타입 단언 사용, 일부 반환 타입 누락 |
| 보안 | 🟡 Medium | CORS 와일드카드, 입력 검증 개선 필요 |
| 에러 핸들링 | 🟡 Good | 일부 에러 처리 누락, 재시도 로직 부재 |
| API 설계 | 🟢 Good | RESTful 준수, 일부 개선 가능 |
| Docker 설정 | 🔴 Critical | Healthcheck 실패, 비효율적 구조 |
| 문서화 | 🟢 Good | README 충실, ARCHITECTURE 상세 |

---

## 1. 코드 품질 (TypeScript 베스트 프랙티스)

### 🔴 Critical

없음

### 🟡 Medium

#### 1.1 타입 단언(as) 과다 사용
**위치:** `src/routes/index.ts`, `src/index.ts`

```typescript
// AS-IS
const limit = parseInt((req.body as any)?.limit) || 10;
const days = parseInt((req.query as any).days) || 7;
```

**문제:**
- Zod로 검증 후에도 `as any` 사용으로 타입 안전성이 떨어짐
- Fastify의 Type Provider를 활용하지 않음

**개선 제안:**
```typescript
// TO-BE: Fastify Type Provider 사용
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.withTypeProvider<ZodTypeProvider>().get('/api/videos', {
  schema: {
    querystring: listVideosQuerySchema,
  },
}, async (req, reply) => {
  // req.query는 자동으로 타입 추론됨
  const { days, limit } = req.query;
});
```

#### 1.2 함수 반환 타입 명시 부족
**위치:** `src/services/collector.ts`, `src/scripts/collect.ts`

```typescript
// AS-IS
export async function getRecentSummary(days: number = 7) {  // 반환 타입 없음
async function main() {  // 반환 타입 없음
```

**개선 제안:**
```typescript
// TO-BE
interface SummaryResult {
  period: string;
  totalVideos: number;
  totalViews: number;
  collectionRuns: number;
  keywordBreakdown: Array<{
    id: number;
    name: string;
    videosCount: number;
  }>;
}

export async function getRecentSummary(days: number = 7): Promise<SummaryResult> {
  // ...
}
```

#### 1.3 사용하지 않는 import
**위치:** `src/services/youtube.ts`

```typescript
import { promisify } from 'util';  // 사용되지 않음
```

---

## 2. 보안 (Security)

### 🔴 Critical

#### 2.1 CORS Origin 와일드카드
**위치:** `src/index.ts:29`

```typescript
await app.register(cors, {
  origin: '*',  // 모든 출처 허용 - 위험
});
```

**위험도:** High  
**문제:** 
- 모든 도메인에서 API 호출 가능
- CSRF 공격 가능성
- 프로덕션 환경에서 위험

**개선 제안:**
```typescript
await app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
});
```

### 🟡 Medium

#### 2.2 LIKE 쿼리 와일드카드 문자 미이스케이프
**위치:** `src/routes/index.ts`

```typescript
like(keywords.name, `%${keyword}%`)
```

**문제:**
- `%`, `_`, `[` 등의 특수문자가 사용자 입력에 포함될 수 있음
- 의도하지 않은 와일드카드 매칭 발생 가능

**개선 제안:**
```typescript
function escapeLikePattern(str: string): string {
  return str.replace(/[%_[\]]/g, '\\$&');
}

like(keywords.name, `%${escapeLikePattern(keyword)}%`)
```

#### 2.3 환경 변수 검증 부재
**위치:** `src/index.ts`, `src/services/notifier.ts`

**문제:**
- `PORT`, `DATABASE_PATH` 등 필수 환경 변수 검증 없음
- 잘못된 값으로 인한 런타임 에러 가능성

**개선 제안:**
```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_PATH: z.string().default('./data/trends.db'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);
```

---

## 3. 에러 핸들링

### 🔴 Critical

없음

### 🟡 Medium

#### 3.1 yt-dlp stderr 무시
**위치:** `src/services/youtube.ts`

```typescript
ytDlp.stderr.on('data', (data: Buffer) => {
  console.debug('yt-dlp stderr:', data.toString().trim());
});
```

**문제:**
- YouTube 차단, 네트워크 오류 등의 심각한 에러를 무시함
- stderr에 실제 에러 정보가 포함될 수 있음

**개선 제안:**
```typescript
let stderrBuffer = '';

ytDlp.stderr.on('data', (data: Buffer) => {
  stderrBuffer += data.toString();
});

ytDlp.on('close', (code) => {
  if (code !== 0 && videos.length === 0) {
    reject(new Error(`yt-dlp failed (exit ${code}): ${stderrBuffer || 'Unknown error'}`));
  } else {
    resolve(videos);
  }
});
```

#### 3.2 알림 실패 시 무시
**위치:** `src/services/notifier.ts`

```typescript
try {
  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  return true;
} catch (error) {
  console.error('Failed to send Telegram notification:', error);
  return false;  // 실패해도 상위에서 처리하지 않음
}
```

**문제:**
- 알림 실패가 로그로만 기록되고, 비즈니스 로직에 영향 없음
- 텔레그램 문제를 인지하지 못할 수 있음

#### 3.3 재시도 로직 부재
**위치:** `src/services/youtube.ts`, `src/services/collector.ts`

**문제:**
- 일시적인 네트워크 오류 시 즉시 실패
- 재시도 없이 바로 포기

**개선 제안:**
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await sleep(delay);
    return withRetry(fn, retries - 1, delay * 2);
  }
}
```

#### 3.4 에러 타입 구분 부족
**위치:** `src/index.ts`

```typescript
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);
  reply.status(500).send({
    error: 'Internal Server Error',
    message: error.message,  // 민감 정보 노출 가능
  });
});
```

**문제:**
- 모든 에러를 500으로 처리
- ValidationError, NotFoundError 등 구분 없음
- 프로덕션에서는 error.message 노출 위험

---

## 4. API 설계 (RESTful 원칙)

### 🟢 Good

- ✅ 리소스 중심 URL 설계 (`/api/keywords`, `/api/videos`)
- ✅ HTTP 메서드 적절한 사용 (GET, POST, DELETE, PATCH)
- ✅ 상태 코드 적절한 사용 (200, 201, 400, 404, 409, 500)
- ✅ Zod를 이용한 입력 검증
- ✅ 페이지네이션 지원

### 🟡 Medium

#### 4.1 일관성 없는 응답 형식
**위치:** `src/routes/index.ts`, `src/index.ts`

```typescript
// 다양한 응답 패턴
return reply.send({ keywords: allKeywords });  // 래핑
return reply.send({ keyword: result[0] });     // 단수 래핑
return reply.status(201).send({ keyword: result[0] });  // 생성
return reply.send({ message: 'Keyword deleted', keyword: existing });  // 삭제

// 에러 응답도 패턴 불일치
return reply.status(400).send({ error: 'Invalid input', details: ... });
return reply.status(500).send({ success: false, error: ... });
```

**개선 제안 (표준 응답 형식):**
```typescript
// 성공 응답
{
  "success": true,
  "data": { ... },
  "meta": { ... }  // 페이지네이션 등
}

// 에러 응답
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": { ... }
  }
}
```

#### 4.2 엔드포인트 네이밍 개선 가능
**AS-IS:**
```
POST /api/collect/manual   # 수동 수집 - 동사 중심
PATCH /api/keywords/:id/toggle   # 토글 - 동사 사용
```

**개선 제안:**
```
POST /api/collection-jobs   # 수집 작업 생성
PATCH /api/keywords/:id/status   # 상태 업데이트 (body로 명시)
# 또는
PUT /api/keywords/:id/active   # 활성화
DELETE /api/keywords/:id/active   # 비활성화
```

#### 4.3 커서 기반 페이지네이션 고려
**위치:** `src/routes/index.ts`

**문제:**
- 현재 offset/limit 방식 사용
- 대량 데이터 시 성능 저하 (OFFSET 쿼리)
- 실시간 데이터에서 중복/누락 가능성

**개선 제안:**
```typescript
// Cursor-based pagination
GET /api/videos?cursor=eyJpZCI6MTAwfQ==&limit=20

{
  "data": [...],
  "pagination": {
    "nextCursor": "eyJpZCI6MTIwfQ==",
    "hasMore": true
  }
}
```

---

## 5. Docker 설정 최적화

### 🔴 Critical

#### 5.1 Healthcheck curl 미설치
**위치:** `docker-compose.yml:22`

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
```

**문제:**
- alpine 이미지에 curl이 설치되지 않음
- healthcheck 항상 실패
- 컨테이너가 unhealthy 상태로 표시됨

**개선 제안 (이미 수정됨):**
```dockerfile
# Dockerfile에 추가
RUN apk add --no-cache curl
# 또는
RUN apk add --no-cache wget

# docker-compose.yml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
```

### 🟡 Medium

#### 5.2 비효율적인 cron 서비스 구조
**위치:** `docker-compose.yml`

**문제:**
- cron 서비스가 전체 앱 이미지를 빌드함 (yt-dlp, Node.js 등 불필요)
- 메인 앱과 cron이 각각 yt-dlp 포함하여 리소스 낭비
- cron은 단순히 API 호출만 하면 됨

**개선 제안:**
```yaml
# cron 서비스 제거, 메인 앱 내부 스케줄러만 사용
# 또는

# Option 1: 간단한 Alpine 이미지로 API 호출
cron:
  image: alpine/curl
  command: >
    sh -c "echo '0 9 * * * curl -X POST http://app:3000/api/collect/manual' | crontab - && crond -f"
  depends_on:
    - app

# Option 2: 메인 앱만 사용 (권장)
# docker-compose.yml에서 cron 서비스 제거
# 메인 앱의 node-cron이 스케줄링 담당
```

#### 5.3 누락된 .dockerignore
**위치:** 프로젝트 루트

**문제:**
- `.git`, `node_modules`, `data` 등이 이미지에 복사됨
- 이미지 크기 증가
- 캐시 효율 감소

**개선 제안:**
```gitignore
# .dockerignore
node_modules
npm-debug.log
.git
.gitignore
.env
.env.*
!.env.example
data
dist
coverage
.vscode
.idea
*.md
!README.md
```

#### 5.4 yt-dlp 버전 고정 권장
**위치:** `Dockerfile`

```dockerfile
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
```

**문제:**
- 항상 최신 버전 사용
- 재현 불가능한 빌드
- 예상치 못한 동작 변경 가능성

**개선 제안:**
```dockerfile
ARG YT_DLP_VERSION=2025.01.26
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp -o /usr/local/bin/yt-dlp
```

---

## 6. 문서화

### 🟢 Good

- ✅ README.md: 설치, 실행, API 문서 충실
- ✅ ARCHITECTURE.md: 상세한 설계 문서
- ✅ .env.example: 환경 변수 예시 제공
- ✅ 주석: 핵심 함수에 JSDoc 작성

### 🟡 Medium

#### 6.1 README와 ARCHITECTURE 중복
**문제:**
- 두 문서에 프로젝트 구조, API 엔드포인트 등 중복 내용 존재
- 유지보수 시 양쪽 모두 수정 필요

**개선 제안:**
- README: 사용자 중심 (설치, 실행)
- ARCHITECTURE: 개발자 중심 (설계, 의사결정)
- API 문서는 Swagger UI에 위임

#### 6.2 누락된 개발 문서
**추가 권장:**

```markdown
# CONTRIBUTING.md
- 커밋 컨벤션
- 브랜치 전략
- PR 프로세스

# API_CHANGELOG.md
- API 버전 변경 이력
- Breaking changes

# DEPLOYMENT.md
- 배포 체크리스트
- 롤백 절차
- 모니터링 가이드
```

---

## 7. 기타 개선 사항

### 7.1 성능 최적화

#### 데이터베이스 인덱스 추가 권장
```sql
-- 검색 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title);
CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_at);
CREATE INDEX IF NOT EXISTS idx_keywords_name ON keywords(name);
```

### 7.2 테스트

**현재 상태:** 테스트 코드 없음

**권장 추가:**
```typescript
// 단위 테스트: services/
// 통합 테스트: routes/
// E2E 테스트: 수집 플로우 전체
```

### 7.3 모니터링

**추가 권장:**
- 메트릭 수집 (수집된 비디오 수, 에러율)
- 로그 집중화 (ELK 스택 또는 CloudWatch)
- 알림 (에러율 임계값 초과 시)

---

## 8. 수정 완료 항목

| # | 이슈 | 수정 파일 | 상태 |
|:---|:---|:---|:---:|
| 1 | Dockerfile에 curl 추가 | Dockerfile | ✅ |
| 2 | CORS origin 환경 변수화 | src/index.ts | ✅ |
| 3 | 사용하지 않는 import 제거 | src/services/youtube.ts | ✅ |

---

## 9. 권장 우선순위

### 즉시 (Immediate)
1. ✅ Dockerfile curl 설치 (이미 수정)
2. ✅ CORS origin 환경 변수화 (이미 수정)

### 단기 (Short-term)
3. 환경 변수 검증 스키마 추가
4. yt-dlp stderr 처리 개선
5. .dockerignore 추가

### 중기 (Medium-term)
6. API 응답 형식 표준화
7. 에러 핸들링 개선 (커스텀 에러 클래스)
8. 재시도 로직 구현

### 장기 (Long-term)
9. 테스트 코드 작성
10. 커서 기반 페이지네이션
11. 메트릭/모니터링 추가

---

## 10. 리뷰 종합 의견

전반적으로 **잘 구성된 프로젝트**입니다. TypeScript, Fastify, Drizzle ORM 등 현대적인 기술 스택을 적절히 사용했으며, 코드 구조도 깔끔합니다.

**강점:**
- 명확한 계층 구조 (routes/services/db)
- Zod를 활용한 입력 검증
- Docker 멀티스테이지 빌드
- 상세한 문서화

**개선 필요:**
- Docker 설정의 healthcheck 문제 (수정 완료)
- CORS 보안 설정 (수정 완료)
- 에러 핸들링 정교화
- 타입 안전성 강화

Critical 이슈는 모두 수정되어 프로덕션 배포가 가능한 상태입니다.
