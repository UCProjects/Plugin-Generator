import assert from 'node:assert/strict';
import { PassThrough, Readable, Writable } from 'node:stream';
import { describe, it } from 'node:test';
import { Cancelled, createPrompt } from '../src/prompt.js';

const UP = '\x1b[A';
const DOWN = '\x1b[B';
const ENTER = '\r';
const CTRL_C = '\x03';

const OPTIONS = [
  { value: 'simple', label: 'Simple', hint: 'one file' },
  { value: 'advanced', label: 'Advanced', hint: 'a project' },
  { value: 'other', label: 'Other' },
];

const tick = () => new Promise((resolve) => { setImmediate(resolve); });

function fakeTTY() {
  const input = new PassThrough();
  input.isTTY = true;
  input.rawModes = [];
  input.setRawMode = (value) => {
    input.rawModes.push(value);
    return input;
  };
  return input;
}

function capture() {
  let text = '';
  const stream = new Writable({
    write(chunk, encoding, callback) {
      text += chunk.toString();
      callback();
    },
  });
  return { stream, read: () => text };
}

async function press(input, ...chunks) {
  await tick();
  for (const chunk of chunks) {
    input.write(chunk);
    await tick();
    await tick();
  }
}

function setup() {
  const input = fakeTTY();
  const output = capture();
  const prompt = createPrompt({ input, output: output.stream });
  return { input, output, prompt };
}

