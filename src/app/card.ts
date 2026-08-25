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

import { App } from '@modelcontextprotocol/ext-apps';

import { type HostContext, adoptHostStyles, describeHostStyles } from './host-styles.ts';

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
 * Apply the host's styling, and show what arrived. See host-styles.ts for both halves.
 */
const showHostStyles = (ctx?: HostContext): void => {
  if (!ctx) return;
  adoptHostStyles(ctx);

  const wrap = document.querySelector('.wrap');
  if (!wrap) return;

  const existing = document.querySelector<HTMLElement>('.hostinfo');
  const line = existing ?? el('div', 'hostinfo');
  line.textContent = describeHostStyles(ctx);
  if (!existing) wrap.append(line);
};

const app = new App({ name: 'bookings-card', version: '0.1.0' });

app.ontoolresult = (result) => {
  const structured = result.structuredContent as { bookings?: Booking[] } | undefined;
  render(structured?.bookings ?? []);
};

app.onhostcontextchanged = showHostStyles;

await app.connect();
showHostStyles(app.getHostContext());
