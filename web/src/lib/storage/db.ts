import Dexie, { type Table } from "dexie";

export type RecordRow = {
  recordId: string;
  pdaAddress: string;
  blobUrl: string;
  aesKey: ArrayBuffer;
  iv: ArrayBuffer;
  contentHash: ArrayBuffer;
  version: number;
  kind: "photo" | "audio" | "text";
  preview: string;
  createdAt: number;
  txSig: string;
};

export type GrantRow = {
  grantId: string;
  pdaAddress: string;
  recordIds: string[];
  granteeLabel: string;
  expiresAt: number;
  revoked: boolean;
  bundleUrl: string;
  bundleKey: ArrayBuffer;
  bundleIv: ArrayBuffer;
  qrPayload: string;
  createdAt: number;
};

class PHDb extends Dexie {
  records!: Table<RecordRow, string>;
  grants!: Table<GrantRow, string>;
  constructor() {
    super("portable_health");
    this.version(1).stores({
      records: "recordId, version, createdAt",
      grants: "grantId, expiresAt, revoked, createdAt",
    });
  }
}

export const db = new PHDb();
