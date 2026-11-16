# Chrome extension — Google Flow worker

Manifest V3 module for the existing FB-ASMR-Factory repository.

## Current integration design

- One extension installation per persistent Chrome profile.
- Each installation is explicitly bound to one profile ID: `flow-1` … `flow-5`.
- The Python orchestrator remains the source of truth for task/job state.
- The extension polls the authenticated loopback bridge and only accepts tasks whose `profileId` matches its configured profile.
- Every event includes protocol version, message/task/job/clip/profile IDs, unique Chrome instance ID and a timestamp.
- The service worker keeps a persistent event outbox and retries unacknowledged events after transient local-service failures.
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

## Reference extension findings applied

The supplied Veo Automation 2.0.1 package was inspected as an implementation reference. Its content script uses these Flow editor patterns:

- `div.ProseMirror[contenteditable="true"]`
- `flow-rich-text-editor [contenteditable="true"]`
- `[contenteditable="true"]` and `[role="textbox"]`

It also contains these Generate-control patterns:

- `button[aria-label="Start generation"]`
- `button.generate-icon-button[type="submit"]`
- a button containing an `arrow_forward` icon

The worker now prefers the observed rich-text editor patterns when identifying a unique prompt field, and the read-only diagnostic reports icon text where available so icon-only Generate/Download controls are easier to recognise. For contenteditable editors, prompt insertion now uses the browser editing-command path instead of directly replacing `textContent`; it deliberately avoids private React internals and DevTools Protocol input simulation.

These are reference-derived candidates, not guarantees that the current Flow UI/account uses them. The worker can use unique semantic auto-detection; explicitly verified custom selectors remain an optional override. The supplied extension's CDP drag/drop, debugger attachment and fallback click techniques have not been copied: they add permissions and complexity and should only be introduced if a specific, reproducible Flow requirement justifies them.

## Live Flow controls: reference-informed adapter

The supplied Veo Automation 2.0.1 ZIP is used as a technical reference, not imported or loaded as a dependency. Its Flow-specific interaction patterns are adapted in our own content/flow-controls.js module:

- Opens Flow's settings panel and selects Video mode when that control is exposed.
- Selects the requested aspect ratio, defaulting to the factory's vertical 9:16 format.
- Selects one output (x1) when the output-count control is exposed.
- Opens the model-family picker and selects a uniquely matched model option. The reference aliases for Nano Banana 2 and Omni Flash are retained.
- Selects the requested resolution from the visible 360p/720p/1080p-style radio options.
- Sets the duration slider when Flow exposes it. The reference UI's three-second slider offset is accounted for; models with fixed/no visible duration slider are explicitly reported as not exposed rather than falsely marked as changed.
- Uses the reference's ProseMirror prompt editor and icon-only Generate button patterns.
- Captures the existing data-media-id values immediately before submission, then waits for the newly created output tile rather than downloading an older video already in the project.
- Opens the new tile's More options menu and selects its Download action. The existing service worker still tracks the browser download and reports completion to the orchestrator.

The adapter uses DOM-visible controls and guarded matching. Ambiguous or missing controls stop the clip before Generate; it does not guess between multiple model, ratio, resolution, or download choices. The extension remains independent: no reference-extension code is installed, imported, or required. Its five-profile binding, local bridge, task/event protocol and download validation remain ours.

**Verification limitation:** these selectors and interactions are adapted from the supplied package and still require a controlled live test in each authorised Flow account. In particular, the current Flow UI may change its DOM, model availability, resolution options or duration behavior. A duration reported as model-fixed-or-not-exposed must be checked against the downloaded clip by the existing FFprobe validation before assembly.

## Protocol

## Project identity and task settings

The extension detects the Google Flow project ID from the signed-in tab URL and stores the most recently detected project in that Chrome profile's local extension storage (`lastFlowProject`). The background worker also records the profile ID, page title and detection timestamp. Project matching uses the Flow project ID rather than a raw URL string, so query parameters or a trailing slash do not make the same project look different. A task is never submitted when its assigned project ID differs from the open project.

Generation settings are read from the assigned task's `settings` object supplied by the desktop/orchestrator bridge: `model`, `resolution`, `durationSeconds`, and optionally `aspectRatio`. The extension does not silently substitute defaults. It verifies those requested values against configured selectors or uniquely detected selected/checked UI values and refuses submission if a required value is missing or differs. Each Chrome profile keeps its own selector configuration and saved project detection state.

The worker expects the local API routes:

- `POST /api/v1/extension/register`
- `GET /api/v1/extension/next-task?profile_id=flow-N`
- `POST /api/v1/extension/events`

Required header: `X-ASMR-Bridge-Token`. Task polling and command polling also include the unique `instance_id`; the server rejects a different extension instance even if it has been misconfigured with the same profile ID.

Task identity is always the tuple `(profileId, taskId, jobId, clipId)`. Never route an event or downloaded file using only a prompt or tab title.

## Verification status

The extension package, profile-instance binding, local bridge, task dispatch, persistent event outbox, selector configuration and selected-setting verification logic are implemented. Automatic Flow DOM control detection and selected-value matching still require a controlled browser test with an authorised account. Prompt submission stays blocked unless the controls are unique and the selected model/resolution/duration values visibly match the requested settings. Do not mark a clip ready based on a Generate click or a video element alone; the orchestrator must validate the completed download with FFprobe before downstream processing.


## Command semantics and safety

- `OPEN_PROJECT`: reopen the task's exact saved project URL in the matching profile.
- `SUBMIT_PROMPT`: re-run the guarded prompt workflow; duplicate prompt/generation checks still apply.
- `CHECK_STATUS`: report the currently detected page state.
- `DOWNLOAD_VIDEO`: invoke the configured download control, with per-task duplicate-click protection.
- `PAUSE` / `RESUME`: pause or resume extension-side monitoring/workflow.
- `CANCEL`: cancel the extension-side task and stop its monitoring.

Pause/cancel do not claim to stop a generation that Google Flow has already accepted. The extension will only use a Flow-native cancel control after that control has been inspected and explicitly implemented. No authentication, CAPTCHA or account restrictions are bypassed.


## Read-only live DOM diagnostic

1. Open the intended Google Flow project in the same Chrome profile.
2. Wait for the Flow interface to finish rendering.
3. Open the extension's **Details → Extension options** page.
4. Select the intended project under **Flow tab in this Chrome profile**, then choose **Scan selected Flow tab**.
5. Review the prompt candidates, Generate candidates, download candidates, settings controls and video metadata.
6. Select **Copy diagnostic JSON** and share that report for selector review.

The scan is read-only. It does not click controls, change settings, submit prompts, or read the value/text entered into prompt fields. Suggested CSS selectors include a confidence level; structural selectors are fragile. A diagnostic scan does not mark selectors verified or enable automation. Review the current page and test selectors against the live account before enabling task execution.
