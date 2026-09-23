"use client";

import { useState } from "react";
// Type-only: erased at compile time (tsconfig's `isolatedModules`), so this never pulls the
// `node:crypto`-using `person-view.ts` module itself into the client bundle.
import type { SourceSegment } from "@/lib/person-view";
import styles from "./person.module.css";

/**
 * The person's photo, hot-linked from ru.openlist.wiki (never downloaded or proxied — plain `<img>`,
 * not `next/image`, so the Next optimiser never fetches it through our server; `referrerPolicy`
 * keeps the wiki from seeing which victim's page each visitor came from). `url` is already built
 * server-side by `photoUrl`. On a load failure the whole figure disappears silently: no placeholder,
 * no broken-image icon, no error text on a memorial page. The page is `force-dynamic` and this image
 * sits at the top of the SSR'd HTML, so the browser can start (and finish) the request before React
 * hydrates and attaches `onError` — the `ref` callback catches that already-failed-by-mount case too.
 */
export function PersonPhoto({ url, alt, caption = [] }: { url: string; alt: string; caption?: SourceSegment[] }) {
  const [failed, setFailed] = useState(false);
  const checkAlreadyFailed = (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  };
  if (failed) return null;
  return (
    <figure className={styles.photo} data-testid="person-photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- hot-linked third-party image, must not go through the Next image optimizer */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={styles.photoImg}
        ref={checkAlreadyFailed}
        onError={() => setFailed(true)}
      />
      {caption.length > 0 && (
        <figcaption className={styles.photoCaption}>
          {caption.map((segment, i) =>
            segment.href ? (
              <a key={i} href={segment.href} rel="nofollow noopener">{segment.text}</a>
            ) : (
              <span key={i}>{segment.text}</span>
            ),
          )}
        </figcaption>
      )}
    </figure>
  );
}
