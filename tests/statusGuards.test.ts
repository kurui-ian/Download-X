import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isActiveStatus,
  isTerminalStatus,
  isPausedStatus,
  isTorrentProtocol,
  isMediaCategory,
  canResumeTask,
} from '../src/main/engine/statusGuards.ts';

test('isActiveStatus returns true only for active network states', () => {
  assert.equal(isActiveStatus('connecting'), true);
  assert.equal(isActiveStatus('downloading'), true);
  assert.equal(isActiveStatus('queued'), false);
  assert.equal(isActiveStatus('paused'), false);
  assert.equal(isActiveStatus('completed'), false);
  assert.equal(isActiveStatus('error'), false);
  assert.equal(isActiveStatus('cancelled'), false);
});

test('isTerminalStatus correctly flags completed, error, and cancelled states', () => {
  assert.equal(isTerminalStatus('completed'), true);
  assert.equal(isTerminalStatus('error'), true);
  assert.equal(isTerminalStatus('cancelled'), true);
  assert.equal(isTerminalStatus('downloading'), false);
  assert.equal(isTerminalStatus('connecting'), false);
  assert.equal(isTerminalStatus('paused'), false);
  assert.equal(isTerminalStatus('queued'), false);
});

test('isPausedStatus matches paused state only', () => {
  assert.equal(isPausedStatus('paused'), true);
  assert.equal(isPausedStatus('downloading'), false);
  assert.equal(isPausedStatus('queued'), false);
});

test('isTorrentProtocol differentiates torrent from http protocols', () => {
  assert.equal(isTorrentProtocol('torrent'), true);
  assert.equal(isTorrentProtocol('http'), false);
  assert.equal(isTorrentProtocol(undefined), false);
});

test('isMediaCategory recognizes video, audio, and image categories', () => {
  assert.equal(isMediaCategory('video'), true);
  assert.equal(isMediaCategory('audio'), true);
  assert.equal(isMediaCategory('image'), true);
  assert.equal(isMediaCategory('document'), false);
  assert.equal(isMediaCategory('archive'), false);
  assert.equal(isMediaCategory('program'), false);
  assert.equal(isMediaCategory('all'), false);
});

test('canResumeTask requires paused/error status and range support', () => {
  assert.equal(canResumeTask({ status: 'paused', supportsRanges: true }), true);
  assert.equal(canResumeTask({ status: 'error', supportsRanges: true }), true);
  assert.equal(canResumeTask({ status: 'paused', supportsRanges: false }), false);
  assert.equal(canResumeTask({ status: 'error', supportsRanges: false }), false);
  assert.equal(canResumeTask({ status: 'completed', supportsRanges: true }), false);
  assert.equal(canResumeTask({ status: 'downloading', supportsRanges: true }), false);
});

