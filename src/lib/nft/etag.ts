import crypto from "crypto";

export const computeWeakEtag = (buf: Buffer) => {
  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);
  return `W/"${buf.length}-${hash}"`;
};

export const maybeNotModified = (request: Request, etag: string) => {
  const ifNoneMatch = request.headers.get("if-none-match");
  return typeof ifNoneMatch === "string" && ifNoneMatch === etag;
};


