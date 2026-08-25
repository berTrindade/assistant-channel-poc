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
import { z } from 'zod';

import { confirmationSecret, intentKey, issueToken, redeemToken } from './confirm.ts';
import { resolvePrincipal } from './principal.ts';
import { RuleViolation, bookSlot, cancelBooking } from './rules.ts';
import { bookingsFor, createStore, listOpenSlots } from './store.ts';
import { auditView, getView, putView } from './views.ts';

/**
 * The same card, declared twice, because the two hosts that render cards do not agree.
 *
 *   MCP Apps (Claude, Copilot)         _meta.ui.resourceUri           + text/html;profile=mcp-app
 *   OpenAI Apps SDK (ChatGPT)          _meta['openai/outputTemplate'] + text/html+skybridge
 *
 * One HTML file, two registrations, and the tool advertises both keys. Hosts read the one
 * they know and ignore the other. This is what "host-neutral tool contract" costs in
 * practice today, and it is the sort of thing worth writing down once rather than
 * being rediscovered per engagement.
 *
 * ponytail: two registrations beat a content-negotiation layer. Delete one the day the
 * conventions converge.
 */
const CARD_URI = 'ui://bookings/card.html';
const CARD_URI_OPENAI = 'ui://bookings/card-openai.html';
const SKYBRIDGE_MIME = 'text/html+skybridge';

/**
 * The model-authored surface, which needs its own pair of URIs for the same reason the
 * card does. See views.ts for why this tool exists at all.
 */
const VIEW_URI = 'ui://views/current.html';
const VIEW_URI_OPENAI = 'ui://views/current-openai.html';

// One store for the process. The MCP server instance is per request (the protocol is
// stateless), so anything that must outlive a request cannot live inside it.
const store = createStore();

const toolError = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

const secret = confirmationSecret();

/**
 * Ask the human before touching a real record.
 *
 * Elicitation first, because it puts the question in the host's own UI where the user
 * actually answers it. Where the host will not answer one, fall back to a server-issued
 * token: see confirm.ts for why the token exists and what it is and is not worth.
 */
const confirmed = async (
  server: McpServer,
  summary: string,
  intent: string,
  token?: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (token !== undefined) {
    return redeemToken(secret, token, intent, Date.now())
      ? { ok: true }
      : {
          ok: false,
          message:
            'That confirmation token is not valid for this change, or has expired. Nothing was saved. Start again without a token.',
        };
  }

  try {
    const response = await server.server.elicitInput({
      message: summary,
      requestedSchema: { type: 'object', properties: {}, required: [] },
    });
    if (response.action === 'accept') return { ok: true };
    return { ok: false, message: 'Not confirmed, so nothing was saved.' };
  } catch {
    // Host will not answer an elicitation. Fall through to the token exchange.
  }

  const fresh = issueToken(secret, intent, Date.now());
  return {
    ok: false,
    message:
      `Nothing saved yet. Say this to the user, in your own words, and wait for their answer: "${summary}" ` +
      `If, and only if, they agree, call this tool again with confirmationToken "${fresh}". ` +
      `Do not call it again with the token if they decline or say nothing.`,
  };
};

const CONFIRMATION_TOKEN = z
  .string()
  .optional()
  .describe(
    'Omit on the first call. The tool will refuse and hand back a token; present that token here only after the user has agreed to the change.',
  );

export const buildServer = (authorization?: string) => {
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
      _meta: {
        ui: { resourceUri: CARD_URI },
        'openai/outputTemplate': CARD_URI_OPENAI,
      },
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
        confirmationToken: CONFIRMATION_TOKEN,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ slotId, idempotencyKey, confirmationToken }) => {
      const slot = store.slots.get(slotId);
      if (!slot) return toolError(`No slot with id ${slotId}.`);

      const gate = await confirmed(
        server,
        `Book ${slot.service} at ${slot.startsAt}?`,
        intentKey('book_slot', { slotId }),
        confirmationToken,
      );
      if (!gate.ok) return toolError(gate.message);

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
      inputSchema: {
        bookingId: z.string().describe('Id of the booking, from get_bookings'),
        confirmationToken: CONFIRMATION_TOKEN,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ bookingId, confirmationToken }) => {
      const gate = await confirmed(
        server,
        `Cancel booking ${bookingId}?`,
        intentKey('cancel_booking', { bookingId }),
        confirmationToken,
      );
      if (!gate.ok) {
        return toolError(gate.message);
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

  registerAppTool(
    server,
    'render_view',
    {
      title: 'Render a view',
      description: [
        'Render your own HTML as a card in this conversation, for when a table or a small chart',
        'says it better than a sentence. Style it only with the host CSS variables, such as',
        'var(--color-text-primary), var(--color-background-primary), var(--color-border-secondary),',
        'var(--font-sans) and var(--border-radius-md). Do not write a colour of your own: no hex',
        'codes, no rgb(), no named colours. A fallback inside var() is fine.',
      ].join(' '),
      inputSchema: {
        html: z
          .string()
          .describe('An HTML fragment. No script tags, no external images, fonts or stylesheets.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: {
        ui: { resourceUri: VIEW_URI },
        'openai/outputTemplate': VIEW_URI_OPENAI,
      },
    },
    async ({ html }) => {
      await putView(html);

      // The audit goes to the log and to structured output, never into the text. Telling
      // the model it broke the rule would have it correct itself, and unprompted
      // compliance is the number this tool exists to measure.
      return {
        content: [{ type: 'text', text: 'Rendered.' }],
        structuredContent: { audit: auditView(html) },
      };
    },
  );

  const readCard = () => fs.readFile(path.join(import.meta.dirname, 'app', 'card.html'), 'utf-8');

  registerAppResource(server, 'bookings-card', CARD_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: await readCard() }],
  }));

  server.registerResource(
    'bookings-card-openai',
    CARD_URI_OPENAI,
    { mimeType: SKYBRIDGE_MIME },
    async () => ({
      contents: [{ uri: CARD_URI_OPENAI, mimeType: SKYBRIDGE_MIME, text: await readCard() }],
    }),
  );

  /**
   * The wrapper is the frame, and it is all we own here. Host variables with the same
   * fallbacks the card uses, so a fragment that ignores the instruction still renders
   * legibly rather than as black text on a transparent ground.
   */
  const readView = () => `<style>
  body {
    margin: 0;
    padding: 16px 18px;
    font: 15px/1.5 var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    color: var(--color-text-primary, #16202c);
    background: var(--color-background-primary, #ffffff);
  }
  .empty { color: var(--color-text-secondary, #5c6b7a); font-size: 13px; }
</style>
${getView()}`;

  registerAppResource(server, 'model-view', VIEW_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: readView() }],
  }));

  server.registerResource(
    'model-view-openai',
    VIEW_URI_OPENAI,
    { mimeType: SKYBRIDGE_MIME },
    async () => ({
      contents: [{ uri: VIEW_URI_OPENAI, mimeType: SKYBRIDGE_MIME, text: readView() }],
    }),
  );

  return server;
};
