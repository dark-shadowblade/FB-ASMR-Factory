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
