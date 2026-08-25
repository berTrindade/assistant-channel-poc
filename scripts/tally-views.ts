/**
 * How far does asking nicely get us?
 *
 * The render_view tool asks the model to style its surface with the host's tokens and
 * never to invent a colour. Nothing enforces that, because at the Open-ended tier there
 * are no variants to withhold. So the only honest way to talk about compliance is to ask
 * for the same view repeatedly and count.
 *
 * Run the tool a handful of times from a real host, then run this.
 */

import fs from 'node:fs/promises';

import { auditView, VIEW_LOG } from '../src/views.ts';

const lines = await fs
  .readFile(VIEW_LOG, 'utf-8')
  .then((text) => text.split('\n').filter(Boolean))
  .catch(() => []);

if (!lines.length) {
  console.error(`No surfaces logged yet. Ask a host to call render_view, then run this again.`);
  process.exit(0);
}

const audits = lines.map((line) => {
  const { at, html } = JSON.parse(line) as { at: string; html: string };
  return { at, ...auditView(html) };
});

const compliant = audits.filter((audit) => audit.compliant);
const invented = audits.flatMap((audit) => audit.inlineColours);
const tokens = new Map<string, number>();

for (const audit of audits) {
  for (const variable of audit.hostVariables) {
    tokens.set(variable, (tokens.get(variable) ?? 0) + 1);
  }
}

const pct = Math.round((compliant.length / audits.length) * 100);

console.error(`surfaces        ${audits.length}`);
console.error(`compliant       ${compliant.length} (${pct}%)`);
console.error(`colours invented ${invented.length}${invented.length ? `: ${[...new Set(invented)].join(', ')}` : ''}`);
console.error(
  `tokens used     ${
    tokens.size
      ? [...tokens]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([name, count]) => `${name} x${count}`)
          .join(', ')
      : 'none'
  }`,
);

for (const audit of audits) {
  if (audit.compliant) continue;
  console.error(`  ${audit.at}  ${audit.inlineColours.join(' ') || 'no host tokens used'}`);
}
