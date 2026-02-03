import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectByKeyword, collectAll } from '../src/services/collector';
import * as youtubeService from '../src/services/youtube';
import { db } from '../src/db/index';

// Mock the db
vi.mock('../src/db/index', () => {
  const mockDb = {
    query: {
      keywords: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      trends: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue({ id: 1 }),
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      then: (resolve: any) => resolve({ id: 1 }),
    }),
    onConflictDoUpdate: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    where: vi.fn().mockResolvedValue({ id: 1 }),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  
  // Make select().from().where() return an empty array by default
  const selectMock = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve([]),
  };
  mockDb.select = vi.fn().mockReturnValue(selectMock);

  // Chaining support for some cases
  (mockDb as any).then = undefined; 

  return { db: mockDb };
});

vi.mock('../src/services/youtube', () => ({
  searchYouTube: vi.fn(),
  checkYtDlp: vi.fn(),
}));

describe('collector service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('collectByKeyword', () => {
    it('should collect videos for a keyword', async () => {
      const mockKeyword = { id: 1, name: 'Test', isActive: true };
      vi.mocked(db.query.keywords.findFirst).mockResolvedValue(mockKeyword as any);
      
      const mockVideos = [
        { id: 'v1', title: 'Video 1', url: 'url1', channel: 'ch1', viewCount: 100 },
      ];
      vi.mocked(youtubeService.searchYouTube).mockResolvedValue(mockVideos as any);

      const result = await collectByKeyword(1);

      expect(result.keywordId).toBe(1);
      expect(result.videosCollected).toBe(1);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should skip collection if keyword is inactive', async () => {
      const mockKeyword = { id: 1, name: 'Test', isActive: false };
      vi.mocked(db.query.keywords.findFirst).mockResolvedValue(mockKeyword as any);

      const result = await collectByKeyword(1);

      expect(result.videosCollected).toBe(0);
      expect(result.errors).toBe('Keyword is inactive');
      expect(youtubeService.searchYouTube).not.toHaveBeenCalled();
    });
  });

  describe('collectAll', () => {
    it('should collect for all active keywords', async () => {
      vi.mocked(youtubeService.checkYtDlp).mockResolvedValue(true);
      
      const mockKeywords = [
        { id: 1, name: 'K1', isActive: true },
        { id: 2, name: 'K2', isActive: true },
      ];
      vi.mocked(db.query.keywords.findMany).mockResolvedValue(mockKeywords as any);
      
      // Mock findFirst for collectByKeyword calls
      vi.mocked(db.query.keywords.findFirst)
        .mockResolvedValueOnce(mockKeywords[0] as any)
        .mockResolvedValueOnce(mockKeywords[1] as any);

      vi.mocked(youtubeService.searchYouTube).mockResolvedValue([]);

      // Mock the videos select in updateTrends
      (db.select() as any).from().where.mockResolvedValue([]);

      const result = await collectAll();

      expect(result.totalKeywords).toBe(2);
      expect(youtubeService.searchYouTube).toHaveBeenCalledTimes(2);
    }, 10000);
  });
});
