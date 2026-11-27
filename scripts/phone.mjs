// Phone mode: serves the app over https on your home Wi-Fi, so a phone on the same
// network can open it and use its camera (phones only allow the camera on secure pages).
// Makes a private certificate for this computer with the built-in openssl the first time,
// and again whenever the computer's Wi-Fi address changes.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '.cert');
const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem'), stamp = join(dir, 'addresses.txt');

const ips = Object.values(networkInterfaces()).flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
if (ips.length === 0) {
  console.error('\nThis computer has no network address. Connect it to Wi-Fi and try again.\n');
  process.exit(1);
}

const want = ips.join(',');
const have = existsSync(stamp) ? readFileSync(stamp, 'utf8') : '';
if (!existsSync(key) || !existsSync(cert) || have !== want) {
  mkdirSync(dir, { recursive: true });
  const names = ['DNS:localhost', ...ips.map((ip) => `IP:${ip}`)].join(',');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825',
    '-keyout', key, '-out', cert, '-subj', '/CN=Voyager Mirror on this computer', '-addext', `subjectAltName=${names}`],
  { stdio: 'ignore' });
  writeFileSync(stamp, want);
}

const port = 5173;
console.log('\n  Voyager Mirror phone mode');
console.log('  -------------------------');
console.log('  1. Put your phone on the same Wi-Fi as this computer.');
console.log('  2. Open this address in the phone\'s browser:\n');
for (const ip of ips) console.log(`       https://${ip}:${port}`);
console.log('\n  3. The phone will warn that the connection is not private. That is expected:');
console.log('     the certificate was made by this computer, not a company.');
console.log('     iPhone: tap "Show Details", then "visit this website".');
console.log('     Android: tap "Advanced", then "Proceed".');
console.log('  4. Tap Start camera and allow the camera.\n');

const vite = spawn(join(root, 'node_modules', '.bin', 'vite'), ['--host', '--port', String(port), '--strictPort'], {
  stdio: 'inherit', env: { ...process.env, VM_HTTPS: '1' },
});
vite.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => vite.kill(sig));
