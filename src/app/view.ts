/**
 * The frame around a surface the model wrote.
 *
 * The model owns every pixel inside this page and none of the page itself. What the frame
 * adds is the one thing model-authored HTML cannot do for itself: talk back. A surface that
 * only renders is a picture, and the tier is supposed to be interactive.
 *
 * The contract is deliberately one verb. Any element carrying data-say becomes clickable,
 * and clicking it sends that text to the conversation as if the user had typed it. One
 * delegated listener here, no script in the model's HTML, nothing exposed on window. So
 * the model can compose anything it likes and still only has a single way to reach the
 * agent, which is the difference between an open surface and an open door.
 *
 * The exposure that remains: this page runs HTML we did not write, and the only thing
 * between it and the user is the host's sandbox.
 *
 * ponytail: one verb, no CSP declared on the resource. Declare one, and add a second verb,
 * the day a surface needs to do more than continue the conversation.
 */

import { App } from '@modelcontextprotocol/ext-apps';

import { adoptHostStyles, describeHostStyles } from './host-styles.ts';

const app = new App({ name: 'model-authored-view', version: '0.1.0' });

const report = (text: string): void => {
  const line = document.getElementById('hostinfo');
  if (line) line.textContent = text;
};

app.onhostcontextchanged = (ctx) => {
  adoptHostStyles(ctx);
  report(describeHostStyles(ctx));
};

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const said = target.closest('[data-say]')?.getAttribute('data-say');
  if (!said) return;

  void app.sendMessage({ role: 'user', content: [{ type: 'text', text: said }] });
});

await app.connect();

const ctx = app.getHostContext();
if (ctx) {
  adoptHostStyles(ctx);
  report(describeHostStyles(ctx));
}
