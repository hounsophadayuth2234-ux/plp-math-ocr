"use client";

import React from "react";
import type { StructuredCalculation } from "@/lib/column-calculation";

interface ColumnCalculationViewProps {
  calculation: StructuredCalculation;
  theme?: "worksheet" | "dark";
  className?: string;
}

export function ColumnCalculationView({
  calculation,
  theme = "worksheet",
  className = "",
}: ColumnCalculationViewProps) {
  const isWorksheet = theme === "worksheet";

  if (calculation.type === "fraction" && calculation.fractionData) {
    const { steps } = calculation.fractionData;
    return (
      <div
        className={`fraction-calculation inline-flex items-center gap-2 font-mono select-all p-3.5 rounded-xl border ${
          isWorksheet
            ? "bg-amber-50/40 border-amber-200/80 text-slate-900 shadow-sm"
            : "bg-slate-900/80 border-slate-700/60 text-emerald-200"
        } ${className}`}
        role="math"
        aria-label="ការគណនាប្រភាគ"
      >
        {steps.map((step, idx) => (
          <React.Fragment key={idx}>
            {step.operator && (
              <span
                className={`font-bold text-base px-1.5 ${
                  isWorksheet ? "text-indigo-700 font-sans" : "text-indigo-300"
                }`}
              >
                {step.operator}
              </span>
            )}
            <div className="inline-flex flex-col items-center justify-center min-w-[2.25rem]">
              <span className="text-base font-semibold px-1 text-center tabular-nums">
                {step.numerator}
              </span>
              <div
                className={`w-full h-[2px] my-1 ${
                  isWorksheet ? "bg-slate-800" : "bg-emerald-400"
                }`}
              />
              <span className="text-base font-semibold px-1 text-center tabular-nums">
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
    minHeight: "2.25rem",
  };

  return (
    <div
      className={`column-calculation inline-flex flex-col font-mono text-base leading-relaxed p-4 sm:p-5 rounded-xl border overflow-x-auto select-all ${
        isWorksheet
          ? "bg-[#FEFEFA] border-amber-200/90 text-slate-900 shadow-sm"
          : "bg-slate-950 border-slate-700 text-emerald-300 shadow-inner"
      } ${className}`}
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
                background: isWorksheet ? "#1e293b" : "#34d399",
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
            className={`math-row ${row.role} ${
              isResult
                ? isWorksheet
                  ? "font-bold text-slate-950"
                  : "font-bold text-emerald-200"
                : isQuotient
                ? isWorksheet
                  ? "font-bold text-indigo-800"
                  : "font-bold text-indigo-300"
                : ""
            }`}
            style={gridStyle}
            data-role={row.role}
          >
            <span
              className={`operator-cell text-center font-bold select-none ${
                isWorksheet ? "text-indigo-800 font-sans text-base" : "text-indigo-400"
              }`}
              style={{ width: "2rem" }}
            >
              {row.operator || ""}
            </span>

            {row.digits.map((digit, cIdx) => (
              <span
                key={cIdx}
                className={`digit-cell text-center tabular-nums font-semibold ${
                  digit === "."
                    ? isWorksheet
                      ? "text-indigo-700 font-bold"
                      : "text-amber-300 font-bold"
                    : ""
                }`}
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
