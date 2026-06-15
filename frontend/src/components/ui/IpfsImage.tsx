"use client";

import { useState, useEffect } from "react";
import { ipfsCandidates } from "@/lib/ipfs";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  /** ipfs:// uri or a plain http/data url */
  uri: string;
};

/**
 * <img> that resolves IPFS via fast gateways and automatically falls back to the
 * next gateway if one errors, so a single slow/failing gateway never leaves a
 * broken or forever-loading image.
 */
export function IpfsImage({ uri, alt = "", ...rest }: Props) {
  const candidates = ipfsCandidates(uri);
  const [idx, setIdx] = useState(0);

  // Reset when the source changes
  useEffect(() => { setIdx(0); }, [uri]);

  const src = candidates[idx] ?? "";
  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setIdx((i) => (i + 1 < candidates.length ? i + 1 : i))}
      {...rest}
    />
  );
}
