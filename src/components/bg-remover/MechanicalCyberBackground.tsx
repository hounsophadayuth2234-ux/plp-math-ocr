"use client";

import React from "react";

interface MechanicalCyberBackgroundProps {
  isProcessing?: boolean;
  hasResult?: boolean;
}

export function MechanicalCyberBackground({
  isProcessing = false,
  hasResult = false,
}: MechanicalCyberBackgroundProps) {
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
          backgroundColor: "#060a12",
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
      <div className="absolute inset-0 opacity-25">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="tech-crosshairs"
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
          <rect width="100%" height="100%" fill="url(#tech-crosshairs)" />
        </svg>
      </div>

      {/* ── Layer 2: Mechanical Industrial Scanning Beam ── */}
      <div
        className={
          isProcessing ? "animate-industrial-scan-intense" : "animate-industrial-scan"
        }
      />

      {/* ── Layer 3: Rotating Mechanical Radar Rings (Behind Preview Area) ── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] opacity-20 pointer-events-none">
        {/* Outer Ring: Rotating Clockwise */}
        <svg
          viewBox="0 0 700 700"
          className="w-full h-full animate-radar-slow"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Segmented Outer Track */}
          <circle
            cx="350"
            cy="350"
            r="320"
            fill="none"
            stroke="#00f0ff"
            strokeWidth="1"
            strokeDasharray="40 15 10 15 80 20"
          />
          {/* Calibrated Degree Ticks */}
          <circle
            cx="350"
            cy="350"
            r="300"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="0.75"
            strokeDasharray="4 8"
          />
          {/* Quadrant Markers */}
          <path
            d="M 350 20 L 350 40 M 350 660 L 350 680 M 20 350 L 40 350 M 660 350 L 680 350"
            stroke="#00f0ff"
            strokeWidth="2"
          />
        </svg>

        {/* Inner Ring: Rotating Counter-Clockwise */}
        <svg
          viewBox="0 0 700 700"
          className="absolute inset-0 w-full h-full animate-radar-reverse-slow opacity-75"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="350"
            cy="350"
            r="240"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.5"
            strokeDasharray="120 40 30 20 60 40"
          />
          <circle
            cx="350"
            cy="350"
            r="180"
            fill="none"
            stroke="#0284c7"
            strokeWidth="1"
            strokeDasharray="8 12"
          />
          {/* Target Reticle Cross */}
          <line
            x1="350"
            y1="230"
            x2="350"
            y2="470"
            stroke="#00f0ff"
            strokeWidth="0.5"
            strokeDasharray="4 4"
          />
          <line
            x1="230"
            y1="350"
            x2="470"
            y2="350"
            stroke="#00f0ff"
            strokeWidth="0.5"
            strokeDasharray="4 4"
          />
        </svg>
      </div>

      {/* ── Layer 4: Floating Technical Data Particles ── */}
      <div className="absolute inset-0">
        <div className="absolute top-[18%] left-[12%] h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff] animate-particle-a" />
        <div className="absolute top-[35%] right-[16%] h-1 w-1 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] animate-particle-b" />
        <div className="absolute top-[68%] left-[22%] h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-particle-b" />
        <div className="absolute top-[82%] right-[28%] h-1 w-1 rounded-full bg-cyan-300 shadow-[0_0_6px_#00f0ff] animate-particle-a" />
        <div className="absolute top-[48%] left-[45%] h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_#818cf8] animate-particle-a" />
      </div>

      {/* ── Layer 5: Circuit Energy Traces ── */}
      <div className="absolute inset-0 opacity-20">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {/* Top-left circuit branch */}
          <path
            d="M 0 80 L 160 80 L 220 140 L 400 140"
            fill="none"
            stroke="#00f0ff"
            strokeWidth="1.5"
            className="animate-circuit-pulse"
          />
          {/* Bottom-right circuit branch */}
          <path
            d="M 600 800 L 750 800 L 820 730 L 1200 730"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.5"
            className="animate-circuit-pulse"
          />
          {/* Node dots */}
          <circle cx="160" cy="80" r="3" fill="#00f0ff" />
          <circle cx="220" cy="140" r="2.5" fill="#38bdf8" />
          <circle cx="750" cy="800" r="3" fill="#00f0ff" />
          <circle cx="820" cy="730" r="2.5" fill="#38bdf8" />
        </svg>
      </div>

      {/* ── Layer 6: Ambient Machine Glow (Cyan / Blue / Amber) ── */}
      <div
        className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[450px] rounded-full blur-3xl transition-all duration-700 pointer-events-none ${
          isProcessing
            ? "bg-amber-500/15 animate-ambient-glow"
            : hasResult
            ? "bg-emerald-500/15 animate-ambient-glow"
            : "bg-cyan-500/12 animate-ambient-glow"
        }`}
      />
      <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      <div className="absolute top-10 left-10 w-80 h-80 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
    </div>
  );
}
