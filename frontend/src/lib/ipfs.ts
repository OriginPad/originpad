// src/lib/ipfs.ts
// Uses Pinata for IPFS uploads. Can swap for NFT.storage or web3.storage.

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || "";

// Images load through our own VPS cache first (local disk + immutable browser
// cache = effectively instant, and never the 403/rate-limit/5-10s hangs of
// public gateways). The cache endpoint races every gateway on a miss, stores
// the bytes, and serves instantly thereafter. Public gateways stay as a
// fallback in case the VPS is ever down.
const PROFILE_API = (process.env.NEXT_PUBLIC_PROFILE_API || "https://originpad.live").replace(/\/$/, "");
const VPS_CACHE = `${PROFILE_API}/api/img`;
const FAST_GATEWAYS = ["https://ipfs.io", "https://nftstorage.link", "https://dweb.link"];
export const IPFS_GATEWAYS = [VPS_CACHE, ...FAST_GATEWAYS].filter((v, i, a) => a.indexOf(v) === i);

/**
 * Upload a file to IPFS via Pinata
 * Returns the ipfs:// URI
 */
export async function uploadToIPFS(file: File): Promise<string> {
  if (!PINATA_JWT) {
    // Dev fallback: return object URL (not persisted)
    console.warn("No PINATA_JWT set — using local object URL (dev only)");
    return URL.createObjectURL(file);
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "pinataMetadata",
    JSON.stringify({ name: file.name })
  );
  formData.append(
    "pinataOptions",
    JSON.stringify({ cidVersion: 1 })
  );

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`IPFS upload failed: ${res.statusText}`);
  }

  const data = await res.json();
  return `ipfs://${data.IpfsHash}`;
}

/**
 * Upload a JSON metadata object to IPFS
 */
export async function uploadJSONToIPFS(metadata: object): Promise<string> {
  if (!PINATA_JWT) {
    return `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;
  }

  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name: "metadata.json" },
    }),
  });

  if (!res.ok) {
    throw new Error(`IPFS JSON upload failed: ${res.statusText}`);
  }

  const data = await res.json();
  return `ipfs://${data.IpfsHash}`;
}

/**
 * Convert ipfs:// URI to gateway URL for display
 */
export function ipfsToHTTP(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    return `${IPFS_GATEWAYS[0]}/ipfs/${uri.replace("ipfs://", "")}`;
  }
  return uri; // Already HTTP or data URL
}

/** Every gateway URL for a uri, in priority order — used for onError fallback. */
export function ipfsCandidates(uri: string): string[] {
  if (!uri) return [];
  if (uri.startsWith("ipfs://")) {
    const cid = uri.replace("ipfs://", "");
    return IPFS_GATEWAYS.map((g) => `${g}/ipfs/${cid}`);
  }
  return [uri];
}
