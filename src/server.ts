/**
 * The tool contract.
 *
 * Declarations and plumbing only. Every decision that matters lives in rules.ts, and
 * every question about who is calling lives in principal.ts. If logic starts
 * accumulating in this file, the shape has drifted.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';

import { resolvePrincipal } from './principal.ts';
import { RuleViolation, bookSlot, cancelBooking } from './rules.ts';
import { bookingsFor, createStore, listOpenSlots } from './store.ts';

const PORT = Number(process.env.PORT ?? 3001);
const CARD_URI = 'ui://bookings/card.html';

// One store for the process. The MCP server instance is per request (the protocol is
// stateless), so anything that must outlive a request cannot live inside it.
const store = createStore();

const toolError = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

/**
 * Ask the human before touching a real record.
 *
 * Elicitation is the mechanism hosts support today. The 2026-07-28 spec adds an
 * `input_required` tool result that does this without a second round trip; when the SDK
 * exposes it, this helper is the only thing that changes.
 *
 * A host that supports neither is not a reason to skip the confirmation. It is a reason
 * to refuse the write and say why.
 */
const confirmed = async (server: McpServer, summary: string): Promise<boolean> => {
  try {
    const response = await server.server.elicitInput({
      message: summary,
      requestedSchema: { type: 'object', properties: {}, required: [] },
    });
    return response.action === 'accept';
  } catch {
    return false;
  }
};

const buildServer = (authorization?: string) => {
  const principal = resolvePrincipal(authorization);
  const server = new McpServer({ name: 'assistant-channel-poc', version: '0.1.0' });

  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description:
        'Show which account this connection resolves to, and what it is allowed to do. Useful for demonstrating that identity is shared in this preview.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: `${principal.displayName} (${principal.id}). Scopes: ${principal.scopes.join(', ')}.`,
        },
      ],
      structuredContent: { ...principal, shared: true },
    }),
  );

  server.registerTool(
    'list_slots',
    {
      title: 'List available slots',
      description: 'List appointment slots that still have space.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const slots = listOpenSlots(store);
      return {
        content: [
          {
            type: 'text',
            text: slots.length
              ? slots.map((s) => `${s.id}: ${s.service}, ${s.startsAt}, ${s.remaining} left`).join('\n')
              : 'No slots have space right now.',
          },
        ],
        structuredContent: { slots },
      };
    },
  );

  registerAppTool(
    server,
    'get_bookings',
    {
      title: 'Your bookings',
      description: 'Show the bookings held by this account.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: CARD_URI } },
    },
    async () => {
      const bookings = bookingsFor(store, principal.id).map((booking) => ({
        ...booking,
        service: store.slots.get(booking.slotId)?.service ?? 'Unknown service',
        startsAt: store.slots.get(booking.slotId)?.startsAt ?? '',
      }));
      return {
        content: [
          {
            type: 'text',
            text: bookings.length
              ? bookings.map((b) => `${b.id}: ${b.service} at ${b.startsAt} (${b.status})`).join('\n')
              : 'No bookings yet.',
          },
        ],
        structuredContent: { bookings },
      };
    },
  );

  server.registerTool(
    'book_slot',
    {
      title: 'Book a slot',
      description:
        'Book an appointment slot. Confirms with the user before saving. Pass the same idempotencyKey when retrying so a repeat does not book twice.',
      inputSchema: {
        slotId: z.string().describe('Id of the slot, from list_slots'),
        idempotencyKey: z
          .string()
          .optional()
          .describe('Stable key for this attempt, so a retry is recognised as the same booking'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ slotId, idempotencyKey }) => {
      const slot = store.slots.get(slotId);
      if (!slot) return toolError(`No slot with id ${slotId}.`);

      const ok = await confirmed(server, `Book ${slot.service} at ${slot.startsAt}?`);
      if (!ok) {
        return toolError('Not booked. The change was not confirmed, so nothing was saved.');
      }

      try {
        const { booking, replayed } = bookSlot(store, principal, slotId, idempotencyKey);
        return {
          content: [
            {
              type: 'text',
              text: replayed
                ? `Already booked as ${booking.id}, nothing changed.`
                : `Booked ${slot.service} at ${slot.startsAt}, reference ${booking.id}.`,
            },
          ],
          structuredContent: { booking, replayed },
        };
      } catch (error) {
        if (error instanceof RuleViolation) return toolError(error.message);
        throw error;
      }
    },
  );

  server.registerTool(
    'cancel_booking',
    {
      title: 'Cancel a booking',
      description: 'Cancel one of this account’s bookings. Confirms with the user before saving.',
      inputSchema: { bookingId: z.string().describe('Id of the booking, from get_bookings') },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ bookingId }) => {
      const ok = await confirmed(server, `Cancel booking ${bookingId}?`);
      if (!ok) {
        return toolError('Not cancelled. The change was not confirmed, so nothing was saved.');
      }

      try {
        const booking = cancelBooking(store, principal, bookingId);
        return {
          content: [{ type: 'text', text: `Booking ${booking.id} is cancelled.` }],
          structuredContent: { booking },
        };
      } catch (error) {
        if (error instanceof RuleViolation) return toolError(error.message);
        throw error;
      }
    },
  );

  registerAppResource(server, 'bookings-card', CARD_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [
      {
        uri: CARD_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await fs.readFile(path.join(import.meta.dirname, 'app', 'card.html'), 'utf-8'),
      },
    ],
  }));

  return server;
};

const app = express();
app.use(cors());
app.use(express.json());

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => void transport.close());
  await buildServer(req.headers.authorization).connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.error(`assistant-channel-poc listening on http://localhost:${PORT}/mcp`);
});
