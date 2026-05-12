import type { Idl } from "@coral-xyz/anchor";
import idlJson from "./idl.json";

export const IDL = idlJson as Idl;

export type HealthRecord = {
  patient: string;
  contentHash: number[];
  createdAt: number;
  version: number;
};

export type AccessGrant = {
  patient: string;
  recordIds: string[];
  granteeLabelHash: number[];
  expiresAt: number;
  revoked: boolean;
};
