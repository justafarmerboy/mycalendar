# mycalendar

- Static web app (HTML/CSS/ES modules, no build step). `npm start` serves it, `npm test` runs the astronomy tests.
- Deployed on Railway from the `main` branch (project `mycalendar`).
- After every finished change: run `npm test`, commit, then push to both the working branch and `main`
  (the owner asked for every change to go straight to `main`).
- UI text is Thai.
- `watchface/` is a Zepp OS watch face (Amazfit T-Rex 3). `watchface/shared/astro.js` must stay identical to `js/astro.js` (a test checks it).
  Build: `zeus build` inside `watchface/`; images come from `node watchface/tools/render-assets.cjs`.
