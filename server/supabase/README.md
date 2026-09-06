# Online runs with Supabase

Participants (e.g. recruited on Prolific) open a link to the app, run one
experiment in a clean full-screen mode, and their responses are stored in
your Supabase project. You fetch the results from inside the app. The
optional "describe the experiment you want" AI function also runs here so
the Anthropic API key never reaches the browser.

## One-time setup (about 15 minutes)

1. **Database.** In your Supabase project open *Database → SQL editor*, paste
   `schema.sql` and run it. It creates `published_experiments`, `sessions`,
   `trials`, the row-level-security policies (participants can only insert;
   only you can read) and the `complete_session` function.
2. **Your experimenter login.** *Authentication → Users → Add user* with your
   email and a password (turn off "Confirm email" or confirm it). Under
   *Authentication → Providers → Email* disable public sign-ups.
3. **Connect the app.** In the app: ⚙ settings → *online* → paste the project
   URL and the `anon` public key (*Settings → API* in Supabase), then sign in
   with the email and password from step 2. The app remembers the connection
   in this browser.
4. **AI function (optional).** Install the Supabase CLI, then from the
   repository root:

       supabase login
       supabase link --project-ref <your-project-ref>
       supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
       supabase functions deploy describe --no-verify-jwt

   (`--no-verify-jwt` lets the function check the session itself, which it
   does; Supabase's gateway check rejects the anon key otherwise.) The
   function uses `claude-opus-5` and only answers signed-in experimenters.
   Alternatively choose "use my own key" in ⚙ settings → *AI*; the key then
   stays in your browser and calls the API directly.

## Running a study

1. Open the experiment in the app, check its settings, and press
   **publish for participants**. Fill in the instructions shown to
   participants and, for Prolific, the completion URL from your Prolific
   study (or just the completion code). The definition is frozen at that
   moment; later edits do not affect it.
2. Copy the participant link and paste it as the study URL in Prolific with
   the standard parameters appended:

       https://…/similarity-with-rotation/?run=<id>&sb=<project>&key=<anon key>&PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}

   The link carries the project ref and the anon key so that the page a
   participant opens knows where to send the data; the anon key is the
   public client key, and the row-level-security policies are what keep
   the data private (participants can insert, never read).

3. Participants see: instructions → screen calibration with a bank card
   (so every response carries the true stimulus size in mm and degrees at
   the stated viewing distance) → the trials → a completion screen that
   redirects to Prolific (or shows the code). Every trial is stored as soon
   as it is answered, so a dropped session still leaves its trials.
4. **fetch results** in the experiment panel lists sessions (Prolific id,
   started, completed, trials) and downloads everything as .csv or .xlsx.
   **unpublish** stops new sessions; the data stays.

## Data

- `published_experiments.definition` holds the full stimulus record of every
  question (shape, sub-shape, rotations, frame, size) exactly as shown.
- `trials.row` is the same record the CSV export writes: response, RT, side,
  all member parameters, size in mm and degrees, px/mm, viewing distance.
- No cookies; the participant's Prolific ids come from the URL only.
