import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { main } from '../src/main.js';

const FIXTURE = {
  'package.json': `${JSON.stringify({
    name: 'my-plugin',
    displayName: 'My Plugin',
    description: 'What my plugin does',
    version: '1.0.0',
    author: 'Your Name',
    repository: 'your-name/my-plugin',
    homepage: 'https://github.com/your-name/my-plugin',
    userscript: {},
    scripts: { start: 'a', build: 'b', lint: 'c', check: 'd', types: 'e', postinstall: 'f' },
    devDependencies: {
      rollup: '1', typescript: '1', simpletoast: '1', eslint: '1', '@eslint/js': '1', globals: '1',
    },
  }, null, 2)}\n`,
  'eslint.config.js': 'export default [];\n',
  'README.md': '# Template\n',
  'package-lock.json': '{}\n',
  'jsconfig.json': '{}\n',
  '.gitignore': 'node_modules/\n',
  'src/index.js': 'export {};\n',
  'scripts/header.js': 'export {};\n',
  'scripts/types.js': 'export {};\n',
  '.github/FUNDING.yml': 'github: []\n',
  '.github/workflows/release.yml': 'name: Release\n',
  'single-file/my-plugin.user.js': [
    '// ==UserScript==',
    '// @name         My Plugin - UnderScript Plugin',
    '// @description  What my plugin does',
    '// @namespace    https://github.com/YOUR-NAME',
    '// @version      1.0.0',
    '// @author       YOUR NAME',
    '// @grant        none',
    '// ==/UserScript==',
    "underscript.plugin('My Plugin', GM_info.script.version);",
    '',
  ].join('\n'),
};

function capture() {
  let text = '';
  const stream = new Writable({
    write(chunk, encoding, callback) {
      text += chunk.toString();
      callback();
    },
  });
  return { stream, read: () => text };
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function tree(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? tree(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  }));
  return nested.flat().sort();
}

