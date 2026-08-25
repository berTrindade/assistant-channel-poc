import assert from 'node:assert/strict';
import { test } from 'node:test';

import { auditView } from '../src/views.ts';

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

