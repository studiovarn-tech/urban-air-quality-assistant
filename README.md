# Urban Air Quality Assistant

Help families get through severe winter smog with personalized low-emission routines and indoor air hacks.

Pick a city (or use your current location) to see live US AQI, then add a few details about your household. The assistant returns a plan for:

- **Outdoor routine:** how long to play or exercise, the best time of day, and inhaler reminders for asthma.
- **Indoor air hacks:** window, purifier, cooking, cleaning and humidity steps that match how polluted the air is.
- **Masks:** when to use a well-fitted N95 / FFP2 respirator, with a rule to keep them away from babies.
- **Low-emission commute:** recirculation mode, no idling, and cleaner travel choices.
- **Daily routines:** batching errands, pre-running a purifier, and planning activity for clean-air windows.
- **Purifier sizing:** the minimum CADR needed for your main room.

Households with children, older adults, asthma, heart or lung conditions, or pregnancy get guidance one level stricter than the measured AQI.

## Features

- **Location picker:** choose from 13 cities with winter smog, or tap **Locate** to use your current position (the browser asks for permission first).
- **Live air data:** AQI comes from the free [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api), which needs no API key. The coordinates of the selected place are sent to Open-Meteo only.
- **Manual override:** enter an AQI yourself under "Enter AQI manually" if you prefer a reading from another source.
- **Light and dark appearance**, following your system setting by default.

Household details, the chosen location and the appearance setting are saved only in your browser's local storage. Nothing is sent to a server.

## Run it

This is a static site with no build step and no dependencies.

1. Clone the repository.
2. Open `index.html` in a browser, or serve the folder with any static server, for example `npx serve .`. Using a server is recommended so that location permission works reliably.

## Run the tests

Requires Node.js 18 or later:

```bash
node --test tests/logic.test.js tests/locations.test.js
```

## Project structure

```
index.html            Page layout and styles
js/logic.js           Pure rules: AQI bands, sensitivity, plan building, CADR sizing
js/locations.js       City list, coordinate checks and the live AQI request
js/app.js             Interface state, location picker and rendering
tests/logic.test.js   Unit tests for the rules
tests/locations.test.js  Unit tests for the location module (mocked network)
```

## How the guidance works

- **AQI bands** follow the US EPA Air Quality Index breakpoints (Good to Hazardous).
- **Sensitive households** move up one band, so a reading of 120 is handled like 150 for a home with children.
- **Outdoor time** shrinks with the adjusted band: 120 minutes at Good, down to none at Very Unhealthy.
- **Purifier size** uses the AHAM guideline that CADR should be at least two-thirds of the room area in square feet.
- **Best outdoor window** is midday, since winter smog often peaks in the early morning inversion and the evening traffic rush.

## Publishing with GitHub Pages (optional)

Repository Settings → Pages → Deploy from a branch → `main` / root. The app will be live at `https://<your-username>.github.io/<repo-name>/`.

## Demo video

Demo video: _add your unlisted YouTube or Google Drive link here_

## Limitations

- Live AQI is the model-based Open-Meteo value for the chosen coordinates. It can differ from an official monitoring station, so use the manual field if you have a more local reading.
- The guidance is general and is not medical advice. Follow your doctor's asthma or care plan, and seek urgent care for severe breathing difficulty.
- Routine rules are based on common public-health guidance and are not tailored to a specific city or building.