describe('arrow menu', () => {
  it('picks the highlighted option with Enter', async () => {
    const { input, prompt } = setup();
    const answer = prompt.choice('Pick', OPTIONS, 0);
    await press(input, DOWN, ENTER);
    assert.equal(await answer, 'advanced');
  });

  it('starts on the default', async () => {
    const { input, prompt } = setup();
    const answer = prompt.choice('Pick', OPTIONS, 1);
    await press(input, ENTER);
    assert.equal(await answer, 'advanced');
  });

  it('wraps around at both ends', async () => {
    const { input, prompt } = setup();
    const up = prompt.choice('Pick', OPTIONS, 0);
    await press(input, UP, ENTER);
    assert.equal(await up, 'other');
    const down = prompt.choice('Pick', OPTIONS, 2);
    await press(input, DOWN, ENTER);
    assert.equal(await down, 'simple');
  });

  it('takes a number key', async () => {
    const { input, prompt } = setup();
    const answer = prompt.choice('Pick', OPTIONS, 0);
    await press(input, '3');
    assert.equal(await answer, 'other');
  });

  it('ignores a number that is not an option', async () => {
    const { input, prompt } = setup();
    const answer = prompt.choice('Pick', OPTIONS, 0);
    await press(input, '9', ENTER);
    assert.equal(await answer, 'simple');
  });

  it('shows the pointer move and collapses to the answer', async () => {
    const { input, output, prompt } = setup();
    const answer = prompt.choice('Pick', OPTIONS, 0);
    await press(input, DOWN, ENTER);
    await answer;
    const text = output.read();
    assert.match(text, /> Simple, one file/);
    assert.match(text, /> Advanced, a project/);
    assert.match(text, /\x1b\[4A/);
    assert.match(text, /Pick .*Advanced/);
  });

  it('puts the terminal back after answering', async () => {
    const { input, prompt } = setup();
    const answer = prompt.choice('Pick', OPTIONS, 0);
    await press(input, ENTER);
    await answer;
    assert.deepEqual(input.rawModes, [true, false]);
  });

  it('cancels on Ctrl+C and restores the terminal', async () => {
    const { input, prompt } = setup();
    const answer = prompt.choice('Pick', OPTIONS, 0);
    const failure = assert.rejects(answer, Cancelled);
    await press(input, CTRL_C);
    await failure;
    assert.deepEqual(input.rawModes, [true, false]);
  });
});

describe('yes or no', () => {
  it('answers with a key', async () => {
    const { input, prompt } = setup();
    const yes = prompt.confirm('Sure?', false);
    await press(input, 'y');
    assert.equal(await yes, true);
    const no = prompt.confirm('Sure?', true);
    await press(input, 'n');
    assert.equal(await no, false);
  });

  it('uses the default on Enter and ignores other keys', async () => {
    const { input, prompt } = setup();
    const answer = prompt.confirm('Sure?', true);
    await press(input, 'x', ENTER);
    assert.equal(await answer, true);
  });

  it('cancels on Ctrl+C', async () => {
    const { input, prompt } = setup();
    const answer = prompt.confirm('Sure?', true);
    const failure = assert.rejects(answer, Cancelled);
    await press(input, CTRL_C);
    await failure;
  });
});

describe('text', () => {
  it('returns what was typed', async () => {
    const { input, prompt } = setup();
    const answer = prompt.text('Name');
    await press(input, 'Hello there', ENTER);
    assert.equal(await answer, 'Hello there');
  });

  it('uses the default for an empty answer', async () => {
    const { input, prompt } = setup();
    const answer = prompt.text('Name', { fallback: 'My Plugin' });
    await press(input, ENTER);
    assert.equal(await answer, 'My Plugin');
  });

  it('asks again after a rejected answer', async () => {
    const { input, output, prompt } = setup();
    const validate = (value) => (value.length > 3 ? 'Too long.' : undefined);
    const answer = prompt.text('Name', { validate });
    await press(input, 'Too long', ENTER);
    await press(input, 'Ok', ENTER);
    assert.equal(await answer, 'Ok');
    assert.match(output.read(), /Too long\./);
  });

  it('cancels on Ctrl+C', async () => {
    const { input, prompt } = setup();
    const answer = prompt.text('Name');
    const failure = assert.rejects(answer, Cancelled);
    await press(input, CTRL_C);
    await failure;
  });

  it('works between menus, which use raw keys', async () => {
    const { input, prompt } = setup();
    const first = prompt.choice('Pick', OPTIONS, 0);
    await press(input, DOWN, ENTER);
    assert.equal(await first, 'advanced');
    const typed = prompt.text('Name');
    await press(input, 'Jane', ENTER);
    assert.equal(await typed, 'Jane');
    const last = prompt.confirm('Sure?', false);
    await press(input, 'y');
    assert.equal(await last, true);
  });
});

describe('input that ends early', () => {
  const ended = () => createPrompt({ input: Readable.from([]), output: capture().stream });

  it('cancels a text question instead of using its default', async () => {
    await assert.rejects(ended().text('Name', { fallback: 'My Plugin' }), (error) => {
      assert.ok(error instanceof Cancelled);
      assert.match(error.message, /Pass --yes/);
      return true;
    });
  });

  it('cancels a menu instead of using its default', async () => {
    await assert.rejects(ended().choice('Pick', OPTIONS, 0), Cancelled);
  });

  it('cancels a yes or no question instead of using its default', async () => {
    await assert.rejects(ended().confirm('Sure?', true), Cancelled);
  });

  it('cancels partway through, after the answers it did get', async () => {
    const prompt = createPrompt({ input: Readable.from(['Jane\n']), output: capture().stream });
    assert.equal(await prompt.text('Name'), 'Jane');
    await assert.rejects(prompt.text('Author'), Cancelled);
  });
});

describe('without a terminal', () => {
  it('falls back to numbered answers read from lines', async () => {
    const output = capture();
    const input = Readable.from(['2\n', 'Jane\n', 'y\n']);
    const prompt = createPrompt({ input, output: output.stream });
    assert.equal(await prompt.choice('Pick', OPTIONS, 0), 'advanced');
    assert.equal(await prompt.text('Name'), 'Jane');
    assert.equal(await prompt.confirm('Sure?', false), true);
    assert.match(output.read(), /1\. Simple, one file/);
    prompt.close();
  });
});
