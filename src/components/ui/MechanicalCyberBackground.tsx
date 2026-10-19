"use client";

import React, { useEffect, useState } from "react";

interface MechanicalCyberBackgroundProps {
  isProcessing?: boolean;
  hasResult?: boolean;
}

// ── 10 Horizontal Mathematical Streams (5 on Mobile, 10 on Desktop) ──
const FORMULA_STREAMS = [
  {
    id: "stream-01",
    direction: "rtl" as const,
    speed: "slow" as const,
    delay: "-8s",
    opacity: "opacity-[0.24]",
    top: "4%",
    desktopOnly: false,
    items: [
      { text: "∫ f(x)dx", color: "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "x² + y² = r²", color: "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "lim_{x→∞} (1 + 1/x)ˣ = e", color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "Δx → 0", color: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "E = mc²", color: "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "∂f/∂x + ∂f/∂y = 0", color: "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "Σ_{n=1}^∞ 1/n² = π²/6", color: "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "√(a² + b²)", color: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
    ],
  },
  {
    id: "stream-02",
    direction: "ltr" as const,
    speed: "normal" as const,
    delay: "-18s",
    opacity: "opacity-[0.18]",
    top: "14%",
    desktopOnly: false,
    items: [
      { text: "sin²θ + cos²θ = 1", color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "∇ × B = μ₀J + μ₀ε₀ ∂E/∂t", color: "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "π ≈ 3.14159265", color: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "aₙ = a₁ + (n − 1)d", color: "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "e^{iπ} + 1 = 0", color: "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "∫₀^∞ e^{-x²} dx = √π/2", color: "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "det(A − λI) = 0", color: "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "lim_{x→0} sin(x)/x = 1", color: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
    ],
  },
  {
    id: "stream-03",
    direction: "rtl" as const,
    speed: "fast" as const,
    delay: "-5s",
    opacity: "opacity-[0.24]",
    top: "24%",
    desktopOnly: false,
    items: [
      { text: "d/dx [ln(x)] = 1/x", color: "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "x = (-b ± √(b² - 4ac)) / 2a", color: "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "∮ B · dl = μ₀ I_{enc}", color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "P(A|B) = P(B|A)P(A)/P(B)", color: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "∂²u/∂t² = c² ∇²u", color: "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "∫ sec²(x) dx = tan(x) + C", color: "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "Σ_{n=1}^∞ 1/n² = π²/6", color: "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "sin θ + cos θ", color: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
    ],
  },
  {
    id: "stream-04",
    direction: "ltr" as const,
    speed: "slow" as const,
    delay: "-22s",
    opacity: "opacity-[0.16]",
    top: "34%",
    desktopOnly: false,
    items: [
      { text: "σ = √( 1/N ∑(xᵢ - μ)² )", color: "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "a³ + b³ = (a+b)(a² - ab + b²)", color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "H|ψ⟩ = E|ψ⟩", color: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "∇ · E = ρ / ε₀", color: "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "∫ 1/(1+x²) dx = arctan(x) + C", color: "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "S = k_B ln Ω", color: "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "x² + y² = r²", color: "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "lim x→∞", color: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
    ],
  },
  {
    id: "stream-05",
    direction: "rtl" as const,
    speed: "normal" as const,
    delay: "-9s",
    opacity: "opacity-[0.25]",
    top: "44%",
    desktopOnly: false,
    items: [
      { text: "∫ f(x)dx", color: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "aₙ = a₁ · rⁿ⁻¹", color: "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "Δy/Δx → dy/dx", color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "eˣ = 1 + x + x²/2! + x³/3! + ...", color: "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "∂f/∂x", color: "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "E = mc²", color: "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "lim_{x→∞} 1/x = 0", color: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "π ≈ 3.14159", color: "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
    ],
  },
  {
    id: "stream-06",
    direction: "ltr" as const,
    speed: "fast" as const,
    delay: "-16s",
    opacity: "opacity-[0.19]",
    top: "54%",
    desktopOnly: true,
    items: [
      { text: "Σ_{n=1}^∞ 1/n² = π²/6", color: "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "A = π r²", color: "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "F = G (m₁ m₂) / r²", color: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "cos(α ± β) = cos α cos β ∓ sin α sin β", color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "∫ u dv = uv - ∫ v du", color: "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "λ = h / p", color: "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "√(a² + b²)", color: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "Δx → 0", color: "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
    ],
  },
  {
    id: "stream-07",
    direction: "rtl" as const,
    speed: "slow" as const,
    delay: "-7s",
    opacity: "opacity-[0.23]",
    top: "64%",
    desktopOnly: true,
    items: [
      { text: "E = mc²", color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "sin θ + cos θ = √2 sin(θ + π/4)", color: "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "∫ xⁿ dx = xⁿ⁺¹/(n+1) + C", color: "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "π ≈ 3.14159", color: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "f''(x) > 0 ⇒ convex", color: "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "∮ E · da = Q_{encl}/ε₀", color: "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "x² + 5x + 6 = 0", color: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "aₙ = a₁ + (n−1)d", color: "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
    ],
  },
  {
    id: "stream-08",
    direction: "ltr" as const,
    speed: "normal" as const,
    delay: "-25s",
    opacity: "opacity-[0.17]",
    top: "74%",
    desktopOnly: true,
    items: [
      { text: "√(a² + b²)", color: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "lim_{x→a} [f(x) - f(a)]/(x - a) = f'(a)", color: "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "e^{iθ} = cos θ + i sin θ", color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "∇ · B = 0", color: "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "∫ tan(x) dx = ln|sec(x)| + C", color: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "[H, P] = iℏ ∂V/∂x", color: "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "Σ_{i=1}^n i = n(n+1)/2", color: "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "∂f/∂x", color: "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
    ],
  },
  {
    id: "stream-09",
    direction: "rtl" as const,
    speed: "fast" as const,
    delay: "-11s",
    opacity: "opacity-[0.26]",
    top: "84%",
    desktopOnly: true,
    items: [
      { text: "x² + y² = r²", color: "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "∂f/∂t + u·∇f = 0", color: "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "∫ e^{ax} dx = (1/a) e^{ax} + C", color: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "lim_{x→∞} x^{1/x} = 1", color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "∫ f(x)dx", color: "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "Σ_{k=0}^∞ xᵏ = 1/(1-x)", color: "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "d/dx [sin x] = cos x", color: "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "ΔS ≥ 0", color: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
    ],
  },
  {
    id: "stream-10",
    direction: "ltr" as const,
    speed: "slow" as const,
    delay: "-20s",
    opacity: "opacity-[0.18]",
    top: "93%",
    desktopOnly: true,
    items: [
      { text: "Σ_{n=1}^∞ 1/n²", color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "E = hν = ℏω", color: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "sinh²x + 1 = cosh²x", color: "text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "∂²u/∂x² + ∂²u/∂y² = 0", color: "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
      { text: "lim_{x→0} (eˣ - 1)/x = 1", color: "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "∫ 1/x dx = ln|x| + C", color: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "aₙ = a₁ + (n−1)d", color: "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" },
      { text: "∮ F · dr = ∬ (∇ × F) · dS", color: "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" },
    ],
  },
];

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
        className="absolute inset-0 opacity-[0.25] animate-grid-drift"
        style={{
          backgroundColor: "#050811",
          backgroundImage: `
            linear-gradient(rgba(0, 240, 255, 0.35) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 240, 255, 0.35) 1px, transparent 1px),
            linear-gradient(rgba(56, 189, 248, 0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(56, 189, 248, 0.15) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px, 80px 80px, 16px 16px, 16px 16px",
        }}
      />

      {/* Technical Grid Coordinate Crosshairs */}
      <div className="absolute inset-0 opacity-35">
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
      <div className="perspective-floor-grid opacity-50 hidden sm:block" />

      {/* ── Layer 2.5: Horizontal Mathematical Formula Streams (10 Desktop, 5 Mobile) ── */}
      <div
        data-testid="math-formula-streams"
        className="pointer-events-none absolute inset-0 overflow-hidden select-none z-0"
      >
        {FORMULA_STREAMS.map((row, idx) => {
          const isRTL = row.direction === "rtl";
          const directionClass = isRTL ? "animate-formula-rtl" : "animate-formula-ltr";
          // Responsive row distribution:
          // Mobile (<768px): 5 rows (stream-01 to stream-05)
          // Tablet (768px-1024px): 7 rows (stream-01 to stream-07)
          // Desktop (>=1024px): 10 rows (stream-01 to stream-10)
          const responsiveVisibility = !row.desktopOnly
            ? "flex"
            : idx < 7
            ? "hidden md:flex"
            : "hidden lg:flex";
          return (
            <div
              key={row.id}
              data-testid="formula-stream-row"
              data-direction={row.direction}
              className={`absolute left-0 w-full overflow-hidden whitespace-nowrap pointer-events-none select-none ${row.opacity} ${responsiveVisibility}`}
              style={{ top: row.top }}
            >
              <div
                data-speed={row.speed}
                className={`formula-stream flex shrink-0 items-center gap-10 ${directionClass}`}
                style={{
                  animationDelay: row.delay,
                }}
              >
                {/* Primary formula set */}
                {row.items.map((item, itemIdx) => (
                  <span
                    key={`p-${itemIdx}`}
                    className={`font-mono text-xs sm:text-sm font-semibold tracking-wider ${item.color}`}
                  >
                    {item.text}
                  </span>
                ))}
                {/* Repeated formula set for seamless continuous marquee */}
                {row.items.map((item, itemIdx) => (
                  <span
                    key={`r-${itemIdx}`}
                    className={`font-mono text-xs sm:text-sm font-semibold tracking-wider ${item.color}`}
                  >
                    {item.text}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Layer 3: Two Horizontal Industrial Scanning Beams ── */}
      {/* Primary Scanning Beam */}
      <div
        className={
          activeProcessing
            ? "animate-industrial-scan-intense"
            : "animate-industrial-scan"
        }
      />
      {/* Secondary Scanning Beam (Staggered Offset, hidden on mobile) */}
      <div
        className={`hidden md:block ${
          activeProcessing
            ? "animate-industrial-scan-secondary-intense"
            : "animate-industrial-scan-secondary"
        }`}
      />

      {/* ── Layer 4: Two Slowly Rotating Mechanical Radar Rings ── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] sm:w-[760px] sm:h-[760px] opacity-30 pointer-events-none">
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

      {/* ── Layer 5: Floating Telemetry Particles (3 on Mobile, 6 on Tablet/Desktop) ── */}
      <div className="absolute inset-0">
        <div className="absolute top-[15%] left-[10%] h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff] animate-particle-a" />
        <div className="absolute top-[32%] right-[14%] h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-particle-b" />
        <div className="absolute top-[65%] left-[18%] h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_10px_#38bdf8] animate-particle-b" />
        <div className="hidden sm:block absolute top-[80%] right-[24%] h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#00f0ff] animate-particle-a" />
        <div className="hidden sm:block absolute top-[45%] left-[42%] h-1.5 w-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_#a855f7] animate-particle-a" />
        <div className="hidden sm:block absolute top-[25%] right-[38%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981] animate-particle-b" />
      </div>

      {/* ── Layer 6: Animated Circuit Traces with Pulsing Nodes ── */}
      <div className="absolute inset-0 opacity-40">
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
        className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[300px] sm:w-[700px] sm:h-[500px] rounded-full blur-2xl sm:blur-3xl transition-all duration-700 pointer-events-none ${
          activeProcessing
            ? "bg-amber-500/20 animate-ambient-glow"
            : hasResult
            ? "bg-emerald-500/15 animate-ambient-glow"
            : "bg-cyan-500/10 animate-ambient-glow"
        }`}
      />
      {/* Ambient Blue Glow (Desktop / Tablet) */}
      <div className="hidden sm:block absolute bottom-10 right-10 w-[420px] h-[420px] rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      {/* Ambient Purple / Indigo Glow (Desktop / Tablet) */}
      <div className="hidden sm:block absolute top-10 left-10 w-[380px] h-[380px] rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />
      {/* Ambient Amber Accent Glow (Desktop / Tablet) */}
      <div className="hidden md:block absolute bottom-20 left-1/3 w-[300px] h-[300px] rounded-full bg-amber-600/5 blur-3xl pointer-events-none" />
    </div>
  );
}
