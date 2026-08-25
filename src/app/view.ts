/**
 * The container, for a surface that is allowed to be a program.
 *
 * This tier says the agent returns an entire UI surface and the frontend is a container that
 * displays whatever the agent provides. The version before this painted the model's HTML
 * with innerHTML, which meant markup only: no script, no state, one hardcoded verb. That is
 * a document, not an app.
 *
 * So the surface now runs in its own iframe, srcdoc, sandbox="allow-scripts" and nothing
 * else. No allow-same-origin, so it has an opaque origin: it cannot read this document,
 * cannot reach the App connection, cannot touch storage, and cannot speak to the host.
 * Everything it wants goes through postMessage to this file, which decides.
 *
 * That makes this a broker rather than a frame, and it is what lets the surface be arbitrary
 * code without the arrangement being reckless. The blast radius of model-written JavaScript
 * is one sandboxed document and the fixed list of verbs below.
 *
 * ponytail: no CSP on the resource yet and no rate limit on the verbs. Both belong here
 * before anything shaped like this meets a user who is not us.
 */

import { App } from '@modelcontextprotocol/ext-apps';

import { type HostContext, adoptHostStyles, describeHostStyles } from './host-styles.ts';
import { SURFACE_SHIM } from './surface-shim.ts';

const app = new App({ name: 'model-authored-view', version: '0.1.0' });

/**
 * What the surface may ask for.
 *
 * Deliberately smaller than the SDK's surface area. Sampling, teardown, downloads and
 * resource reads are all available to a view and none are here, because nothing has needed
 * them yet and an unused verb is only a way in.
 */
type SurfaceRequest =
  | { id?: number; verb: 'say'; text: string }
  | { id?: number; verb: 'callTool'; name: string; arguments?: Record<string, unknown> }
  | { id?: number; verb: 'openLink'; url: string }
  | { id?: number; verb: 'displayMode'; mode: 'inline' | 'fullscreen' }
  | { id?: number; verb: 'context'; text: string }
  | { id?: number; verb: 'height'; px: number };

const surface = document.getElementById('surface') as HTMLIFrameElement | null;

const report = (text: string): void => {
  const line = document.getElementById('hostinfo');
  if (line) line.textContent = text;
};

/** Push the host's theming through to the sandbox, which cannot ask for it itself. */
const dressSurface = (ctx?: HostContext): void => {
  if (!ctx || !surface?.contentWindow) return;

  surface.contentWindow.postMessage(
    { styles: ctx.styles?.variables, fonts: ctx.styles?.css?.fonts, theme: ctx.theme },
    '*',
  );
};

addEventListener('message', async (event) => {
  if (event.source !== surface?.contentWindow) return;

  const request = event.data as SurfaceRequest;
  const reply = (result: unknown) => {
    if (request.id) surface?.contentWindow?.postMessage({ reply: request.id, result }, '*');
  };

  switch (request.verb) {
    case 'say':
      reply(await app.sendMessage({ role: 'user', content: [{ type: 'text', text: request.text }] }));
      return;
    case 'callTool':
      reply(await app.callServerTool({ name: request.name, arguments: request.arguments }));
      return;
    case 'openLink':
      reply(await app.openLink({ url: request.url }));
      return;
    case 'displayMode':
      reply(await app.requestDisplayMode({ mode: request.mode }));
      return;
    case 'context':
      reply(await app.updateModelContext({ content: [{ type: 'text', text: request.text }] }));
      return;
    case 'height':
      // The host sizes this document, and this document is mostly the sandbox, so the
      // sandbox's height has to become ours before the host is told anything.
      if (surface) surface.style.height = `${request.px}px`;
      await app.sendSizeChanged({ height: document.documentElement.scrollHeight });
      return;
  }
});

app.ontoolresult = (result) => {
  const { html } = (result.structuredContent ?? {}) as { html?: string };

  if (html && surface) {
    surface.addEventListener('load', () => dressSurface(app.getHostContext()), { once: true });
    surface.srcdoc = `${SURFACE_SHIM}\n${html}`;
    return;
  }

  // A later result on a surface that is already running, so let it decide what to do.
  surface?.contentWindow?.postMessage({ toolResult: result.structuredContent ?? {} }, '*');
};

app.onhostcontextchanged = (ctx) => {
  adoptHostStyles(ctx);
  dressSurface(ctx);
  report(describeHostStyles(ctx));
};

await app.connect();

const ctx = app.getHostContext();
if (ctx) {
  adoptHostStyles(ctx);
  report(describeHostStyles(ctx));
}
