/**
 * What the host sees when the confirmation gate refuses.
 *
 * This exists because of a real host. Claude labelled the refusal Failed, in red, and then
 * asked the user to confirm the thing that had just apparently broken. The gate was working
 * exactly as designed; the flag was wrong. So the assertion here is about presentation
 * rather than logic: a write that declined to save is not a tool that failed to run.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildServer } from '../src/tools.ts';

const connect = async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });

  await Promise.all([buildServer().connect(serverSide), client.connect(clientSide)]);

  return client;
};

test('an unconfirmed booking is a question, not a failure', async () => {
  const client = await connect();

  const result = await client.callTool({ name: 'book_slot', arguments: { slotId: 'slot-101' } });

  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent, { saved: false });
  assert.match((result.content as { text: string }[])[0].text, /Nothing saved yet/);
});

test('a booking that breaks a write rule is still an error', async () => {
  // The distinction the gate change has to preserve: asking is not failing, but a slot that
  // does not exist is.
  const client = await connect();

  const result = await client.callTool({ name: 'book_slot', arguments: { slotId: 'nope' } });

  assert.equal(result.isError, true);
});
