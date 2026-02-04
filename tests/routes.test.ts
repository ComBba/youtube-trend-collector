import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import fastify from 'fastify';
import { keywordRoutes, videoRoutes, trendRoutes, logRoutes } from '../src/routes/index';
import { db } from '../src/db/index';

vi.mock('../src/db/index', () => ({
  db: {
    query: {
      keywords: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    $count: vi.fn(),
  },
}));

describe('keyword routes', () => {
  let app: any;

  beforeAll(async () => {
    app = fastify();
    await app.register(keywordRoutes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('GET / should return all keywords', async () => {
    const mockKeywords = [{ id: 1, name: 'Test' }];
    vi.mocked(db.query.keywords.findMany).mockResolvedValue(mockKeywords as any);

    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ keywords: mockKeywords });
  });

  it('POST / should create a new keyword', async () => {
    const newKeyword = { id: 2, name: 'New' };
    vi.mocked(db.insert(null as any).values(null as any).returning).mockResolvedValue([newKeyword] as any);

    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'New' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ keyword: newKeyword });
  });

  it('POST / should return 400 for invalid input', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: { name: '' }, // empty name
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST / should return 409 for duplicate keyword', async () => {
    const error = new Error('UNIQUE constraint failed: keywords.name');
    vi.mocked(db.insert(null as any).values(null as any).returning).mockRejectedValue(error);

    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'Duplicate' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('Keyword already exists');
  });

  it('DELETE /:id should delete a keyword', async () => {
    const mockKeyword = { id: 1, name: 'Test' };
    vi.mocked(db.query.keywords.findFirst).mockResolvedValue(mockKeyword as any);

    const response = await app.inject({
      method: 'DELETE',
      url: '/1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe('Keyword deleted');
  });

  it('DELETE /:id should return 404 if not found', async () => {
    vi.mocked(db.query.keywords.findFirst).mockResolvedValue(null as any);

    const response = await app.inject({
      method: 'DELETE',
      url: '/999',
    });

    expect(response.statusCode).toBe(404);
  });

  it('DELETE /:id should return 400 for invalid ID', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/abc',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Invalid ID');
  });

  it('PATCH /:id/toggle should toggle keyword active state', async () => {
    const mockKeyword = { id: 1, name: 'Test', isActive: true };
    const toggledKeyword = { ...mockKeyword, isActive: false };
    
    vi.mocked(db.query.keywords.findFirst).mockResolvedValue(mockKeyword as any);
    vi.mocked(db.update(null as any).set(null as any).where(null as any).returning).mockResolvedValue([toggledKeyword] as any);

    const response = await app.inject({
      method: 'PATCH',
      url: '/1/toggle',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().keyword.isActive).toBe(false);
  });

  it('PATCH /:id/toggle should return 404 if keyword not found', async () => {
    vi.mocked(db.query.keywords.findFirst).mockResolvedValue(null as any);

    const response = await app.inject({
      method: 'PATCH',
      url: '/999/toggle',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('Keyword not found');
  });

  it('PATCH /:id/toggle should return 400 for invalid ID', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/abc/toggle',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Invalid ID');
  });
});

describe('video routes', () => {
  let app: any;

  beforeAll(async () => {
    app = fastify();
    await app.register(videoRoutes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('GET / should return 400 for invalid days parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?days=invalid',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Invalid query parameters');
  });

  it('GET / should return 400 for days out of range', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?days=0',
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET / should return 400 for limit out of range', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?limit=200',
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET / should return 400 for negative offset', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?offset=-1',
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('trend routes', () => {
  let app: any;

  beforeAll(async () => {
    app = fastify();
    await app.register(trendRoutes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('GET / should return trends with default parameters', async () => {
    const mockTrends = [
      { trend: { id: 1, period: 'daily' }, keywordName: 'Keyword1', topVideoTitle: 'Top Video' },
    ];
    
    const mockOrderBy = vi.fn().mockResolvedValue(mockTrends);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
    const mockLeftJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('trends');
  });

  it('GET / should return 400 for invalid query parameters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?period=invalid',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Invalid query parameters');
  });

  it('GET / should filter by keyword when provided', async () => {
    const mockTrends = [
      { trend: { id: 1, period: 'weekly' }, keywordName: 'React', topVideoTitle: 'Top Video' },
    ];
    
    const mockOrderBy = vi.fn().mockResolvedValue(mockTrends);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
    const mockLeftJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/?keyword=React&period=weekly&days=14',
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('log routes', () => {
  let app: any;

  beforeAll(async () => {
    app = fastify();
    await app.register(logRoutes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('GET / should return logs with default limit', async () => {
    const mockLogs = [
      { id: 1, startedAt: new Date(), status: 'success' },
    ];
    
    const mockLimit = vi.fn().mockResolvedValue(mockLogs);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('logs');
  });

  it('GET / should respect custom limit parameter', async () => {
    const mockLogs = Array(5).fill({ id: 1, startedAt: new Date(), status: 'success' });
    
    const mockLimit = vi.fn().mockResolvedValue(mockLogs);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/?limit=5',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().logs).toHaveLength(5);
  });

  it('GET / should use default limit for invalid limit parameter', async () => {
    const mockLogs = [{ id: 1, startedAt: new Date(), status: 'success' }];
    
    const mockLimit = vi.fn().mockResolvedValue(mockLogs);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/?limit=invalid',
    });

    expect(response.statusCode).toBe(200);
    // Should use default limit of 20
    expect(mockLimit).toHaveBeenCalledWith(20);
  });
});
