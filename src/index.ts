import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { initDb } from './db/index.js';
import { keywordRoutes, videoRoutes, trendRoutes, logRoutes } from './routes/index.js';
import { startScheduler, stopScheduler, getSchedulerStatus } from './services/scheduler.js';
import { collectAll, getRecentSummary } from './services/collector.js';
import { notifyCollectionResult } from './services/notifier.js';

const app = Fastify({
  logger: true,
});

const PORT = parseInt(process.env.PORT || '3000', 10);

// DB 초기화
initDb();

async function setup() {
  // 미들웨어 등록
  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  // Swagger 설정
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'YouTube Trend Collector API',
        description: 'YouTube 트렌드 키워드 수집기 API',
        version: '1.0.0',
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // 라우트 등록
  app.register(async (fastify) => {
    // Health check
    fastify.get('/api/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    }));

    // 키워드 라우트
    fastify.register(keywordRoutes, { prefix: '/api/keywords' });
    
    // 비디오 라우트
    fastify.register(videoRoutes, { prefix: '/api/videos' });
    
    // 트렌드 라우트
    fastify.register(trendRoutes, { prefix: '/api/trends' });
    
    // 로그 라우트
    fastify.register(logRoutes, { prefix: '/api/logs' });

    // 수동 수집 트리거
    fastify.post('/api/collect/manual', async (req, reply) => {
      try {
        const limit = parseInt((req.body as any)?.limit) || 10;
        const result = await collectAll(limit);
        await notifyCollectionResult(result);
        return reply.send({ success: true, result });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // 요약 정보
    fastify.get('/api/summary', async (req, reply) => {
      const days = parseInt((req.query as any).days) || 7;
      const summary = await getRecentSummary(days);
      return reply.send(summary);
    });

    // 스케줄러 상태
    fastify.get('/api/scheduler/status', async () => {
      return getSchedulerStatus();
    });
  });

  // 에러 핸들러
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  });
}

// 서버 시작
async function start() {
  try {
    await setup();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📚 API Docs at http://localhost:${PORT}/docs`);

    // 스케줄러 시작 (production 모드에서만)
    if (process.env.NODE_ENV === 'production') {
      startScheduler();
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  stopScheduler();
  await app.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  stopScheduler();
  await app.close();
  process.exit(0);
});

start();
