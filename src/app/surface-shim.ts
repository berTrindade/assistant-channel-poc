/**
 * What model-authored code is written against, injected ahead of the model's own markup.
 *
 * A shim rather than a document: the surface may replace anything here, and if it writes its
 * own handlers or ignores window.mcp entirely, that is the tier working as described.
 *
 * It lives in its own module for one reason: it is JavaScript inside a string, so nothing
 * type-checks it. test/shim.test.ts parses it instead, which is the only thing standing
 * between a typo here and every surface breaking silently in a real host.
 */
export const SURFACE_SHIM = `<script>
  (() => {
    const pending = new Map();
    let seq = 0;

    const ask = (payload) => {
      const id = ++seq;
      parent.postMessage({ ...payload, id }, '*');
      return new Promise((resolve) => pending.set(id, resolve));
    };

    window.mcp = {
      say: (text) => ask({ verb: 'say', text: String(text) }),
      callTool: (name, args) => ask({ verb: 'callTool', name: String(name), arguments: args ?? {} }),
      openLink: (url) => ask({ verb: 'openLink', url: String(url) }),
      requestDisplayMode: (mode) => ask({ verb: 'displayMode', mode: String(mode) }),
      updateContext: (text) => ask({ verb: 'context', text: String(text) }),
      onToolResult: (fn) => { window.mcp._onToolResult = fn; },
      onTheme: (fn) => { window.mcp._onTheme = fn; },
      theme: 'light',
    };

    addEventListener('message', (event) => {
      const data = event.data ?? {};

      if (data.reply !== undefined && pending.has(data.reply)) {
        pending.get(data.reply)(data.result);
        pending.delete(data.reply);
        return;
      }

      if (data.styles) {
        const sheet = document.getElementById('host-styles') ?? document.createElement('style');
        sheet.id = 'host-styles';
        sheet.textContent = ':root{' + Object.entries(data.styles)
          .filter(([, value]) => value)
          .map(([name, value]) => name + ':' + value + ';')
          .join('') + '}';
        document.head.append(sheet);
      }

      if (data.fonts) {
        const fonts = document.createElement('style');
        fonts.textContent = data.fonts;
        document.head.append(fonts);
      }

      if (data.theme) {
        window.mcp.theme = data.theme;
        document.documentElement.dataset.theme = data.theme;
        window.mcp._onTheme?.(data.theme);
      }

      if (data.toolResult) window.mcp._onToolResult?.(data.toolResult);
    });

    // Kept from the version before this: mark anything with data-say and it is clickable
    // without writing a listener.
    addEventListener('click', (event) => {
      const said = event.target.closest?.('[data-say]')?.getAttribute('data-say');
      if (said) window.mcp.say(said);
    });

    // The container is not allowed to read this document, so this document reports its own
    // height and the container passes it on.
    const report = () => parent.postMessage({ verb: 'height', px: document.documentElement.scrollHeight }, '*');
    new ResizeObserver(report).observe(document.documentElement);
    addEventListener('load', report);
  })();
</script>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    font: 15px/1.5 var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    color: var(--color-text-primary, #16202c);
    background: transparent;
  }
  [data-say] { cursor: pointer; }
</style>`;
