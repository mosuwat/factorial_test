import { useEffect, useRef, useState } from "react";
import {
  AGE_MAX,
  AGE_MIN,
  FIXATION_MS,
  GROUPS,
  PRACTICE_EXPR,
  STIMULUS_MS,
  TIME_LIMIT_SEC,
  TRUE_VALUE,
  screensFor,
} from "./config";
import { TEST_MODE, assignGroup, saveResult } from "./api";

const DONE_KEY = "factorial_study_done";

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export default function App() {
  const [phase, setPhase] = useState(storageGet(DONE_KEY) && !TEST_MODE ? "already" : "consent");
  const [demo, setDemo] = useState({ nickname: "", gender: "", age: "" });
  const [demoError, setDemoError] = useState("");
  const [assignment, setAssignment] = useState(null); // { group, slot }
  const [screenIdx, setScreenIdx] = useState(0);
  const [responses, setResponses] = useState([]); // estimate trials only
  const [errorMsg, setErrorMsg] = useState("");
  const [finalRow, setFinalRow] = useState(null);
  const startedAt = useRef(null);

  const screens = assignment ? screensFor(assignment.group) : [];

  function declineConsent() {
    setPhase("declinedConsent");
  }

  function agreeConsent() {
    setPhase("demographics");
  }

  async function submitDemographics(e) {
    e.preventDefault();
    setDemoError("");
    if (!demo.nickname.trim() || !demo.gender) {
      setDemoError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    const age = Number(demo.age);
    if (!Number.isFinite(age) || age <= 0) {
      setDemoError("กรุณากรอกอายุเป็นตัวเลข");
      return;
    }
    if (age < AGE_MIN || age > AGE_MAX) {
      setPhase("ageExcluded");
      return;
    }
    await begin();
  }

  async function begin() {
    setPhase("assigning");
    const pid = demo.nickname.trim();
    try {
      const r = await assignGroup(pid);
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

  function startRealTask() {
    startedAt.current = performance.now();
    setScreenIdx(0);
    setPhase("task");
  }

  function next(response) {
    const updated = response ? [...responses, response] : responses;
    setResponses(updated);
    if (screenIdx + 1 < screens.length) {
      setScreenIdx(screenIdx + 1);
    } else {
      setPhase("debrief");
    }
  }

  function declineDataUse() {
    setPhase("declinedDataUse");
  }

  async function finish(all) {
    const g = GROUPS[assignment.group];
    const row = {
      participant: demo.nickname.trim(),
      gender: demo.gender,
      age: demo.age,
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

      {phase === "consent" && (
        <section className="card">
          <h1>Estimation</h1>
          <p>
            การวิจัยนี้มุ่งศึกษาความสามารถในการประมาณผลลัพธ์ของโจทย์การคูณอย่างรวดเร็ว และความสัมพันธ์ของความสามารถดังกล่าวกับความคล่องแคล่วในการคิดเลขพื้นฐาน
            ในการเข้าร่วม ท่านจะได้ประมาณคำตอบของโจทย์การคูณภายในเวลาที่กำหนด และทำแบบทดสอบการคิดคำนวณสั้น ๆ
            โดยขอให้ท่านไม่ใช้เครื่องคิดเลขหรืออุปกรณ์ช่วยคำนวณใด ๆ ตลอดการทำกิจกรรม
          </p>
          <p>
            กิจกรรมทั้งหมดเป็นการคำนวณทางคณิตศาสตร์โดยสังเขป ซึ่งไม่มีความเสี่ยงที่อาจก่อให้เกิดอันตรายต่อผู้เข้าร่วมการวิจัย
            การเข้าร่วมครั้งนี้เป็นไปโดยสมัครใจ ท่านมีสิทธิ์ปฏิเสธหรือยุติการเข้าร่วมได้ทุกเมื่อ โดยไม่ต้องแจ้งเหตุผลและไม่ส่งผลกระทบใด ๆ ต่อท่าน
          </p>
          <p>
            ข้อมูลของท่านทั้งหมดจะถูกเก็บรักษาเป็นความลับ และจะนำเสนอผลการวิจัยในภาพรวมเท่านั้น โดยไม่เปิดเผยข้อมูลที่อาจระบุตัวตนของท่านได้
          </p>
          <p><strong>ท่านได้อ่านรายละเอียดเรียบร้อยแล้ว และรับทราบและยินดีเข้าร่วมการวิจัยหรือไม่?</strong></p>
          <div className="choice-buttons">
            <button onClick={agreeConsent}>รับทราบ และยินดีเข้าร่วมงานวิจัย</button>
            <button className="secondary" onClick={declineConsent}>ไม่ยินยอมเข้าร่วมงานวิจัย</button>
          </div>
        </section>
      )}

      {phase === "declinedConsent" && (
        <section className="card center">
          <h2>ขอบคุณที่สนใจ</h2>
          <p>ท่านได้เลือกไม่เข้าร่วมงานวิจัยนี้ ท่านสามารถปิดหน้านี้ได้</p>
        </section>
      )}

      {phase === "demographics" && (
        <section className="card">
          <h2>ข้อมูลส่วนตัวของผู้เข้าร่วมงานวิจัย</h2>
          <form onSubmit={submitDemographics}>
            <label className="field">
              <span>ชื่อเล่น</span>
              <input
                value={demo.nickname}
                onChange={(e) => setDemo({ ...demo, nickname: e.target.value })}
                autoFocus
              />
            </label>
            <label className="field">
              <span>เพศ</span>
              <select value={demo.gender} onChange={(e) => setDemo({ ...demo, gender: e.target.value })}>
                <option value="">เลือก</option>
                <option value="ชาย">ชาย</option>
                <option value="หญิง">หญิง</option>
                <option value="อื่น ๆ">อื่น ๆ</option>
              </select>
            </label>
            <label className="field">
              <span>อายุ</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="120"
                value={demo.age}
                onChange={(e) => setDemo({ ...demo, age: e.target.value })}
              />
            </label>
            {demoError && <p className="error-text">{demoError}</p>}
            <button type="submit">ถัดไป</button>
          </form>
        </section>
      )}

      {phase === "ageExcluded" && (
        <section className="card center">
          <h2>ขอบคุณที่สนใจ</h2>
          <p>ขออภัย งานวิจัยนี้จำกัดช่วงอายุผู้เข้าร่วม ท่านไม่ตรงตามเกณฑ์การเข้าร่วมในครั้งนี้ ท่านสามารถปิดหน้านี้ได้</p>
        </section>
      )}

      {phase === "assigning" && <section className="card center"><p>กำลังเตรียมข้อมูล…</p></section>}

      {phase === "instructions" && (
        <section className="card">
          <h2>คำแนะนำ (Instructions)</h2>
          <p>
            ท่านจะได้ประมาณผลลัพธ์ของโจทย์การคูณหลายข้อ โจทย์เหล่านี้ยากต่อการหาคำตอบที่แม่นยำ จึงขอให้ท่านประมาณค่าให้ดีที่สุดเท่าที่ทำได้
          </p>
          <p>
            ในแต่ละข้อ ท่านจะเห็นเครื่องหมาย (<span className="urgent-text">!</span>) สีแดงกลางหน้าจอ 1 วินาที จากนั้นโจทย์จะปรากฏ 5 วินาที
            ขอให้ดูโจทย์และคิดประมาณคำตอบในใจ เมื่อโจทย์หายไป ช่องพิมพ์คำตอบจะปรากฏพร้อมนาฬิกานับถอยหลัง
            กรุณาพิมพ์ค่าประมาณเป็นตัวเลขอย่างเดียว ไม่ต้องใส่จุลภาคหรือหน่วย ภายใน 10 วินาที แล้วกดส่ง
          </p>
          <p>
            ขอให้ตอบตามการคาดคะเนของท่านเอง และไม่ใช้เครื่องคิดเลข กระดาษ หรืออุปกรณ์ช่วยคำนวณใด ๆ
          </p>
          <p>
            ก่อนเริ่มโจทย์จริง ท่านจะได้ทำแบบฝึกหัด 1 ข้อ เพื่อทำความคุ้นเคยกับขั้นตอนทั้งหมด หากพร้อมแล้ว กดปุ่ม "เริ่มแบบฝึกหัด" เพื่อดำเนินการต่อ
          </p>
          <button onClick={() => setPhase("practice")}>เริ่มแบบฝึกหัด</button>
        </section>
      )}

      {phase === "practice" && (
        <EstimateScreen
          key="practice"
          screen={{ trial: "practice", expr: PRACTICE_EXPR }}
          onDone={() => setPhase("practiceDone")}
        />
      )}

      {phase === "practiceDone" && (
        <section className="card center">
          <h2>แบบฝึกหัดเสร็จสิ้น</h2>
          <p>ต่อไปท่านจะเริ่มทำโจทย์จริง ขอให้ตั้งใจประมาณคำตอบให้ดีที่สุด</p>
          <button onClick={startRealTask}>เริ่มทำโจทย์จริง</button>
        </section>
      )}

      {phase === "task" && screens[screenIdx] && (
        screens[screenIdx].kind === "estimate" ? (
          <EstimateScreen key={screenIdx} screen={screens[screenIdx]} onDone={next} />
        ) : (
          <CalibrationScreen key={screenIdx} screen={screens[screenIdx]} onDone={() => next(null)} />
        )
      )}

      {phase === "debrief" && (
        <section className="card">
          <h2>ข้อความชี้แจงหลังการทดลอง (Debriefing)</h2>
          <p>
            ก่อนหน้านี้เราแจ้งว่าการศึกษานี้เกี่ยวกับความสามารถในการประมาณค่าโจทย์คูณโดยทั่วไป แต่วัตถุประสงค์ที่แท้จริงคือการศึกษาปรากฏการณ์การยึดติดค่าอ้างอิง
            (anchoring effect) ซึ่งเป็นแนวโน้มที่การตัดสินใจภายใต้ความไม่แน่นอนของเราถูกชักนำโดยข้อมูลแรกที่ได้เห็นมากเกินควร
          </p>
          <p>
            เหตุผลที่ไม่แจ้งให้ทราบล่วงหน้า เพราะ หากท่านทราบล่วงหน้าว่าเรากำลังศึกษาเรื่องใด ท่านอาจตอบต่างจากที่ตอบตามสัญชาตญาณ
            ซึ่งจะทำให้ผลไม่สะท้อนการคิดตามธรรมชาติ
          </p>
          <p><strong>ท่านได้ทราบวัตถุประสงค์ที่แท้จริงของการวิจัยแล้ว ท่านยินยอมให้ผู้วิจัยนำข้อมูลที่ท่านให้ไว้ในการทดลองนี้ไปใช้ในการวิเคราะห์หรือไม่?</strong></p>
          <div className="choice-buttons">
            <button onClick={() => finish(responses)}>ยินยอม</button>
            <button className="secondary" onClick={declineDataUse}>ไม่ยินยอม</button>
          </div>
        </section>
      )}

      {phase === "declinedDataUse" && (
        <section className="card center">
          <h2>ขอบคุณสำหรับการเข้าร่วม</h2>
          <p>ข้อมูลของท่านจะไม่ถูกนำไปใช้ในการวิเคราะห์ ตามที่ท่านแจ้งความต้องการ ท่านสามารถปิดหน้านี้ได้</p>
        </section>
      )}

      {phase === "saving" && <section className="card center"><p>กำลังบันทึกคำตอบของท่าน…</p></section>}

      {phase === "done" && (
        <section className="card center">
          <h2>ขอบคุณ!</h2>
          <p>คำตอบของท่านถูกบันทึกแล้ว ท่านสามารถปิดหน้านี้ได้</p>
          {TEST_MODE && <pre className="debug">{JSON.stringify(finalRow, null, 2)}</pre>}
        </section>
      )}

      {phase === "saveFailed" && (
        <section className="card center">
          <h2>บันทึกคำตอบไม่สำเร็จ</h2>
          <p>กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่</p>
          <p className="muted">{errorMsg}</p>
          <button onClick={() => trySave(finalRow)}>ลองใหม่</button>
        </section>
      )}

      {phase === "full" && (
        <section className="card center">
          <h2>งานวิจัยนี้ครบจำนวนผู้เข้าร่วมแล้ว</h2>
          <p>ขอบคุณที่ให้ความสนใจ</p>
        </section>
      )}

      {phase === "already" && (
        <section className="card center">
          <h2>ท่านได้เข้าร่วมงานวิจัยนี้ไปแล้ว</h2>
          <p>ขอบคุณ — ผู้เข้าร่วมแต่ละท่านสามารถทำแบบวัดนี้ได้เพียงครั้งเดียว</p>
        </section>
      )}

      {phase === "error" && (
        <section className="card center">
          <h2>เกิดข้อผิดพลาด</h2>
          <p className="muted">{errorMsg}</p>
          <button onClick={() => setPhase("consent")}>กลับ</button>
        </section>
      )}
    </main>
  );
}

// Fixation ("!") -> stimulus (problem shown) -> response (input + countdown).
// Used for both the practice item and the real estimate trials.
function EstimateScreen({ screen, onDone }) {
  const [stage, setStage] = useState("fixation");
  const [value, setValue] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const responseShownAt = useRef(null);
  const finished = useRef(false);
  const valueRef = useRef("");

  useEffect(() => {
    const t1 = setTimeout(() => setStage("stimulus"), FIXATION_MS);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (stage !== "stimulus") return;
    const t2 = setTimeout(() => {
      responseShownAt.current = performance.now();
      setStage("response");
    }, STIMULUS_MS);
    return () => clearTimeout(t2);
  }, [stage]);

  useEffect(() => {
    if (stage !== "response" || !TIME_LIMIT_SEC) return;
    const id = setInterval(() => {
      setElapsed(Math.round((performance.now() - responseShownAt.current) / 100) / 10);
    }, 100);
    return () => clearInterval(id);
  }, [stage]);

  function submit() {
    if (finished.current || !valueRef.current) return;
    finished.current = true;
    const rt = Math.round(performance.now() - responseShownAt.current) / 1000;
    onDone({
      trial: screen.trial,
      expr: screen.expr,
      response: Number(valueRef.current),
      rt,
      timedOut: Boolean(TIME_LIMIT_SEC) && rt > TIME_LIMIT_SEC,
    });
  }

  function onChange(e) {
    const digits = e.target.value.replace(/[^0-9]/g, "");
    valueRef.current = digits;
    setValue(digits);
  }

  const remaining = TIME_LIMIT_SEC ? Math.max(0, Math.ceil(TIME_LIMIT_SEC - elapsed)) : null;

  return (
    <section className="card trial">
      {stage === "fixation" && (
        <p className="expr fixation" aria-hidden="true">!</p>
      )}

      {stage === "stimulus" && (
        <>
          <p className="label">ประมาณคำตอบของโจทย์ต่อไปนี้:</p>
          <p className="expr">{screen.expr}</p>
        </>
      )}

      {stage === "response" && (
        <>
          {remaining !== null && <div className={`timer ${remaining <= 3 ? "urgent" : ""}`}>{remaining}s</div>}
          <p className="label">กรุณาพิมพ์ค่าประมาณ (ตัวเลขเท่านั้น):</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              className="answer"
              value={value}
              onChange={onChange}
              inputMode="numeric"
              autoComplete="off"
              placeholder="พิมพ์ค่าประมาณ"
              autoFocus
            />
            <button type="submit" disabled={!value}>ส่งคำตอบ</button>
          </form>
        </>
      )}
    </section>
  );
}

function CalibrationScreen({ screen, onDone }) {
  return (
    <section className="card trial">
      <p className="label">คำตอบที่ถูกต้องของโจทย์การคูณอีกข้อหนึ่งคือ:</p>
      <p className="expr">{screen.expr}</p>
      <button onClick={onDone}>ดำเนินการต่อ</button>
    </section>
  );
}
