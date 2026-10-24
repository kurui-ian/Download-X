import test from 'node:test';
import assert from 'node:assert/strict';

interface TestChunk {
  id: number;
  startByte: number;
  endByte: number;
  downloadedBytes: number;
  totalBytes: number;
  status: 'pending' | 'downloading' | 'completed';
}

function simulateWorkSteal(chunks: TestChunk[], nextId: number, minSplitThreshold = 1024 * 1024) {
  let bestCandidate: TestChunk | null = null;
  let maxRemaining = 0;

  for (const chunk of chunks) {
    if (chunk.status === 'downloading') {
      const currentHead = chunk.startByte + chunk.downloadedBytes;
      const remaining = chunk.endByte - currentHead + 1;
      if (remaining > maxRemaining && remaining >= minSplitThreshold) {
        maxRemaining = remaining;
        bestCandidate = chunk;
      }
    }
  }

  if (!bestCandidate) {
    return null;
  }

  const currentHead = bestCandidate.startByte + bestCandidate.downloadedBytes;
  const splitBytes = Math.floor(maxRemaining / 2);
  if (splitBytes < 256 * 1024) {
    return null;
  }

  const newCandidateEnd = currentHead + splitBytes - 1;
  const newChunkStart = newCandidateEnd + 1;
  const newChunkEnd = bestCandidate.endByte;

  bestCandidate.endByte = newCandidateEnd;
  bestCandidate.totalBytes = newCandidateEnd - bestCandidate.startByte + 1;

  const newChunk: TestChunk = {
    id: nextId,
    startByte: newChunkStart,
    endByte: newChunkEnd,
    downloadedBytes: 0,
    totalBytes: newChunkEnd - newChunkStart + 1,
    status: 'downloading',
  };

  const idx = chunks.findIndex((c) => c.id === bestCandidate!.id);
  chunks.splice(idx + 1, 0, newChunk);

  return newChunk;
}

test('work-stealing splits the largest active chunk into contiguous non-overlapping ranges', () => {
  const chunks: TestChunk[] = [
    { id: 0, startByte: 0, endByte: 9999999, downloadedBytes: 10000000, totalBytes: 10000000, status: 'completed' },
    { id: 1, startByte: 10000000, endByte: 29999999, downloadedBytes: 2000000, totalBytes: 20000000, status: 'downloading' },
  ];

  const originalStart = chunks[1].startByte;
  const originalEnd = chunks[1].endByte;
  const originalTotal = chunks[1].totalBytes;
  const originalDownloaded = chunks[1].downloadedBytes;

  const stolen = simulateWorkSteal(chunks, 2);
  assert.notEqual(stolen, null);

  const candidate = chunks[1];
  const newChunk = chunks[2];

  // 1. Candidate must retain its starting byte and existing downloaded bytes
  assert.equal(candidate.startByte, originalStart);
  assert.equal(candidate.downloadedBytes, originalDownloaded);

  // 2. The boundary between candidate and stolen chunk must be strictly adjacent
  assert.equal(candidate.endByte + 1, newChunk.startByte);

  // 3. Stolen chunk must end at the original chunk's endByte
  assert.equal(newChunk.endByte, originalEnd);

  // 4. Stolen chunk must start with 0 downloaded bytes
  assert.equal(newChunk.downloadedBytes, 0);

  // 5. Total bytes across candidate and newChunk must equal original totalBytes
  assert.equal(candidate.totalBytes + newChunk.totalBytes, originalTotal);
});

test('work-stealing rejects chunks smaller than the split threshold to prevent micro-fragmentation', () => {
  const chunks: TestChunk[] = [
    { id: 0, startByte: 0, endByte: 500000, downloadedBytes: 200000, totalBytes: 500001, status: 'downloading' },
  ];

  // Remaining is 300,001 bytes, which is below 1 MB threshold
  const stolen = simulateWorkSteal(chunks, 1, 1024 * 1024);
  assert.equal(stolen, null);
  assert.equal(chunks.length, 1);
});
