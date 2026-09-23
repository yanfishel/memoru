import type { TimelineStep } from "@/lib/person-view";
import { UI } from "@/lib/ui-text";
import styles from "./person.module.css";

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className={styles.timeline} data-testid="person-timeline" aria-label={UI.person.timeline.title}>
      {steps.map((step) => (
        <li key={step.key} className={step.value === null ? styles.stepUnknown : step.accent ? styles.stepAccent : styles.step}>
          <span className={`${styles.stepValue} tnum`}>{step.value ?? "—"}</span>
          <span className={styles.stepLabel}>{step.value === null ? `${step.label}: ${UI.notStated}` : step.label}</span>
        </li>
      ))}
    </ol>
  );
}
