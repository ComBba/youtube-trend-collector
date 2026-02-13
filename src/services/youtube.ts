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
  maxAgeDays?: number; // 최근 N일 이내 영상만 수집
}

const DEFAULT_OPTIONS: SearchOptions = {
  limit: 10,
  sort: 'view_count',
  maxAgeDays: 7, // 기본값: 7일 이내
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
  // ytsearchdate: 업로드 날짜순 (최신순), ytsearch: 관련성순
  const searchPrefix = opts.maxAgeDays ? 'ytsearchdate' : 'ytsearch';
  const searchQuery = `${searchPrefix}${limit}:${keyword}`;

  // 정렬 및 필터 옵션 (추후 고급 정렬 기능에 사용 예정)
  // const sortMap: Record<string, string> = {
  //   relevance: '',
  //   upload_date: 'upload_date',
  //   view_count: 'view_count',
  //   rating: 'rating',
  // };

  // ytsearchdate 사용 시 최신 영상 위주로 검색됨
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

  // 날짜 필터 - maxAgeDays 우선 적용
  if (opts.maxAgeDays) {
    const dateAfter = new Date();
    dateAfter.setDate(dateAfter.getDate() - opts.maxAgeDays);
    const dateStr = dateAfter.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    args.push('--dateafter', dateStr);
  } else if (dateRange) {
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

    // NDJSON collector (chunk-safe, CRLF-safe, and safe close flush)
    // NOTE: yt-dlp는 기본적으로 JSON 한 줄씩(NDJSON) 출력하지만,
    //       chunk boundary가 임의라서 line boundary는 직접 복원해야 함.
    const MAX_BUFFER_CHARS = 5_000_000; // safety net (대략 5MB)

    let buffer = '';

    const tryParseLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const info = JSON.parse(trimmed) as Record<string, unknown>;
        videos.push(parseVideoInfo(info));
      } catch {
        // JSON 파싱 실패 무시 (yt-dlp가 간헐적으로 non-JSON 라인을 섞을 수 있음)
      }
    };

    const consumeNdjson = (chunk: Buffer | string) => {
      buffer += chunk.toString();

      // corrupted output 등으로 newline이 영원히 오지 않는 경우를 방어
      if (buffer.length > MAX_BUFFER_CHARS) {
        buffer = '';
        return;
      }

      // split()은 chunk가 많을 때 alloc이 커질 수 있어 indexOf loop로 처리
      while (true) {
        const nl = buffer.indexOf('\n');
        if (nl === -1) break;

        let line = buffer.slice(0, nl);
        if (line.endsWith('\r')) line = line.slice(0, -1); // CRLF
        buffer = buffer.slice(nl + 1);

        tryParseLine(line);
      }
    };

    const flushNdjson = () => {
      if (!buffer) return;

      // Close 시점에 buffer 안에 여러 줄이 남아있을 수 있음 (trailing newline 없음)
      const lines = buffer.split(/\r?\n/);
      buffer = '';

      for (const line of lines) tryParseLine(line);
    };

    ytDlp.stdout.on('data', consumeNdjson);

    ytDlp.stderr.on('data', (data: Buffer) => {
      // stderr는 보통 progress/warnings 용도. 필요할 때만 debug 출력.
      if (process.env.DEBUG_YTDLP === '1') {
        console.debug('yt-dlp stderr:', data.toString().trim());
      }
    });

    ytDlp.on('close', (code) => {
      flushNdjson();

      // non-zero exit라도 일부 결과가 있으면 partial 결과를 반환
      if (code !== 0 && videos.length === 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
      } else {
        resolve(videos);
      }
    });

    ytDlp.on('error', (err) => {
      if (err instanceof Error && err.message.includes('ENOENT')) {
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
      } catch {
        reject(new Error('Failed to parse video info'));
      }
    });

    ytDlp.on('error', reject);
  });
}

/**
 * yt-dlp 출력 파싱
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseVideoInfo(data: Record<string, any>): VideoInfo {
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
