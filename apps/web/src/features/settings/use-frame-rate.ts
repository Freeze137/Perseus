"use client";

import { useEffect, useRef, useState } from "react";

export type FrameReport = {
  /** Frames per second across the whole sample, on the wall clock. */
  fps: number;
  /**
   * The rate this display was ever going to allow, inferred from the quickest
   * frames actually observed. 60 on most screens, 30 on a cheap panel or under
   * a battery saver, 120 on a fast one.
   */
  ceiling: number;
  /** Share of frames that missed the display's own beat, 0–1. */
  missed: number;
  total: number;
  /** Whether this is the machine falling behind rather than the screen's pace. */
  struggling: boolean;
};

/** Under this many frames the numbers mean nothing; a real run is thousands. */
const MIN_SAMPLE = 240;
/** A frame this much longer than the display's beat missed at least one. */
const MISS_FACTOR = 1.6;
/** Missing this share of frames is visible as stutter rather than as bad luck. */
const MISS_SHARE = 0.1;
/** Frame durations are bucketed to the millisecond up to this ceiling. */
const MAX_BUCKET = 64;

/**
 * Measures what the machine actually managed while the typist was typing — and,
 * just as importantly, what it was ever allowed to manage.
 *
 * **A frame rate on its own is not evidence of a slow machine**, which is the
 * mistake the first version of this made. A 30 Hz panel reports 30 fps while
 * keeping perfect time. So does a laptop in battery-saver mode, because Chrome
 * and Edge deliberately halve the animation callback there, and so does macOS
 * in Low Power Mode. Telling any of those three that their hardware is
 * struggling would be the interface inventing a problem and then selling the
 * cure for it.
 *
 * So the sample is judged against itself. The quickest frames observed say what
 * this display's beat actually is; frames far longer than that beat are the ones
 * the machine genuinely missed. A screen running steadily at 30 misses nothing.
 * A machine that can reach 120 but keeps landing at 40 misses most of them.
 *
 * `deviceMemory` and `hardwareConcurrency` were the other obvious instrument and
 * are worse than either: they describe the hardware, not the hardware running
 * this page in this browser with this configuration — and the most common cause
 * of a genuinely bad frame rate here is hardware acceleration being switched
 * off, which no device API reports at all.
 *
 * **Nothing here touches the keystroke's critical path.** Per frame it does one
 * subtraction and one array increment into a fixed histogram — no allocation, no
 * `setState`. The hook re-renders exactly once, when the run ends.
 */
export function useFrameRate(active: boolean): FrameReport | null {
  const [report, setReport] = useState<FrameReport | null>(null);
  // Fixed-size histogram of frame durations in whole milliseconds. Bounded and
  // allocation-free, which a growing array of every frame's duration would not
  // have been over a run of several thousand frames.
  const buckets = useRef(new Uint32Array(MAX_BUCKET + 1));

  useEffect(() => {
    if (!active) return;

    const histogram = buckets.current;
    histogram.fill(0);
    const started = performance.now();
    let previous = started;
    let frames = 0;

    let frame = requestAnimationFrame(function step(now: number) {
      const delta = now - previous;
      previous = now;
      frames += 1;
      histogram[Math.min(MAX_BUCKET, Math.max(0, Math.round(delta)))] += 1;
      frame = requestAnimationFrame(step);
    });

    return () => {
      cancelAnimationFrame(frame);
      const elapsed = performance.now() - started;
      if (frames < MIN_SAMPLE || elapsed <= 0) {
        setReport(null);
        return;
      }

      // The display's beat, taken as the 10th percentile rather than the single
      // fastest frame: one freak 4 ms callback would otherwise claim the screen
      // runs at 250 Hz and make every honest frame look like a miss.
      const beat = percentile(histogram, frames, 0.1);
      const threshold = beat * MISS_FACTOR;
      let missed = 0;
      for (let ms = 0; ms <= MAX_BUCKET; ms += 1) {
        if (ms > threshold) missed += histogram[ms] ?? 0;
      }

      const share = missed / frames;
      setReport({
        fps: Math.round((frames / elapsed) * 1_000),
        ceiling: beat > 0 ? Math.round(1_000 / beat) : 0,
        missed: share,
        total: frames,
        struggling: share > MISS_SHARE,
      });
    };
  }, [active]);

  return report;
}

/** The duration at a given percentile, read straight out of the histogram. */
function percentile(
  histogram: Uint32Array,
  total: number,
  fraction: number,
): number {
  const target = total * fraction;
  let seen = 0;
  for (let ms = 0; ms <= MAX_BUCKET; ms += 1) {
    seen += histogram[ms] ?? 0;
    if (seen >= target) return Math.max(1, ms);
  }
  return MAX_BUCKET;
}
