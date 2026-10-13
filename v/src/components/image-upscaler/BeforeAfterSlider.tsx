"use client";

import React, { useState, useRef, useCallback } from "react";
import { Move } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
}

/**
 * Interactive drag-to-reveal Before/After image comparison slider.
 * Uses CSS clip-path for pixel-perfect splitting with no flicker.
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Original",
  afterLabel = "Upscaled (4×)",
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50); // 0–100 percent
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  // Mouse events
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    updatePosition(e.clientX);
    e.preventDefault();
  };
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => { if (isDragging.current) updatePosition(e.clientX); },
    [updatePosition]
  );
  const onMouseUp = () => { isDragging.current = false; };

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    updatePosition(e.touches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (isDragging.current) updatePosition(e.touches[0].clientX);
  };
  const onTouchEnd = () => { isDragging.current = false; };

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-xl border border-slate-700 bg-slate-950 cursor-col-resize"
      style={{ aspectRatio: "16/9" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      role="slider"
      aria-label="Before/After image comparison"
      aria-valuenow={Math.round(position)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* AFTER image — full width underneath */}
      <img
        src={afterSrc}
        alt="After upscaling"
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />

      {/* BEFORE image — clipped to left portion */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <img
          src={beforeSrc}
          alt="Before upscaling"
          className="h-full object-contain"
          style={{ width: containerRef.current?.offsetWidth ?? "100%" }}
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
        style={{ left: `${position}%` }}
        aria-hidden="true"
      />

      {/* Drag handle */}
      <div
        className="absolute top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-white/20 shadow-lg backdrop-blur-sm"
        style={{ left: `${position}%` }}
        aria-hidden="true"
      >
        <Move className="h-4 w-4 text-white drop-shadow" />
      </div>

      {/* Labels */}
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-slate-950/80 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-amber-500/90 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
        {afterLabel}
      </span>
    </div>
  );
}
