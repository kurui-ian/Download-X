import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDownloadUrl,
  isMagnetUri,
  extractDomain,
  extractFilenameFromUrl,
  cleanUrlInput,
} from '../src/renderer/utils/urlUtils.ts';

test('isValidDownloadUrl validates standard and magnet download URLs', () => {
  assert.equal(isValidDownloadUrl('https://releases.ubuntu.com/24.04/ubuntu-desktop.iso'), true);
  assert.equal(isValidDownloadUrl('http://speedtest.tele2.net/100MB.zip'), true);
  assert.equal(isValidDownloadUrl('magnet:?xt=urn:btih:da39a3ee5e6b4b0d3255bfef95601890afd80709&dn=test'), true);
  
  assert.equal(isValidDownloadUrl('ftp://example.com/file.zip'), false);
  assert.equal(isValidDownloadUrl('file:///C:/path/file.txt'), false);
  assert.equal(isValidDownloadUrl('javascript:alert(1)'), false);
  assert.equal(isValidDownloadUrl(''), false);
  assert.equal(isValidDownloadUrl('not a url'), false);
});

test('isMagnetUri accurately identifies BitTorrent magnet URIs', () => {
  assert.equal(isMagnetUri('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'), true);
  assert.equal(isMagnetUri('MAGNET:?XT=URN:BTIH:0123456789ABCDEF0123456789ABCDEF01234567'), true);
  assert.equal(isMagnetUri('magnet:?xt=urn:sha1:fake'), false);
  assert.equal(isMagnetUri('https://example.com/torrent.torrent'), false);
  assert.equal(isMagnetUri(''), false);
});

test('extractDomain correctly parses hostname and handles swarm placeholders', () => {
  assert.equal(extractDomain('https://speedtest.server.org/data/test.bin'), 'speedtest.server.org');
  assert.equal(extractDomain('http://localhost:3000/download'), 'localhost');
  assert.equal(extractDomain('magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335de7ece74f6ac'), 'BitTorrent Swarm');
  assert.equal(extractDomain('invalid-domain-string'), '');
  assert.equal(extractDomain(''), '');
});

test('extractFilenameFromUrl handles paths, percent-encoding, and query strings', () => {
  assert.equal(
    extractFilenameFromUrl('https://example.com/downloads/NodeSetup-v22.10.0.msi'),
    'NodeSetup-v22.10.0.msi'
  );
  assert.equal(
    extractFilenameFromUrl('https://cdn.example.org/files/Project%20Roadmap%20%28Final%29.pdf?token=xyz123'),
    'Project Roadmap (Final).pdf'
  );
  assert.equal(
    extractFilenameFromUrl('magnet:?xt=urn:btih:abcdef123456&dn=ArchLinux-2026.iso'),
    'ArchLinux-2026.iso'
  );
  assert.equal(
    extractFilenameFromUrl('magnet:?xt=urn:btih:abcdef123456'),
    'torrent-download'
  );
  assert.equal(extractFilenameFromUrl('https://example.com/'), '');
});

test('cleanUrlInput strips quotes and extraneous whitespace', () => {
  assert.equal(cleanUrlInput('  https://example.com/file.zip  '), 'https://example.com/file.zip');
  assert.equal(cleanUrlInput('"https://example.com/file.zip"'), 'https://example.com/file.zip');
  assert.equal(cleanUrlInput("'https://example.com/file.zip'"), 'https://example.com/file.zip');
  assert.equal(cleanUrlInput(''), '');
});
