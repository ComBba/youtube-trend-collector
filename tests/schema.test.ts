import { describe, it, expect } from 'vitest';
import * as schema from '../src/db/schema';

describe('database schema', () => {
  it('should have keywords table defined', () => {
    expect(schema.keywords).toBeDefined();
    expect(schema.keywords.name).toBeDefined();
  });

  it('should have videos table defined', () => {
    expect(schema.videos).toBeDefined();
    expect(schema.videos.videoId).toBeDefined();
  });

  it('should have trends table defined', () => {
    expect(schema.trends).toBeDefined();
  });

  it('should have relations defined', () => {
    expect(schema.keywordsRelations).toBeDefined();
    expect(schema.videosRelations).toBeDefined();
  });
});
