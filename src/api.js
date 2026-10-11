import { APPS_SCRIPT_URL } from "./config";

export const TEST_MODE = !APPS_SCRIPT_URL;

// Ask the sheet for the next group in the block sequence.
export async function assignGroup(participantId) {
  if (TEST_MODE) {
    return { ok: true, group: 1 + Math.floor(Math.random() * 4), slot: "test" };
  }
  const url = `${APPS_SCRIPT_URL}?action=assign&pid=${encodeURIComponent(participantId)}`;
  const res = await fetch(url);
  return res.json(); // { ok, group, slot } or { ok:false, full:true } / { ok:false, error }
}

// Send the finished data. text/plain avoids a CORS preflight, which Apps Script can't answer.
export async function saveResult(row) {
  if (TEST_MODE) return { ok: true };
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "save", ...row }),
  });
  return res.json();
}
