"use client";

import React, { useEffect, useState } from "react";

interface MechanicalCyberBackgroundProps {
  isProcessing?: boolean;
  hasResult?: boolean;
}

export function MechanicalCyberBackground({
  isProcessing: propIsProcessing,
  hasResult = false,
}: MechanicalCyberBackgroundProps) {
  // Global event listener for AI processing across any page
  const [globalProcessing, setGlobalProcessing] = useState(false);

  useEffect(() => {
    const handleProcessingChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ isProcessing: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.isProcessing === "boolean") {
        setGlobalProcessing(customEvent.detail.isProcessing);
      }
    };

    window.addEventListener("ai-processing-change", handleProcessingChange);
    return () => {
      window.removeEventListener("ai-processing-change", handleProcessingChange);
    };
  }, []);

  const activeProcessing = propIsProcessing ?? globalProcessing;

  return (
    <div
      aria-hidden="true"
      data-testid="cyber-bg-canvas"
      className="pointer-events-none absolute inset-0 overflow-hidden z-0 select-none"
    >
      {/* ── Layer 1: Precision Blueprint / Animated Technical Grid ── */}
      <div
        className="absolute inset-0 opacity-[0.14] animate-grid-drift"
        style={{
          backgroundColor: "#050811",
          backgroundImage: `
            linear-gradient(rgba(0, 240, 255, 0.22) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 240, 255, 0.22) 1px, transparent 1px),
            linear-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(56, 189, 248, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px, 80px 80px, 16px 16px, 16px 16px",
        }}
      />

      {/* Technical Grid Coordinate Crosshairs */}
      <div className="absolute inset-0 opacity-20">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="tech-crosshairs-global"
              width="240"
              height="240"
              patternUnits="userSpaceOnUse"
            >
              {/* Center Crosshair */}
              <path
                d="M 120 110 L 120 130 M 110 120 L 130 120"
                stroke="#00f0ff"
                strokeWidth="1"
              />
              <circle
                cx="120"
                cy="120"
                r="3"
                fill="none"
                stroke="#00f0ff"
                strokeWidth="0.5"
              />
              {/* Corner ticks */}
              <path
                d="M 5 0 L 0 0 L 0 5 M 235 0 L 240 0 L 240 5 M 0 235 L 0 240 L 5 240 M 240 235 L 240 240 L 235 240"
                stroke="#38bdf8"
                strokeWidth="0.75"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#tech-crosshairs-global)" />
        </svg>
      </div>

      {/* ── Layer 2: Perspective Engineering Floor Grid ── */}
      <div className="perspective-floor-grid opacity-30" />

      {/* ── Layer 3: Two Horizontal Industrial Scanning Beams ── */}
      {/* Primary Scanning Beam */}
      <div
        className={
          activeProcessing
            ? "animate-industrial-scan-intense"
            : "animate-industrial-scan"
        }
      />
      {/* Secondary Scanning Beam (Staggered Offset) */}
      <div
        className={
          activeProcessing
            ? "animate-industrial-scan-secondary-intense"
            : "animate-industrial-scan-secondary"
        }
      />

      {/* ── Layer 4: Two Slowly Rotating Mechanical Radar Rings ── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[760px] h-[760px] opacity-15 pointer-events-none">
        {/* Outer Ring: Rotating Clockwise */}
        <svg
          viewBox="0 0 760 760"
          className="w-full h-full animate-radar-slow"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Segmented Outer Track */}
          <circle
            cx="380"
            cy="380"
            r="350"
            fill="none"
            stroke="#00f0ff"
            strokeWidth="1"
            strokeDasharray="50 20 15 20 100 25"
          />
          {/* Calibrated Degree Ticks */}
          <circle
            cx="380"
            cy="380"
            r="330"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="0.75"
            strokeDasharray="4 8"
          />
          {/* Quadrant Markers */}
          <path
            d="M 380 20 L 380 45 M 380 715 L 380 740 M 20 380 L 45 380 M 715 380 L 740 380"
            stroke="#00f0ff"
            strokeWidth="2"
          />
        </svg>

        {/* Inner Ring: Rotating Counter-Clockwise */}
        <svg
          viewBox="0 0 760 760"
          className="absolute inset-0 w-full h-full animate-radar-reverse-slow opacity-80"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="380"
            cy="380"
            r="260"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.5"
            strokeDasharray="140 40 35 20 70 40"
          />
          <circle
            cx="380"
            cy="380"
            r="190"
            fill="none"
            stroke="#a855f7"
            strokeWidth="1"
            strokeDasharray="10 14"
          />
          {/* Target Reticle Crosshairs */}
          <line
            x1="380"
            y1="250"
            x2="380"
            y2="510"
            stroke="#00f0ff"
            strokeWidth="0.5"
            strokeDasharray="4 4"
          />
          <line
            x1="250"
            y1="380"
            x2="510"
            y2="380"
            stroke="#00f0ff"
            strokeWidth="0.5"
            strokeDasharray="4 4"
          />
        </svg>
      </div>

      {/* ── Layer 5: Floating Telemetry Particles ── */}
      <div className="absolute inset-0">
        <div className="absolute top-[15%] left-[10%] h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff] animate-particle-a" />
        <div className="absolute top-[32%] right-[14%] h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-particle-b" />
        <div className="absolute top-[65%] left-[18%] h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_10px_#38bdf8] animate-particle-b" />
        <div className="absolute top-[80%] right-[24%] h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#00f0ff] animate-particle-a" />
        <div className="absolute top-[45%] left-[42%] h-1.5 w-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_#a855f7] animate-particle-a" />
        <div className="absolute top-[25%] right-[38%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981] animate-particle-b" />
      </div>

      {/* ── Layer 6: Animated Circuit Traces with Pulsing Nodes ── */}
      <div className="absolute inset-0 opacity-25">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {/* Top-left circuit branch */}
          <path
            d="M 0 100 L 180 100 L 250 170 L 450 170"
            fill="none"
            stroke="#00f0ff"
            strokeWidth="1.5"
            className="animate-circuit-pulse"
          />
          {/* Top-right circuit branch */}
          <path
            d="M 1400 120 L 1250 120 L 1180 190 L 980 190"
            fill="none"
            stroke="#a855f7"
            strokeWidth="1.5"
            className="animate-circuit-pulse"
          />
          {/* Bottom-right circuit branch */}
          <path
            d="M 700 850 L 880 850 L 960 770 L 1350 770"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.5"
            className="animate-circuit-pulse"
          />
          {/* Bottom-left circuit branch */}
          <path
            d="M 100 800 L 260 800 L 320 860 L 520 860"
            fill="none"
            stroke="#00f0ff"
            strokeWidth="1.5"
            className="animate-circuit-pulse"
          />
          {/* Connection Node Dots */}
          <circle cx="180" cy="100" r="3" fill="#00f0ff" />
          <circle cx="250" cy="170" r="2.5" fill="#38bdf8" />
          <circle cx="1250" cy="120" r="3" fill="#a855f7" />
          <circle cx="1180" cy="190" r="2.5" fill="#c084fc" />
          <circle cx="880" cy="850" r="3" fill="#00f0ff" />
          <circle cx="960" cy="770" r="2.5" fill="#38bdf8" />
          <circle cx="260" cy="800" r="3" fill="#00f0ff" />
          <circle cx="320" cy="860" r="2.5" fill="#22d3ee" />
        </svg>
      </div>

      {/* ── Layer 7: Subtle Cyan, Blue, Purple & Amber Ambient Glows ── */}
      <div
        className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full blur-3xl transition-all duration-700 pointer-events-none ${
          activeProcessing
            ? "bg-amber-500/20 animate-ambient-glow"
            : hasResult
            ? "bg-emerald-500/15 animate-ambient-glow"
            : "bg-cyan-500/10 animate-ambient-glow"
        }`}
      />
      {/* Ambient Blue Glow */}
      <div className="absolute bottom-10 right-10 w-[420px] h-[420px] rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      {/* Ambient Purple / Indigo Glow */}
      <div className="absolute top-10 left-10 w-[380px] h-[380px] rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />
      {/* Ambient Amber Accent Glow */}
      <div className="absolute bottom-20 left-1/3 w-[300px] h-[300px] rounded-full bg-amber-600/5 blur-3xl pointer-events-none" />
    </div>
  );
}
