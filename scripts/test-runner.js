#!/usr/bin/env node
const { spawnSync } = require('child_process');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (res.status !== 0) process.exit(res.status || 1);
}

console.log('1) Running unit tests in mock mode...');
process.env.MOCK_MODE = process.env.MOCK_MODE || 'true';
run('npm', ['run', 'test', '--silent']);

console.log('\n2) Checking environment for live integration tests...');
const liveReady = process.env.MOCK_MODE === 'false' && !!process.env.DATABASE_URL && !!process.env.NEO4J_URI && !!process.env.CLOUDINARY_CLOUD_NAME;
console.log(`Live ready: ${liveReady}`);

console.log('\n3) Running test suite including conditionally-enabled live tests...');
run('npm', ['run', 'test', '--silent']);

console.log('\nAll tests completed successfully.');

