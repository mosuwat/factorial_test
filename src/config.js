// ---- Edit these settings ----

// Paste your Google Apps Script Web App URL here (ends with /exec).
// While it's empty, the app runs in TEST MODE: random group, nothing is saved,
// and the collected data is shown at the end instead.
export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbylGj-mHGP-M_RkYutj5FEsWPwdzWfbzUjBawkc0hdqzaBirOf_1V-BnRd5xgEHEr6spg/exec";

// Seconds allowed per estimate. Use null for no time limit.
export const TIME_LIMIT_SEC = 10;

// ---- Experiment design (Table 1) ----
const ASC8 = "1 × 2 × 3 × 4 × 5 × 6 × 7 × 8";
const DESC8 = "8 × 7 × 6 × 5 × 4 × 3 × 2 × 1";

export const TRUE_VALUE = 40320; // 8!

export const GROUPS = {
  1: { order: "ascending_first", calib: "6!", calibExpr: "1 × 2 × 3 × 4 × 5 × 6 = 720" },
  2: { order: "ascending_first", calib: "10!", calibExpr: "1 × 2 × 3 × 4 × 5 × 6 × 7 × 8 × 9 × 10 = 3628800" },
  3: { order: "descending_first", calib: "6!", calibExpr: "6 × 5 × 4 × 3 × 2 × 1 = 720" },
  4: { order: "descending_first", calib: "10!", calibExpr: "10 × 9 × 8 × 7 × 6 × 5 × 4 × 3 × 2 × 1 = 3628800" },
};

// Trial 1, Trial 2, calibration, Trial 3, Trial 4
export function screensFor(group) {
  const g = GROUPS[group];
  const [a, b] = g.order === "ascending_first" ? [ASC8, DESC8] : [DESC8, ASC8];
  return [
    { kind: "estimate", trial: 1, expr: a },
    { kind: "estimate", trial: 2, expr: b },
    { kind: "calibration", expr: g.calibExpr },
    { kind: "estimate", trial: 3, expr: a },
    { kind: "estimate", trial: 4, expr: b },
  ];
}
