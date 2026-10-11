import { parseArgs } from 'node:util';

export const USAGE = `Usage: underscript-plugin-generator [options]

Sets up a new UnderScript plugin. Anything you do not pass is asked for.

  --mode <simple|advanced>   simple is a single script file, advanced is a project
  --name <text>              plugin name (letters, numbers and spaces, up to 20)
  --description <text>
  --author <text>
  --version <x.y.z>          default 1.0.0
  --repository <owner/repo>  advanced only, the update links in the header are
                             built from it
  --url <https link>         simple only, where you will host the file
  --releases, --no-releases  advanced only, keep the GitHub release workflow
                             (it works without --repository)
  --types, --no-types        editor autocomplete and type checking
  --lint, --no-lint          ESLint to check your code style (advanced defaults to
                             yes, simple to no). Without types or lint, simple is
                             only the script file
  --dir <path>               where to create it, default ./<plugin-name>
  --template <path|url>      use another copy of the plugin template
  --no-install               do not run npm install
  --no-git                   do not run git init
  -y, --yes                  use the defaults for anything not passed
  --dry-run                  show what would be created, change nothing
  -h, --help
`;

export function parse(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      mode: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string' },
      author: { type: 'string' },
      version: { type: 'string' },
      repository: { type: 'string' },
      url: { type: 'string' },
      dir: { type: 'string' },
      template: { type: 'string' },
      releases: { type: 'boolean' },
      'no-releases': { type: 'boolean' },
      types: { type: 'boolean' },
      'no-types': { type: 'boolean' },
      lint: { type: 'boolean' },
      'no-lint': { type: 'boolean' },
      'no-install': { type: 'boolean' },
      'no-git': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const flag = (on, off) => {
    if (values[on] && values[off]) throw new Error(`Use only one of --${on} and --${off}.`);
    if (values[on]) return true;
    return values[off] ? false : undefined;
  };

  if (values.mode !== undefined && !['simple', 'advanced'].includes(values.mode)) {
    throw new Error('--mode must be simple or advanced.');
  }

  return {
    mode: values.mode,
    name: values.name,
    description: values.description,
    author: values.author,
    version: values.version,
    repository: values.repository,
    url: values.url,
    dir: values.dir,
    template: values.template,
    releases: flag('releases', 'no-releases'),
    types: flag('types', 'no-types'),
    lint: flag('lint', 'no-lint'),
    install: values['no-install'] ? false : undefined,
    git: values['no-git'] ? false : undefined,
    yes: Boolean(values.yes),
    dryRun: Boolean(values['dry-run']),
    help: Boolean(values.help),
  };
}
