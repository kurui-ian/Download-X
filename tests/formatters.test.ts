import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatSpeed, formatEta, formatDate, formatPercent } from '../src/renderer/utils/formatters.ts';

test('formatBytes formats zero and invalid bytes correctly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(-1), '--');
  assert.equal(formatBytes(NaN), '--');
});

test('formatBytes formats binary unit scales accurately', () => {
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1024 * 1024), '1 MB');
  assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB');
  assert.equal(formatBytes(1024 * 1024 * 1024), '1 GB');
  assert.equal(formatBytes(1024 * 1024 * 1024 * 1024), '1 TB');
});

test('formatBytes handles petabytes and exabytes scaling', () => {
  const pb = Math.pow(1024, 5);
  const eb = Math.pow(1024, 6);
  assert.equal(formatBytes(pb), '1 PB');
  assert.equal(formatBytes(eb), '1 EB');
});

test('formatSpeed appends /s suffix and handles zero rate', () => {
  assert.equal(formatSpeed(0), '0 KB/s');
  assert.equal(formatSpeed(-100), '0 KB/s');
  assert.equal(formatSpeed(1024 * 1024 * 5), '5 MB/s');
});

test('formatSpeed handles non-finite and infinite values gracefully', () => {
  assert.equal(formatSpeed(Infinity), '0 KB/s');
  assert.equal(formatSpeed(-Infinity), '0 KB/s');
  assert.equal(formatSpeed(NaN), '0 KB/s');
});

test('formatEta formats seconds into readable time spans', () => {
  assert.equal(formatEta(0), '--');
  assert.equal(formatEta(-5), '--');
  assert.equal(formatEta(45), '45s');
  assert.equal(formatEta(125), '2m 5s');
  assert.equal(formatEta(3665), '1h 1m');
});

test('formatEta formats exact minute and hour thresholds correctly', () => {
  assert.equal(formatEta(60), '1m 0s');
  assert.equal(formatEta(3600), '1h 0m');
  assert.equal(formatEta(7200), '2h 0m');
  assert.equal(formatEta(Infinity), '--');
});

test('formatPercent clamps values between 0% and 100%', () => {
  assert.equal(formatPercent(-10), '0%');
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(45.56, 1), '45.6%');
  assert.equal(formatPercent(100), '100%');
  assert.equal(formatPercent(120), '100%');
});

test('formatPercent handles edge values and custom decimal precisions', () => {
  assert.equal(formatPercent(NaN), '0%');
  assert.equal(formatPercent(99.999, 2), '100.00%');
  assert.equal(formatPercent(12.3456, 3), '12.346%');
});

test('formatDate handles valid and invalid timestamps', () => {
  assert.equal(formatDate(0), '--');
  assert.equal(formatDate(-100), '--');
  assert.equal(formatDate(NaN), '--');
  
  const sampleTime = new Date('2026-01-01T12:00:00Z').getTime();
  const formatted = formatDate(sampleTime);
  assert.equal(typeof formatted, 'string');
  assert.notEqual(formatted, '--');
});

test('formatBytes respects custom decimal parameters', () => {
  const bytes = 1.256 * 1024 * 1024;
  assert.equal(formatBytes(bytes, 2), '1.26 MB');
  assert.equal(formatBytes(bytes, 0), '1 MB');
});
