# Factorial Estimation Study

A web version of the Tversky & Kahneman (1973) factorial-estimation task with the calibration
manipulation. It has 4 groups (order × calibration) and block randomization for 160 participants,
40 per group. Data is saved to a Google Sheet.

## 1. Set up the Google Sheet (database)

1. Create a new Google Sheet.
2. Open **Extensions → Apps Script**, delete the sample code, and paste in all of `apps-script/Code.gs`. Save.
3. In the function dropdown next to **Run**, choose **`setup`**, then click **Run** and allow the permissions.
   This creates two tabs:
   - **Sequence**: the 160 block-randomized slots (40 blocks of 1–4).
   - **Results**: one row per participant.
4. Click **Deploy → New deployment**, set the type to **Web app**, then set:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Deploy, then copy the **Web app URL** (it ends in `/exec`).
5. Paste the URL into `src/config.js` as `APPS_SCRIPT_URL`.

If you later edit `Code.gs`, use **Deploy → Manage deployments → Edit → Version: New version**.
That keeps the same URL.

## 2. Run locally

```
npm install
npm run dev
```

If `APPS_SCRIPT_URL` is empty, the app runs in **test mode**. It picks a random group, saves nothing,
and shows the collected data at the end.

## 3. Publish on GitHub Pages

1. Create a GitHub repository and push this folder to the `main` branch.
2. In the repository, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. Each push to `main` builds and deploys the site. The link appears under Settings → Pages,
   for example `https://<username>.github.io/<repo>/`. Share that link with participants.

## How assignment works

- When someone clicks Start, the script locks the sheet, gives them the next empty slot in **Sequence**,
  and marks it `assigned`. Because of the lock, two people starting at the same moment never get the same slot.
- When they finish, their answers go into **Results** and the slot is marked `done`.
- If someone starts but doesn't finish within 20 minutes (`ABANDON_MINUTES`), their slot is given to the
  next person. This keeps the groups at 40 each.
- After all 160 slots are done, new visitors see "This study is now full".
- A browser that has already completed the study sees "You've already taken part". This is a soft check
  only, so also check the `participant` column for duplicates.

## Settings (`src/config.js`)

- `TIME_LIMIT_SEC`: seconds per estimate (default 10). Set it to `null` for no time limit.
  When time runs out, the trial is saved with `timed_out = TRUE`.

## Data columns (Results tab)

`timestamp, participant, slot, group, order_cond, calib_cond, true_value (40320), total_time_sec, user_agent`,
and for each estimate trial 1–4: `trialN_expr, trialN_response, trialN_rt_sec, trialN_timed_out`.

To get an Excel file, use **File → Download → Microsoft Excel (.xlsx)**.

To reset before the real study, delete the test rows in **Results** and run `setup` again.
This clears and refills **Sequence**.
