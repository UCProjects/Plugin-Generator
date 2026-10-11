import {
  authorProblem,
  nameProblem,
  repositoryProblem,
  single,
  urlProblem,
  versionProblem,
} from './names.js';

export async function collect(options, prompt, { author: known = '', nameCheck = nameProblem } = {}) {
  const ask = !options.yes;

  async function field(given, question, config = {}) {
    if (given !== undefined) {
      const value = single(given);
      const problem = config.validate?.(value);
      if (problem) throw new Error(`${question}: ${problem}`);
      return value;
    }
    if (ask) return prompt.text(question, config);
    const value = config.fallback ?? '';
    if (config.validate?.(value)) {
      throw new Error(`${question} is required, pass it as an option or leave out --yes.`);
    }
    return value;
  }

  async function yesNo(given, question, fallback) {
    if (given !== undefined) return given;
    return ask ? prompt.confirm(question, fallback) : fallback;
  }

  const providedName = options.name === undefined
    ? undefined
    : await field(options.name, 'Plugin name', { validate: nameCheck });

  let { mode } = options;
  if (mode === undefined) {
    mode = ask
      ? await prompt.choice('What do you want to make?', [
        { value: 'simple', label: 'Simple', hint: 'one script file to paste into Tampermonkey' },
        { value: 'advanced', label: 'Advanced', hint: 'a full project with several files, editor autocomplete, code checking and releases' },
      ], 0)
      : 'simple';
  }

  const answers = { mode };
  answers.name = providedName ?? await field(undefined, 'Plugin name', {
    fallback: 'My Plugin',
    validate: nameCheck,
  });
  answers.description = await field(options.description, 'Description (optional)');
  answers.author = await field(options.author, 'Author', { fallback: known, validate: authorProblem });
  answers.version = await field(options.version, 'Version', { fallback: '1.0.0', validate: versionProblem });

  const advanced = mode === 'advanced';
  if (advanced) {
    answers.repository = await field(options.repository, 'GitHub repository, owner/repo (optional)', {
      validate: repositoryProblem,
    });
    answers.releases = await yesNo(options.releases, 'Publish through GitHub releases?', true);
  } else {
    answers.url = await field(options.url, 'Link to your file (optional)', { validate: urlProblem });
  }

  answers.types = await yesNo(options.types, 'Set up editor autocomplete and type checking?', true);
  answers.lint = await yesNo(options.lint, 'Set up ESLint to check your code style?', advanced);
  const project = advanced || answers.types || answers.lint;
  answers.git = project ? await yesNo(options.git, 'Start a git repository?', true) : false;
  answers.install = project ? await yesNo(options.install, 'Run npm install now?', true) : false;
  return answers;
}
