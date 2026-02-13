import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

import { searchYouTube } from '../src/services/youtube';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

function mockSpawnProcess() {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  vi.mocked(spawn).mockReturnValue(proc);
  return proc;
}

describe('youtube service - edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles partial JSON data across multiple chunks', async () => {
    const proc = mockSpawnProcess();

    const mockVideoData = { id: 'chunk123', title: 'Chunked Video', view_count: 100 };
    const jsonStr = `${JSON.stringify(mockVideoData)}\n`;
    const mid = Math.floor(jsonStr.length / 2);

    const searchPromise = searchYouTube('test');

    proc.stdout.emit('data', Buffer.from(jsonStr.slice(0, mid)));
    proc.stdout.emit('data', Buffer.from(jsonStr.slice(mid)));

    proc.emit('close', 0);

    const results = await searchPromise;
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('chunk123');
  });

  it('handles empty output from yt-dlp', async () => {
    const proc = mockSpawnProcess();

    const searchPromise = searchYouTube('test');
    proc.emit('close', 0);

    const results = await searchPromise;
    expect(results).toHaveLength(0);
  });

  it('returns partial results even when yt-dlp exits non-zero', async () => {
    const proc = mockSpawnProcess();

    const mockVideoData = { id: 'v1', title: 'V1' };
    const searchPromise = searchYouTube('test');

    proc.stdout.emit('data', Buffer.from(`${JSON.stringify(mockVideoData)}\n`));
    proc.emit('close', 1);

    const results = await searchPromise;
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('v1');
  });

  it('flushes multiple buffered lines on close (no trailing newline)', async () => {
    const proc = mockSpawnProcess();

    const a = { id: 'a', title: 'A' };
    const b = { id: 'b', title: 'B' };

    const searchPromise = searchYouTube('test');

    proc.stdout.emit('data', Buffer.from(`${JSON.stringify(a)}\n${JSON.stringify(b)}`));
    proc.emit('close', 0);

    const results = await searchPromise;
    expect(results.map((v) => v.id)).toEqual(['a', 'b']);
  });
});
