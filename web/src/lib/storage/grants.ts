import { db, type GrantRow } from "./db";

export async function addGrant(row: GrantRow): Promise<void> {
  await db.grants.add(row);
}
export async function listGrants(): Promise<GrantRow[]> {
  return db.grants.orderBy("createdAt").reverse().toArray();
}
export async function markRevoked(grantId: string): Promise<void> {
  await db.grants.update(grantId, { revoked: true });
}
