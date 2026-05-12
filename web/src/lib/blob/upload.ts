import { upload } from "@vercel/blob/client";

export async function uploadCipher(ciphertext: ArrayBuffer, filename: string): Promise<string> {
  const blob = new Blob([ciphertext], { type: "application/octet-stream" });
  const result = await upload(filename, blob, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
  });
  return result.url;
}
