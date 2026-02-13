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
  /** Max number of videos to return */
  limit?: number;
  /** Higher-level sort hint (note: ytsearch/ytsearchdate have limited server-side sorting controls) */
  sort?: 'relevance' | 'upload_date' | 'view_count' | 'rating';
  /** Date window (used only when maxAgeDays is not provided) */
  dateRange?: 'today' | 'this_week' | 'this_month' | 'this_year';
  /** Only include videos uploaded in the last N days */
  maxAgeDays?: number;
}

const DEFAULT_OPTIONS: Required<Pick<SearchOptions, 'limit' | 'sort' | 'maxAgeDays'>> = {
  limit: 10,
  sort: 'view_count',
  maxAgeDays: 7,
};

/**
 * Parse a stream of newline-delimited JSON (NDJSON).
 * - Handles chunked output.
 * - Handles CRLF.
 * - Avoids losing multiple buffered lines on close.
 */
function createNdjsonCollector<T>(
  onItem: (item: T) => void,
  opts?: { onParseError?: (line: string, err: unknown) => void }
) {
  let buffer = '';

  const flush = () => {
    if (!buffer) return;

    // There may be multiple lines still in the buffer (e.g., no trailing \n).
    const lines = buffer.split(/\r?\n/);
    buffer = '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onItem(JSON.parse(line) as T);
      } catch (err) {
        opts?.onParseError?.(line, err);
      }
    }
  };

  const consume = (chunk: Buffer | string) => {
    buffer += chunk.toString();

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onItem(JSON.parse(line) as T);
      } catch (err) {
        opts?.onParseError?.(line, err);
      }
    }
  };

  return { consume, flush };
}

/**
 * yt-dlp based YouTube search.
 * NOTE: This is a drop-in alternative implementation meant for hardening.
 */
export async function searchYouTubeV2(
  keyword: string,
  options: SearchOptions = {}
): Promise<VideoInfo[]> {
  const opts: SearchOptions = { ...DEFAULT_OPTIONS, ...options };
  const limit = opts.limit ?? DEFAULT_OPTIONS.limit;

  // Prefer "ytsearchdate" when using maxAgeDays to bias towards recent uploads.
  const searchPrefix = opts.maxAgeDays ? 'ytsearchdate' : 'ytsearch';
  const searchQuery = `${searchPrefix}${limit}:${keyword}`;

  const args: string[] = [
    searchQuery,
    '--dump-json',
    '--flat-playlist',
    '--no-warnings',
    '--quiet',
    // Ensure we never return more than limit even if the backend changes.
    '--playlist-end',
    String(limit),
  ];

  // Date filter: maxAgeDays first.
  if (opts.maxAgeDays) {
    const dateAfter = new Date();
    dateAfter.setDate(dateAfter.getDate() - opts.maxAgeDays);
    const dateStr = dateAfter.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    args.push('--dateafter', dateStr);
  } else if (opts.dateRange) {
    const dateFilter: Record<NonNullable<SearchOptions['dateRange']>, string> = {
      today: 'today',
      this_week: 'thisweek',
      this_month: 'thismonth',
      this_year: 'thisyear',
    };
    args.push('--dateafter', dateFilter[opts.dateRange]);
  }

  return new Promise((resolve, reject) => {
    const videos: VideoInfo[] = [];

    const ytDlp = spawn('yt-dlp', args);

    const collector = createNdjsonCollector<Record<string, unknown>>(
      (raw) => videos.push(parseVideoInfo(raw)),
      {
        onParseError: () => {
          // Intentionally ignore parse errors: yt-dlp occasionally logs non-JSON lines.
        },
      }
    );

    ytDlp.stdout.on('data', collector.consume);

    ytDlp.stderr.on('data', (data: Buffer) => {
      // Stderr is typically used for progress/warnings; keep as debug only.
      console.debug('yt-dlp stderr:', data.toString().trim());
    });

    ytDlp.on('close', (code) => {
      collector.flush();

      // If yt-dlp exits non-zero but we got some items, we still return the partial results.
      if (code !== 0 && videos.length === 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }

      resolve(videos);
    });

    ytDlp.on('error', (err) => {
      if (err instanceof Error && err.message.includes('ENOENT')) {
        reject(new Error('yt-dlp가 설치되어 있지 않습니다. 먼저 설치해주세요.'));
        return;
      }
      reject(err);
    });
  });
}

/**
 * yt-dlp output parsing
 */
function parseVideoInfo(data: Record<string, unknown>): VideoInfo {
  const getString = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : undefined);
  const getNumber = (k: string) => (typeof data[k] === 'number' ? (data[k] as number) : undefined);

  // Upload date parsing (YYYYMMDD)
  let publishedAt: Date | undefined;
  const uploadDate = getString('upload_date');
  if (uploadDate && /^\d{8}$/.test(uploadDate)) {
    const year = uploadDate.slice(0, 4);
    const month = uploadDate.slice(4, 6);
    const day = uploadDate.slice(6, 8);
    publishedAt = new Date(`${year}-${month}-${day}`);
  }

  const id = getString('id') ?? '';

  return {
    id,
    title: getString('title') ?? 'Unknown Title',
    url: getString('webpage_url') ?? (id ? `https://youtube.com/watch?v=${id}` : 'https://youtube.com'),
    channel: getString('channel') ?? getString('uploader') ?? 'Unknown Channel',
    channelUrl: getString('channel_url') ?? getString('uploader_url'),
    viewCount: getNumber('view_count') ?? 0,
    likeCount: getNumber('like_count'),
    duration: formatDuration(getNumber('duration')),
    thumbnail: getString('thumbnail'),
    publishedAt,
    description: getString('description'),
  };
}

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
