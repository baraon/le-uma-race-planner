// Runs the shared package's tests with the process clock set to several timezones.
// The results must be identical: availability is stored and computed in UTC, and zones only
// matter when we explicitly format for a viewer.
import { spawnSync } from 'node:child_process';

const zones = ['UTC', 'America/Chicago', 'Europe/Berlin', 'Australia/Sydney', 'Asia/Kolkata'];
let failed = false;

for (const tz of zones) {
  console.log(`\n=== TZ=${tz} ===`);
  const result = spawnSync('pnpm', ['--filter', '@lmu/shared', 'test'], {
    stdio: 'inherit',
    env: { ...process.env, TZ: tz },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
