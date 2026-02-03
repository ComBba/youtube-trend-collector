import cron from 'node-cron';
import { collectAll } from './collector.js';
import { notifyCollectionResult, notifySchedulerStart, notifyError } from './notifier.js';

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * 기본 스케줄: 매일 오전 9시
 */
const DEFAULT_SCHEDULE = '0 9 * * *';

/**
 * 스케줄러 시작
 */
export function startScheduler(schedule: string = DEFAULT_SCHEDULE): cron.ScheduledTask {
  // 기존 태스크 중지
  stopScheduler();

  console.log(`Starting scheduler with cron: ${schedule}`);

  scheduledTask = cron.schedule(schedule, async () => {
    console.log('Running scheduled collection at', new Date().toISOString());
    
    try {
      const result = await collectAll(10);
      await notifyCollectionResult(result);
    } catch (error) {
      console.error('Scheduled collection failed:', error);
      await notifyError(error as Error, 'scheduled collection');
    }
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'Asia/Seoul',
  });

  notifySchedulerStart().catch(console.error);

  return scheduledTask;
}

/**
 * 스케줄러 중지
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('Scheduler stopped');
  }
}

/**
 * 스케줄러 상태 확인
 */
export function getSchedulerStatus(): { running: boolean; schedule?: string } {
  return {
    running: scheduledTask !== null,
    schedule: scheduledTask ? DEFAULT_SCHEDULE : undefined,
  };
}

/**
 * 즉시 수집 실행
 */
export async function runNow(): Promise<void> {
  console.log('Running manual collection at', new Date().toISOString());
  
  try {
    const result = await collectAll(10);
    await notifyCollectionResult(result);
  } catch (error) {
    console.error('Manual collection failed:', error);
    await notifyError(error as Error, 'manual collection');
    throw error;
  }
}
