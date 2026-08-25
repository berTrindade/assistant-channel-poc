import assert from 'node:assert/strict';
import { test } from 'node:test';

import { auditView, HOST_TOKENS } from '../src/views.ts';

test('the token list is the whole spec vocabulary, all 76 of it', () => {
  // If this number moves, the spec moved, and the audit is measuring against the wrong
  // contract until someone regenerates the list from McpUiStyleVariableKey.
  assert.equal(HOST_TOKENS.size, 76);
  assert.equal(HOST_TOKENS.has('--color-text-success'), true);
  assert.equal(HOST_TOKENS.has('--color-success'), false);
});

test('a token that no host sends is an invented colour, whatever it looks like', () => {
  // Found in a real run: asked to use the host's tokens, the model wrote this. There is no
  // --color-success in the spec, so the fallback paints and the green is the model's own.
  const audit = auditView('<span style="color: var(--color-success, green)">Confirmed</span>');

  assert.equal(audit.compliant, false);
  assert.deepEqual(audit.unknownVariables, ['--color-success']);
  assert.deepEqual(audit.hostVariables, []);
});

test('the real success token passes, since that one arrives', () => {
  const audit = auditView('<span style="color: var(--color-text-success, green)">Confirmed</span>');

  assert.equal(audit.compliant, true);
  assert.deepEqual(audit.hostVariables, ['--color-text-success']);
});

test('a surface styled with host tokens passes', () => {
  const audit = auditView(
    '<div style="color: var(--color-text-primary); background: var(--color-background-primary)">Hi</div>',
  );

  assert.equal(audit.compliant, true);
  assert.deepEqual(audit.inlineColours, []);
  assert.deepEqual(audit.hostVariables, ['--color-text-primary', '--color-background-primary']);
});

test('a literal colour inside a var fallback is allowed, because the spec asks for fallbacks', () => {
  const audit = auditView('<div style="color: var(--color-text-primary, #16202c)">Hi</div>');

  assert.equal(audit.compliant, true);
  assert.deepEqual(audit.inlineColours, []);
});

test('a colour invented outside a fallback is caught, whatever notation it uses', () => {
  const hex = auditView('<div style="color: #ff0000">Delete</div>');
  const fn = auditView('<div style="background: rgb(255 0 0)">Delete</div>');

  assert.equal(hex.compliant, false);
  assert.deepEqual(hex.inlineColours, ['#ff0000']);
  assert.equal(fn.compliant, false);
  assert.deepEqual(fn.inlineColours, ['rgb(']);
});

test('using no colour at all is not compliance, it is an empty surface', () => {
  // Nothing to correct, but nothing to learn either: the run should not count as a pass.
  const audit = auditView('<p>Nothing booked yet.</p>');

  assert.equal(audit.compliant, false);
  assert.deepEqual(audit.hostVariables, []);
});

