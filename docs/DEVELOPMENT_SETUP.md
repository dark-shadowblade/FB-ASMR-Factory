# Windows Quick Start

FB-ASMR-Factory is an early development build. This guide describes the current setup; the full five-account Flow workflow still needs a live test on the user's PC.

## 1. Install prerequisites

1. Install **Node.js 20 or newer** from https://nodejs.org/.
2. Install **Python 3.10 or newer** from https://www.python.org/downloads/windows/.
3. Install **Google Chrome**.
4. Install **FFmpeg and FFprobe** and make sure both `ffmpeg` and `ffprobe` commands are available on PATH. The media pipeline uses them to validate and merge the five downloaded MP4 clips.

## 2. Launch the desktop app

1. Download this repository using **Code → Download ZIP** and extract it.
2. Double-click **INSTALL.bat**.
3. On the first run, the script creates the Python environment, installs backend and desktop dependencies, starts the local backend and opens the Electron dashboard.
4. Keep the backend terminal open while using the app.

Run **INSTALL.bat** again for later launches. It reuses the installed environments and checks/installs backend dependencies.

## 3. Configure five Google Flow accounts

1. In the desktop app's **Flow sessions** panel, paste one saved Google Flow project URL for each of the five accounts and click **Save**.
2. Click **Open** for each profile. Each profile has its own persistent Chrome data directory; sign in to the intended Google account once in that profile.
3. In each of the five Chrome profiles, open `chrome://extensions`, enable Developer mode and choose **Load unpacked**.
4. Select the repository's `extensions/flow-automation` folder. Repeat this for all five profiles.
5. Open the extension options page in each profile. Paste the desktop app's bridge token, assign the matching profile ID (`flow-1` through `flow-5`), and enable task polling.
6. Open that profile's saved Google Flow project and use **Scan selected Flow tab** in extension options to inspect the live controls.
7. Configure and verify the prompt, Generate, download and selected-setting selectors against the actual signed-in Flow page. Do not mark selectors verified based only on suggested selectors. Generation remains blocked until the configured controls and requested values are verified.
8. Return to the desktop app. Wait until all five workers show as connected.

The one-click **Start automatic production** action generates missing prompts, approves the prompt pack and dispatches one clip to each connected Flow profile. Prompt editing remains available before starting. A connected worker heartbeat only confirms the extension can reach the local bridge; it does not prove that Flow is signed in or that generation is working.

## 4. Download folder

By default, the media assembly API expects Chrome's MP4 downloads under the current Windows user's **Downloads** folder. If Chrome saves videos somewhere else, set the environment variable `ASMR_FACTORY_DOWNLOADS_DIR` to that folder before launching the backend. The browser-reported file paths must be absolute and remain inside that configured folder.

After all five clip downloads are reported, choose **Merge five downloaded clips** in the job panel. The backend probes the inputs and final MP4 with FFprobe and only records the final output after validation succeeds.

## 5. What is implemented and what remains

Implemented in the repository:
- All seven ASMR styles and five distinct prompts per job.
- Persistent Style Bible and Prompt Studio.
- Five isolated Chrome profile slots and saved Flow project URLs.
- Manifest V3 extension, authenticated localhost bridge, live worker status and task dispatch.
- Reference-informed prompt-field discovery, guarded prompt insertion/Generate path, download reporting and per-clip retry.
- FFmpeg/FFprobe five-clip validation, vertical 9:16 assembly, output record and basic Video Library details.

Still requiring live verification or implementation:
- Actual Flow model/resolution/duration/aspect-ratio selection and real generation/download behavior on the user's signed-in accounts.
- Reliable restart recovery, automatic retry/backoff and full five-account end-to-end tests.
- Library thumbnails, search and in-app playback.
- Meta authentication, Page selection and automatic Facebook Reel publishing.
- Optional scheduler and a verified release Windows installer.

Do not treat CI mocks as proof that a real Flow generation or a real FFmpeg merge has been completed on the user's machine.
