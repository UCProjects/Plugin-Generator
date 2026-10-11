import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  COPY_SKIP,
  emptiable,
  projectReadme,
  removals,
  transformPackage,
} from './advanced.js';
import { collect } from './answers.js';
import { parse, USAGE } from './args.js';
import { nameProblem, slugify } from './names.js';
import { createPrompt } from './prompt.js';
import { fillSingleFile, missingTokens, SINGLE_FILE } from './simple.js';
import { fetchTemplate, gitUser, TEMPLATE_URL } from './template.js';
import { downloadTypes, TYPES_FILE, TYPES_PAGE } from './types.js';
import {
  GLOBALS,
  GLOBALS_FILE,
  hasProject,
  simpleGitignore,
  simpleJsconfig,
  simplePackage,
  simpleReadme,
} from './project.js';

function isAvailableSync(dir) {
  try {
    return readdirSync(dir).length === 0;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
}

async function isAvailable(dir) {
  try {
    return (await fs.readdir(dir)).length === 0;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
}

async function listFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  }));
  return nested.flat().sort();
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJSON(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function buildSimple(source, stage, answers, { warn, dryRun, request }) {
  const template = await fs.readFile(path.join(source, SINGLE_FILE), 'utf8');
  const missing = missingTokens(template);
  if (missing.length) {
    warn('The plugin template has changed, so some fields may not have been filled in.');
  }
  const file = `${slugify(answers.name)}.user.js`;
  await fs.writeFile(path.join(stage, file), fillSingleFile(template, answers));
  if (!hasProject(answers)) return { file, project: false, planned: [] };

  const write = (name, content) => fs.writeFile(path.join(stage, name), content);
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  const templatePackage = await readJSON(path.join(source, 'package.json'));
  await write('package.json', json(simplePackage(templatePackage, answers)));
  await write('.gitignore', simpleGitignore(answers));
  await write('README.md', simpleReadme({ ...answers, file }));
  if (answers.lint) {
    await fs.copyFile(path.join(source, 'eslint.config.js'), path.join(stage, 'eslint.config.js'));
  }

  if (!answers.types) return { file, project: true, downloaded: false, planned: [] };

  await fs.mkdir(path.join(stage, 'scripts'));
  await fs.copyFile(path.join(source, 'scripts', 'types.js'), path.join(stage, 'scripts', 'types.js'));
  await write('jsconfig.json', json(simpleJsconfig(await readJSON(path.join(source, 'jsconfig.json')))));
  await write(GLOBALS_FILE, GLOBALS);
  if (dryRun) {
    return { file, project: true, downloaded: false, planned: [`types/${TYPES_FILE} (would be downloaded)`] };
  }
  try {
    await fs.mkdir(path.join(stage, 'types'));
    await downloadTypes(path.join(stage, 'types', TYPES_FILE), { request });
    return { file, project: true, downloaded: true, planned: [] };
  } catch (e) {
    warn(`Could not download the type definitions (${e.message}). Run npm run types later, or get ${TYPES_FILE} from ${TYPES_PAGE}.`);
    return { file, project: true, downloaded: false, planned: [] };
  }
}

async function buildAdvanced(source, stage, answers) {
  await fs.cp(source, stage, {
    recursive: true,
    filter: (item) => !COPY_SKIP.has(path.basename(item)) || item === source,
  });

  const removed = [];
  await Promise.all(removals(answers).map(async (relative) => {
    const target = path.join(stage, relative);
    if (await exists(target)) {
      await fs.rm(target, { recursive: true, force: true });
      removed.push(relative);
    }
  }));
  for (const relative of emptiable) {
    const target = path.join(stage, relative);
    if (await exists(target) && (await fs.readdir(target)).length === 0) {
      await fs.rmdir(target);
    }
  }

  const manifest = path.join(stage, 'package.json');
  const pkg = JSON.parse(await fs.readFile(manifest, 'utf8'));
  await fs.writeFile(manifest, `${JSON.stringify(transformPackage(pkg, answers), null, 2)}\n`);
  await fs.writeFile(path.join(stage, 'README.md'), projectReadme(answers));
  return { removed: removed.sort() };
}

function run(command, args, cwd) {
  if (process.platform === 'win32' && command === 'npm') {
    return spawnSync(`npm ${args.join(' ')}`, { cwd, stdio: 'inherit', shell: true });
  }
  return spawnSync(command, args, { cwd, stdio: 'inherit' });
}

export async function main(argv, {
  cwd = process.cwd(),
  input,
  output = process.stdout,
  request = fetch,
} = {}) {
  const options = parse(argv);
  if (options.help) {
    output.write(USAGE);
    return;
  }

  const prompt = createPrompt({ input, output });
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-generator-'));
  try {
    const folderFor = (name) => path.resolve(cwd, options.dir ?? slugify(name));
    if (options.dir && !isAvailableSync(folderFor(''))) {
      throw new Error(`${folderFor('')} already exists and is not empty.`);
    }
    prompt.say('UnderScript plugin generator');
    prompt.say();
    const answers = await collect(options, prompt, {
      author: gitUser(),
      nameCheck: (name) => nameProblem(name)
        ?? (isAvailableSync(folderFor(name))
          ? undefined
          : `${folderFor(name)} already exists and is not empty. Pick another name.`),
    });
    const dir = folderFor(answers.name);
    if (!await isAvailable(dir)) throw new Error(`${dir} already exists and is not empty.`);

    const source = path.join(scratch, 'template');
    const stage = path.join(scratch, 'stage');
    await fs.mkdir(stage);
    prompt.say();
    prompt.say('Getting the plugin template...');
    fetchTemplate(options.template ?? TEMPLATE_URL, source);

    const built = answers.mode === 'simple'
      ? await buildSimple(source, stage, answers, {
        warn: (message) => prompt.say(`Warning: ${message}`),
        dryRun: options.dryRun,
        request,
      })
      : await buildAdvanced(source, stage, answers);
    const files = await listFiles(stage);

    if (options.dryRun) {
      prompt.say(`Would create ${dir}`);
      files.forEach((file) => prompt.say(`  + ${file}`));
      (built.planned ?? []).forEach((file) => prompt.say(`  + ${file}`));
      (built.removed ?? []).forEach((file) => prompt.say(`  - ${file} (left out)`));
      return;
    }

    await fs.mkdir(dir, { recursive: true });
    await fs.cp(stage, dir, { recursive: true });
    prompt.say(`Created ${dir}`);

    if (answers.git) run('git', ['init', '--quiet'], dir);
    if (answers.install) {
      prompt.say('Running npm install...');
      const result = run('npm', ['install'], dir);
      if (result.status !== 0) prompt.say('npm install failed, run it again yourself in that folder.');
    }

    prompt.say();
    const relative = path.relative(cwd, dir) || '.';
    if (answers.mode === 'simple') {
      prompt.say(`Your plugin is ${path.join(relative, built.file)}`);
      prompt.say('Copy it into a new Tampermonkey script and save.');
      if (built.project) {
        if (!answers.install) prompt.say(`Run npm install in ${relative} for editor autocomplete and npm run check.`);
        else if (built.downloaded) prompt.say('Your editor will now suggest the UnderScript API as you type.');
      }
    } else {
      prompt.say('Next steps:');
      prompt.say(`  cd ${relative}`);
      if (!answers.install) prompt.say('  npm install');
      prompt.say('  npm start');
    }
  } finally {
    prompt.close();
    await fs.rm(scratch, { recursive: true, force: true });
  }
}
