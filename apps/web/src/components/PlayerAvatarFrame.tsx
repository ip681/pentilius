'use client';

import { AssetIcon } from './AssetIcon';

// Avatar drawn under the frame, both stretched to the same box — this only
// looks right because every avatar/frame PNG shares one fixed canvas size
// with the frame's transparent "window" always at the same spot (owner's
// production convention, see instructions/ASSETS.md-style asset guidance).
// No per-image scaling here or ever, by design.
export function PlayerAvatarFrame({
  avatarKey,
  frameKey,
  className,
}: {
  avatarKey: string | null;
  frameKey: string | null;
  className?: string;
}) {
  if (!avatarKey && !frameKey) {
    return null;
  }

  return (
    <div className={`relative ${className ?? 'h-20 w-20'}`}>
      {avatarKey && (
        <AssetIcon
          assetId={`avatars.${avatarKey}.icon`}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          fallback={<span className="absolute inset-0 rounded-full bg-well" />}
        />
      )}
      {frameKey && (
        <AssetIcon assetId={`frames.${frameKey}.icon`} alt="" className="absolute inset-0 h-full w-full object-contain" fallback={<></>} />
      )}
    </div>
  );
}
