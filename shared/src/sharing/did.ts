/** Compact a long DID for display: keep the head and tail recognizable. */
export function truncateDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 16)}...${did.slice(-8)}`;
}
