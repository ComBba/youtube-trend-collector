import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { keywords, videos, trends, collectionLogs } from '../db/schema.js';
import { eq, desc, gte, and, like } from 'drizzle-orm';

// 스키마 정의
const createKeywordSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().max(50).optional(),
});

const listVideosQuerySchema = z.object({
  keyword: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).default(7),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const listTrendsQuerySchema = z.object({
  keyword: z.string().optional(),
  period: z.enum(['daily', 'weekly']).default('daily'),
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export async function keywordRoutes(app: FastifyInstance) {
  // GET /api/keywords - 키워드 목록
  app.get('/', async (_req, reply) => {
    const allKeywords = await db.query.keywords.findMany({
      orderBy: desc(keywords.createdAt),
    });
    return reply.send({ keywords: allKeywords });
  });

  // POST /api/keywords - 키워드 추가
  app.post('/', async (req, reply) => {
    const parseResult = createKeywordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid input',
        details: parseResult.error.format(),
      });
    }

    const { name, category } = parseResult.data;

    try {
      const result = await db
        .insert(keywords)
        .values({ name: name.trim(), category })
        .returning();
      
      return reply.status(201).send({ keyword: result[0] });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({ error: 'Keyword already exists' });
      }
      throw error;
    }
  });

  // DELETE /api/keywords/:id - 키워드 삭제
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const keywordId = parseInt(id, 10);

    if (isNaN(keywordId)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }

    const existing = await db.query.keywords.findFirst({
      where: eq(keywords.id, keywordId),
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Keyword not found' });
    }

    await db.delete(keywords).where(eq(keywords.id, keywordId));
    
    return reply.send({ message: 'Keyword deleted', keyword: existing });
  });

  // PATCH /api/keywords/:id/toggle - 키워드 활성화/비활성화 토글
  app.patch('/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const keywordId = parseInt(id, 10);

    if (isNaN(keywordId)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }

    const existing = await db.query.keywords.findFirst({
      where: eq(keywords.id, keywordId),
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Keyword not found' });
    }

    const result = await db
      .update(keywords)
      .set({ isActive: !existing.isActive })
      .where(eq(keywords.id, keywordId))
      .returning();

    return reply.send({ keyword: result[0] });
  });
}

export async function videoRoutes(app: FastifyInstance) {
  // GET /api/videos - 비디오 목록
  app.get('/', async (req, reply) => {
    const parseResult = listVideosQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parseResult.error.format(),
      });
    }

    const { keyword, days, limit, offset } = parseResult.data;

    const since = new Date();
    since.setDate(since.getDate() - days);

    let results;

    if (keyword) {
      results = await db
        .select({
          video: videos,
          keywordName: keywords.name,
        })
        .from(videos)
        .leftJoin(keywords, eq(videos.keywordId, keywords.id))
        .where(
          and(
            gte(videos.collectedAt, since),
            like(keywords.name, `%${keyword}%`)
          )
        )
        .orderBy(desc(videos.collectedAt))
        .limit(limit)
        .offset(offset);
    } else {
      results = await db
        .select({
          video: videos,
          keywordName: keywords.name,
        })
        .from(videos)
        .leftJoin(keywords, eq(videos.keywordId, keywords.id))
        .where(gte(videos.collectedAt, since))
        .orderBy(desc(videos.collectedAt))
        .limit(limit)
        .offset(offset);
    }

    const totalResult = await db
      .select({ count: db.$count(videos) })
      .from(videos)
      .where(gte(videos.collectedAt, since));

    return reply.send({
      videos: results.map(r => ({
        ...r.video,
        keywordName: r.keywordName,
      })),
      pagination: {
        total: totalResult[0]?.count || 0,
        limit,
        offset,
      },
    });
  });
}

export async function trendRoutes(app: FastifyInstance) {
  // GET /api/trends - 트렌드 목록
  app.get('/', async (req, reply) => {
    const parseResult = listTrendsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parseResult.error.format(),
      });
    }

    const { keyword, period, days } = parseResult.data;

    const since = new Date();
    since.setDate(since.getDate() - days);

    let results;

    if (keyword) {
      results = await db
        .select({
          trend: trends,
          keywordName: keywords.name,
          topVideoTitle: videos.title,
        })
        .from(trends)
        .leftJoin(keywords, eq(trends.keywordId, keywords.id))
        .leftJoin(videos, eq(trends.topVideoId, videos.id))
        .where(
          and(
            eq(trends.period, period),
            gte(trends.date, since),
            like(keywords.name, `%${keyword}%`)
          )
        )
        .orderBy(desc(trends.date));
    } else {
      results = await db
        .select({
          trend: trends,
          keywordName: keywords.name,
          topVideoTitle: videos.title,
        })
        .from(trends)
        .leftJoin(keywords, eq(trends.keywordId, keywords.id))
        .leftJoin(videos, eq(trends.topVideoId, videos.id))
        .where(
          and(
            eq(trends.period, period),
            gte(trends.date, since)
          )
        )
        .orderBy(desc(trends.date));
    }

    return reply.send({
      trends: results.map(r => ({
        ...r.trend,
        keywordName: r.keywordName,
        topVideoTitle: r.topVideoTitle,
      })),
    });
  });
}

export async function logRoutes(app: FastifyInstance) {
  // GET /api/logs - 수집 로그
  app.get('/', async (req, reply) => {
    const limit = parseInt((req.query as any).limit) || 20;

    const logs = await db
      .select()
      .from(collectionLogs)
      .orderBy(desc(collectionLogs.startedAt))
      .limit(limit);

    return reply.send({ logs });
  });
}
