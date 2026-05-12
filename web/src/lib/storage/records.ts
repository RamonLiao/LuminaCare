import { db, type RecordRow } from "./db";

export async function addRecord(row: RecordRow): Promise<void> {
  await db.records.add(row);
}
export async function listRecords(): Promise<RecordRow[]> {
  return db.records.orderBy("createdAt").reverse().toArray();
}
export async function getRecord(recordId: string): Promise<RecordRow | undefined> {
  return db.records.get(recordId);
}
export async function nextVersion(): Promise<number> {
  const last = await db.records.orderBy("version").last();
  return (last?.version ?? 0) + 1;
}
