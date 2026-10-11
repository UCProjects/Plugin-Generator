const REPLACEMENTS = /My Plugin|What my plugin does|YOUR-NAME|YOUR NAME|(?<=@version\s+)1\.0\.0/g;
const GRANT = '// @grant        none';
const DESCRIPTION_LINE = /^\/\/ @description .*\r?\n/m;
const TOKENS = ['My Plugin', 'What my plugin does', 'YOUR-NAME', 'YOUR NAME', '// @version      1.0.0', GRANT];

export const SINGLE_FILE = 'single-file/my-plugin.user.js';

export function missingTokens(template) {
  return TOKENS.filter((token) => !template.includes(token));
}

export function fillSingleFile(template, { name, description, author, version, url }) {
  const values = {
    'My Plugin': name,
    'What my plugin does': description,
    'YOUR-NAME': author.replace(/ /g, '-'),
    'YOUR NAME': author,
    '1.0.0': version,
  };
  let text = template.replace(REPLACEMENTS, (match) => values[match]);
  if (!description) text = text.replace(DESCRIPTION_LINE, '');
  if (url) text = text.replace(GRANT, `// @updateURL    ${url}\n// @downloadURL  ${url}\n${GRANT}`);
  return text;
}
