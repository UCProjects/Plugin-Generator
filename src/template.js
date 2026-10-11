import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

export const TEMPLATE_URL = 'https://github.com/UCProjects/plugin-template';

export function gitUser() {
  try {
    return execFileSync('git', ['config', 'user.name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function fetchTemplate(source, into) {
  const local = fs.existsSync(source);
  const args = ['clone', '--quiet', ...(local ? [] : ['--depth', '1']), source, into];
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    throw new Error('git is required to download the plugin template. Install it from https://git-scm.com/ and try again.');
  }
  if (result.status !== 0) {
    throw new Error(`Could not download the plugin template from ${source}\n${result.stderr.trim()}`);
  }
}
