import { fromBase64, toBase64 } from "@/lib/crypto/aes";

export type QrPayloadV1 = {
  v: 1;
  grantId: string;
  patientPubkey: string;
  bundleUrl: string;
  bundleKey: string;
  bundleIv: string;
  programId: string;
  cluster: "devnet";
};

export function encodePayload(p: QrPayloadV1): string {
  return toBase64(new TextEncoder().encode(JSON.stringify(p)));
}

export function decodePayload(s: string): QrPayloadV1 {
  const json = new TextDecoder().decode(fromBase64(s));
  const obj = JSON.parse(json);
  if (obj.v !== 1) throw new Error("unsupported QR version");
  return obj;
}
