# Development Log — FB-ASMR-Factory

This file records implementation decisions and verified/unverified work so future sessions can resume without losing requirements.

## 2026-11-14 — Seven-style AI Director correction

### Product requirement confirmed
All seven styles are active, not merely reserved. Weekly rotation:
- Monday: Fruits
- Tuesday: Soaps
- Wednesday: Clay
- Thursday: Kinetic Sand
- Friday: Slime
- Saturday: Satisfying Objects / Materials
- Sunday: Mixed ASMR

Every selected style produces exactly five distinct subjects and five distinct prompts. All five clips in one job must belong to the selected style. Keep the same shared Style Bible for camera, lighting, background, pacing and sound; vary subject/material/action across the five prompts. Target each clip at 8 seconds, approximately 40 seconds total.

### Default subject sets currently implemented
- Fruits: Watermelon, Kiwi, Orange, Pineapple, Strawberry.
- Soaps: Rose, Transparent, Rainbow, Marble, Glitter soap.
- Clay: Red, Blue, Rainbow, Pastel, Metallic clay.
- Kinetic Sand: Golden, Blue, Pink, Rainbow, Layered kinetic sand.
- Slime: Clear, Crunchy, Glossy, Glitter, Fluffy slime.
- Satisfying Objects / Materials: Jelly, Wax, Soft foam, Coloured blocks, Sensory material.
- Mixed ASMR: Layered sensory block, Jelly-filled object, Soft wax object, Foam-and-clay object, Multi-texture sensory object.

These are initial default subjects and can be refined later; do not reduce the system to Fruits-only.

### Code changes committed
- Backend accepts all seven theme keys and creates five clip rows from the selected style's subject set.
- Built-in prompt composer now applies style-specific material direction plus the shared Style Bible.
- Optional OpenAI-compatible prompt provider is given the selected style and exact five subject names, and its response is validated against that list.
- Desktop dashboard now has a seven-style selector.
- Backend tests updated to cover all seven styles and five distinct prompts per style.
- README, detailed project specification and PROJECT_STATUS updated to preserve the seven-style requirement and weekly rotation.

### Not yet verified
- Python tests have been written but not executed on the user's Windows machine.
- TypeScript/Electron build has not been run after these changes.
- Google Flow browser automation, downloads, FFmpeg compilation and Facebook publishing are still not implemented.

### Next actions
1. Pull latest main branch and restart the backend and desktop UI.
2. Create one job for each style and verify exactly five subjects/prompts.
3. Run backend unit tests and fix any failures.
4. Continue Chrome extension and five persistent Flow browser profiles.

## 2026-11-14 — Google Flow persistent profile milestone

### Implemented
- Added `app/flow_browser.py` with five fixed, isolated persistent Chrome profiles (`flow-1` through `flow-5`).
- Each profile has its own local Chrome user-data directory under the app data folder and a dedicated downloads folder.
- Added strict HTTPS Google Flow project URL validation; only direct `flow.google.com/project/{id}` URLs are accepted.
- Added SQLite-backed account labels and saved project URLs, with five default account slots seeded automatically.
- Added local API endpoints to list, save and open each profile.
- Opening an account launches visible Google Chrome, opens its saved Flow project directly and reuses its persistent session on later launches.
- A Google sign-in redirect is detected and surfaced; the user signs in once inside that profile. No Google passwords or cookies are copied into app settings.
- Added five account URL inputs and Save/Open controls to the desktop Flow Sessions panel.
- Added Playwright to backend requirements and included its runtime in the PyInstaller build configuration.
- Added unit tests for the five profile IDs, accepted/rejected project URLs and profile directory isolation.

### Boundaries / not yet verified
- The account/profile milestone is implemented in code; real five-account browser launch still needs a Windows machine with Google Chrome and the user's authorised accounts.
- This commit does not claim prompt insertion, generation completion detection, downloads, FFmpeg processing or Facebook publishing. Those remain the next milestones.
- Chrome must be installed separately; Playwright uses the installed Chrome channel rather than downloading a separate Chromium browser.

### Next
1. Run backend unit tests and the Windows installer workflow.
2. Verify one profile launch, saved session reuse and direct project navigation on Windows.
3. Implement guarded prompt insertion and Generate interaction using observable Flow page controls.
4. Add per-clip task persistence and generation/download recovery before enabling five-way automatic production.
