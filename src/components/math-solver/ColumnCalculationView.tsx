"use client";

import React from "react";
import type { StructuredCalculation } from "@/lib/column-calculation";

interface ColumnCalculationViewProps {
  calculation: StructuredCalculation;
  className?: string;
}

export function ColumnCalculationView({
  calculation,
  className = "",
}: ColumnCalculationViewProps) {
  if (calculation.type === "fraction" && calculation.fractionData) {
    const { steps } = calculation.fractionData;
    return (
      <div
        className={`fraction-calculation inline-flex items-center gap-2 font-mono text-emerald-200 select-all p-3 rounded-lg bg-slate-900/80 border border-slate-700/60 ${className}`}
        role="math"
        aria-label="ការគណនាប្រភាគ"
      >
        {steps.map((step, idx) => (
          <React.Fragment key={idx}>
            {step.operator && (
              <span className="font-bold text-base text-indigo-300 px-1">
                {step.operator}
              </span>
            )}
            <div className="inline-flex flex-col items-center justify-center min-w-[2.25rem]">
              <span className="text-sm font-semibold px-1 text-center tabular-nums">
                {step.numerator}
              </span>
              <div className="w-full h-[2px] bg-emerald-400 my-0.5" />
              <span className="text-sm font-semibold px-1 text-center tabular-nums">
                {step.denominator}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  const numCols = calculation.columns.length;
  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `2rem repeat(${numCols}, 2.25rem)`,
    alignItems: "center",
    minHeight: "2rem",
  };

  return (
    <div
      className={`column-calculation inline-flex flex-col font-mono text-sm leading-relaxed p-4 rounded-lg bg-slate-950 border border-slate-700 text-emerald-300 shadow-inner overflow-x-auto select-all ${className}`}
      role="math"
      aria-label="ការគណនាជួរឈរ"
      data-testid="column-calculation-container"
      style={{
        fontFamily: '"Noto Sans Khmer", "Kantumruy Pro", ui-monospace, SFMono-Regular, Menlo, monospace',
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {calculation.rows.map((row, rIdx) => {
        if (row.role === "separator") {
          return (
            <div
              key={rIdx}
              className="math-separator my-1"
              style={{
                height: "2px",
                background: "#34d399",
                marginLeft: "2rem",
                width: `calc(${numCols} * 2.25rem)`,
              }}
            />
          );
        }

        const isResult = row.role === "result";
        const isQuotient = row.role === "quotient";

        return (
          <div
            key={rIdx}
            className={`math-row ${row.role} ${isResult ? "font-bold text-emerald-200" : isQuotient ? "font-bold text-indigo-300" : ""}`}
            style={gridStyle}
            data-role={row.role}
          >
            <span
              className="operator-cell text-center font-bold text-indigo-400 select-none"
              style={{ width: "2rem" }}
            >
              {row.operator || ""}
            </span>

            {row.digits.map((digit, cIdx) => (
              <span
                key={cIdx}
                className={`digit-cell text-center tabular-nums font-semibold ${digit === "." ? "text-amber-300 font-bold" : ""}`}
                style={{
                  width: "2.25rem",
                  fontVariantNumeric: "tabular-nums",
                }}
                data-column={calculation.columns[cIdx]}
              >
                {digit || ""}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
