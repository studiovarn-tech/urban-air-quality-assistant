# Urban Air Quality Assistant

Help families get through severe winter smog with personalized low-emission routines and indoor air hacks.

Pick a city, search for one, or use your current location to see live US AQI. Then add a few details about your household. The app returns:

- **Your day:** a timed family routine, from morning ventilation and the commute to the outdoor window, evening cooking and bedtime purifier use.
- **Impact today:** how much the plan limits outdoor time compared with a clean-air day, and how many actions are planned.
- **Outdoor routine:** how long to play or exercise, the best time of day, and inhaler reminders for asthma.
- **Indoor air hacks:** window, purifier, cooking, cleaning and humidity steps that match how polluted the air is.
- **Masks:** when to use a well-fitted N95 / FFP2 respirator, with a rule to keep them away from babies under 2.
- **Low-emission commute:** recirculation mode, no idling, and cleaner travel choices.
- **Daily routines:** batching errands, pre-running a purifier, and planning activity for clean-air windows.
- **Purifier sizing:** the minimum CADR needed for your main room.

Households with children, older adults, asthma, heart or lung conditions, or pregnancy get guidance one level stricter than the measured AQI.

**Live app:** https://studiovarn-tech.github.io/urban-air-quality-assistant/
**Demo video:** _add your unlisted YouTube or Google Drive link here_

## User journey

1. First visit: a sheet asks where the family is. The user searches for a city, picks a preset, or taps Locate.
2. The app fetches live US AQI for that place and builds today's plan.
3. The user adds household details with switches and an optional room size. The plan updates immediately.
4. The user reads "Your day" and "Impact today", follows the outdoor window and indoor steps, and can share the plan with one tap.

## Architecture

The app is a static site with three JavaScript files and no build step, framework or dependencies.

```
index.html          Layout, styles and the first-visit location sheet
js/logic.js         Rules engine (pure functions, no DOM or network)
js/locations.js     Preset cities, place search and live AQI requests
js/app.js           Interface state, rendering, storage and sharing
tests/              Unit tests for the rules and the location module
```

- **Rules engine (`logic.js`).** `buildPlan` turns an AQI and a household profile into a plan. `buildSchedule` and `buildImpact` derive the daily timeline and the impact summary from that plan, so all three always agree.
- **Data layer (`locations.js`).** Two calls to Open-Meteo, both free and keyless: the Air Quality API for current US AQI, and the Geocoding API for place search. Both return JSON and are called from the browser.
- **Interface (`app.js`).** Holds state (location, profile, manual AQI, theme), re-renders the plan on every change, and saves state to `localStorage`. Each live-data request has a request ID so that a slow older response cannot overwrite a newer one.
- **Hosting.** GitHub Pages serves the repository's `main` branch over HTTPS. HTTPS is required for the browser's location permission.

## Prompt and rule design

The runtime contains **no language model and no prompts**. The guidance is deterministic. I chose this because:

- Advice for children and people with asthma should be predictable, reviewable and testable. The same reading and profile always produce the same plan.
- Every recommendation traces back to a rule in `logic.js`, so a reviewer can check the wording against public-health guidance.
- It works offline apart from the two data requests, and it costs nothing to run.

The rules are these:

| Input | Rule |
| --- | --- |
| AQI | US EPA breakpoints: Good (0 to 50) through Hazardous (301 to 500) |
| Sensitive household | Moves the band up one level before any other rule runs |
| Band | Sets outdoor minutes per session: 120, 60, 30, 15, then 0 at Very Unhealthy |
| Band and profile | Chooses the outdoor window, mask advice, commute tips and indoor steps |
| Room size | Purifier CADR is at least two-thirds of the room area in sq ft (AHAM guidance) |
| Time of day | Midday is the suggested outdoor window, because winter smog often peaks in the early morning and evening rush |

If the AQI is unavailable, the app says so and asks for a manual reading. It doesn't guess.

## Features

- **Location:** 13 preset winter-smog cities, a search box for any place, and a Locate button.
- **Live air data:** Open-Meteo values for the chosen coordinates, with a manual override under "Enter AQI manually".
- **Household profile:** switches for children, older adults, asthma, heart or lung conditions, pregnancy, pets and purifier ownership, plus room size.
- **Sharing:** the phone's share sheet, or a copy to the clipboard. The shared text contains the place, the AQI and the key advice, not household details.
- **Appearance:** light and dark modes, following the system setting by default.
- **Privacy:** household details, location and appearance are stored only in the browser's local storage. The coordinates of the selected place are sent to Open-Meteo to fetch the AQI.

## Setup

Requirements: a modern browser. Node.js 18 or later is needed only for the tests.

1. Clone the repository:

   ```bash
   git clone https://github.com/studiovarn-tech/urban-air-quality-assistant.git
   cd urban-air-quality-assistant
   ```

2. Serve the folder with any static server, which keeps location permission working:

   ```bash
   npx serve .
   ```

   You can also open `index.html` directly, but location requests may be blocked by the browser.

3. Run the tests:

   ```bash
   npm test
   ```

   This runs `node --test tests/logic.test.js tests/locations.test.js`. `npm start` serves the app at http://localhost:8080.

4. To publish with GitHub Pages: Repository Settings → Pages → Deploy from a branch → `main` / root.

## Testing

- `tests/logic.test.js` covers the EPA bands, the sensitivity bump, outdoor time limits, CADR sizing, mask and commute rules, the daily timeline and the impact summary.
- `tests/locations.test.js` covers coordinate checks, the live AQI parser, error handling and place search. The network is mocked, so the tests run offline.

There are 26 unit tests in total. Interface behavior has been checked by hand and with browser screenshots, but there are no automated browser tests yet.

## Limitations and disclaimer

- Live AQI is the model-based Open-Meteo value for the chosen coordinates. It can differ from an official monitoring station, so use the manual field if you have a more local reading.
- The guidance is general and is not medical advice. Follow your doctor's asthma or care plan, and seek urgent care for severe breathing difficulty.
- The rules are based on common public-health guidance and are not tailored to a specific city or building.
- "Impact today" measures the plan against a clean-air day. It does not estimate health outcomes.

## Development note

Claude (Haiku 5.5) was used through Claude Code to write the code, tests and documentation. The app itself does not use generative AI at runtime.
