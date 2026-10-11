import { slugify } from './names.js';

const TEMPLATE_ONLY = ['single-file', '.github/FUNDING.yml', 'package-lock.json'];
const TYPE_FILES = ['jsconfig.json', 'scripts/types.js'];
const RELEASE_FILES = ['.github/workflows/release.yml'];
const LINT_FILES = ['eslint.config.js'];
const TYPE_SCRIPTS = ['check', 'types', 'postinstall'];
const TYPE_PACKAGES = ['typescript', '@types/jquery', 'simpletoast'];
const LINT_PACKAGES = ['@eslint/js', 'eslint', 'globals'];
const EMPTY_AFTER = ['.github/workflows', '.github', 'scripts'];

export const COPY_SKIP = new Set(['.git', 'node_modules', 'dist', 'types']);

export function removals({ releases, types, lint }) {
  return [
    ...TEMPLATE_ONLY,
    ...(types ? [] : TYPE_FILES),
    ...(releases ? [] : RELEASE_FILES),
    ...(lint ? [] : LINT_FILES),
  ];
}

export const emptiable = EMPTY_AFTER;

export function transformPackage(pkg, {
  name,
  description,
  author,
  version,
  repository,
  releases,
  types,
  lint,
}) {
  const next = structuredClone(pkg);
  next.name = slugify(name);
  next.displayName = name;
  next.description = description;
  next.author = author;
  next.version = version;

  if (repository) {
    next.repository = repository;
    next.homepage = `https://github.com/${repository}`;
  } else {
    delete next.repository;
    delete next.homepage;
  }

  next.userscript = { ...next.userscript };
  if (repository && !releases) {
    next.userscript.updateURL = false;
    next.userscript.downloadURL = false;
  }

  if (!types) {
    TYPE_SCRIPTS.forEach((script) => delete next.scripts?.[script]);
    TYPE_PACKAGES.forEach((dependency) => delete next.devDependencies?.[dependency]);
  }

  if (!lint) {
    delete next.scripts?.lint;
    LINT_PACKAGES.forEach((dependency) => delete next.devDependencies?.[dependency]);
  }

  return next;
}

export function projectReadme({ name, description, repository, releases, types, lint }) {
  const lines = [
    `# ${name}`,
    '',
    description || 'An [UnderScript](https://feildmaster.github.io/UnderScript/) plugin.',
    '',
    '## Develop',
    '',
    '1. Install [Node.js](https://nodejs.org/) 24',
    '1. Run `npm install`',
    '1. Edit the code in [src/index.js](src/index.js)',
    '1. Run `npm start` to rebuild `dist` on every change',
    '',
    '- `npm run build` builds `dist/<name>.user.js` and `dist/<name>.meta.js`',
  ];
  if (lint) lines.push('- `npm run lint` checks the code style');
  if (types) {
    lines.push('- `npm run check` type checks against the UnderScript API', '- `npm run types` downloads the latest UnderScript type definitions');
  }
  lines.push(
    '',
    'To run your build in the browser, follow [Try it in your browser](https://github.com/UCProjects/plugin-template#try-it-in-your-browser).',
    '',
    'The userscript header is generated from [package.json](package.json). Extra tags go in its `userscript` object.',
  );
  if (releases) {
    lines.push('', '## Release', '');
    if (!repository) {
      lines.push(
        '1. Set `repository` in [package.json](package.json) to `owner/repo`. The update links in the userscript header are built from it, and they are left out until then',
      );
    }
    lines.push(
      '1. Run `npm install` and commit `package-lock.json`, because the release workflow installs with `npm ci`',
      '1. Run `npm version patch` (or `minor`, `major`)',
      '1. Run `git push --follow-tags`',
      '',
      repository
        ? `GitHub builds the plugin and publishes it to a release. Players install from, and get updates from, [the latest release](https://github.com/${repository}/releases/latest).`
        : 'GitHub builds the plugin and publishes it to a release. Players install from, and get updates from, the latest release.',
    );
  }
  return `${lines.join('\n')}\n`;
}
