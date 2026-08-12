/**
 * HTTP entry point.
 *
 * Streamable HTTP, one server instance per request because the protocol is stateless.
 * Use this when a cloud host has to reach you, which means a public HTTPS address and
 * therefore a tunnel or a deployment.
 *
 * For a host that can spawn a process locally, stdio.ts is less machinery.
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express from 'express';

import { buildServer } from './tools.ts';

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.use(cors());
app.use(express.json());

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => void transport.close());
  await buildServer(req.headers.authorization).connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.error(`assistant-channel-poc listening on http://localhost:${PORT}/mcp`);
});
