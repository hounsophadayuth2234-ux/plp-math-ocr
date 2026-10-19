"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Move,
  Columns,
  SplitSquareVertical,
  Eye,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export type ComparisonViewMode = "split" | "side-by-side" | "after-only";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  srcWidth?: number;
  srcHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
}

/**
 * Interactive Before/After Studio Comparison Workspace:
 *  - Modes: Split Slider, Side-by-Side, After Only.
 *  - Zoom: 100% Fit & 200% Micro-Inspection Loupe.
 *  - Draggable handle with smooth touch & mouse responsiveness.
 *  - Bilingual Cyber badges.
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "BEFORE (រូបដើម - ស្រពិចស្រពិល)",
  afterLabel = "AFTER (ក្រោយកែ - ច្បាស់ស្តង់ដារ)",
  srcWidth,
  srcHeight,
  outputWidth,
  outputHeight,
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50); // 0–100%
  const [viewMode, setViewMode] = useState<ComparisonViewMode>("split");
  const [zoomLevel, setZoomLevel] = useState<1 | 2>(1); // 1 = 100%, 2 = 200%
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingSlider = useRef(false);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    setContainerWidth(containerRef.current.offsetWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  // Slider Mouse events
  const onMouseDownSlider = (e: React.MouseEvent) => {
    if (zoomLevel === 2) {
      isPanning.current = true;
      panStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      return;
    }
    isDraggingSlider.current = true;
    updatePosition(e.clientX);
    e.preventDefault();
  };

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingSlider.current && zoomLevel === 1) {
        updatePosition(e.clientX);
      } else if (isPanning.current && zoomLevel === 2) {
        setPanOffset({
          x: Math.max(-200, Math.min(200, e.clientX - panStart.current.x)),
          y: Math.max(-200, Math.min(200, e.clientY - panStart.current.y)),
        });
      }
    },
    [updatePosition, zoomLevel]
  );

  const onMouseUp = () => {
    isDraggingSlider.current = false;
    isPanning.current = false;
  };

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => {
    if (zoomLevel === 2) {
      isPanning.current = true;
      panStart.current = {
        x: e.touches[0].clientX - panOffset.x,
        y: e.touches[0].clientY - panOffset.y,
      };
      return;
    }
    isDraggingSlider.current = true;
    updatePosition(e.touches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (isDraggingSlider.current && zoomLevel === 1) {
      updatePosition(e.touches[0].clientX);
    } else if (isPanning.current && zoomLevel === 2) {
      setPanOffset({
        x: Math.max(-200, Math.min(200, e.touches[0].clientX - panStart.current.x)),
        y: Math.max(-200, Math.min(200, e.touches[0].clientY - panStart.current.y)),
      });
    }
  };

  const onTouchEnd = () => {
    isDraggingSlider.current = false;
    isPanning.current = false;
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Workspace View Mode & Zoom Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-cyan-500/20 shadow-inner">
          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              viewMode === "split"
                ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(0,240,255,0.4)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Split Slider Comparison"
          >
            <SplitSquareVertical className="h-3.5 w-3.5" />
            <span>ប្រៀបធៀប (Split Slider)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("side-by-side")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              viewMode === "side-by-side"
                ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(0,240,255,0.4)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Side-by-Side Comparison"
          >
            <Columns className="h-3.5 w-3.5" />
            <span>ដាក់ទន្ទឹមគ្នា (Side-by-Side)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("after-only")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              viewMode === "after-only"
                ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(0,240,255,0.4)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="After Only View"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>រូបច្បាស់ (After Only)</span>
          </button>
        </div>

        {/* Zoom Magnifier Controls */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-cyan-500/20">
          <button
            type="button"
            onClick={() => {
              setZoomLevel(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
              zoomLevel === 1
                ? "bg-indigo-600 text-white font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="100% Fit View"
          >
            <ZoomOut className="h-3.5 w-3.5" />
            <span>100%</span>
          </button>

          <button
            type="button"
            onClick={() => setZoomLevel(2)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
              zoomLevel === 2
                ? "bg-indigo-600 text-white font-bold shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="200% Loupe Magnifier for Micro-Detail Inspection"
          >
            <ZoomIn className="h-3.5 w-3.5" />
            <span>200% Loupe</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      {viewMode === "split" && (
        <div
          ref={containerRef}
          className={`relative w-full select-none overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950 shadow-[0_0_30px_rgba(0,0,0,0.8)] ${
            zoomLevel === 2 ? "cursor-grab active:cursor-grabbing" : "cursor-col-resize"
          }`}
          style={{ aspectRatio: "16/10", minHeight: "360px" }}
          onMouseDown={onMouseDownSlider}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          role="slider"
          aria-label="Before/After comparison slider"
          aria-valuenow={Math.round(position)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {/* Zoom Wrapper */}
          <div
            className="absolute inset-0 transition-transform duration-100 ease-out flex items-center justify-center"
            style={{
              transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
            }}
          >
            {/* AFTER image — full width underneath */}
            <img
              src={afterSrc}
              alt="After enhancement"
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
                alt="Before enhancement"
                className="h-full object-contain"
                style={{ width: containerWidth ? `${containerWidth}px` : "100%" }}
                draggable={false}
              />
            </div>

            {/* Divider line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-400 via-white to-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.9)]"
              style={{ left: `${position}%` }}
              aria-hidden="true"
            />

            {/* Drag handle */}
            <div
              className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-cyan-300 bg-slate-950/80 shadow-[0_0_15px_rgba(0,240,255,0.7)] backdrop-blur-md"
              style={{ left: `${position}%` }}
              aria-hidden="true"
            >
              <Move className="h-4 w-4 text-cyan-300 drop-shadow" />
            </div>
          </div>

          {/* Badges */}
          <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-lg bg-slate-950/85 px-3 py-1.5 text-xs font-mono font-bold text-slate-300 border border-slate-700/60 backdrop-blur-md shadow-lg">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span>{beforeLabel}</span>
            {srcWidth && srcHeight && (
              <span className="text-[10px] text-slate-400">({srcWidth}×{srcHeight} px)</span>
            )}
          </div>

          <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-2 rounded-lg bg-cyan-950/85 px-3 py-1.5 text-xs font-mono font-bold text-cyan-300 border border-cyan-500/50 backdrop-blur-md shadow-[0_0_15px_rgba(0,240,255,0.25)]">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>{afterLabel}</span>
            {outputWidth && outputHeight && (
              <span className="text-[10px] text-cyan-400/80">({outputWidth}×{outputHeight} px)</span>
            )}
          </div>
        </div>
      )}

      {/* Side-by-Side View */}
      {viewMode === "side-by-side" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          {/* Before Column */}
          <div className="relative flex flex-col rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2">
              <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                {beforeLabel}
              </span>
              {srcWidth && srcHeight && (
                <span className="text-[11px] font-mono text-slate-400">{srcWidth}×{srcHeight} px</span>
              )}
            </div>
            <div
              className="relative w-full flex items-center justify-center p-2 overflow-hidden"
              style={{ aspectRatio: "16/10", minHeight: "280px" }}
            >
              <img
                src={beforeSrc}
                alt="Before enhancement"
                className="max-h-full max-w-full object-contain"
                style={{ transform: `scale(${zoomLevel})` }}
              />
            </div>
          </div>

          {/* After Column */}
          <div className="relative flex flex-col rounded-2xl border border-cyan-500/40 bg-slate-950 overflow-hidden shadow-[0_0_20px_rgba(0,240,255,0.15)]">
            <div className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-950/40 px-4 py-2">
              <span className="text-xs font-mono font-bold text-cyan-300 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                {afterLabel}
              </span>
              {outputWidth && outputHeight && (
                <span className="text-[11px] font-mono text-cyan-400 font-bold">{outputWidth}×{outputHeight} px</span>
              )}
            </div>
            <div
              className="relative w-full flex items-center justify-center p-2 overflow-hidden"
              style={{ aspectRatio: "16/10", minHeight: "280px" }}
            >
              <img
                src={afterSrc}
                alt="After enhancement"
                className="max-h-full max-w-full object-contain"
                style={{ transform: `scale(${zoomLevel})` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* After Only View */}
      {viewMode === "after-only" && (
        <div className="relative w-full rounded-2xl border border-cyan-500/30 bg-slate-950 overflow-hidden shadow-[0_0_25px_rgba(0,240,255,0.15)]">
          <div className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-950/40 px-4 py-2">
            <span className="text-xs font-mono font-bold text-cyan-300 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              {afterLabel}
            </span>
            {outputWidth && outputHeight && (
              <span className="text-[11px] font-mono text-cyan-400 font-bold">{outputWidth}×{outputHeight} px (Studio Super-Resolution)</span>
            )}
          </div>
          <div
            className="relative w-full flex items-center justify-center p-3 overflow-hidden"
            style={{ aspectRatio: "16/10", minHeight: "360px" }}
          >
            <img
              src={afterSrc}
              alt="After enhancement full view"
              className="max-h-full max-w-full object-contain"
              style={{ transform: `scale(${zoomLevel})` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
