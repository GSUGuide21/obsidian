import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filePreview, parsePreview, plainPreview, previewTarget } from "../lib/chat/unfurl.ts";

describe("which link gets a preview", () => {
  it("is the first ordinary link", () => {
    assert.equal(previewTarget("see https://example.com/a and https://example.org"), "https://example.com/a");
  });

  it("skips embedded sites and links that already have a card", () => {
    assert.equal(previewTarget("https://youtu.be/abc"), undefined);
    assert.equal(previewTarget("https://www.youtube.com/watch?v=1"), undefined);
    assert.equal(
      previewTarget("https://example.com/", [{ type: "link", url: "https://example.com/" }]),
      undefined,
    );
  });

  it("leaves trailing punctuation out of the link", () => {
    assert.equal(previewTarget("look (https://example.com/page)."), "https://example.com/page");
  });

  it("is nothing without a link", () => {
    assert.equal(previewTarget("no links here"), undefined);
  });
});

describe("reading a page's preview", () => {
  const page = "https://example.com/post";

  it("prefers Open Graph tags", () => {
    const html = `<html><head><title>Plain title</title>
      <meta property="og:title" content="OG &amp; title">
      <meta property="og:description" content='A "quoted" description'>
      <meta property="og:image" content="/img/cover.png">
    </head></html>`;
    assert.deepEqual(parsePreview(html, page), {
      type: "link",
      url: page,
      title: "OG & title",
      description: 'A "quoted" description',
      thumbnail: "https://example.com/img/cover.png",
      icon: "https://example.com/favicon.ico",
    });
  });

  it("reads the site's name, icon, color and large-image request", () => {
    const html = `<head>
      <meta property="og:title" content="T"><meta property="og:site_name" content="Example News">
      <meta property="og:image" content="https://cdn.example.com/big.jpg">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="theme-color" content="#1A2b3C">
      <link rel="apple-touch-icon" href="/touch.png"><link rel="shortcut icon" href="/fav.png">
    </head>`;
    const preview = parsePreview(html, page);
    assert.equal(preview.siteName, "Example News");
    assert.equal(preview.icon, "https://example.com/fav.png");
    assert.equal(preview.color, "#1a2b3c");
    assert.equal(preview.large, true);
    // Short colors are expanded; names aren't colors here.
    assert.equal(parsePreview(`<meta name="theme-color" content="#abc">`, page).color, "#aabbcc");
    assert.equal(parsePreview(`<meta name="theme-color" content="red">`, page).color, undefined);
    // Asking for a large image without one is nothing.
    assert.equal(parsePreview(`<meta name="twitter:card" content="summary_large_image">`, page).large, undefined);
  });

  it("resolves images against where the page really was (after redirects)", () => {
    const preview = parsePreview(`<meta property="og:image" content="a.png">`, page, "https://www.example.org/moved/");
    assert.equal(preview.thumbnail, "https://www.example.org/moved/a.png");
    assert.equal(preview.icon, "https://www.example.org/favicon.ico");
    assert.equal(preview.url, page);
  });

  it("never points viewers at private addresses", () => {
    const html = `<meta property="og:image" content="http://192.168.1.1/cam.jpg"><link rel="icon" href="http://[::1]/i.png">`;
    const preview = parsePreview(html, page);
    assert.equal(preview.thumbnail, undefined);
    assert.equal(preview.icon, "https://example.com/favicon.ico");
    assert.equal(parsePreview(`<meta property="og:image" content="https://8.8.8.8/x.png">`, page).thumbnail, "https://8.8.8.8/x.png");
  });

  it("falls back to Twitter cards, then <title> and the description", () => {
    assert.equal(parsePreview(`<meta name="twitter:title" content="Tweet title">`, page)?.title, "Tweet title");
    const fallback = parsePreview(`<title> Just  a title </title><meta name="description" content="Desc">`, page);
    assert.equal(fallback?.title, "Just a title");
    assert.equal(fallback?.description, "Desc");
  });

  it("drops images that aren't http(s)", () => {
    const html = `<meta property="og:title" content="T"><meta property="og:image" content="javascript:alert(1)">`;
    assert.equal(parsePreview(html, page)?.thumbnail, undefined);
  });

  it("caps long titles and decodes numeric entities", () => {
    const preview = parsePreview(`<meta property="og:title" content="${"x".repeat(300)}&#33;">`, page);
    assert.equal(preview?.title?.length, 200);
    assert.equal(parsePreview(`<title>Caf&#xe9;</title>`, page)?.title, "Café");
  });

  it("is a plain card with the site's icon for a page with no title or description", () => {
    assert.deepEqual(parsePreview("<html><body>hi</body></html>", page), {
      type: "link",
      url: page,
      icon: "https://example.com/favicon.ico",
    });
  });
});

describe("cards for links that aren't pages", () => {
  const url = "https://files.example.com/docs/Annual%20Report.pdf?v=2";

  it("shows media browsers play inline", () => {
    assert.equal(filePreview("https://e.com/a.png", { type: "image/png" }).media, "image");
    assert.equal(filePreview("https://e.com/a.mp4", { type: "video/mp4" }).media, "video");
    assert.equal(filePreview("https://e.com/a.mp3", { type: "audio/mpeg; charset=binary" }).media, "audio");
    assert.equal(filePreview("https://e.com/a.mkv", { type: "video/x-matroska" }).media, "file");
  });

  it("describes files by name, type and size", () => {
    assert.deepEqual(filePreview(url, { type: "application/pdf", length: "2411724" }), {
      type: "link",
      url,
      media: "file",
      fileName: "Annual Report.pdf",
      contentType: "application/pdf",
      size: 2411724,
    });
  });

  it("prefers the name the server gives, and keeps path parts out of it", () => {
    const named = (disposition: string) => filePreview(url, { type: "application/zip", disposition }).fileName;
    assert.equal(named(`attachment; filename="build.zip"`), "build.zip");
    assert.equal(named(`attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.zip`), "résumé.zip");
    assert.equal(named(`attachment; filename="../../etc/passwd"`), "passwd");
  });

  it("leaves out sizes and types it can't trust", () => {
    const preview = filePreview(url, { type: "not a type", length: "-5" });
    assert.equal(preview.size, undefined);
    assert.equal(preview.contentType, undefined);
  });

  it("can be just the address", () => {
    assert.deepEqual(plainPreview("https://example.com/x"), { type: "link", url: "https://example.com/x" });
  });
});
