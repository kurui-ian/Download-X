const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

function waitForVite(url, timeoutMs = 20000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Timed out waiting for Vite dev server'));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    check();
  });
}

async function startDev() {
  console.log('[DLX Dev] 1/3 Compiling Electron main process...');
  const tsc = spawn('cmd.exe', ['/c', 'npx', 'tsc', '-p', 'tsconfig.electron.json'], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
  });

  await new Promise((resolve, reject) => {
    tsc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`TypeScript compilation failed with code ${code}`));
    });
  });

  console.log('[DLX Dev] 2/3 Starting Vite live dev server on http://localhost:5173...');
  const vite = spawn('cmd.exe', ['/c', 'npx', 'vite'], {
    stdio: 'pipe',
    cwd: path.resolve(__dirname, '..'),
  });

  vite.stdout.on('data', (d) => process.stdout.write(`[Vite] ${d}`));
  vite.stderr.on('data', (d) => process.stderr.write(`[Vite ERR] ${d}`));

  await waitForVite('http://localhost:5173');
  console.log('[DLX Dev] 3/3 Launching DLX with Live Hot-Reloading...');

  const electronPath = require('electron');
  const electronProcess = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
  });

  electronProcess.on('exit', () => {
    console.log('[DLX Dev] Desktop application closed. Stopping Vite dev server...');
    vite.kill();
    process.exit(0);
  });
}

startDev().catch((err) => {
  console.error('[DLX Dev] Failed to start dev environment:', err);
  process.exit(1);
});
