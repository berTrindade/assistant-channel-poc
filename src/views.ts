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
 * Every style variable a host may send, from the spec's McpUiStyleVariableKey union.
 *
 * This list is the point rather than a convenience. Asked to use the host's tokens, a model
 * wrote `var(--color-success, green)`, which is not a key any host sends, so the fallback
 * painted and the colour on screen was the model's own. An audit that trusts the shape of a
 * name agrees with that; one that knows the names does not.
 */
export const HOST_TOKENS: ReadonlySet<string> = new Set([
  // background
  '--color-background-danger',
  '--color-background-disabled',
  '--color-background-ghost',
  '--color-background-info',
  '--color-background-inverse',
  '--color-background-primary',
  '--color-background-secondary',
  '--color-background-success',
  '--color-background-tertiary',
  '--color-background-warning',
  // text
  '--color-text-danger',
  '--color-text-disabled',
  '--color-text-ghost',
  '--color-text-info',
  '--color-text-inverse',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-success',
  '--color-text-tertiary',
  '--color-text-warning',
  // border-c
  '--color-border-danger',
  '--color-border-disabled',
  '--color-border-ghost',
  '--color-border-info',
  '--color-border-inverse',
  '--color-border-primary',
  '--color-border-secondary',
  '--color-border-success',
  '--color-border-tertiary',
  '--color-border-warning',
  // ring
  '--color-ring-danger',
  '--color-ring-info',
  '--color-ring-inverse',
  '--color-ring-primary',
  '--color-ring-secondary',
  '--color-ring-success',
  '--color-ring-warning',
  // font
  '--font-heading-2xl-line-height',
  '--font-heading-2xl-size',
  '--font-heading-3xl-line-height',
  '--font-heading-3xl-size',
  '--font-heading-lg-line-height',
  '--font-heading-lg-size',
  '--font-heading-md-line-height',
  '--font-heading-md-size',
  '--font-heading-sm-line-height',
  '--font-heading-sm-size',
  '--font-heading-xl-line-height',
  '--font-heading-xl-size',
  '--font-heading-xs-line-height',
  '--font-heading-xs-size',
  '--font-mono',
  '--font-sans',
  '--font-text-lg-line-height',
  '--font-text-lg-size',
  '--font-text-md-line-height',
  '--font-text-md-size',
  '--font-text-sm-line-height',
  '--font-text-sm-size',
  '--font-text-xs-line-height',
  '--font-text-xs-size',
  '--font-weight-bold',
  '--font-weight-medium',
  '--font-weight-normal',
  '--font-weight-semibold',
  // radius
  '--border-radius-full',
  '--border-radius-lg',
  '--border-radius-md',
  '--border-radius-sm',
  '--border-radius-xl',
  '--border-radius-xs',
  // width
  '--border-width-regular',
  // shadow
  '--shadow-hairline',
  '--shadow-lg',
  '--shadow-md',
  '--shadow-sm',
]);

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
const HOST_VARIABLE = /var\(\s*(--[a-z0-9-]+)/gi;
const INLINE_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|color-mix)\(/gi;

export type ViewAudit = {
  inlineColours: string[];
  hostVariables: string[];
  /** Names shaped like host tokens that no host sends, so their fallback is the real colour. */
  unknownVariables: string[];
  compliant: boolean;
};

export const auditView = (html: string): ViewAudit => {
  const outsideFallbacks = html.replace(/var\([^()]*\)/gi, '');
  const referenced = [...new Set([...html.matchAll(HOST_VARIABLE)].map((match) => match[1]))];

  const inlineColours = [...outsideFallbacks.matchAll(INLINE_COLOUR)].map((match) => match[0]);
  const hostVariables = referenced.filter((name) => HOST_TOKENS.has(name));
  const unknownVariables = referenced.filter((name) => !HOST_TOKENS.has(name));

  return {
    inlineColours,
    hostVariables,
    unknownVariables,
    compliant: inlineColours.length === 0 && unknownVariables.length === 0 && hostVariables.length > 0,
  };
};
