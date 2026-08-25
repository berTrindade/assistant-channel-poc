/**
 * The shim is JavaScript inside a string, so no compiler reads it.
 *
 * A typo in there does not fail the build, does not fail typecheck, and does not fail until a
 * real host renders a surface and nothing works. So this parses it, and checks the verbs the
 * broker in view.ts is written to answer are the ones the shim actually sends.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SURFACE_SHIM } from '../src/app/surface-shim.ts';

const script = SURFACE_SHIM.slice(SURFACE_SHIM.indexOf('>') + 1, SURFACE_SHIM.indexOf('</script>'));

test('the shim parses as JavaScript', () => {
  // new Function parses without running, which is all that is wanted: the body reaches for
  // parent and ResizeObserver, neither of which exists here.
  assert.doesNotThrow(() => new Function(script));
});

test('every verb the shim sends is one the broker answers', () => {
  const sent = [...script.matchAll(/verb: '([a-zA-Z]+)'/g)].map((match) => match[1]);
  const answered = ['say', 'callTool', 'openLink', 'displayMode', 'context', 'height'];

  assert.deepEqual([...new Set(sent)].sort(), [...answered].sort());
});

test('the shim exposes the surface API and nothing is left half-wired', () => {
  for (const method of ['say', 'callTool', 'openLink', 'requestDisplayMode', 'updateContext']) {
    assert.match(script, new RegExp(`${method}:`), `window.mcp.${method} is missing`);
  }
});
