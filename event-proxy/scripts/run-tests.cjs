const { spawnSync } = require('node:child_process');

const args = ['vitest', 'run'];
const input = process.argv.slice(2);

for (let index = 0; index < input.length; index += 1) {
  const arg = input[index];

  if (arg === '--collectCoverageFrom') {
    index += 1;
    continue;
  }

  if (arg.startsWith('--collectCoverageFrom=')) {
    continue;
  }

  if (arg === '--coverageReporters') {
    const reporter = input[index + 1];
    if (reporter) {
      args.push(`--coverage.reporter=${reporter}`);
      index += 1;
    }
    continue;
  }

  if (arg.startsWith('--coverageReporters=')) {
    args.push(`--coverage.reporter=${arg.split('=')[1]}`);
    continue;
  }

  args.push(arg);
}

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
