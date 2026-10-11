const NAME_RULE = /^[A-Za-z0-9 ]{1,20}$/;
const VERSION_RULE = /^\d+\.\d+\.\d+$/;
const REPOSITORY_RULE = /^[\w.-]+\/[\w.-]+$/;

export function single(value = '') {
  return `${value}`.replace(/\s+/g, ' ').trim();
}

export function nameProblem(name) {
  if (NAME_RULE.test(name)) return undefined;
  if (!name) return 'Enter a name.';
  if (name.length > 20) return `That is ${name.length} characters, the limit is 20.`;
  return 'Use only letters, numbers and spaces.';
}

export function authorProblem(author) {
  return author ? undefined : 'Enter your name.';
}

export function versionProblem(version) {
  return VERSION_RULE.test(version) ? undefined : 'Use three numbers with dots, like 1.0.0.';
}

export function repositoryProblem(repository) {
  if (!repository || REPOSITORY_RULE.test(repository)) return undefined;
  return 'Use the form owner/repository.';
}

export function urlProblem(url) {
  if (!url) return undefined;
  try {
    return new URL(url).protocol === 'https:' ? undefined : 'Use an https link.';
  } catch {
    return 'Enter a link that starts with https://';
  }
}

export function slugify(name) {
  return single(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'my-plugin';
}
