import { spawn } from 'child_process';

export interface VideoInfo {
  id: string;
  title: string;
  url: string;
  channel: string;
  channelUrl?: string;
  viewCount?: number;
  likeCount?: number;
  duration?: string;
  thumbnail?: string;
  publishedAt?: Date;
  description?: string;
}

export interface SearchOptions {
  limit?: number;
  sort?: 'relevance' | 'upload_date' | 'view_count' | 'rating';
  dateRange?: 'today' | 'this_week' | 'this_month' | 'this_year';
}

const DEFAULT_OPTIONS: SearchOptions = {
  limit: 10,
  sort: 'view_count',
};

/**
 * yt-dlp를 사용한 YouTube 검색
 */
export async function searchYouTube(
  keyword: string,
  options: SearchOptions = {}
): Promise<VideoInfo[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { limit, sort, dateRange } = opts;

  // yt-dlp 검색 URL 형식
  const searchQuery = `ytsearch${limit}:${keyword}`;

  // 정렬 및 필터 옵션
  const sortMap: Record<string, string> = {
    relevance: '',
    upload_date: 'upload_date',
    view_count: 'view_count',
    rating: 'rating',
  };

  const args: string[] = [
    searchQuery,
    '--dump-json',
    '--flat-playlist',
    '--no-warnings',
    '--quiet',
  ];

  // 정렬 옵션 추가
  if (sort && sort !== 'relevance') {
    args.push('--playlist-end', String(limit));
  }

  // 날짜 필터
  if (dateRange) {
    const dateFilter: Record<string, string> = {
      today: 'today',
      this_week: 'thisweek',
      this_month: 'thismonth',
      this_year: 'thisyear',
    };
    args.push('--dateafter', dateFilter[dateRange]);
  }

  return new Promise((resolve, reject) => {
    const videos: VideoInfo[] = [];
    const ytDlp = spawn('yt-dlp', args);
    let buffer = '';

    ytDlp.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 마지막 불완전한 라인 유지

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const info = JSON.parse(line);
          videos.push(parseVideoInfo(info));
        } catch (e) {
          // JSON 파싱 실패 무시
        }
      }
    });

    ytDlp.stderr.on('data', (data: Buffer) => {
      // stderr 로그는 무시하거나 디버그용으로 사용
      console.debug('yt-dlp stderr:', data.toString().trim());
    });

    ytDlp.on('close', (code) => {
      if (buffer) {
        try {
          const info = JSON.parse(buffer);
          videos.push(parseVideoInfo(info));
        } catch {
          // 무시
        }
      }

      if (code !== 0 && videos.length === 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
      } else {
        resolve(videos);
      }
    });

    ytDlp.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        reject(new Error('yt-dlp가 설치되어 있지 않습니다. 먼저 설치해주세요.'));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * 특정 비디오의 상세 정보 가져오기
 */
export async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  const url = `https://youtube.com/watch?v=${videoId}`;
  
  return new Promise((resolve, reject) => {
    const ytDlp = spawn('yt-dlp', [
      url,
      '--dump-json',
      '--no-warnings',
      '--quiet',
    ]);

    let output = '';

    ytDlp.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    ytDlp.on('close', (code) => {
      if (code !== 0 || !output) {
        reject(new Error(`Failed to fetch video info: ${code}`));
        return;
      }

      try {
        const info = JSON.parse(output);
        resolve(parseVideoInfo(info));
      } catch (e) {
        reject(new Error('Failed to parse video info'));
      }
    });

    ytDlp.on('error', reject);
  });
}

/**
 * yt-dlp 출력 파싱
 */
function parseVideoInfo(data: any): VideoInfo {
  // 업로드 날짜 파싱
  let publishedAt: Date | undefined;
  if (data.upload_date) {
    const year = data.upload_date.slice(0, 4);
    const month = data.upload_date.slice(4, 6);
    const day = data.upload_date.slice(6, 8);
    publishedAt = new Date(`${year}-${month}-${day}`);
  }

  return {
    id: data.id,
    title: data.title || 'Unknown Title',
    url: data.webpage_url || `https://youtube.com/watch?v=${data.id}`,
    channel: data.channel || data.uploader || 'Unknown Channel',
    channelUrl: data.channel_url || data.uploader_url,
    viewCount: data.view_count || 0,
    likeCount: data.like_count,
    duration: formatDuration(data.duration),
    thumbnail: data.thumbnail,
    publishedAt,
    description: data.description,
  };
}

/**
 * 초를 HH:MM:SS 형식으로 변환
 */
function formatDuration(seconds?: number): string | undefined {
  if (!seconds) return undefined;
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * yt-dlp 설치 확인
 */
export async function checkYtDlp(): Promise<boolean> {
  return new Promise((resolve) => {
    const ytDlp = spawn('yt-dlp', ['--version']);
    ytDlp.on('close', (code) => resolve(code === 0));
    ytDlp.on('error', () => resolve(false));
  });
}
