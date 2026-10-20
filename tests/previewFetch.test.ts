import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { fetchable, fetchPreviewPage, get } from "../lib/chat/previewFetch.ts";

describe("what may be fetched for a preview", () => {
  it("allows ordinary http(s) URLs", () => {
    assert.equal(fetchable(new URL("https://example.com/a")), true);
    assert.equal(fetchable(new URL("http://example.com:80/")), true);
  });

  it("refuses other schemes, ports, credentials and private literal IPs", () => {
    for (const url of [
      "ftp://example.com/",
      "https://example.com:8443/",
      "https://user:pass@example.com/",
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://10.0.0.5/",
    ]) {
      assert.equal(fetchable(new URL(url)), false, url);
    }
  });
});

describe("the connection itself refuses private addresses", () => {
  // A real page on this machine: the fetcher must never reach it.
  let server: Server;
  let port = 0;
  let hits = 0;
  before(async () => {
    server = createServer((_, res) => {
      hits++;
      res.writeHead(200, { "content-type": "text/html" }).end("<title>secret</title>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("fails the lookup for a name that resolves to loopback", async () => {
    await assert.rejects(get(new URL(`http://localhost:${port}/`)), /private address/);
    assert.equal(hits, 0);
  });

  it("gives private targets only a plain card (no icon), without connecting", async () => {
    const local = `http://localhost:${port}/`;
    assert.deepEqual(await fetchPreviewPage(local), { type: "link", url: local });
    assert.deepEqual(await fetchPreviewPage("http://127.0.0.1/"), { type: "link", url: "http://127.0.0.1/" });
    assert.equal(hits, 0);
  });
});
