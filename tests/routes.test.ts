import { describe, it, expect, vi, beforeAll } from 'vitest';
import fastify from 'fastify';
import { keywordRoutes } from '../src/routes/index';
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
  },
}));

describe('keyword routes', () => {
  let app: any;

  beforeAll(async () => {
    app = fastify();
    await app.register(keywordRoutes);
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
});
