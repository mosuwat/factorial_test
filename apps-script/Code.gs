/**
 * Google Apps Script backend for the factorial estimation study.
 *
 * Setup (once):
 *  1. Create a new Google Sheet. Extensions -> Apps Script. Paste this whole file, save.
 *  2. Choose the function "setup" in the toolbar and click Run (allow permissions).
 *     This creates the "Sequence" sheet (160 block-randomized slots) and the "Results" sheet.
 *  3. Deploy -> New deployment -> type "Web app".
 *       Execute as: Me      Who has access: Anyone
 *     Copy the Web app URL (ends in /exec) into src/config.js -> APPS_SCRIPT_URL.
 */

const SEQUENCE = [3, 1, 2, 4, 2, 1, 3, 4, 4, 3, 1, 2, 1, 4, 3, 2, 3, 1, 4, 2, 4, 2, 1, 3, 4, 1, 2, 3, 4, 3, 2, 1, 3, 2, 4, 1, 4, 2, 1, 3, 2, 4, 3, 1, 2, 4, 1, 3, 3, 1, 4, 2, 2, 4, 3, 1, 2, 4, 3, 1, 3, 1, 2, 4, 1, 2, 4, 3, 1, 2, 4, 3, 3, 2, 1, 4, 2, 1, 3, 4, 3, 1, 4, 2, 1, 3, 2, 4, 4, 2, 1, 3, 3, 2, 1, 4, 2, 1, 4, 3, 4, 3, 1, 2, 1, 3, 2, 4, 4, 2, 3, 1, 3, 1, 4, 2, 2, 3, 1, 4, 3, 4, 1, 2, 2, 4, 1, 3, 1, 4, 2, 3, 2, 4, 3, 1, 4, 1, 2, 3, 2, 3, 4, 1, 4, 1, 3, 2, 4, 1, 3, 2, 4, 2, 3, 1, 4, 3, 2, 1]; // 40 blocks of [1,2,3,4] shuffled, 40 per group
const ABANDON_MINUTES = 10; // a started-but-unfinished slot is given to someone else after this

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let seq = ss.getSheetByName("Sequence") || ss.insertSheet("Sequence");
  seq.clear();
  seq.appendRow(["slot", "block", "group", "status", "participant", "assigned_at", "completed_at"]);
  const rows = SEQUENCE.map((g, i) => [i + 1, Math.floor(i / 4) + 1, g, "", "", "", ""]);
  seq.getRange(2, 1, rows.length, 7).setValues(rows);
  seq.setFrozenRows(1);

  let res = ss.getSheetByName("Results") || ss.insertSheet("Results");
  if (res.getLastRow() === 0) {
    res.appendRow(["timestamp"]);
    res.setFrozenRows(1);
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// GET ?action=assign&pid=...  ->  { ok, group, slot }
function doGet(e) {
  const action = (e.parameter.action || "").toLowerCase();
  if (action !== "assign") return json_({ ok: false, error: "unknown action" });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // one participant at a time, so two people never get the same slot
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sequence");
    const n = sheet.getLastRow() - 1;
    const data = sheet.getRange(2, 1, n, 7).getValues();
    const now = new Date();
    for (let i = 0; i < n; i++) {
      const status = data[i][3];
      const assignedAt = data[i][5] ? new Date(data[i][5]) : null;
      const abandoned = status === "assigned" && assignedAt &&
        (now - assignedAt) / 60000 > ABANDON_MINUTES;
      if (status === "" || abandoned) {
        sheet.getRange(i + 2, 4, 1, 3).setValues([["assigned", String(e.parameter.pid || ""), now]]);
        return json_({ ok: true, group: data[i][2], slot: data[i][0] });
      }
    }
    return json_({ ok: false, full: true });
  } finally {
    lock.releaseLock();
  }
}

// POST body (text/plain JSON): { action:"save", participant, slot, group, ... }
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.action !== "save") return json_({ ok: false, error: "unknown action" });
  delete body.action;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const res = ss.getSheetByName("Results");

    // Add any new columns to the header, then write values in header order.
    let headers = res.getRange(1, 1, 1, Math.max(1, res.getLastColumn())).getValues()[0].filter(String);
    if (headers.length === 0) headers = ["timestamp"];
    Object.keys(body).forEach((k) => { if (headers.indexOf(k) === -1) headers.push(k); });
    res.getRange(1, 1, 1, headers.length).setValues([headers]);
    body.timestamp = new Date();
    res.appendRow(headers.map((h) => (body[h] === undefined ? "" : body[h])));

    // Mark the slot as completed.
    const seq = ss.getSheetByName("Sequence");
    const slot = Number(body.slot);
    if (slot >= 1 && slot <= seq.getLastRow() - 1) {
      seq.getRange(slot + 1, 4).setValue("done");
      seq.getRange(slot + 1, 7).setValue(new Date());
    }
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}