describe('cli', () => {
  let root;
  let template;
  let count = 0;

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'generator-test-'));
    template = path.join(root, 'template');
    await Promise.all(Object.entries(FIXTURE).map(async ([file, content]) => {
      const target = path.join(template, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content);
    }));
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: template, stdio: 'ignore' });
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'template');
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const served = async () => ({ ok: true, text: async () => 'declare const underscript: unknown;\n' });

  async function run(args, lines, request = served) {
    count += 1;
    const dir = path.join(root, `out-${count}`);
    const output = capture();
    const input = lines ? Readable.from(lines.map((line) => `${line}\n`)) : Readable.from([]);
    await main(['--template', template, '--dir', dir, ...args], {
      cwd: root,
      input,
      output: output.stream,
      request,
    });
    return { dir, text: output.read() };
  }

  it('writes only the script in simple mode without typings', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'simple', '--name', 'Cool Plugin', '--author', 'Jane Doe', '--no-types',
    ]);
    assert.deepEqual(await tree(dir), ['cool-plugin.user.js']);
    const text = await fs.readFile(path.join(dir, 'cool-plugin.user.js'), 'utf8');
    assert.match(text, /@name {9}Cool Plugin - UnderScript Plugin/);
    assert.match(text, /@author {7}Jane Doe/);
  });

  it('adds a small typed project around the script in simple mode', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'simple', '--name', 'Cool Plugin', '--author', 'Jane Doe', '--no-install', '--no-git',
    ]);
    assert.deepEqual(await tree(dir), [
      '.gitignore',
      'README.md',
      'cool-plugin.user.js',
      'globals.d.ts',
      'jsconfig.json',
      'package.json',
      'scripts/types.js',
      'types/underscript.d.ts',
    ]);
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'cool-plugin');
    assert.equal(pkg.type, 'module');
    assert.equal('version' in pkg, false);
    assert.deepEqual(Object.keys(pkg.scripts), ['check', 'types', 'postinstall']);
    assert.deepEqual(Object.keys(pkg.devDependencies), ['simpletoast', 'typescript']);
    const jsconfig = JSON.parse(await fs.readFile(path.join(dir, 'jsconfig.json'), 'utf8'));
    assert.deepEqual(jsconfig.include, ['*.js', '*.d.ts', 'types']);
    assert.match(await fs.readFile(path.join(dir, 'globals.d.ts'), 'utf8'), /declare const GM_info/);
  });

  it('can add only ESLint in simple mode', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'simple', '--name', 'Cool Plugin', '--author', 'Jane Doe',
      '--no-types', '--lint', '--no-install', '--no-git',
    ]);
    assert.deepEqual(await tree(dir), [
      '.gitignore', 'README.md', 'cool-plugin.user.js', 'eslint.config.js', 'package.json',
    ]);
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.scripts, { lint: 'eslint .' });
    assert.deepEqual(Object.keys(pkg.devDependencies), ['@eslint/js', 'eslint', 'globals']);
    assert.equal(await fs.readFile(path.join(dir, '.gitignore'), 'utf8'), 'node_modules/\n');
  });

  it('can add typings and ESLint together in simple mode', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'simple', '--name', 'Cool Plugin', '--author', 'Jane Doe',
      '--types', '--lint', '--no-install', '--no-git',
    ]);
    const files = await tree(dir);
    assert.ok(files.includes('eslint.config.js'));
    assert.ok(files.includes('jsconfig.json'));
    assert.ok(files.includes('types/underscript.d.ts'));
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(pkg.scripts), ['check', 'types', 'postinstall', 'lint']);
  });

  it('does not set up ESLint in simple mode unless asked', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'simple', '--name', 'Cool Plugin', '--author', 'Jane Doe', '--no-install', '--no-git',
    ]);
    assert.equal(await exists(path.join(dir, 'eslint.config.js')), false);
  });

  it('still makes the project when the type definitions cannot be downloaded', async () => {
    const failing = async () => ({ ok: false, status: 500, statusText: 'Server Error' });
    const { dir, text } = await run([
      '--yes', '--mode', 'simple', '--name', 'Cool Plugin', '--author', 'Jane Doe', '--no-install', '--no-git',
    ], undefined, failing);
    assert.match(text, /Could not download the type definitions \(500 Server Error\)/);
    const files = await tree(dir);
    assert.ok(files.includes('package.json'));
    assert.ok(!files.includes('types/underscript.d.ts'));
  });

  it('builds the advanced project and leaves out what is declined', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'advanced', '--name', 'Cool Plugin', '--author', 'Jane Doe',
      '--repository', 'jane/cool-plugin', '--no-releases', '--no-types', '--no-install', '--no-git',
    ]);
    assert.deepEqual(await tree(dir), [
      '.gitignore', 'README.md', 'eslint.config.js', 'package.json', 'scripts/header.js', 'src/index.js',
    ]);
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'cool-plugin');
    assert.deepEqual(pkg.userscript, { updateURL: false, downloadURL: false });
    assert.deepEqual(Object.keys(pkg.scripts), ['start', 'build', 'lint']);
    assert.equal(await exists(path.join(dir, '.git')), false);
  });

  it('keeps the release workflow and type setup when asked', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'advanced', '--name', 'Cool Plugin', '--author', 'Jane Doe',
      '--repository', 'jane/cool-plugin', '--releases', '--types', '--no-install', '--no-git',
    ]);
    const files = await tree(dir);
    assert.ok(files.includes('.github/workflows/release.yml'));
    assert.ok(files.includes('jsconfig.json'));
    assert.ok(files.includes('scripts/types.js'));
    assert.ok(!files.includes('single-file/my-plugin.user.js'));
    assert.ok(!files.includes('package-lock.json'));
    assert.ok(!files.includes('.github/FUNDING.yml'));
  });

  it('asks the questions and re-asks on a bad answer', async () => {
    const { dir, text } = await run(['--author', 'Jane Doe', '--no-install', '--no-git'], [
      '2',
      'Way too long of a plugin name',
      'Okay Name',
      'Made interactively',
      '',
      'jane/okay-name',
      'n',
      'n',
      'y',
    ]);
    assert.match(text, /limit is 20/);
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.displayName, 'Okay Name');
    assert.equal(pkg.description, 'Made interactively');
    assert.equal(pkg.version, '1.0.0');
    assert.equal(pkg.repository, 'jane/okay-name');
    assert.deepEqual(pkg.userscript, { updateURL: false, downloadURL: false });
    assert.equal(pkg.scripts.check, undefined);
  });

  it('asks about typings and ESLint in simple mode and leaves only the script when both are declined', async () => {
    const { dir, text } = await run(['--author', 'Jane Doe'], ['1', 'Plain', '', '', '', 'n', 'n']);
    assert.match(text, /editor autocomplete and type checking/);
    assert.match(text, /ESLint to check your code style/);
    assert.deepEqual(await tree(dir), ['plain.user.js']);
  });

  it('asks the project questions only when there is a project', async () => {
    const { text } = await run(['--author', 'Jane Doe'], ['1', 'Plain', '', '', '', 'n', 'n']);
    assert.doesNotMatch(text, /git repository/);
    assert.doesNotMatch(text, /npm install now/);
  });

  it('lists the downloaded definitions on a dry run', async () => {
    const { dir, text } = await run(['--yes', '--mode', 'simple', '--name', 'Dry', '--author', 'A', '--dry-run']);
    assert.equal(await exists(dir), false);
    assert.match(text, /\+ dry\.user\.js/);
    assert.match(text, /\+ types\/underscript\.d\.ts \(would be downloaded\)/);
  });

  it('can be driven with arrow keys in a terminal', async () => {
    const input = new PassThrough();
    input.isTTY = true;
    input.setRawMode = () => input;
    const output = capture();
    const dir = path.join(root, 'out-tty');
    const finished = main(
      ['--template', template, '--dir', dir, '--author', 'Jane Doe'],
      { cwd: root, input, output: output.stream, request: served },
    );
    const tick = () => new Promise((resolve) => { setImmediate(resolve); });
    const waitFor = async (pattern) => {
      for (let attempt = 0; attempt < 400; attempt += 1) {
        if (pattern.test(output.read())) return;
        await tick();
      }
      throw new Error(`Never saw ${pattern}\n${output.read()}`);
    };
    const type = async (text) => {
      input.write(text);
      await tick();
      await tick();
    };

    await waitFor(/What do you want to make\?/);
    await type('\x1b[B');
    await type('\r');
    await waitFor(/Plugin name/);
    await type('Arrow Plugin\r');
    await waitFor(/Description/);
    await type('Picked with arrows\r');
    await waitFor(/Version/);
    await type('\r');
    await waitFor(/GitHub repository/);
    await type('\r');
    await waitFor(/Publish through GitHub releases/);
    await type('n');
    await waitFor(/editor autocomplete and type checking/);
    await type('n');
    await waitFor(/ESLint to check your code style/);
    await type('n');
    await waitFor(/Start a git repository/);
    await type('n');
    await waitFor(/Run npm install now/);
    await type('n');
    await finished;

    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.displayName, 'Arrow Plugin');
    assert.equal(pkg.description, 'Picked with arrows');
    assert.equal(pkg.scripts.check, undefined);
    assert.equal(pkg.scripts.lint, undefined);
    assert.equal(await exists(path.join(dir, 'eslint.config.js')), false);
    assert.equal(await exists(path.join(dir, 'single-file')), false);
    assert.match(output.read(), /What do you want to make\? .*Advanced/);
  });

  it('can leave ESLint out of an advanced project', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'advanced', '--name', 'Cool Plugin', '--author', 'Jane Doe',
      '--no-lint', '--no-types', '--no-install', '--no-git',
    ]);
    const files = await tree(dir);
    assert.ok(!files.includes('eslint.config.js'));
    assert.ok(files.includes('src/index.js'));
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.lint, undefined);
    assert.deepEqual(Object.keys(pkg.devDependencies), ['rollup']);
    assert.doesNotMatch(await fs.readFile(path.join(dir, 'README.md'), 'utf8'), /npm run lint/);
  });

  it('keeps the release workflow without a repository and says what is still needed', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'advanced', '--name', 'Cool Plugin', '--author', 'Jane Doe',
      '--releases', '--no-install', '--no-git',
    ]);
    assert.ok((await tree(dir)).includes('.github/workflows/release.yml'));
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    assert.equal('repository' in pkg, false);
    assert.deepEqual(pkg.userscript, {});
    const readme = await fs.readFile(path.join(dir, 'README.md'), 'utf8');
    assert.match(readme, /Set `repository` in \[package\.json\]/);
    assert.match(readme, /commit `package-lock\.json`/);
  });

  it('asks about releases even when no repository was given', async () => {
    const { dir, text } = await run(['--author', 'Jane Doe', '--no-install', '--no-git'], [
      '2', 'No Repo Yet', '', '', '', 'y', 'y', 'y',
    ]);
    assert.match(text, /Publish through GitHub releases/);
    assert.ok((await tree(dir)).includes('.github/workflows/release.yml'));
  });

  it('keeps ESLint in an advanced project by default', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'advanced', '--name', 'Cool Plugin', '--author', 'Jane Doe',
      '--no-install', '--no-git',
    ]);
    assert.ok((await tree(dir)).includes('eslint.config.js'));
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.lint);
  });

  it('creates nothing when the input ends before the questions are answered', async () => {
    const dir = path.join(root, 'out-ended');
    await assert.rejects(
      main(['--author', 'Jane Doe', '--template', template, '--dir', dir], {
        cwd: root,
        input: Readable.from(['1\n', 'Half Done\n']),
        output: capture().stream,
      }),
      /Input ended/,
    );
    assert.equal(await exists(dir), false);
  });

  it('uses the defaults for what is left when asked to with --yes', async () => {
    const { dir } = await run([
      '--yes', '--mode', 'simple', '--name', 'Yes Plugin', '--author', 'Jane Doe', '--no-types',
    ]);
    assert.deepEqual(await tree(dir), ['yes-plugin.user.js']);
  });

  it('creates nothing on a dry run', async () => {
    const { dir, text } = await run(['--yes', '--mode', 'advanced', '--name', 'Dry Run', '--author', 'A', '--dry-run']);
    assert.equal(await exists(dir), false);
    assert.match(text, /\+ package\.json/);
    assert.match(text, /- single-file \(left out\)/);
  });

  it('refuses a folder that already has files', async () => {
    const taken = path.join(root, 'taken');
    await fs.mkdir(taken);
    await fs.writeFile(path.join(taken, 'file.txt'), 'x');
    await assert.rejects(
      main(['--yes', '--mode', 'simple', '--name', 'X', '--author', 'A', '--template', template, '--dir', taken], {
        cwd: root,
        output: capture().stream,
      }),
      /not empty/,
    );
  });

  it('asks for another name as soon as the folder for one is taken', async () => {
    const cwd = path.join(root, 'work');
    await fs.mkdir(path.join(cwd, 'taken-plugin'), { recursive: true });
    await fs.writeFile(path.join(cwd, 'taken-plugin', 'file.txt'), 'x');
    const output = capture();
    await main(['--author', 'Jane Doe', '--template', template], {
      cwd,
      input: Readable.from(['1\n', 'Taken Plugin\n', 'Free Plugin\n', '\n', '\n', '\n', 'n\n', 'n\n']),
      output: output.stream,
      request: served,
    });
    const text = output.read();
    assert.match(text, /taken-plugin.* already exists and is not empty\. Pick another name\./);
    assert.deepEqual(await tree(path.join(cwd, 'free-plugin')), ['free-plugin.user.js']);
    assert.equal(await fs.readFile(path.join(cwd, 'taken-plugin', 'file.txt'), 'utf8'), 'x');
  });

  it('fails before asking anything when a given --name is taken', async () => {
    const cwd = path.join(root, 'work-name');
    await fs.mkdir(path.join(cwd, 'taken-plugin'), { recursive: true });
    await fs.writeFile(path.join(cwd, 'taken-plugin', 'file.txt'), 'x');
    const output = capture();
    await assert.rejects(
      main(['--name', 'Taken Plugin', '--author', 'Jane Doe', '--template', template], {
        cwd,
        input: Readable.from([]),
        output: output.stream,
      }),
      /already exists/,
    );
    assert.doesNotMatch(output.read(), /Description|Version/);
  });

  it('fails before asking anything when --dir is taken', async () => {
    const taken = path.join(root, 'taken-dir');
    await fs.mkdir(taken);
    await fs.writeFile(path.join(taken, 'file.txt'), 'x');
    const output = capture();
    await assert.rejects(
      main(['--dir', taken, '--template', template], {
        cwd: root,
        input: Readable.from([]),
        output: output.stream,
      }),
      /already exists and is not empty/,
    );
    assert.doesNotMatch(output.read(), /What do you want to make/);
  });

  it('needs the options when it cannot ask', async () => {
    await assert.rejects(
      main(['--yes', '--mode', 'simple', '--name', 'X', '--author', '', '--template', template], {
        cwd: root,
        output: capture().stream,
      }),
      /Author/,
    );
  });
});
