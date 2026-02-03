import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// 키워드 테이블
export const keywords = sqliteTable('keywords', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  category: text('category'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 비디오 테이블
export const videos = sqliteTable('videos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  videoId: text('video_id').notNull().unique(),
  keywordId: integer('keyword_id').references(() => keywords.id),
  title: text('title').notNull(),
  url: text('url').notNull(),
  channelName: text('channel_name'),
  viewCount: integer('view_count'),
  likeCount: integer('like_count'),
  duration: text('duration'),
  thumbnail: text('thumbnail'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  collectedAt: integer('collected_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 트렌드 테이블 (일간/주간 요약)
export const trends = sqliteTable('trends', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  keywordId: integer('keyword_id').references(() => keywords.id),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  period: text('period').notNull().default('daily'), // 'daily' | 'weekly'
  videoCount: integer('video_count').default(0),
  totalViews: integer('total_views').default(0),
  avgViews: integer('avg_views').default(0),
  topVideoId: integer('top_video_id').references(() => videos.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 수집 로그 테이블
export const collectionLogs = sqliteTable('collection_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  keywordCount: integer('keyword_count'),
  videoCount: integer('video_count'),
  status: text('status'), // 'success' | 'partial' | 'failed'
  error: text('error'),
});

// Relations
export const keywordsRelations = relations(keywords, ({ many }) => ({
  videos: many(videos),
  trends: many(trends),
}));

export const videosRelations = relations(videos, ({ one }) => ({
  keyword: one(keywords, {
    fields: [videos.keywordId],
    references: [keywords.id],
  }),
}));

export const trendsRelations = relations(trends, ({ one }) => ({
  keyword: one(keywords, {
    fields: [trends.keywordId],
    references: [keywords.id],
  }),
  topVideo: one(videos, {
    fields: [trends.topVideoId],
    references: [videos.id],
  }),
}));

// Types
export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type Trend = typeof trends.$inferSelect;
export type NewTrend = typeof trends.$inferInsert;
export type CollectionLog = typeof collectionLogs.$inferSelect;
export type NewCollectionLog = typeof collectionLogs.$inferInsert;
