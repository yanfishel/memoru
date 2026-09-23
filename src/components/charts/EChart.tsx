"use client";

import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { useEffect, useRef } from "react";
import { chartTheme, SERVER_STYLE } from "@/lib/chart-theme";
import styles from "./EChart.module.css";
import { usePalette } from "./usePalette";

export function EChart({
  option,
  height = 320,
  fill = false,
  ariaLabel,
  onClick,
}: {
  option: EChartsOption;
  /** A CSS length as well as a pixel count. Ignored when `fill` is set. */
  height?: number | string;
  /** True absolutely positions this chart to fill its parent instead of sizing from `height` — for a
      map inside an aspect-ratio'd wrapper (Choropleth.tsx), where the wrapper's own box, not this
      component, determines the size. */
  fill?: boolean;
  ariaLabel: string;
  onClick?: (name: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const style = usePalette();
  const onClickRef = useRef(onClick);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  // The theme is fixed at init, so a scheme change disposes and re-creates the instance. `style === SERVER_STYLE`
  // (by reference) is the "not read yet" sentinel from usePalette: skip the placeholder init entirely so the
  // chart is created exactly once, already themed with the real tokens.
  useEffect(() => {
    if (!ref.current || style === SERVER_STYLE) return;
    chart.current = echarts.init(ref.current, chartTheme(style), { renderer: "svg" });
    chart.current.setOption(option, { notMerge: true });
    chart.current.on("click", (params) => {
      const p = params as { name?: string };
      if (p.name) onClickRef.current?.(p.name);
    });
    const onResize = () => chart.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.current?.dispose();
      chart.current = null;
    };
    // `option` is applied by the effect below; re-running this one for it would flash the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={ref}
      className={fill ? `${styles.chart} ${styles.fill}` : styles.chart}
      style={fill ? { cursor: onClick ? "pointer" : undefined } : { height, cursor: onClick ? "pointer" : undefined }}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
