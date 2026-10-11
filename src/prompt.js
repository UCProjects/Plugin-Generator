import readline from 'node:readline';

export class Cancelled extends Error {
  constructor(message = 'Cancelled.') {
    super(message);
    this.name = 'Cancelled';
  }
}

const INPUT_ENDED = 'Input ended before every question was answered, so nothing was created. Pass --yes to use the defaults.';

const CURSOR_UP = (lines) => `\x1b[${lines}A`;
const CLEAR_BELOW = '\x1b[0J';
const BOLD = (text) => `\x1b[1m${text}\x1b[22m`;
const DIM = (text) => `\x1b[2m${text}\x1b[22m`;

function choiceText({ label, hint }) {
  return `${label}${hint ? `, ${hint}` : ''}`;
}

function createLines({ input, output }) {
  const rl = readline.createInterface({ input, output, terminal: false });
  const lines = rl[Symbol.asyncIterator]();

  async function read(question) {
    output.write(question);
    const { value, done } = await lines.next();
    if (done) {
      output.write('\n');
      throw new Cancelled(INPUT_ENDED);
    }
    return value.trim();
  }

  function say(message = '') {
    output.write(`${message}\n`);
  }

  async function text(question, { fallback = '', validate = () => undefined } = {}) {
    for (;;) {
      const hint = fallback ? ` (${fallback})` : '';
      const answer = await read(`${question}${hint}: `);
      const value = answer === '' ? fallback : answer;
      const problem = validate(value);
      if (!problem) return value;
      say(`  ${problem}`);
    }
  }

  async function choice(question, options, fallback) {
    say(question);
    options.forEach((option, index) => say(`  ${index + 1}. ${choiceText(option)}`));
    for (;;) {
      const answer = await read(`Choose 1-${options.length} (${fallback + 1}): `);
      if (answer === '') return options[fallback].value;
      const picked = options[Number(answer) - 1]
        ?? options.find(({ value }) => value === answer.toLowerCase());
      if (picked) return picked.value;
      say(`  Enter a number from 1 to ${options.length}.`);
    }
  }

  async function confirm(question, fallback = true) {
    for (;;) {
      const answer = await read(`${question} (${fallback ? 'Y/n' : 'y/N'}): `);
      if (answer === '') return fallback;
      if (/^y(es)?$/i.test(answer)) return true;
      if (/^no?$/i.test(answer)) return false;
      say('  Answer y or n.');
    }
  }

  return { text, choice, confirm, say, close: () => rl.close() };
}

function createInteractive({ input, output }) {
  readline.emitKeypressEvents(input);

  function say(message = '') {
    output.write(`${message}\n`);
  }

  function keys(onKey) {
    return new Promise((resolve, reject) => {
      const finish = (finalize) => {
        input.off('keypress', handler);
        input.setRawMode(false);
        input.pause();
        finalize();
      };
      function handler(character, key = {}) {
        if (key.ctrl && key.name === 'c') {
          finish(() => reject(new Cancelled()));
          return;
        }
        const result = onKey(character, key);
        if (result !== undefined) finish(() => resolve(result.value));
      }
      input.setRawMode(true);
      input.resume();
      input.on('keypress', handler);
    });
  }

  async function text(question, { fallback = '', validate = () => undefined } = {}) {
    for (;;) {
      const hint = fallback ? ` (${fallback})` : '';
      const rl = readline.createInterface({ input, output, terminal: true });
      const answer = await new Promise((resolve, reject) => {
        rl.once('SIGINT', () => {
          rl.close();
          reject(new Cancelled());
        });
        rl.question(`${question}${hint}: `, (line) => {
          rl.close();
          resolve(line.trim());
        });
      });
      input.pause();
      const value = answer === '' ? fallback : answer;
      const problem = validate(value);
      if (!problem) return value;
      say(`  ${problem}`);
    }
  }

  async function choice(question, options, fallback) {
    let index = fallback;
    let drawn = false;
    const draw = () => {
      if (drawn) output.write(CURSOR_UP(options.length + 1));
      drawn = true;
      output.write(`${CLEAR_BELOW}${question}\n`);
      options.forEach((option, position) => {
        const line = choiceText(option);
        output.write(position === index ? `${BOLD(`> ${line}`)}\n` : `  ${DIM(line)}\n`);
      });
    };
    draw();
    const picked = await keys((character, key) => {
      if (key.name === 'up' || key.name === 'k') index = (index + options.length - 1) % options.length;
      else if (key.name === 'down' || key.name === 'j') index = (index + 1) % options.length;
      else if (key.name === 'return') return { value: index };
      else if (/^[1-9]$/.test(character ?? '') && Number(character) <= options.length) {
        index = Number(character) - 1;
        return { value: index };
      } else return undefined;
      draw();
      return undefined;
    });
    output.write(`${CURSOR_UP(options.length + 1)}${CLEAR_BELOW}${question} ${BOLD(options[picked].label)}\n`);
    return options[picked].value;
  }

  async function confirm(question, fallback = true) {
    output.write(`${question} (${fallback ? 'Y/n' : 'y/N'}) `);
    const answer = await keys((character, key) => {
      if (key.name === 'return') return { value: fallback };
      if (/^y$/i.test(character ?? '')) return { value: true };
      if (/^n$/i.test(character ?? '')) return { value: false };
      return undefined;
    });
    output.write(`${answer ? 'yes' : 'no'}\n`);
    return answer;
  }

  return { text, choice, confirm, say, close: () => input.pause() };
}

export function createPrompt({ input = process.stdin, output = process.stdout } = {}) {
  const interactive = input.isTTY === true && typeof input.setRawMode === 'function';
  return interactive ? createInteractive({ input, output }) : createLines({ input, output });
}
