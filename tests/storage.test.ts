import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uploadObjectPath } from "../lib/chat/storage.ts";

const base = "https://abc.supabase.co";

describe("upload URLs", () => {
  it("finds the object path of an upload", () => {
    assert.equal(
      uploadObjectPath(`${base}/storage/v1/object/public/uploads/u1/9f0c/cat.png`, base),
      "u1/9f0c/cat.png",
    );
    assert.equal(
      uploadObjectPath(`${base}/storage/v1/object/public/uploads/u1/9f0c/my%20cat.png?v=2`, `${base}/`),
      "u1/9f0c/my cat.png",
    );
  });

  it("ignores everything else", () => {
    assert.equal(uploadObjectPath("https://media.tenor.com/x.gif", base), undefined);
    assert.equal(uploadObjectPath(`${base}/storage/v1/object/public/avatars/u1/a.png`, base), undefined);
    assert.equal(uploadObjectPath(`https://evil.example/storage/v1/object/public/uploads/a/b/c`, base), undefined);
    assert.equal(uploadObjectPath(`${base}/storage/v1/object/public/uploads/`, base), undefined);
  });

  it("refuses paths that climb out of the bucket", () => {
    assert.equal(uploadObjectPath(`${base}/storage/v1/object/public/uploads/u1/%2E%2E/x`, base), undefined);
    assert.equal(uploadObjectPath(`${base}/storage/v1/object/public/uploads/%E0%A4%A`, base), undefined);
  });
});
