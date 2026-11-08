"use client";

import { useEffect, useState } from "react";
import type { Notice } from "../lib/types";

const VISIBLE_MS = 6000;

/** One short message at the bottom of the screen. It answers what the person just did. */
export function Toast({ notice }: { notice: Notice | null }) {
  const [shownId, setShownId] = useState<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    setShownId(notice.id);
    const timer = setTimeout(() => setShownId(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const visible = notice !== null && shownId === notice.id;
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {visible && <p className={`toast toast--${notice.tone}`}>{notice.text}</p>}
    </div>
  );
}
