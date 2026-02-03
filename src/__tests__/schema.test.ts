import { describe, it, expect } from 'vitest';
import { keywords, videos, trends, collectionLogs } from '../db/schema';

describe('Database Schema', () => {
  describe('keywords table', () => {
    it('should have correct column definitions', () => {
      expect(keywords).toBeDefined();
      expect(keywords.id).toBeDefined();
      expect(keywords.name).toBeDefined();
      expect(keywords.category).toBeDefined();
      expect(keywords.isActive).toBeDefined();
      expect(keywords.createdAt).toBeDefined();
    });
  });

  describe('videos table', () => {
    it('should have correct column definitions', () => {
      expect(videos).toBeDefined();
      expect(videos.id).toBeDefined();
      expect(videos.videoId).toBeDefined();
      expect(videos.keywordId).toBeDefined();
      expect(videos.title).toBeDefined();
      expect(videos.channelName).toBeDefined();
      expect(videos.viewCount).toBeDefined();
      expect(videos.collectedAt).toBeDefined();
    });
  });

  describe('trends table', () => {
    it('should have correct column definitions', () => {
      expect(trends).toBeDefined();
      expect(trends.id).toBeDefined();
      expect(trends.keywordId).toBeDefined();
      expect(trends.date).toBeDefined();
      expect(trends.videoCount).toBeDefined();
      expect(trends.totalViews).toBeDefined();
    });
  });

  describe('collectionLogs table', () => {
    it('should have correct column definitions', () => {
      expect(collectionLogs).toBeDefined();
      expect(collectionLogs.id).toBeDefined();
      expect(collectionLogs.startedAt).toBeDefined();
      expect(collectionLogs.completedAt).toBeDefined();
      expect(collectionLogs.keywordCount).toBeDefined();
      expect(collectionLogs.videoCount).toBeDefined();
      expect(collectionLogs.status).toBeDefined();
    });
  });
});
