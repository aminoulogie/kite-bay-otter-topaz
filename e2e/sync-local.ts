// The sync relay in memory, on localhost, for the browser tests. Same request
// handling as the Cloudflare worker (src/lib/sync/server-core.ts).
import { createServer } from "node:http";
import { handle, memoryStorage } from "../src/lib/sync/server-core.ts";

const port = Number(process.env.PORT ?? 8787);
const store = memoryStorage();

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await handle(
    new Request(`http://localhost:${port}${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    }),
    store,
  );
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`sync relay on http://localhost:${port}`));
