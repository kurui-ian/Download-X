#!/usr/bin/env node
/**
 * DLX Native Messaging Host (Chrome / Edge / Brave / Chromium)
 *
 * Implements the standard Chromium Native Messaging stdio protocol:
 * - Reads 4-byte UInt32LE length prefix + UTF-8 JSON message from process.stdin
 * - Forwards validated message to the running DLX Electron Main Process on 127.0.0.1:45789
 * - Writes 4-byte UInt32LE length prefix + UTF-8 JSON response to process.stdout
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BRIDGE_HOST = '127.0.0.1';
const BRIDGE_PORT = 45789;
const MAX_MSG_SIZE = 64 * 1024;

function writeNativeMessage(obj) {
  try {
    const jsonStr = JSON.stringify(obj);
    const payload = Buffer.from(jsonStr, 'utf-8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length, 0);
    process.stdout.write(Buffer.concat([header, payload]));
  } catch (err) {
    // Avoid writing non-framed text to stdout
  }
}

function forwardToElectronBridge(payloadObj) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify(payloadObj), 'utf-8');
    const req = http.request(
      {
        hostname: BRIDGE_HOST,
        port: BRIDGE_PORT,
        path: '/api/bridge',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          'X-DLX-Client': 'native-messaging-host',
        },
        timeout: 4500,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf-8');
            const parsed = JSON.parse(raw);
            resolve(parsed);
          } catch {
            resolve({ ok: false, error: 'Invalid response from DLX Desktop.' });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        ok: false,
        running: false,
        status: 'offline',
        error: 'DLX desktop application did not respond (timed out).',
      });
    });

    req.on('error', () => {
      resolve({
        ok: false,
        running: false,
        status: 'offline',
        error: 'DLX desktop application is not running.',
      });
    });

    req.write(body);
    req.end();
  });
}

function tryLaunchDlxDesktop() {
  try {
    const configPath = path.join(__dirname, 'dlx-host-config.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (cfg.exePath && fs.existsSync(cfg.exePath)) {
        const child = spawn(cfg.exePath, cfg.args || [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
        child.unref();
        return true;
      }
    }
  } catch {}
  return false;
}

async function handleIncomingMessage(rawBuffer) {
  let msg;
  try {
    msg = JSON.parse(rawBuffer.toString('utf-8'));
  } catch {
    writeNativeMessage({ ok: false, error: 'Malformed JSON sent to Native Messaging Host.' });
    return;
  }

  let response = await forwardToElectronBridge(msg);

  // If DLX is closed and user requested openApplication, launch DLX.exe
  if (!response.ok && response.running === false && msg && msg.type === 'openApplication') {
    const launched = tryLaunchDlxDesktop();
    if (launched) {
      // Wait up to 3 seconds for DLX bridge to come online
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const check = await forwardToElectronBridge({ type: 'getStatus' });
        if (check && check.running) {
          writeNativeMessage({ ok: true, running: true, launched: true });
          return;
        }
      }
      writeNativeMessage({ ok: true, running: true, launched: true });
      return;
    }
  }

  writeNativeMessage(response);
}

// Stdin stream reader for 4-byte UInt32LE length-prefixed messages
let inputBuffer = Buffer.alloc(0);
let processingChain = Promise.resolve();
let stdinClosed = false;

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);

  while (inputBuffer.length >= 4) {
    const msgLen = inputBuffer.readUInt32LE(0);
    if (msgLen > MAX_MSG_SIZE) {
      writeNativeMessage({ ok: false, error: 'Native message exceeds maximum allowed size.' });
      process.exit(1);
      return;
    }
    if (inputBuffer.length < 4 + msgLen) {
      break;
    }
    const msgSlice = Buffer.from(inputBuffer.subarray(4, 4 + msgLen));
    inputBuffer = inputBuffer.subarray(4 + msgLen);
    processingChain = processingChain
      .then(() => handleIncomingMessage(msgSlice))
      .catch(() => {});
  }
});

process.stdin.on('end', () => {
  stdinClosed = true;
  processingChain.finally(() => {
    process.exit(0);
  });
});
