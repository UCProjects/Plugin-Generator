import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { projectReadme, removals, transformPackage } from '../src/advanced.js';
import { parse } from '../src/args.js';
import {
  authorProblem,
  nameProblem,
  repositoryProblem,
  single,
  slugify,
  urlProblem,
  versionProblem,
} from '../src/names.js';
import { fillSingleFile, missingTokens } from '../src/simple.js';
import { downloadTypes } from '../src/types.js';
import {
  hasProject,
  simpleGitignore,
  simpleJsconfig,
  simplePackage,
  simpleReadme,
} from '../src/project.js';

const TEMPLATE = [
  '// ==UserScript==',
  '// @name         My Plugin - UnderScript Plugin',
  '// @description  What my plugin does',
  '// @namespace    https://github.com/YOUR-NAME',
  '// @version      1.0.0',
  '// @author       YOUR NAME',
  '// @grant        none',
  '// ==/UserScript==',
  '',
  "const plugin = underscript.plugin('My Plugin', GM_info.script.version);",
  "plugin.toast('Hello from my plugin!');",
  '',
].join('\n');

const answers = {
  name: 'Cool Plugin',
  description: 'Does cool things',
  author: 'Jane Doe',
  version: '2.0.0',
  url: '',
};

describe('names', () => {
  it('accepts plugin names the API accepts', () => {
    assert.equal(nameProblem('My Plugin'), undefined);
    assert.equal(nameProblem('x'.repeat(20)), undefined);
  });

  it('explains why a name is refused', () => {
    assert.match(nameProblem(''), /Enter a name/);
    assert.match(nameProblem('x'.repeat(21)), /21 characters/);
    assert.match(nameProblem('Bad-Name'), /letters, numbers and spaces/);
  });

  it('checks the other fields', () => {
    assert.equal(authorProblem(''), 'Enter your name.');
    assert.equal(versionProblem('1.2.3'), undefined);
    assert.match(versionProblem('1.2'), /three numbers/);
    assert.equal(repositoryProblem(''), undefined);
    assert.equal(repositoryProblem('owner/repo'), undefined);
    assert.match(repositoryProblem('not a repo'), /owner\/repository/);
    assert.equal(urlProblem(''), undefined);
    assert.equal(urlProblem('https://example.com/x.user.js'), undefined);
    assert.match(urlProblem('http://example.com'), /https/);
    assert.match(urlProblem('nope'), /https/);
  });

  it('builds file names', () => {
    assert.equal(slugify('My Plugin'), 'my-plugin');
    assert.equal(slugify('  Chat  Deck 2 '), 'chat-deck-2');
    assert.equal(slugify('!!!'), 'my-plugin');
  });

  it('collapses whitespace', () => {
    assert.equal(single('  a   b \n c '), 'a b c');
  });
});

