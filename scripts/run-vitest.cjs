const { spawnSync } = require('child_process');
const path = require('path');

const bin = process.platform === 'win32'
  ? path.join(__dirname, '..', 'node_modules', '.bin', 'vitest.cmd')
  : path.join(__dirname, '..', 'node_modules', '.bin', 'vitest');

const run = (args) => {
  const result = spawnSync(bin, args, { stdio: 'inherit', shell: true });
  return typeof result.status === 'number' ? result.status : 1;
};

const exit1 = run(['run']);
if (exit1 !== 0) process.exit(exit1);

const exit2 = run(['run', '--config', 'vitest.backend.config.js']);
process.exit(exit2);
