// Write-only drop box for the nightly Postgres backup. The Railway `postgres-backup` cron service
// holds a bearer token that can create new backup objects and nothing else: it cannot read, list,
// overwrite or delete anything in the bucket.

const KEY =
  /^(postgres|monthly\/postgres)\/milkandhenny-postgres-\d{8}T\d{6}Z\.(dump|dump\.list|row-counts\.txt|SHA256SUMS)$/;
const SHA256 = /^[a-f0-9]{64}$/;

/** @param {string} a @param {string} b */
function sameSecret(a, b) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  return left.byteLength === right.byteLength && crypto.subtle.timingSafeEqual(left, right);
}

/** @param {number} status @param {Record<string, unknown>} body */
function json(status, body) {
  return Response.json(body, { status });
}

export default {
  /** @param {Request} request @param {{ BACKUPS: any; BACKUP_DROP_TOKEN: string }} env */
  async fetch(request, env) {
    const authorization = request.headers.get("authorization") ?? "";
    if (!env.BACKUP_DROP_TOKEN || !sameSecret(authorization, `Bearer ${env.BACKUP_DROP_TOKEN}`)) {
      return json(401, { error: "unauthorized" });
    }
    if (request.method !== "PUT") return json(405, { error: "method not allowed" });

    const key = decodeURIComponent(new URL(request.url).pathname.slice(1));
    const sha256 = request.headers.get("x-content-sha256") ?? "";
    if (!KEY.test(key)) return json(400, { error: "key not allowed" });
    if (!SHA256.test(sha256)) return json(400, { error: "x-content-sha256 required" });
    if (!request.body || !request.headers.get("content-length")) {
      return json(411, { error: "content-length required" });
    }
    if (await env.BACKUPS.head(key)) return json(409, { error: "object exists", key });

    try {
      // R2 rejects the write if the received bytes do not hash to `sha256`.
      const object = await env.BACKUPS.put(key, request.body, { sha256 });
      return json(201, { key, size: object.size, sha256 });
    } catch (error) {
      console.error("backup put failed", { key, error: String(error) });
      return json(422, { error: "upload rejected", key });
    }
  },
};