describe('fillSingleFile', () => {
  it('fills in every field', () => {
    const text = fillSingleFile(TEMPLATE, answers);
    assert.match(text, /@name {9}Cool Plugin - UnderScript Plugin/);
    assert.match(text, /@description {2}Does cool things/);
    assert.match(text, /@namespace {4}https:\/\/github\.com\/Jane-Doe/);
    assert.match(text, /@version {6}2\.0\.0/);
    assert.match(text, /@author {7}Jane Doe/);
    assert.match(text, /underscript\.plugin\('Cool Plugin'/);
    assert.match(text, /Hello from my plugin!/);
  });

  it('does not run replacements over what it just inserted', () => {
    const text = fillSingleFile(TEMPLATE, { ...answers, author: 'YOUR NAME My Plugin' });
    assert.match(text, /@author {7}YOUR NAME My Plugin\n/);
  });

  it('leaves out an empty description', () => {
    assert.doesNotMatch(fillSingleFile(TEMPLATE, { ...answers, description: '' }), /@description/);
  });

  it('adds update links before the grant', () => {
    const text = fillSingleFile(TEMPLATE, { ...answers, url: 'https://example.com/p.user.js' });
    assert.match(text, /@updateURL {4}https:\/\/example\.com\/p\.user\.js\n\/\/ @downloadURL {2}https:\/\/example\.com\/p\.user\.js\n\/\/ @grant/);
  });

  it('notices when the template changed', () => {
    assert.deepEqual(missingTokens(TEMPLATE), []);
    assert.deepEqual(missingTokens(TEMPLATE.replace('YOUR NAME', 'SOMEONE')), ['YOUR NAME']);
  });
});

describe('advanced', () => {
  const pkg = {
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
      rollup: '1',
      typescript: '1',
      '@types/jquery': '1',
      simpletoast: '1',
      eslint: '1',
      '@eslint/js': '1',
      globals: '1',
    },
  };
  const full = {
    ...answers,
    repository: 'jane/cool-plugin',
    releases: true,
    types: true,
    lint: true,
  };

  it('fills in the package fields without changing the original', () => {
    const copy = structuredClone(pkg);
    const next = transformPackage(pkg, full);
    assert.deepEqual(pkg, copy);
    assert.equal(next.name, 'cool-plugin');
    assert.equal(next.displayName, 'Cool Plugin');
    assert.equal(next.author, 'Jane Doe');
    assert.equal(next.version, '2.0.0');
    assert.equal(next.repository, 'jane/cool-plugin');
    assert.equal(next.homepage, 'https://github.com/jane/cool-plugin');
    assert.deepEqual(next.userscript, {});
    assert.ok(next.scripts.check);
    assert.ok(next.devDependencies.typescript);
  });

  it('drops the type setup when typing is declined', () => {
    const next = transformPackage(pkg, { ...full, types: false });
    assert.deepEqual(Object.keys(next.scripts), ['start', 'build', 'lint']);
    assert.deepEqual(Object.keys(next.devDependencies), ['rollup', 'eslint', '@eslint/js', 'globals']);
  });

  it('turns the update links off without releases', () => {
    const next = transformPackage(pkg, { ...full, releases: false });
    assert.deepEqual(next.userscript, { updateURL: false, downloadURL: false });
  });

  it('removes the repository fields without a repository', () => {
    const next = transformPackage(pkg, { ...full, repository: '', releases: false });
    assert.equal('repository' in next, false);
    assert.equal('homepage' in next, false);
    assert.deepEqual(next.userscript, {});
  });

  it('drops ESLint when it is declined', () => {
    const next = transformPackage(pkg, { ...full, lint: false });
    assert.equal('lint' in next.scripts, false);
    ['eslint', '@eslint/js', 'globals'].forEach((dependency) => {
      assert.equal(dependency in next.devDependencies, false);
    });
    assert.ok(next.devDependencies.rollup);
    assert.ok(next.devDependencies.typescript);
    assert.ok(next.scripts.build);
  });

  it('keeps ESLint when it is wanted', () => {
    const next = transformPackage(pkg, full);
    assert.equal(next.scripts.lint, 'c');
    assert.ok(next.devDependencies.eslint);
  });

  it('lists what is left out', () => {
    const always = ['single-file', '.github/FUNDING.yml', 'package-lock.json'];
    const all = { releases: true, types: true, lint: true };
    assert.deepEqual(removals(all), always);
    assert.deepEqual(removals({ ...all, releases: false }), [...always, '.github/workflows/release.yml']);
    assert.deepEqual(removals({ ...all, types: false }), [...always, 'jsconfig.json', 'scripts/types.js']);
    assert.deepEqual(removals({ ...all, lint: false }), [...always, 'eslint.config.js']);
  });

  it('writes a readme that matches the choices', () => {
    const readme = projectReadme(full);
    assert.match(readme, /^# Cool Plugin/);
    assert.match(readme, /npm run check/);
    assert.match(readme, /## Release/);
    assert.match(readme, /github\.com\/jane\/cool-plugin\/releases\/latest/);
    assert.match(readme, /npm run lint/);
    assert.match(readme, /commit `package-lock\.json`/);
    assert.doesNotMatch(readme, /Set `repository`/);
    const noRepository = projectReadme({ ...full, repository: '' });
    assert.match(noRepository, /## Release/);
    assert.match(noRepository, /Set `repository` in \[package\.json\]/);
    assert.doesNotMatch(noRepository, /github\.com\/\/releases/);
    const bare = projectReadme({ ...full, releases: false, types: false, lint: false });
    assert.doesNotMatch(bare, /npm run check/);
    assert.doesNotMatch(bare, /npm run lint/);
    assert.doesNotMatch(bare, /## Release/);
  });
});

describe('simple project', () => {
  const template = {
    devDependencies: {
      rollup: '1',
      typescript: '^5',
      simpletoast: 'github:a/b',
      '@types/jquery': '^2',
      eslint: '^10',
      '@eslint/js': '^10',
      globals: '^17',
    },
  };
  const base = { name: 'Cool Plugin', description: 'd', author: 'Jane' };

  it('is only a project when typings or lint are wanted', () => {
    assert.equal(hasProject({ types: false, lint: false }), false);
    assert.equal(hasProject({ types: true, lint: false }), true);
    assert.equal(hasProject({ types: false, lint: true }), true);
  });

  it('keeps only the type packages for typings, at the template versions', () => {
    const pkg = simplePackage(template, { ...base, types: true, lint: false });
    assert.deepEqual(pkg.devDependencies, {
      '@types/jquery': '^2',
      simpletoast: 'github:a/b',
      typescript: '^5',
    });
    assert.deepEqual(Object.keys(pkg.scripts), ['check', 'types', 'postinstall']);
    assert.equal(pkg.name, 'cool-plugin');
    assert.equal(pkg.type, 'module');
    assert.equal('version' in pkg, false);
    assert.equal(pkg.private, true);
  });

  it('keeps only eslint for lint', () => {
    const pkg = simplePackage(template, { ...base, types: false, lint: true });
    assert.deepEqual(pkg.devDependencies, { '@eslint/js': '^10', eslint: '^10', globals: '^17' });
    assert.deepEqual(pkg.scripts, { lint: 'eslint .' });
  });

  it('combines both', () => {
    const pkg = simplePackage(template, { ...base, types: true, lint: true });
    assert.deepEqual(Object.keys(pkg.devDependencies), [
      '@eslint/js', '@types/jquery', 'eslint', 'globals', 'simpletoast', 'typescript',
    ]);
    assert.deepEqual(Object.keys(pkg.scripts), ['check', 'types', 'postinstall', 'lint']);
  });

  it('tolerates a template without dev dependencies', () => {
    assert.deepEqual(simplePackage({}, { ...base, types: true, lint: true }).devDependencies, {});
  });

  it('ignores the types folder only when there are no types', () => {
    assert.equal(simpleGitignore({ types: true }), 'node_modules/\ntypes/\n');
    assert.equal(simpleGitignore({ types: false }), 'node_modules/\n');
  });

  it('points the jsconfig at the script and the definitions', () => {
    const jsconfig = simpleJsconfig({ compilerOptions: { checkJs: true }, include: ['src', 'types'] });
    assert.deepEqual(jsconfig.include, ['*.js', '*.d.ts', 'types']);
    assert.deepEqual(jsconfig.compilerOptions, { checkJs: true });
  });

  it('writes a readme that matches the choices', () => {
    const typed = simpleReadme({ ...base, file: 'cool-plugin.user.js', types: true, lint: false });
    assert.match(typed, /^# Cool Plugin/);
    assert.match(typed, /\[cool-plugin\.user\.js\]\(cool-plugin\.user\.js\)/);
    assert.match(typed, /npm run check/);
    assert.doesNotMatch(typed, /npm run lint/);
    const linted = simpleReadme({ ...base, file: 'cool-plugin.user.js', types: false, lint: true });
    assert.match(linted, /npm run lint/);
    assert.doesNotMatch(linted, /npm run check/);
    assert.doesNotMatch(linted, /type definitions/);
  });
});

describe('parse', () => {
  it('reads values and flags', () => {
    const options = parse(['--mode', 'advanced', '--name', 'X', '--no-types', '--releases', '-y', '--dry-run']);
    assert.equal(options.mode, 'advanced');
    assert.equal(options.name, 'X');
    assert.equal(options.types, false);
    assert.equal(options.releases, true);
    assert.equal(options.yes, true);
    assert.equal(options.dryRun, true);
    assert.equal(options.install, undefined);
  });

  it('refuses an unknown mode', () => {
    assert.throws(() => parse(['--mode', 'fancy']), /simple or advanced/);
  });

  it('refuses a flag and its opposite', () => {
    assert.throws(() => parse(['--types', '--no-types']), /only one of/);
    assert.throws(() => parse(['--lint', '--no-lint']), /only one of/);
  });

  it('reads the lint flags', () => {
    assert.equal(parse(['--lint']).lint, true);
    assert.equal(parse(['--no-lint']).lint, false);
    assert.equal(parse([]).lint, undefined);
  });

  it('refuses unknown options', () => {
    assert.throws(() => parse(['--nope']));
  });
});

describe('downloadTypes', () => {
  it('writes the response to disk', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'types-test-'));
    try {
      const file = path.join(dir, 'underscript.d.ts');
      const request = async (url) => ({ ok: true, text: async () => `declared from ${url}` });
      await downloadTypes(file, { url: 'https://example.com/u.d.ts', request });
      assert.equal(await fs.readFile(file, 'utf8'), 'declared from https://example.com/u.d.ts');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('reports a failing status', async () => {
    const request = async () => ({ ok: false, status: 404, statusText: 'Not Found' });
    await assert.rejects(downloadTypes('unused', { request }), /404 Not Found/);
  });

  it('passes a network error through', async () => {
    const request = async () => {
      throw new Error('getaddrinfo ENOTFOUND github.com');
    };
    await assert.rejects(downloadTypes('unused', { request }), /ENOTFOUND/);
  });
});
