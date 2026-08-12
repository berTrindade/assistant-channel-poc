/**
 * stdio entry point.
 *
 * For hosts that spawn the server as a child process: no port, no tunnel, no public
 * address, and nothing for an administrator to have disabled. Same tool contract as the
 * HTTP entry point, because the contract is the thing that stays put when the transport
 * changes.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { buildServer } from './tools.ts';

await buildServer().connect(new StdioServerTransport());
