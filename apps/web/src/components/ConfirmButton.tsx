'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

interface ConfirmButtonProps {
  label: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  // Shown above the Confirm/Cancel pair while confirming — for warnings that
  // matter (a penalty, "cannot be undone") rather than a bare yes/no.
  message?: ReactNode;
  className?: string;
  confirmClassName?: string;
  cancelClassName?: string;
  // Applied to the wrapping <div> while confirming — needed when the button
  // is a flex-1 item among siblings (e.g. a "Leave"/"Disband" pair), so the
  // confirming state keeps occupying the same share of the row.
  wrapperClassName?: string;
}

// Replaces window.confirm()'s native dialog with an inline two-step button —
// the native dialog looks out of place in the game's own UI and is awkward
// on mobile (instructions/PRODUCT_SPEC.md targets busy players on any device).
export function ConfirmButton({
  label,
  confirmLabel,
  cancelLabel,
  onConfirm,
  disabled,
  message,
  className,
  confirmClassName,
  cancelClassName,
  wrapperClassName,
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className={wrapperClassName}>
        {message && <p className="mb-2 text-[10px] text-textMuted">{message}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => { setConfirming(false); void onConfirm(); }} className={confirmClassName ?? className}>
            {confirmLabel}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={cancelClassName}>
            {cancelLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" disabled={disabled} onClick={() => setConfirming(true)} className={className}>
      {label}
    </button>
  );
}
