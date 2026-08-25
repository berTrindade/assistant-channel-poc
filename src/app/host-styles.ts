/**
 * Wear the host's colours rather than guessing them.
 *
 * The card's first version painted a fixed palette and approximated dark mode through
 * prefers-color-scheme, on the assumption that a sandboxed frame is told nothing about the
 * app around it. It is told: the host context carries CSS custom properties, a font
 * stylesheet and a theme. Claude sends all 76 variables the spec defines, plus fonts.
 *
 * Every field is optional, so both surfaces keep their own values as fallbacks and the
 * host only wins where it has an opinion.
 */

import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';

// The SDK's own name for this type collides with another export at the package root, so
// take it from the method that returns it.
export type HostContext = NonNullable<ReturnType<App['getHostContext']>>;

export const adoptHostStyles = (ctx?: HostContext): void => {
  if (!ctx) return;
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.theme) applyDocumentTheme(ctx.theme);
};

/**
 * Say what the host actually sent.
 *
 * Whether a host themes its surfaces is the question, and the answer differs per host. A
 * line in the surface is the cheapest way to read it from inside a real client, where
 * there are no devtools to open.
 *
 * ponytail: delete once we have the answer for the hosts we care about.
 */
export const describeHostStyles = (ctx: HostContext): string =>
  [
    `theme ${ctx.theme ?? 'not sent'}`,
    `${Object.values(ctx.styles?.variables ?? {}).filter(Boolean).length} style variables`,
    ctx.styles?.css?.fonts ? 'fonts sent' : 'no fonts',
  ].join(' · ');
