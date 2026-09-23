import { Paper } from "@mantine/core";
import { UI } from "@/lib/ui-text";
import { CountUp } from "./CountUp";
import styles from "./home.module.css";

export function StatCards({ summary }: { summary: Record<string, number> }) {
  const items: Array<[string, number, string]> = [
    ["persons", summary.persons ?? 0, UI.home.persons],
    ["cases", summary.cases ?? 0, UI.home.cases],
    ["executed", summary.executed ?? 0, UI.home.executed],
    ["rehabilitated", summary.rehabilitated ?? 0, UI.home.rehabilitated],
  ];
  return (
    <dl className={styles.stats}>
      {items.map(([key, value, label]) => (
        // <dt> precedes <dd> for a valid <dl>; the card reverses them visually so the number reads first.
        <Paper key={key} component="div" className={styles.stat} withBorder radius="md" p="md">
          <dt>{label}</dt>
          <dd><CountUp value={value} testId={`stat-${key}`} /></dd>
        </Paper>
      ))}
    </dl>
  );
}
