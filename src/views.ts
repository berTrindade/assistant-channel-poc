/**
 * The Open-ended tier, for real.
 *
 * The bookings card is a file in this repository, so the model has no say in it: that card
 * is Open-ended by delivery and Controlled by authorship, which is why it proves less about
 * this tier than it looks. Here the HTML arrives as a tool argument and the frame paints
 * it. The model owns every pixel, we own the frame.
 *
 * The surface travels in the tool result rather than in the resource, because the host reads
 * the resource before it calls the tool. The first version substituted the HTML into the
 * resource server-side and rendered an empty frame every time, since the read happened first
 * and there was nothing to substitute yet. The resource is a template and the tool result is
 * the data, exactly as it is for the card.
 *
 * Nothing checks the HTML before it renders, which is the finding rather than an oversight.
 * At this tier there are no variants to withhold, so the only instrument left is the tool
 * description asking nicely, and auditView exists to measure how far asking nicely gets us.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/** Where every submitted surface is appended, one JSON object per line. */
export const VIEW_LOG = path.join(import.meta.dirname, '..', 'views.log');

export const putView = async (html: string): Promise<void> => {
  await fs.appendFile(VIEW_LOG, `${JSON.stringify({ at: new Date().toISOString(), html })}\n`, 'utf-8');
};

/**
 * Did the model style this with the host's tokens, or with colours it made up?
 *
 * Hex codes and colour functions are counted only outside `var()`, because the spec tells
 * views to carry their own fallbacks and a fallback is the one legitimate place to write a
 * literal colour. The `var()` strip handles a single level of nesting, which is all a
 * fallback needs.
 *
 * A heuristic, deliberately: a hash followed by hex characters can be an anchor rather than
 * a colour, so treat a small count as a hint and read the surface itself.
 */
const HOST_VARIABLE = /var\(\s*(--(?:color|font|border|shadow)-[a-z0-9-]+)/gi;
const INLINE_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|color-mix)\(/gi;

export type ViewAudit = {
  inlineColours: string[];
  hostVariables: string[];
  compliant: boolean;
};

export const auditView = (html: string): ViewAudit => {
  const outsideFallbacks = html.replace(/var\([^()]*\)/gi, '');

  const inlineColours = [...outsideFallbacks.matchAll(INLINE_COLOUR)].map((match) => match[0]);
  const hostVariables = [...new Set([...html.matchAll(HOST_VARIABLE)].map((match) => match[1]))];

  return {
    inlineColours,
    hostVariables,
    compliant: inlineColours.length === 0 && hostVariables.length > 0,
  };
};
