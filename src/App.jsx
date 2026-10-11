import { useEffect, useRef, useState } from "react";
import { GROUPS, TIME_LIMIT_SEC, TRUE_VALUE, screensFor } from "./config";
import { TEST_MODE, assignGroup, saveResult } from "./api";

const DONE_KEY = "factorial_study_done";

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export default function App() {
  const [phase, setPhase] = useState(storageGet(DONE_KEY) && !TEST_MODE ? "already" : "start");
  const [pid, setPid] = useState("");
  const [assignment, setAssignment] = useState(null); // { group, slot }
  const [screenIdx, setScreenIdx] = useState(0);
  const [responses, setResponses] = useState([]); // estimate trials only
  const [errorMsg, setErrorMsg] = useState("");
  const [finalRow, setFinalRow] = useState(null);
  const startedAt = useRef(null);

  const screens = assignment ? screensFor(assignment.group) : [];

  async function begin() {
    setPhase("assigning");
    try {
      const r = await assignGroup(pid.trim());
      if (r.ok) {
        setAssignment({ group: Number(r.group), slot: r.slot });
        setPhase("instructions");
      } else if (r.full) {
        setPhase("full");
      } else {
        throw new Error(r.error || "Unknown error");
      }
    } catch (e) {
      setErrorMsg(String(e.message || e));
      setPhase("error");
    }
  }

  function next(response) {
    const updated = response ? [...responses, response] : responses;
    setResponses(updated);
    if (screenIdx + 1 < screens.length) {
      setScreenIdx(screenIdx + 1);
    } else {
      finish(updated);
    }
  }

  async function finish(all) {
    const g = GROUPS[assignment.group];
    const row = {
      participant: pid.trim(),
      slot: assignment.slot,
      group: assignment.group,
      order_cond: g.order,
      calib_cond: g.calib,
      true_value: TRUE_VALUE,
      total_time_sec: Math.round((performance.now() - startedAt.current) / 100) / 10,
      user_agent: navigator.userAgent,
    };
    all.forEach((r) => {
      row[`trial${r.trial}_expr`] = r.expr;
      row[`trial${r.trial}_response`] = r.response;
      row[`trial${r.trial}_rt_sec`] = r.rt;
      row[`trial${r.trial}_timed_out`] = r.timedOut;
    });
    setFinalRow(row);
    await trySave(row);
  }

  async function trySave(row) {
    setPhase("saving");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await saveResult(row);
        if (r.ok) {
          storageSet(DONE_KEY, "1");
          setPhase("done");
          return;
        }
        throw new Error(r.error || "Save failed");
      } catch (e) {
        setErrorMsg(String(e.message || e));
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
    setPhase("saveFailed");
  }

  return (
    <main className="shell">
      {TEST_MODE && <div className="test-banner">TEST MODE — no Apps Script URL set, nothing is saved</div>}

      {phase === "start" && (
        <section className="card">
          <h1>Estimation study</h1>
          <p>
            You'll see a few multiplication problems and give your best quick estimate of each answer.
            It takes about 2 minutes. Your responses are recorded anonymously.
          </p>
          <label className="field">
            <span>Participant ID</span>
            <input
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              placeholder="e.g. your student ID"
              autoFocus
            />
          </label>
          <button disabled={!pid.trim()} onClick={begin}>I agree to take part — start</button>
        </section>
      )}

      {phase === "assigning" && <section className="card center"><p>Loading…</p></section>}

      {phase === "instructions" && (
        <section className="card">
          <h2>Instructions</h2>
          <p>
            Each screen shows a multiplication problem. <strong>Don't calculate it</strong> — type your best
            quick estimate of the answer and press Submit.
          </p>
          {TIME_LIMIT_SEC && <p>You have <strong>{TIME_LIMIT_SEC} seconds</strong> for each problem.</p>}
          <p>Only numbers can be typed.</p>
          <button
            onClick={() => {
              startedAt.current = performance.now();
              setPhase("task");
            }}
          >
            Begin
          </button>
        </section>
      )}

      {phase === "task" && screens[screenIdx] && (
        screens[screenIdx].kind === "estimate" ? (
          <EstimateScreen key={screenIdx} screen={screens[screenIdx]} onDone={next} />
        ) : (
          <CalibrationScreen key={screenIdx} screen={screens[screenIdx]} onDone={() => next(null)} />
        )
      )}

      {phase === "saving" && <section className="card center"><p>Saving your answers…</p></section>}

      {phase === "done" && (
        <section className="card center">
          <h2>Thank you!</h2>
          <p>Your answers have been saved. You can close this page.</p>
          {TEST_MODE && <pre className="debug">{JSON.stringify(finalRow, null, 2)}</pre>}
        </section>
      )}

      {phase === "saveFailed" && (
        <section className="card center">
          <h2>Couldn't save your answers</h2>
          <p>Please check your internet connection and try again.</p>
          <p className="muted">{errorMsg}</p>
          <button onClick={() => trySave(finalRow)}>Try again</button>
        </section>
      )}

      {phase === "full" && (
        <section className="card center">
          <h2>This study is now full</h2>
          <p>Thank you for your interest.</p>
        </section>
      )}

      {phase === "already" && (
        <section className="card center">
          <h2>You've already taken part</h2>
          <p>Thank you — each person can only do the study once.</p>
        </section>
      )}

      {phase === "error" && (
        <section className="card center">
          <h2>Something went wrong</h2>
          <p className="muted">{errorMsg}</p>
          <button onClick={() => setPhase("start")}>Back</button>
        </section>
      )}
    </main>
  );
}

function EstimateScreen({ screen, onDone }) {
  const [value, setValue] = useState("");
  const [left, setLeft] = useState(TIME_LIMIT_SEC);
  const shownAt = useRef(performance.now());
  const finished = useRef(false);
  const valueRef = useRef("");

  function submit(timedOut) {
    if (finished.current) return;
    finished.current = true;
    onDone({
      trial: screen.trial,
      expr: screen.expr,
      response: valueRef.current === "" ? "" : Number(valueRef.current),
      rt: Math.round(performance.now() - shownAt.current) / 1000,
      timedOut,
    });
  }

  useEffect(() => {
    if (!TIME_LIMIT_SEC) return;
    const id = setInterval(() => {
      const remaining = TIME_LIMIT_SEC - (performance.now() - shownAt.current) / 1000;
      setLeft(Math.max(0, Math.ceil(remaining)));
      if (remaining <= 0) {
        clearInterval(id);
        submit(true);
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChange(e) {
    const digits = e.target.value.replace(/[^0-9]/g, "");
    valueRef.current = digits;
    setValue(digits);
  }

  return (
    <section className="card trial">
      {TIME_LIMIT_SEC && <div className={`timer ${left <= 3 ? "urgent" : ""}`}>{left}s</div>}
      <p className="label">Estimate:</p>
      <p className="expr">{screen.expr}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value) submit(false);
        }}
      >
        <input
          className="answer"
          value={value}
          onChange={onChange}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Type your estimate"
          autoFocus
        />
        <button type="submit" disabled={!value}>Submit</button>
      </form>
    </section>
  );
}

function CalibrationScreen({ screen, onDone }) {
  return (
    <section className="card trial">
      <p className="label">For reference:</p>
      <p className="expr">{screen.expr}</p>
      <button onClick={onDone}>Continue</button>
    </section>
  );
}
