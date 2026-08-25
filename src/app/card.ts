/**
 * The card, as the host actually expects it.
 *
 * The first version hand-rolled a postMessage listener and painted nothing in a real
 * host: Claude created the iframe and the contents stayed blank. The `ui/` dialect is a
 * JSON-RPC protocol with a handshake, not a message you can guess the shape of, so this
 * uses the App class from the SDK and lets it do the talking.
 *
 * Bundled by scripts/build-card.mjs into src/app/card.html, which is what the server
 * serves. The output is committed because hosts spawn `node src/stdio.ts` directly and
 * never run an npm script.
 */

import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';

// The SDK's own name for this type collides with another export at the package root, so
// take it from the method that returns it.
type HostContext = NonNullable<ReturnType<App['getHostContext']>>;

type Booking = {
  id: string;
  service: string;
  startsAt: string;
  status: 'confirmed' | 'cancelled';
};

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const formatWhen = (iso: string): string => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const renderRow = (booking: Booking): HTMLElement => {
  const row = el('div', `row${booking.status === 'cancelled' ? ' cancelled' : ''}`);
  const left = el('div', 'left');
  left.append(el('div', 'service', booking.service), el('div', 'when', formatWhen(booking.startsAt)));
  row.append(left, el('div', `status ${booking.status}`, booking.status));
  return row;
};

const render = (bookings: Booking[]): void => {
  const list = document.getElementById('list');
  if (!list) return;

  list.replaceChildren(
    ...(bookings.length
      ? bookings.map(renderRow)
      : [el('div', 'empty', 'Nothing booked yet.')]),
  );
};

/**
 * Say what the host actually sent.
 *
 * Whether a host themes its cards at all is the open question, and the answer differs
 * per host. A line in the card is the cheapest way to read the answer from inside a real
 * client, where there are no devtools to open.
 *
 * ponytail: delete once we have the answer for the hosts we care about.
 */
const reportHostStyles = (ctx: HostContext): void => {
  const wrap = document.querySelector('.wrap');
  if (!wrap) return;

  const variables = Object.values(ctx.styles?.variables ?? {}).filter(Boolean).length;
  const existing = document.querySelector<HTMLElement>('.hostinfo');
  const line = existing ?? el('div', 'hostinfo');

  line.textContent = [
    `theme ${ctx.theme ?? 'not sent'}`,
    `${variables} style variables`,
    ctx.styles?.css?.fonts ? 'fonts sent' : 'no fonts',
  ].join(' \u00b7 ');

  if (!existing) wrap.append(line);
};

/**
 * Wear the host's colours rather than guessing them.
 *
 * The first version painted a fixed palette and approximated dark mode through
 * prefers-color-scheme, on the assumption that a sandboxed frame is told nothing about
 * the app around it. It is told: the host context carries CSS custom properties, a font
 * stylesheet and a theme. Every field is optional, which is why card.css keeps its own
 * values as fallbacks and the host only wins where it has an opinion.
 */
const adoptHostStyles = (ctx?: HostContext): void => {
  if (!ctx) return;
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  reportHostStyles(ctx);
};

const app = new App({ name: 'bookings-card', version: '0.1.0' });

app.ontoolresult = (result) => {
  const structured = result.structuredContent as { bookings?: Booking[] } | undefined;
  render(structured?.bookings ?? []);
};

app.onhostcontextchanged = adoptHostStyles;

await app.connect();
adoptHostStyles(app.getHostContext());
