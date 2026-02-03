import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchYouTube, getVideoInfo, checkYtDlp } from '../src/services/youtube';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('youtube service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchYouTube', () => {
    it('should parse yt-dlp output correctly', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const mockVideoData = {
        id: 'abc12345',
        title: 'Test Video',
        webpage_url: 'https://youtube.com/watch?v=abc12345',
        uploader: 'Test Channel',
        view_count: 1000,
        upload_date: '20230101',
        duration: 365,
      };

      const searchPromise = searchYouTube('test keyword', { limit: 1 });

      // Simulate output
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(mockVideoData) + '\n'));
      
      // Simulate close
      mockProcess.emit('close', 0);

      const results = await searchPromise;

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('abc12345');
      expect(results[0].title).toBe('Test Video');
      expect(results[0].channel).toBe('Test Channel');
      expect(results[0].viewCount).toBe(1000);
      expect(results[0].duration).toBe('6:05');
      expect(results[0].publishedAt?.toISOString()).toContain('2023-01-01');
    });

    it('should throw error if yt-dlp is not installed', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter(); // stderr 추가
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const searchPromise = searchYouTube('test');

      // Error event should be emitted and handled
      mockProcess.emit('error', new Error('spawn yt-dlp ENOENT'));

      await expect(searchPromise).rejects.toThrow('yt-dlp가 설치되어 있지 않습니다');
    });
  });

  describe('getVideoInfo', () => {
    it('should fetch video info for a specific ID', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const mockVideoData = {
        id: 'vid123',
        title: 'Single Video',
        view_count: 500,
      };

      const infoPromise = getVideoInfo('vid123');

      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(mockVideoData)));
      mockProcess.emit('close', 0);

      const result = await infoPromise;
      expect(result.id).toBe('vid123');
      expect(result.title).toBe('Single Video');
    });
  });

  describe('checkYtDlp', () => {
    it('should return true if yt-dlp exists', async () => {
      const mockProcess = new EventEmitter() as any;
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const checkPromise = checkYtDlp();
      mockProcess.emit('close', 0);

      expect(await checkPromise).toBe(true);
    });

    it('should return false if yt-dlp does not exist', async () => {
      const mockProcess = new EventEmitter() as any;
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const checkPromise = checkYtDlp();
      mockProcess.emit('error', new Error('ENOENT'));

      expect(await checkPromise).toBe(false);
    });
  });
});
