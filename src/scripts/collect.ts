import 'dotenv/config';
import { initDb, db } from '../db/index.js';
import { collectAll } from '../services/collector.js';
import { notifyCollectionResult } from '../services/notifier.js';
import { keywords } from '../db/schema.js';

// 초기 키워드
const INITIAL_KEYWORDS = [
  { name: 'tech news', category: 'technology' },
  { name: 'programming', category: 'development' },
  { name: 'frontend', category: 'development' },
  { name: 'backend', category: 'development' },
  { name: 'AI coding', category: 'technology' },
  { name: 'devops', category: 'development' },
  { name: 'golang', category: 'language' },
  { name: 'nextjs', category: 'framework' },
  { name: 'OpenClaw', category: 'technology' },
];

async function main() {
  console.log('🚀 Starting YouTube collection...\n');

  // DB 초기화
  initDb();

  // 초기 키워드 등록 (없는 경우에만)
  const existingKeywords = await db.select().from(keywords);
  const existingNames = new Set(existingKeywords.map(k => k.name.toLowerCase()));

  for (const kw of INITIAL_KEYWORDS) {
    if (!existingNames.has(kw.name.toLowerCase())) {
      try {
        await db.insert(keywords).values(kw);
        console.log(`✅ Added keyword: ${kw.name}`);
      } catch (e) {
        console.error(`❌ Failed to add keyword ${kw.name}:`, e);
      }
    } else {
      console.log(`⏩ Skipped existing keyword: ${kw.name}`);
    }
  }

  console.log('\n📥 Starting collection...\n');

  try {
    const result = await collectAll(10);
    
    console.log('\n✅ Collection completed!');
    console.log(`📊 Total keywords: ${result.totalKeywords}`);
    console.log(`📹 Total videos: ${result.totalVideos}`);
    console.log(`⏱️ Duration: ${(result.completedAt.getTime() - result.startedAt.getTime()) / 1000}s`);
    
    // 텔레그램 알림
    await notifyCollectionResult(result);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Collection failed:', error);
    process.exit(1);
  }
}

main();
