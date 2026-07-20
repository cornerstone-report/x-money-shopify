import { randomBytes } from "node:crypto";
import prisma from "../db.server";

/** Crockford-ish alphabet without ambiguous 0/O/1/I/L. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generate a clean XM-XXXXX payment reference.
 * Format: XM- + 5 uppercase alphanumeric chars (collision-safe via retry).
 */
export function generateXmReference(): string {
  const bytes = randomBytes(5);
  let body = "";
  for (let i = 0; i < 5; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `XM-${body}`;
}

/**
 * Allocate a unique XM reference for a shop (retry on rare unique conflicts).
 */
export async function allocateUniqueXmReference(
  shop: string,
  maxAttempts = 8,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const xmReference = generateXmReference();
    const existing = await prisma.pendingXMoneyPayment.findUnique({
      where: {
        shop_xmReference: { shop, xmReference },
      },
      select: { id: true },
    });
    if (!existing) {
      return xmReference;
    }
  }
  throw new Error("Could not allocate a unique XM reference");
}
