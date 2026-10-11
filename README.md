# UnderScript plugin generator

Set up a new [UnderScript](https://feildmaster.github.io/UnderScript/) plugin by answering a few questions.

```sh
npx github:UCProjects/Plugin-Generator
```

Always include the owner, `UCProjects/`. A bare `npx plugin-generator` downloads an unrelated package from the npm registry that happens to have that name. The `github:` prefix is optional, so `npx UCProjects/Plugin-Generator` works too.

The first time, npm asks `Ok to proceed?` before it installs the package. That question is npm's, and it comes before the generator starts. Answer `y`, or add `-y` to skip it:

```sh
npx -y github:UCProjects/Plugin-Generator
```

You need [Node.js](https://nodejs.org/) (24 is recommended) and [git](https://git-scm.com/). The generator downloads the latest [plugin template](https://github.com/UCProjects/Plugin-Template) every time it runs, so what you get is never out of date.

## What it asks

In a terminal, choices are arrow-key menus: up and down to move, Enter to pick, or press a number. Yes or no questions take `y`, `n` or Enter for the default, and Ctrl+C cancels at any point. When the input is piped, or the terminal can't do raw keys, the same questions fall back to typing a number or `y`/`n`.

1. **Simple or Advanced**
   - **Simple** is one script file that you edit by hand and paste into Tampermonkey. There is no build.
   - **Advanced** is a full project. Your code can be split across several files, and it comes with editor autocomplete, code checking and automatic releases if you want them.
1. **Your plugin's name, description, author and version.** The name is checked against the same rules UnderScript enforces: letters, numbers and spaces, at most 20 characters.
1. **Simple only:** a link to where you will host the file (optional).
1. **Editor autocomplete and type checking?** Both modes ask this.
   - **Simple** with typings is the script file plus a small project around it: `package.json`, `jsconfig.json`, `globals.d.ts` and the UnderScript type definitions in `types`. `npm run check` type checks your plugin.
   - **Advanced** without typings leaves the type setup out of the project.
1. **ESLint to check your code style?** Both modes ask this. It adds `eslint.config.js` and `npm run lint`, and works with or without typings.
   - **Advanced** defaults to yes. Declining removes the config, the `lint` script and the ESLint packages.
   - **Simple** defaults to no. Declining both typings and ESLint leaves only the script file, with no `package.json` at all.
1. **Advanced only:** your GitHub repository (`owner/repo`, optional), and whether to publish through GitHub releases.
   - Releases keep the release workflow. It doesn't need the repository name, so you can say yes before the repository exists.
   - The update links in the userscript header are built from the repository. Without one they are left out until you set `repository` in `package.json`, and the generated README says so.
1. **Whether to run `git init` and `npm install`**, when there is a project to set up.

Whatever you decline is deleted from the result, and the readme it writes only describes what is left.

## Without questions

Pass any answer as an option, and add `--yes` to use the defaults for the rest:

```sh
npx github:UCProjects/Plugin-Generator --yes --mode advanced --name "My Plugin" --author "Your Name" --repository you/my-plugin
```

| Option | |
| --- | --- |
| `--mode <simple\|advanced>` | Single file or project |
| `--name`, `--description`, `--author`, `--version` | Basic information |
| `--repository <owner/repo>` | Advanced: the update links in the header are built from it |
| `--url <https link>` | Simple: where you will host the file |
| `--releases`, `--no-releases` | Advanced: GitHub releases |
| `--types`, `--no-types` | Editor autocomplete and type checking |
| `--lint`, `--no-lint` | ESLint (advanced defaults to yes, simple to no) |
| `--dir <path>` | Where to create it, default `./<plugin-name>` |
| `--template <path\|url>` | Use another copy of the plugin template |
| `--no-install`, `--no-git` | Skip `npm install` or `git init` |
| `--dry-run` | List what would be created and left out, change nothing |
| `-y`, `--yes` | Use the defaults for anything not passed |

## Developing the generator

```sh
npm test
```

There are no dependencies. The tests build a small template repository and run the generator against it, so they need git but not the network.
