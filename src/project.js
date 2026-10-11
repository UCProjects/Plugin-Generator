import { slugify } from './names.js';

const TYPE_DEPENDENCIES = ['@types/jquery', 'simpletoast', 'typescript'];
const LINT_DEPENDENCIES = ['@eslint/js', 'eslint', 'globals'];

export const GLOBALS_FILE = 'globals.d.ts';
export const GLOBALS = [
  'declare const GM_info: {',
  '  script: {',
  '    name: string;',
  '    version: string;',
  '  };',
  '};',
  '',
].join('\n');

export function hasProject({ types, lint }) {
  return Boolean(types || lint);
}

export function simpleGitignore({ types }) {
  return `node_modules/\n${types ? 'types/\n' : ''}`;
}

export function simplePackage(template, { name, description, author, types, lint }) {
  const wanted = [
    ...(types ? TYPE_DEPENDENCIES : []),
    ...(lint ? LINT_DEPENDENCIES : []),
  ].sort();
  const devDependencies = {};
  wanted.forEach((dependency) => {
    const version = template.devDependencies?.[dependency];
    if (version) devDependencies[dependency] = version;
  });

  const scripts = {};
  if (types) {
    scripts.check = 'tsc -p jsconfig.json';
    scripts.types = 'node scripts/types.js';
    scripts.postinstall = 'node scripts/types.js';
  }
  if (lint) scripts.lint = 'eslint .';

  return {
    name: slugify(name),
    description,
    author,
    license: 'MIT',
    private: true,
    type: 'module',
    scripts,
    devDependencies,
  };
}

export function simpleJsconfig(jsconfig) {
  return { ...jsconfig, include: ['*.js', '*.d.ts', 'types'] };
}

export function simpleReadme({ name, description, file, types, lint }) {
  const lines = [
    `# ${name}`,
    '',
    description || 'An [UnderScript](https://feildmaster.github.io/UnderScript/) plugin.',
    '',
    `Your plugin is [${file}](${file}). Edit it, then copy it into a Tampermonkey script.`,
    '',
    '## Develop',
    '',
    '1. Run `npm install`',
  ];
  if (types) {
    lines.push(
      '1. Your editor now suggests the UnderScript API as you type, using the definitions downloaded into `types`',
    );
  }
  lines.push('');
  if (types) {
    lines.push(
      '- `npm run check` type checks the plugin',
      '- `npm run types` downloads the latest UnderScript definitions again',
    );
  }
  if (lint) lines.push('- `npm run lint` checks the code style');
  lines.push(
    '',
    `To run the file straight from this folder in the browser, follow [Try it in your browser](https://github.com/UCProjects/plugin-template#try-it-in-your-browser) and point it at \`${file}\`.`,
  );
  return `${lines.join('\n')}\n`;
}
