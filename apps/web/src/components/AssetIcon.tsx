'use client';

import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '@/lib/assets';

// Most entities don't have prepared art yet (see instructions/ASSETS.md — placeholders are
// expected during early development), so a missing file falls back to the caller's placeholder
// instead of showing a broken image icon.
export function AssetIcon({
  assetId,
  alt,
  className,
  fallback,
}: {
  assetId: string;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // A missing file can fail before React attaches onError (server-rendered
  // markup), leaving a broken image instead of the fallback — check once mounted.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [assetId]);

  if (failed) {
    return <>{fallback}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- next/image's optimizer is disabled project-wide (no sharp); see apps/web/next.config.mjs.
    <img ref={imgRef} src={assetUrl(assetId)} alt={alt} className={className} onError={() => setFailed(true)} />
  );
}
