"use client";

import { Play, Volume2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { BrowserFrame } from "./frames";
import { TOUR_CHAPTERS, TOUR_DURATION } from "./tour-chapters";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function chapterAt(time: number) {
  let index = 0;
  TOUR_CHAPTERS.forEach((c, i) => {
    if (c.start <= time + 0.25) index = i;
  });
  return index;
}

/** The recorded walkthrough (scripts/record-tour.ts) with a chapter index that seeks the video. */
export function ProductTour() {
  const video = React.useRef<HTMLVideoElement>(null);
  const strip = React.useRef<HTMLOListElement>(null);
  const [started, setStarted] = React.useState(false);
  const [time, setTime] = React.useState(0);
  const active = chapterAt(time);

  const play = (at?: number) => {
    const v = video.current;
    if (!v) return;
    if (at != null) v.currentTime = at + 0.05;
    setStarted(true);
    void v.play().catch(() => {});
  };

  // On phones the chapters are a sideways strip: keep the playing one in view without moving the page.
  React.useEffect(() => {
    const ol = strip.current;
    const item = ol?.children[active] as HTMLElement | undefined;
    if (!ol || !item || !started || ol.scrollWidth <= ol.clientWidth) return;
    ol.scrollTo({ left: item.offsetLeft - ol.clientWidth / 2 + item.clientWidth / 2, behavior: "smooth" });
  }, [active, started]);

  return (
    <div className="mx-auto max-w-[1040px]">
      <BrowserFrame dark label="Tabla · Product tour">
        <div className="relative aspect-video bg-night-2">
          <video
            ref={video}
            className="absolute inset-0 size-full"
            src="/landing/tour.mp4"
            poster="/landing/tour-poster.webp"
            preload="metadata"
            playsInline
            controls={started}
            onPlay={() => setStarted(true)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            aria-label="Tabla POS product tour"
          />
          {!started ? (
            <button
              type="button"
              onClick={() => play()}
              className="group absolute inset-0 grid place-items-center bg-night/30 transition-colors duration-300 hover:bg-night/20"
              aria-label="Play the product tour"
            >
              <span className="flex items-center gap-3 rounded-full bg-white py-2 pr-5 pl-2 shadow-[0_20px_50px_-12px_rgb(22_21_42/0.6)] transition-transform duration-300 group-hover:scale-[1.04] sm:py-2.5 sm:pl-2.5">
                <span className="grid size-10 place-items-center rounded-full bg-brand-500 text-white sm:size-12">
                  <Play className="ml-0.5 size-5 fill-current" />
                </span>
                <span className="text-left">
                  <span className="block text-[14px] font-semibold text-ink sm:text-[15px]">Watch the full tour</span>
                  <span className="flex items-center gap-1 text-[12px] text-muted">
                    {clock(TOUR_DURATION)} · {TOUR_CHAPTERS.length} chapters · <Volume2 className="size-3.5" aria-hidden /> sound on
                  </span>
                </span>
              </span>
            </button>
          ) : null}
        </div>
      </BrowserFrame>

      <ol
        ref={strip}
        aria-label="Chapters"
        className="-mx-4 mt-6 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:mt-8 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
      >
        {TOUR_CHAPTERS.map((c, i) => {
          const end = TOUR_CHAPTERS[i + 1]?.start ?? TOUR_DURATION;
          const on = started && i === active;
          const progress = on ? Math.min(1, Math.max(0, (time - c.start) / (end - c.start))) : 0;
          return (
            <li key={c.key} className="shrink-0 snap-start sm:shrink">
              <button
                type="button"
                onClick={() => play(c.start)}
                aria-current={on ? "step" : undefined}
                className={cn(
                  "relative flex w-max items-center gap-3 overflow-hidden rounded-xl py-2.5 pr-3.5 pl-2.5 text-left ring-1 transition-colors duration-200 sm:w-full",
                  on ? "bg-white/[0.1] ring-brand-400/70" : "bg-white/[0.04] ring-white/10 hover:bg-white/[0.08]",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg text-[11.5px] font-semibold tabular-nums transition-colors",
                    on ? "bg-brand-500 text-white" : "bg-white/10 text-white/70",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-white/85">{c.title}</span>
                <span className="text-[12px] text-white/45 tabular-nums">{clock(c.start)}</span>
                <span
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand-400 transition-transform duration-300 ease-linear"
                  style={{ transform: `scaleX(${progress})` }}
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
