import { LogoMark } from "./LogoMark";
import styles from "./SiteHeader.module.css";

interface LogoLockupProps {
  size?: number;
}

/**
 * The mark plus the "MEMO"+"ru" wordmark — shared by the header, the mobile drawer title and the
 * footer's left column, all pulling the same classes from SiteHeader.module.css so the shapes and
 * colours stay identical everywhere. Callers own the surrounding layout (link vs. plain container,
 * size, spacing); this only ever renders the two visual pieces.
 */
export function LogoLockup({ size = 24 }: LogoLockupProps) {
  return (
    <>
      <LogoMark size={size} className={styles.mark} />
      <span className={styles.wordmark}>
        MEMO<span className={styles.wordmarkMuted}>ru</span>
      </span>
    </>
  );
}
