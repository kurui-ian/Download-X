import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { app } from 'electron';

export const NATIVE_HOST_NAME = 'com.dlx.downloadmanager';
export const DEFAULT_EXTENSION_ID = 'poalfflpopjbfnhibkondgcgogpmgkbh';

const NATIVE_HOST_SCRIPT = `#!/usr/bin/env node
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
  } catch {}
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
            resolve(JSON.parse(raw));
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

  const response = await forwardToElectronBridge(msg);

  if (!response.ok && response.running === false && msg && msg.type === 'openApplication') {
    const launched = tryLaunchDlxDesktop();
    if (launched) {
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

let inputBuffer = Buffer.alloc(0);
let processingChain = Promise.resolve();

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
  processingChain.finally(() => {
    process.exit(0);
  });
});
`;

export interface NativeHostStatus {
  registered: boolean;
  hostName: string;
  extensionId: string;
  manifestPath: string;
}

export class NativeHostRegistrar {
  private static manifestPath: string = '';

  public static async ensureRegistered(customExtensionIds: string[] = []): Promise<NativeHostStatus> {
    let userDataDir: string;
    try {
      userDataDir = app.getPath('userData');
    } catch {
      userDataDir = path.join(os.homedir(), '.dlx');
    }

    const hostDir = path.join(userDataDir, 'native-host');
    if (!fs.existsSync(hostDir)) {
      fs.mkdirSync(hostDir, { recursive: true });
    }

    const scriptPath = path.join(hostDir, 'dlx-native-host.js');
    const batPath = path.join(hostDir, 'dlx-native-host.bat');
    const configPath = path.join(hostDir, 'dlx-host-config.json');
    const manifestPath = path.join(hostDir, `${NATIVE_HOST_NAME}.json`);
    this.manifestPath = manifestPath;

    // 1. Write the Node.js stdio host script
    fs.writeFileSync(scriptPath, NATIVE_HOST_SCRIPT, 'utf-8');

    // 2. Write config with DLX executable path so the host can launch DLX when closed
    const exePath = process.execPath;
    const isPackaged = app ? app.isPackaged : true;
    const launchArgs = isPackaged ? [] : [app.getAppPath()];
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          exePath,
          args: launchArgs,
          updatedAt: Date.now(),
        },
        null,
        2
      ),
      'utf-8'
    );

    // 3. Write batch launcher using ELECTRON_RUN_AS_NODE=1 so it runs without requiring global Node.js
    const batContent = [
      '@echo off',
      'set ELECTRON_RUN_AS_NODE=1',
      `"${exePath}" "${scriptPath}" %*`,
      '',
    ].join('\r\n');
    fs.writeFileSync(batPath, batContent, 'utf-8');

    // 4. Build allowed_origins with our deterministic Extension ID + any custom IDs
    const extIds = Array.from(new Set([DEFAULT_EXTENSION_ID, ...customExtensionIds])).filter((id) =>
      /^[a-p]{32}$/.test(id)
    );
    const allowedOrigins = extIds.map((id) => `chrome-extension://${id}/`);

    const hostManifest = {
      name: NATIVE_HOST_NAME,
      description: 'DLX (Download-X) Native Messaging Host',
      path: batPath,
      type: 'stdio',
      allowed_origins: allowedOrigins,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(hostManifest, null, 2), 'utf-8');

    // Also mirror into workspace native-host/ folder if running in project workspace
    try {
      const workspaceHostDir = path.join(process.cwd(), 'native-host');
      if (fs.existsSync(workspaceHostDir)) {
        fs.writeFileSync(path.join(workspaceHostDir, 'dlx-native-host.bat'), batContent, 'utf-8');
        fs.writeFileSync(path.join(workspaceHostDir, 'dlx-host-config.json'), fs.readFileSync(configPath, 'utf-8'), 'utf-8');
        fs.writeFileSync(
          path.join(workspaceHostDir, `${NATIVE_HOST_NAME}.json`),
          JSON.stringify({ ...hostManifest, path: path.join(workspaceHostDir, 'dlx-native-host.bat') }, null, 2),
          'utf-8'
        );
      }
    } catch {}

    // 5. Register in Windows Registry for Chrome, Edge, Brave, and Chromium
    if (process.platform === 'win32') {
      const regKeys = [
        `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
        `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
        `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
        `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
      ];

      await Promise.all(
        regKeys.map(
          (regKey) =>
            new Promise<void>((resolve) => {
              execFile(
                'reg.exe',
                ['add', regKey, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'],
                { windowsHide: true },
                () => resolve()
              );
            })
        )
      );
    }

    return {
      registered: true,
      hostName: NATIVE_HOST_NAME,
      extensionId: DEFAULT_EXTENSION_ID,
      manifestPath,
    };
  }

  public static getStatus(): NativeHostStatus {
    return {
      registered: Boolean(this.manifestPath && fs.existsSync(this.manifestPath)),
      hostName: NATIVE_HOST_NAME,
      extensionId: DEFAULT_EXTENSION_ID,
      manifestPath: this.manifestPath,
    };
  }
}
