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

These are reference-derived candidates, not guarantees that the current Flow UI/account uses them. The worker still requires an explicitly configured and verified selector before it submits anything. The supplied extension's CDP drag/drop, debugger attachment and fallback click techniques have not been copied: they add permissions and complexity and should only be introduced if a specific, reproducible Flow requirement justifies them.

## Live Flow selectors: deliberately unverified

The repository has no captured DOM fixture or verified live Google Flow selectors. The content script therefore runs in safe mode: it reports whether it can identify a unique prompt field but does not submit prompts or click Generate until the user has supplied selectors and explicitly marked them verified in that profile's options.

Model, quality, duration and aspect-ratio selection are not implemented as verified actions yet. The worker reports this limitation instead of pretending requested settings were applied.

## Protocol

The worker expects the local API routes:

- `POST /api/v1/extension/register`
- `GET /api/v1/extension/next-task?profile_id=flow-N`
- `POST /api/v1/extension/events`

Required header: `X-ASMR-Bridge-Token`. Task polling and command polling also include the unique `instance_id`; the server rejects a different extension instance even if it has been misconfigured with the same profile ID.

Task identity is always the tuple `(profileId, taskId, jobId, clipId)`. Never route an event or downloaded file using only a prompt or tab title.

## Verification status

The extension package, profile-instance binding, local bridge, task dispatch, persistent event outbox, selector configuration and selected-setting verification logic are implemented. Real Flow DOM selectors and selected-value elements still require a controlled browser test with an authorised account. Prompt submission stays blocked until the selectors are configured and the selected model/resolution/duration values visibly match the requested settings. Do not mark a clip ready based on a Generate click or a video element alone; the orchestrator must validate the completed download with FFprobe before downstream processing.


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
