import { db } from '../db/index.js';
import { keywords, videos, trends, collectionLogs } from '../db/schema.js';
import { searchYouTube, checkYtDlp } from './youtube.js';
import { eq, and, gte, sql } from 'drizzle-orm';

export interface CollectResult {
  keywordId: number;
  keywordName: string;
  videosCollected: number;
  errors?: string;
}

export interface CollectAllResult {
  startedAt: Date;
  completedAt: Date;
  totalKeywords: number;
  totalVideos: number;
  results: CollectResult[];
  status: 'success' | 'partial' | 'failed';
}

// 수집할 비디오의 최대 나이 (일 단위) - 추후 필터링에 사용 예정
// const MAX_VIDEO_AGE_DAYS = 7;

/**
 * 단일 키워드로 비디오 수집
 */
export async function collectByKeyword(
  keywordId: number,
  limit: number = 10
): Promise<CollectResult> {
  const keyword = await db.query.keywords.findFirst({
    where: eq(keywords.id, keywordId),
  });

  if (!keyword) {
    throw new Error(`Keyword not found: ${keywordId}`);
  }

  if (!keyword.isActive) {
    return {
      keywordId,
      keywordName: keyword.name,
      videosCollected: 0,
      errors: 'Keyword is inactive',
    };
  }

  try {
    // YouTube 검색
    const searchResults = await searchYouTube(keyword.name, { limit });

    // 비디오 저장 (ytsearchdate로 이미 최신 영상 위주로 검색됨)
    let collectedCount = 0;

    for (const video of searchResults) {
      try {
        await db
          .insert(videos)
          .values({
            videoId: video.id,
            keywordId: keyword.id,
            title: video.title,
            url: video.url,
            channelName: video.channel,
            viewCount: video.viewCount || 0,
            likeCount: video.likeCount,
            duration: video.duration,
            thumbnail: video.thumbnail,
            publishedAt: video.publishedAt,
          })
          .onConflictDoUpdate({
            target: videos.videoId,
            set: {
              title: video.title,
              viewCount: video.viewCount || 0,
              likeCount: video.likeCount,
              collectedAt: new Date(),
            },
          });
        collectedCount++;
      } catch (e) {
        console.error(`Failed to save video ${video.id}:`, e);
      }
    }

    return {
      keywordId,
      keywordName: keyword.name,
      videosCollected: collectedCount,
    };
  } catch (error) {
    console.error(`Failed to collect videos for keyword "${keyword.name}":`, error);
    return {
      keywordId,
      keywordName: keyword.name,
      videosCollected: 0,
      errors: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 모든 활성 키워드로 비디오 수집
 */
export async function collectAll(
  limit: number = 10
): Promise<CollectAllResult> {
  const startedAt = new Date();
  const startTime = Date.now();

  // yt-dlp 설치 확인
  const hasYtDlp = await checkYtDlp();
  if (!hasYtDlp) {
    throw new Error('yt-dlp is not installed');
  }

  // 활성 키워드 조회
  const activeKeywords = await db.query.keywords.findMany({
    where: eq(keywords.isActive, true),
  });

  if (activeKeywords.length === 0) {
    return {
      startedAt,
      completedAt: new Date(),
      totalKeywords: 0,
      totalVideos: 0,
      results: [],
      status: 'success',
    };
  }

  const results: CollectResult[] = [];
  let totalVideos = 0;
  let hasErrors = false;

  // 순차적으로 수집 (병렬하면 IP 밴 위험)
  for (const keyword of activeKeywords) {
    console.log(`Collecting videos for keyword: ${keyword.name}`);
    const result = await collectByKeyword(keyword.id, limit);
    results.push(result);
    totalVideos += result.videosCollected;
    if (result.errors) hasErrors = true;

    // 요청 간 딜레이 (IP 밴 방지)
    await sleep(2000);
  }

  const completedAt = new Date();
  const duration = Date.now() - startTime;
  console.log(`Collection completed in ${duration}ms, total videos: ${totalVideos}`);

  // 로그 저장
  const status: CollectAllResult['status'] = hasErrors
    ? 'partial'
    : totalVideos > 0
    ? 'success'
    : 'failed';

  await db.insert(collectionLogs).values({
    startedAt,
    completedAt,
    keywordCount: activeKeywords.length,
    videoCount: totalVideos,
    status,
  });

  // 트렌드 집계 업데이트
  await updateTrends();

  return {
    startedAt,
    completedAt,
    totalKeywords: activeKeywords.length,
    totalVideos,
    results,
    status,
  };
}

/**
 * 트렌드 집계 업데이트
 */
async function updateTrends(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 모든 키워드에 대해 오늘의 트렌드 업데이트
  const allKeywords = await db.query.keywords.findMany();

  for (const keyword of allKeywords) {
    // 오늘 수집된 비디오 조회
    const todayVideos = await db
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.keywordId, keyword.id),
          gte(videos.collectedAt, today)
        )
      );

    if (todayVideos.length === 0) continue;

    const totalViews = todayVideos.reduce((sum, v) => sum + (v.viewCount || 0), 0);
    const avgViews = Math.round(totalViews / todayVideos.length);
    
    // 조회수 기준 Top 비디오
    const topVideo = todayVideos.reduce((max, v) => 
      (v.viewCount || 0) > (max.viewCount || 0) ? v : max
    );

    // 트렌드 Upsert
    const existing = await db.query.trends.findFirst({
      where: and(
        eq(trends.keywordId, keyword.id),
        eq(trends.date, today),
        eq(trends.period, 'daily')
      ),
    });

    if (existing) {
      await db
        .update(trends)
        .set({
          videoCount: todayVideos.length,
          totalViews,
          avgViews,
          topVideoId: topVideo.id,
        })
        .where(eq(trends.id, existing.id));
    } else {
      await db.insert(trends).values({
        keywordId: keyword.id,
        date: today,
        period: 'daily',
        videoCount: todayVideos.length,
        totalViews,
        avgViews,
        topVideoId: topVideo.id,
      });
    }
  }
}

/**
 * 최근 수집 결과 요약
 */
export async function getRecentSummary(days: number = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const recentVideos = await db
    .select({
      count: sql<number>`count(*)`,
      totalViews: sql<number>`sum(${videos.viewCount})`,
    })
    .from(videos)
    .where(gte(videos.collectedAt, since));

  const recentLogs = await db
    .select()
    .from(collectionLogs)
    .where(gte(collectionLogs.startedAt, since))
    .orderBy(collectionLogs.startedAt);

  const keywordStats = await db.query.keywords.findMany({
    with: {
      videos: {
        where: gte(videos.collectedAt, since),
      },
    },
  });

  return {
    period: `${days} days`,
    totalVideos: recentVideos[0]?.count || 0,
    totalViews: recentVideos[0]?.totalViews || 0,
    collectionRuns: recentLogs.length,
    keywordBreakdown: keywordStats.map(k => ({
      id: k.id,
      name: k.name,
      videosCount: k.videos.length,
    })),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
