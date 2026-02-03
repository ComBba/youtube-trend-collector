import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { searchYouTube, getVideoInfo, checkYtDlp, type VideoInfo } from '../services/youtube';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('YouTube Service', () => {
  const mockSpawn = vi.mocked(spawn);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchYouTube', () => {
    it('should parse yt-dlp JSON output correctly', async () => {
      const mockVideoData = {
        id: 'test123',
        title: 'Test Video',
        webpage_url: 'https://youtube.com/watch?v=test123',
        channel: 'Test Channel',
        view_count: 12345,
        upload_date: '20260201',
      };

      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(JSON.stringify(mockVideoData) + '\n'));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      const results = await searchYouTube('test query', { limit: 1 });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Video');
      expect(results[0].channel).toBe('Test Channel');
      expect(results[0].viewCount).toBe(12345);
    });

    it('should handle empty results', async () => {
      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(''));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      const results = await searchYouTube('empty query');

      expect(results).toHaveLength(0);
    });

    it('should use correct yt-dlp arguments', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') callback(0);
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      await searchYouTube('golang tutorial', { limit: 5 });

      expect(mockSpawn).toHaveBeenCalledWith('yt-dlp', expect.arrayContaining([
        'ytsearch5:golang tutorial',
        '--dump-json',
        '--flat-playlist',
      ]));
    });

    it('should reject on yt-dlp error', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('ENOENT'));
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      await expect(searchYouTube('test')).rejects.toThrow();
    });
  });

  describe('checkYtDlp', () => {
    it('should return true when yt-dlp is installed', async () => {
      const mockProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await checkYtDlp();

      expect(result).toBe(true);
    });

    it('should return false when yt-dlp is not installed', async () => {
      const mockProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('ENOENT'));
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await checkYtDlp();

      expect(result).toBe(false);
    });
  });
});
