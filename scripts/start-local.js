import { execFile } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

// Local desktop mode stays on the loopback interface.
process.env.HOST = '127.0.0.1';
process.env.PORT = '3000';
process.env.COOKIE_SECURE = '0';
const address = 'http://localhost:3000';
try {
  const response = await fetch('http://127.0.0.1:3000/api/questions', { signal: AbortSignal.timeout(1000) });
  if (response.ok) {
    console.error('Port 3000 is already in use. Open http://localhost:3000 if QA Path is already running, or stop that process before starting again.');
    process.exit(1);
  }
} catch { /* The port is normally not listening before startup. */ }
await import('../server.js');
for (let i = 0; i < 50; i++) {
  try {
    const response = await fetch('http://127.0.0.1:3000/api/questions', { signal: AbortSignal.timeout(1000) });
    if (!response.ok) throw new Error('Server not ready');
    console.log(`\nOpen ${address}\nKeep this window open. Press Ctrl+C to stop.\nYour account and questions are saved in data/app.db.\n`);
    if (process.platform === 'win32') {
      execFile('cmd.exe', ['/d', '/c', 'start', '', address], error => {
        if (error) console.log(`Please open ${address} in your browser.`);
      });
    }
    break;
  } catch {
    if (i === 49) { console.error('Startup timed out. Check the server output above.'); process.exit(1); }
    await setTimeout(200);
  }
}
