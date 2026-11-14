# Chrome extension — Google Flow worker

Manifest V3 module for the existing FB-ASMR-Factory repository.

## Current integration design

- One extension installation per persistent Chrome profile.
- Each installation is explicitly bound to one profile ID: `flow-1` … `flow-5`.
- The Python orchestrator remains the source of truth for task/job state.
- The extension polls the authenticated loopback bridge and only accepts tasks whose `profileId` matches its configured profile.
- Every event includes protocol version, message/task/job/clip/profile IDs and a timestamp.
- Google authentication remains inside the corresponding Chrome profile. The extension does not handle passwords, cookies, CAPTCHA or account restrictions.
- The local bridge uses a random token stored in the orchestrator data directory. Configure the same token in the extension options page.

## Load unpacked

1. Start FB-ASMR-Factory and ensure the local orchestrator is running.
2. Open each of the five managed Chrome windows.
3. Visit `chrome://extensions`, enable Developer mode and choose **Load unpacked**.
4. Select this `extensions/flow-automation` directory.
5. Open the extension's **Details → Extension options** page.
6. Enter the local bridge token and assign the matching profile ID. Repeat separately in each profile.
7. Keep task polling disabled until the desktop app has assigned the correct profile and project URL.

## Live Flow selectors: deliberately unverified

The repository has no captured DOM fixture or verified live Google Flow selectors. The content script therefore runs in safe mode: it reports whether it can identify a unique prompt field but does not submit prompts or click Generate until the user has supplied selectors and explicitly marked them verified in that profile's options.

Model, quality, duration and aspect-ratio selection are not implemented as verified actions yet. The worker reports this limitation instead of pretending requested settings were applied.

## Protocol

The worker expects the local API routes:

- `POST /api/v1/extension/register`
- `GET /api/v1/extension/next-task?profile_id=flow-N`
- `POST /api/v1/extension/events`

Required header: `X-ASMR-Bridge-Token`.

Task identity is always the tuple `(profileId, taskId, jobId, clipId)`. Never route an event or downloaded file using only a prompt or tab title.

## Verification status

The extension package and message validation are implemented, but real Flow DOM behavior, model settings and download-button interaction still require a controlled browser test with an authorised account. Do not mark a clip ready based on a Generate click or a video element alone; the orchestrator must validate the completed download with FFprobe before downstream processing.
