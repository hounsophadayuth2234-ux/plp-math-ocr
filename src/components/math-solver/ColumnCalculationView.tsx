"use client";

import React from "react";
import {
  type StructuredCalculation,
  KHMER_INTEGER_PLACE_LABELS,
  KHMER_DECIMAL_PLACE_LABELS,
} from "@/lib/column-calculation";

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

  // Fractions layout
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

  // Cambodian MoEYS Primary Textbook L-bracket / T-grid Division
  if (calculation.type === "division" && calculation.divisionData) {
    const div = calculation.divisionData;
    const divDigits = div.dividendKhmer.split("");
    const leftCols = Math.max(divDigits.length, 3);

    return (
      <div
        className={`inline-block overflow-x-auto rounded-xl p-3 border ${
          isWorksheet
            ? "bg-[#FEFEFA] border-amber-200/90 text-slate-900 shadow-sm"
            : "bg-slate-950 border-slate-700 text-emerald-300"
        } ${className}`}
      >
        <table
          className="column-calculation division-textbook-grid select-all"
          role="math"
          aria-label="ប្រមាណវិធីចែកជួរឈរ"
          style={{
            borderCollapse: "collapse",
            fontVariantNumeric: "tabular-nums",
            fontFamily: '"Noto Sans Khmer", "Kantumruy Pro", ui-monospace, SFMono-Regular, monospace',
          }}
        >
          <tbody>
            <tr>
              {/* Left side: Dividend & subtraction steps */}
              <td className="align-top pr-5 border-r-2 border-slate-900">
                <table style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
                  <tbody>
                    {/* Dividend row */}
                    <tr className="math-row dividend">
                      <td className="operator-cell" style={{ width: "36px", height: "34px", textAlign: "center" }} />
                      {Array.from({ length: leftCols }).map((_, cIdx) => (
                        <td
                          key={cIdx}
                          className="digit-cell font-bold text-slate-900"
                          style={{
                            width: "36px",
                            height: "34px",
                            textAlign: "center",
                            verticalAlign: "middle",
                            fontSize: "18px",
                          }}
                        >
                          {divDigits[cIdx] || ""}
                        </td>
                      ))}
                    </tr>

                    {/* Step-by-step subtraction rows */}
                    {div.steps.map((step, sIdx) => {
                      const subDigits = step.prodKhmer.split("");
                      const remDigits = step.broughtKhmer.split("");
                      const subPad = Math.max(0, leftCols - subDigits.length);
                      const remPad = Math.max(0, leftCols - remDigits.length);

                      return (
                        <React.Fragment key={sIdx}>
                          <tr className="math-row step">
                            <td
                              className="operator-cell font-bold text-rose-700"
                              style={{ width: "36px", height: "34px", textAlign: "center", verticalAlign: "middle" }}
                            >
                              −
                            </td>
                            {Array.from({ length: subPad }).map((_, p) => (
                              <td key={`sub-pad-${p}`} style={{ width: "36px", height: "34px" }} />
                            ))}
                            {subDigits.map((d, dIdx) => (
                              <td
                                key={`sub-${dIdx}`}
                                className="digit-cell text-slate-800"
                                style={{
                                  width: "36px",
                                  height: "34px",
                                  textAlign: "center",
                                  verticalAlign: "middle",
                                  fontSize: "18px",
                                }}
                              >
                                {d}
                              </td>
                            ))}
                          </tr>

                          <tr className="separator-row">
                            <td
                              colSpan={leftCols + 1}
                              style={{
                                borderBottom: "2px solid #0f172a",
                                height: "4px",
                                padding: 0,
                              }}
                            />
                          </tr>

                          <tr className={`math-row ${step.isLast ? "remainder" : "step"}`}>
                            <td style={{ width: "36px", height: "34px" }} />
                            {Array.from({ length: remPad }).map((_, p) => (
                              <td key={`rem-pad-${p}`} style={{ width: "36px", height: "34px" }} />
                            ))}
                            {remDigits.map((d, dIdx) => (
                              <td
                                key={`rem-${dIdx}`}
                                className={`digit-cell ${step.isLast ? "font-extrabold text-emerald-700" : "text-slate-800"}`}
                                style={{
                                  width: "36px",
                                  height: "34px",
                                  textAlign: "center",
                                  verticalAlign: "middle",
                                  fontSize: "18px",
                                }}
                              >
                                {d}
                              </td>
                            ))}
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </td>

              {/* Right side: Divisor on top, separator line, Quotient underneath */}
              <td className="align-top pl-5 min-w-[130px]">
                <div className="border-b-2 border-slate-900 pb-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    តួចែក (Divisor)
                  </span>
                  <span className="text-xl font-bold text-slate-900 tabular-nums">
                    {div.divisorKhmer}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    ផលចែក (Quotient)
                  </span>
                  <span className="text-2xl font-extrabold text-indigo-700 tabular-nums">
                    {div.quotientKhmer}
                  </span>
                </div>
                {div.remainder > 0 && (
                  <div className="mt-2 text-xs font-bold text-amber-700">
                    សំណល់ = {div.remainderKhmer}
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // Standard vertical grid for Addition (+), Subtraction (−), Multiplication (×)
  const numCols = calculation.columns.length;
  const hasPlaceHeaders = calculation.columns.some(
    (col) => KHMER_INTEGER_PLACE_LABELS[col] || KHMER_DECIMAL_PLACE_LABELS[col]
  );

  return (
    <div
      className={`inline-block overflow-x-auto rounded-xl p-3 border select-all ${
        isWorksheet
          ? "bg-[#FEFEFA] border-amber-200/90 text-slate-900 shadow-sm"
          : "bg-slate-950 border-slate-700 text-emerald-300"
      } ${className}`}
    >
      <table
        className="column-calculation"
        role="math"
        aria-label="ការគណនាជួរឈរ"
        data-testid="column-calculation-container"
        style={{
          borderCollapse: "collapse",
          fontVariantNumeric: "tabular-nums",
          fontFamily: '"Noto Sans Khmer", "Kantumruy Pro", ui-monospace, SFMono-Regular, monospace',
          textAlign: "right",
        }}
      >
        <tbody>
          {/* Subtle top place header row */}
          {hasPlaceHeaders && (
            <tr className="place-header-row text-slate-400 text-[11px] font-semibold">
              <th style={{ width: "36px", height: "24px", textAlign: "center", padding: 0 }} />
              {calculation.columns.map((colKey, cIdx) => {
                const label =
                  KHMER_INTEGER_PLACE_LABELS[colKey] ||
                  (colKey === "decimal_point" ? "·" : KHMER_DECIMAL_PLACE_LABELS[colKey] || "");
                return (
                  <th
                    key={cIdx}
                    className="place-header-cell border-b border-dashed border-slate-300 pb-0.5"
                    style={{
                      width: "36px",
                      height: "24px",
                      textAlign: "center",
                      verticalAlign: "middle",
                      padding: 0,
                    }}
                  >
                    {label}
                  </th>
                );
              })}
            </tr>
          )}

          {/* Data rows */}
          {calculation.rows.map((row, rIdx) => {
            if (row.role === "separator") {
              return (
                <tr key={rIdx} className="separator-row">
                  <td
                    colSpan={numCols + 1}
                    style={{
                      borderBottom: "2px solid #0f172a",
                      height: "6px",
                      padding: 0,
                    }}
                  />
                </tr>
              );
            }

            const isBorrowOrCarry = row.role === "borrow" || row.role === "carry";
            const isResult = row.role === "result";
            const cellList = row.cells && row.cells.length > 0 ? row.cells : row.digits || [];

            if (isBorrowOrCarry) {
              return (
                <tr key={rIdx} className="math-row carry-borrow-row text-amber-600 font-bold text-xs">
                  <td style={{ width: "36px", height: "28px", textAlign: "center", padding: 0 }} />
                  {calculation.columns.map((_, cIdx) => {
                    const val = cellList[cIdx] !== undefined && cellList[cIdx] !== null ? cellList[cIdx] : "";
                    return (
                      <td
                        key={cIdx}
                        className="digit-cell carry-borrow-cell"
                        style={{
                          width: "36px",
                          height: "28px",
                          textAlign: "center",
                          verticalAlign: "middle",
                          padding: 0,
                          color: "#d97706",
                          fontWeight: 700,
                          fontSize: "13px",
                        }}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              );
            }

            return (
              <tr key={rIdx} className={`math-row ${row.role}`}>
                <td
                  className="operator-cell font-bold text-indigo-800"
                  style={{
                    width: "36px",
                    height: "34px",
                    textAlign: "center",
                    verticalAlign: "middle",
                    fontSize: "18px",
                  }}
                >
                  {row.operator || ""}
                </td>

                {calculation.columns.map((colKey, cIdx) => {
                  const val = cellList[cIdx] !== undefined && cellList[cIdx] !== null ? cellList[cIdx] : "";
                  const isPoint = val === ".";

                  return (
                    <td
                      key={cIdx}
                      className={`digit-cell ${isPoint ? "point-cell font-bold text-indigo-700" : ""} ${
                        isResult ? "font-extrabold text-slate-950" : "font-medium text-slate-800"
                      }`}
                      data-column={colKey}
                      style={{
                        width: "36px",
                        height: "34px",
                        textAlign: "center",
                        verticalAlign: "middle",
                        fontSize: "18px",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {val}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
