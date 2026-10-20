// Fetching pages for link previews (server only: server.mts imports it by
// path, so `import type` only from the app, and Node built-ins).
//
// Never from private or internal addresses: the check runs in the DNS lookup
// Node uses to connect, so the address checked is the address connected to (a
// name can't answer "public" to a check and "private" to the connection). It
// applies again after every redirect; literal IPs are checked directly, since
// they skip DNS. Standard ports only, a short timeout and a size cap.

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isPrivateAddress } from "./safety.ts";
import type { LinkPreview } from "./types";
import { defaultIcon, filePreview, parsePreview, plainPreview } from "./unfurl.ts";

const TIMEOUT = 4000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

/** A DNS lookup that fails for names resolving to any private address. */
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} is a private address`), { code: "EPRIVATE" }), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, all: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

/** One GET, redirects not followed: the status and headers, and the body (up to `max` bytes) of a 200 HTML page. */
export function get(target: URL, max = MAX_BYTES) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const request = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, {
      method: "GET",
      lookup: publicOnlyLookup,
      timeout: TIMEOUT,
      // Pages preferred, but files are previewed too (from their headers; their body isn't read).
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ObsidianChat/1.0; link preview)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    request.on("timeout", () => request.destroy(new Error("timed out")));
    request.on("error", reject);
    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      const html = (response.headers["content-type"] ?? "").includes("html");
      if (status !== 200 || !html) {
        response.resume();
        request.destroy();
        return resolve({ status, headers: response.headers, body: "" });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        size += chunk.length;
        if (size >= max) request.destroy(); // enough for the <head>
      });
      const done = () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks).subarray(0, max).toString("utf8") });
      response.on("end", done);
      response.on("close", done);
    });
    request.end();
  });
}

/** Whether a URL may be fetched at all (before DNS): http(s), standard port, no credentials, no private literal IP. */
export function fetchable(target: URL) {
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  if ((target.port && target.port !== "80" && target.port !== "443") || target.username || target.password) return false;
  const literal = target.hostname.replace(/^\[|\]$/g, "");
  return !(isIP(literal) && isPrivateAddress(literal));
}

/**
 * The link's preview card, following up to three redirects. Always one: a
 * page's (see parsePreview), a file's (filePreview), or a plain card when it
 * can't be fetched safely, fails or answers with an error. The plain card only
 * gets the site's icon when the site was actually reached (a public address).
 */
export async function fetchPreviewPage(href: string): Promise<LinkPreview> {
  let target: URL;
  try {
    target = new URL(href);
  } catch {
    return plainPreview(href);
  }
  const deadline = Date.now() + TIMEOUT * 2;
  for (let hop = 0; hop <= MAX_REDIRECTS && Date.now() < deadline; hop++) {
    if (!fetchable(target)) return plainPreview(href);
    let response: Awaited<ReturnType<typeof get>>;
    try {
      response = await get(target);
    } catch {
      return plainPreview(href); // unreachable, private, or too slow
    }
    if (response.status >= 300 && response.status < 400) {
      if (!response.headers.location) return plainPreview(href, defaultIcon(target.href));
      try {
        target = new URL(response.headers.location, target);
      } catch {
        return plainPreview(href, defaultIcon(target.href));
      }
      continue;
    }
    if (response.status !== 200) return plainPreview(href, defaultIcon(target.href));
    const type = response.headers["content-type"] ?? "";
    // The card links to what was posted, not where it redirected.
    if (!type.includes("html")) {
      return filePreview(href, {
        type,
        length: response.headers["content-length"],
        disposition: response.headers["content-disposition"],
      });
    }
    return parsePreview(response.body, href, target.href);
  }
  return plainPreview(href);
}
