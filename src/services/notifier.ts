import TelegramBot from 'node-telegram-bot-api';
import { CollectAllResult } from './collector.js';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

let bot: TelegramBot | null = null;

/**
 * 텔레그램 봇 초기화
 */
export function initTelegramBot(): TelegramBot | null {
  if (!botToken) {
    console.warn('TELEGRAM_BOT_TOKEN is not set');
    return null;
  }

  if (!bot) {
    bot = new TelegramBot(botToken, { polling: false });
  }
  return bot;
}

/**
 * 수집 결과 알림 전송
 */
export async function notifyCollectionResult(
  result: CollectAllResult
): Promise<boolean> {
  if (!botToken || !chatId) {
    console.warn('Telegram credentials not configured');
    return false;
  }

  const bot = initTelegramBot();
  if (!bot) return false;

  const duration = result.completedAt.getTime() - result.startedAt.getTime();
  const durationSec = Math.round(duration / 1000);

  const statusEmoji = {
    success: '✅',
    partial: '⚠️',
    failed: '❌',
  };

  let message = `${statusEmoji[result.status]} **YouTube 수집 완료**\n\n`;
  message += `📊 **요약**\n`;
  message += `- 처리 키워드: ${result.totalKeywords}개\n`;
  message += `- 수집 영상: ${result.totalVideos}개\n`;
  message += `- 소요 시간: ${durationSec}초\n`;
  message += `- 상태: ${result.status === 'success' ? '성공' : result.status === 'partial' ? '부분 성공' : '실패'}\n\n`;

  // 키워드별 상세
  if (result.results.length > 0) {
    message += `📋 **키워드별 수집 현황**\n`;
    for (const r of result.results) {
      const emoji = r.errors ? '⚠️' : '✅';
      message += `${emoji} ${r.keywordName}: ${r.videosCollected}개`;
      if (r.errors) {
        message += ` (오류: ${r.errors.substring(0, 30)}...)`;
      }
      message += '\n';
    }
  }

  message += `\n⏰ ${result.completedAt.toLocaleString('ko-KR')}`;

  try {
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
    return true;
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
    return false;
  }
}

/**
 * 간단한 메시지 전송
 */
export async function sendMessage(message: string): Promise<boolean> {
  if (!botToken || !chatId) {
    console.warn('Telegram credentials not configured');
    return false;
  }

  const bot = initTelegramBot();
  if (!bot) return false;

  try {
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
    });
    return true;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

/**
 * 스케줄러 시작 알림
 */
export async function notifySchedulerStart(): Promise<void> {
  const time = new Date().toLocaleString('ko-KR');
  await sendMessage(`🚀 **YouTube 트렌드 수집기**\n\n⏰ 스케줄러가 시작되었습니다.\n\n스케줄: 매일 오전 9시\n시작 시간: ${time}`);
}

/**
 * 에러 알림
 */
export async function notifyError(error: Error, context?: string): Promise<void> {
  const time = new Date().toLocaleString('ko-KR');
  const contextStr = context ? `\n📍 컨텍스트: ${context}` : '';
  
  await sendMessage(
    `❌ **오류 발생**${contextStr}\n\n` +
    `🔴 ${error.message}\n\n` +
    `⏰ ${time}`
  );
}
