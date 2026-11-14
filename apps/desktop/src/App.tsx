import { useEffect, useState } from "react";

type Clip = { id: string; subject: string; prompt: string; status: string; order: number };
type Job = { id: string; topic: string; theme: string; status: string; created_at: string; clips: Clip[]; final_video?: { output_path: string; duration_seconds: number; width: number; height: number; size_bytes: number; created_at: string; social_metadata?: { title: string; caption: string; description: string; hashtags: string[]; source: string } } | null };
type FlowProfile = { profile_id: string; display_name: string; project_url: string; configured: boolean; browser_open: boolean; extension_connected?: boolean };
type LibraryVideo = { job_id: string; output_path: string; duration_seconds: number; width: number; height: number; size_bytes: number; created_at: string; topic: string; theme: string; status: string };
type FacebookStatus = { configured: boolean; connected?: boolean; page_name?: string; message?: string; account_id?: string; label?: string };
type FacebookAccount = { account_id: string; label: string; page_id: string; page_name: string; is_active: boolean; created_at?: string };
type FacebookPublication = { status: string; video_id?: string | null; post_id?: string | null; error?: string | null; created_at?: string };
type FlowAutomationStatus = { profiles: { profile_id: string; registered: boolean; last_seen: string | null; extension_version: string | null }[]; registered_count: number; tasks: { task_id: string; job_id: string; clip_id: string; profile_id: string; status: string; updated_at: string; last_error: string | null; download_path: string | null }[] };

const API = "http://127.0.0.1:8765/api/v1";
const WEEKLY_ROTATION = ["fruits", "soaps", "clay", "kinetic_sand", "slime", "satisfying_objects", "mixed_asmr"];
const todaysTheme = () => WEEKLY_ROTATION[(new Date().getDay() + 6) % 7];
const THEMES = [
  { value: "fruits", label: "Fruits", emoji: "🍉" },
  { value: "soaps", label: "Soaps", emoji: "🧼" },
  { value: "clay", label: "Clay", emoji: "🟣" },
  { value: "kinetic_sand", label: "Kinetic Sand", emoji: "🏖️" },
  { value: "slime", label: "Slime", emoji: "🫧" },
  { value: "satisfying_objects", label: "Satisfying Objects / Materials", emoji: "🧊" },
  { value: "mixed_asmr", label: "Mixed ASMR", emoji: "✨" },
];


function PromptEditor({ clip, locked, onSave }: { clip: Clip; locked: boolean; onSave: (value: string) => void }) {
  const [value, setValue] = useState(clip.prompt);
  useEffect(() => setValue(clip.prompt), [clip.prompt]);
  return <div className="prompt-card">
    <div className="clip-top"><span>CLIP 0{clip.order}</span><span>{clip.status.replaceAll("_"," ")}</span></div>
    <b>{clip.subject}</b>
    <textarea value={value} onChange={e=>setValue(e.target.value)} placeholder="Generate prompts to begin…" disabled={locked}/>
    <button className="prompt-save" disabled={locked || value.trim().length<40 || value===clip.prompt} onClick={()=>onSave(value)}>Save edit</button>
  </div>;
}

export default function App() {
  const [activePage, setActivePage] = useState<"home" | "prompts" | "accounts" | "library" | "settings">("home");
  const [topic, setTopic] = useState("");
  const [theme, setTheme] = useState(todaysTheme());
  const [flowSettings, setFlowSettings] = useState({ model: "Veo 3.1 Lite", resolution: "720p", duration_seconds: 8, aspect_ratio: "9:16" });
  const [savingFlowSettings, setSavingFlowSettings] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [library, setLibrary] = useState<LibraryVideo[]>([]);
  const [flowProfiles, setFlowProfiles] = useState<FlowProfile[]>([]);
  const [bridgeToken, setBridgeToken] = useState("");
  const [flowAutomation, setFlowAutomation] = useState<FlowAutomationStatus>({ profiles: [], registered_count: 0, tasks: [] });
  const [dispatching, setDispatching] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [selected, setSelected] = useState<Job | null>(null);
  const [health, setHealth] = useState<"checking" | "online" | "offline">("checking");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Today’s scheduled ASMR style: " + (THEMES.find(x => x.value === todaysTheme())?.label || "Fruits") + ".");
  const [generating, setGenerating] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiModel, setAiModel] = useState("gemini-2.0-flash");
  const [aiBaseUrl, setAiBaseUrl] = useState("https://generativelanguage.googleapis.com/v1beta/openai");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiKeySaved, setAiKeySaved] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [verifyingAi, setVerifyingAi] = useState(false);
  const [aiVerifyMessage, setAiVerifyMessage] = useState("");
  const [showAiSetup, setShowAiSetup] = useState(false);
  const [styleBible, setStyleBible] = useState("");
  const [facebookStatus, setFacebookStatus] = useState<FacebookStatus>({ configured: false });
  const [facebookAccounts, setFacebookAccounts] = useState<FacebookAccount[]>([]);
  const [showAddFacebook, setShowAddFacebook] = useState(false);
  const [facebookAccountLabel, setFacebookAccountLabel] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [facebookPageToken, setFacebookPageToken] = useState("");
  const [savingFacebookAccount, setSavingFacebookAccount] = useState(false);
  const [facebookPublication, setFacebookPublication] = useState<FacebookPublication | null>(null);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoCaption, setSeoCaption] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoHashtags, setSeoHashtags] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [autoAssemblyAttempted, setAutoAssemblyAttempted] = useState<Set<string>>(new Set());

  async function refresh() {
    try {
      const h = await fetch(`${API}/health`);
      if (!h.ok) throw new Error("Service unavailable");
      setHealth("online");
      const response = await fetch(`${API}/jobs`);
      const data = await response.json();
      setJobs(data.jobs ?? []);
      const libraryResponse = await fetch(API + "/library");
      if (libraryResponse.ok) setLibrary((await libraryResponse.json()).videos ?? []);
      const profilesResponse = await fetch(`${API}/flow/profiles`);
      if (profilesResponse.ok) {
        const profilesData = await profilesResponse.json();
        const pairingResponse = await fetch(`${API}/extension/desktop-config`);
        let extensionByProfile: Record<string, boolean> = {};
        if (pairingResponse.ok) {
          const pairing = await pairingResponse.json();
          setBridgeToken(pairing.bridgeToken || "");
          extensionByProfile = Object.fromEntries((pairing.profiles || []).map((p: any) => [p.profileId, Boolean(p.connected)]));
        }
        setFlowProfiles((profilesData.profiles ?? []).map((p: FlowProfile) => ({ ...p, extension_connected: extensionByProfile[p.profile_id] || false })));
      }
      const automationResponse = await fetch(`${API}/flow/automation/status`);
      if (automationResponse.ok) setFlowAutomation(await automationResponse.json());
      if (selected) {
        const updated = (data.jobs ?? []).find((j: Job) => j.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch {
      setHealth("offline");
    }
  }

  useEffect(() => { refresh(); loadFacebookAccounts(); fetch(API + "/settings/flow").then(r=>r.json()).then(d=>setFlowSettings({model:d.model || "Veo 3.1 Lite",resolution:d.resolution || "720p",duration_seconds:d.duration_seconds || 8,aspect_ratio:d.aspect_ratio || "9:16"})).catch(()=>{}); fetch(API + "/style-bible").then(r=>r.json()).then(d=>setStyleBible(d.content || "")).catch(()=>{}); fetch(API + "/settings/ai").then(r=>r.json()).then(d=>{setAiConfigured(Boolean(d.configured));setAiProvider(d.provider || "gemini");setAiModel(d.model || "gemini-2.0-flash");setAiBaseUrl(d.base_url || "https://generativelanguage.googleapis.com/v1beta/openai");setAiKeySaved(Boolean(d.key_saved));}).catch(()=>{}); const timer = window.setInterval(refresh, 4000); return () => window.clearInterval(timer); }, []);


  async function saveFlowSettings() {
    setSavingFlowSettings(true);
    try {
      const response = await fetch(API + "/settings/flow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(flowSettings) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save Flow settings");
      setFlowSettings({ model: data.model, resolution: data.resolution, duration_seconds: data.duration_seconds, aspect_ratio: data.aspect_ratio });
      setNotice("Flow generation settings saved. All new tasks will use these values and verify them in Google Flow.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save Flow settings."); }
    finally { setSavingFlowSettings(false); }
  }

  async function saveFlowProfile(profile: FlowProfile) {
    try {
      const response = await fetch(`${API}/flow/profiles/${profile.profile_id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: profile.display_name, project_url: profile.project_url })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save Flow account");
      setNotice(profile.display_name + " project URL saved.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save Flow account."); }
  }

  async function openFlowProfile(profile: FlowProfile) {
    try {
      const response = await fetch(`${API}/flow/profiles/${profile.profile_id}/open`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not open Chrome profile");
      setNotice(data.profile.login_required
        ? profile.display_name + " opened. Sign in to Google once in that Chrome window; the session will be reused."
        : profile.display_name + " opened its saved Google Flow project.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open Chrome profile."); }
  }

  async function copyBridgeToken() {
    try {
      await navigator.clipboard.writeText(bridgeToken);
      setNotice("Extension bridge token copied. Paste it into the options page in each Chrome profile.");
    } catch {
      setNotice("Clipboard access was unavailable. Copy the token from the field manually.");
    }
  }

  async function createJob() {
    if (!topic.trim()) { setNotice("Enter a topic first."); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), theme })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not create job");
      setTopic("");
      setSelected(data.job);
      setNotice("Draft " + (THEMES.find(t => t.value === theme)?.label || theme) + " job created with five clip tasks.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Backend is not running. Start the local service.");
    } finally { setBusy(false); }
  }


  async function generatePrompts(job: Job) {
    setGenerating(true);
    try {
      const response = await fetch(API + "/jobs/" + job.id + "/generate-prompts", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Prompt generation failed");
      setSelected(data.job);
      setNotice("Five prompts created using " + data.source + ". Review and edit them below.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Prompt generation failed."); }
    finally { setGenerating(false); }
  }

  async function savePrompt(job: Job, clip: Clip, prompt: string) {
    try {
      const response = await fetch(API + "/jobs/" + job.id + "/clips/" + clip.id + "/prompt", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save prompt");
      setSelected(data.job); setNotice(clip.subject + " prompt saved."); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save prompt."); }
  }

  async function approvePrompts(job: Job) {
    try {
      const response = await fetch(API + "/jobs/" + job.id + "/approve-prompts", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Prompt approval failed");
      setSelected(data.job); setNotice("All five prompts approved and locked."); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not approve prompts."); }
  }

  async function dispatchFlowJob(job: Job) {
    setDispatching(true);
    try {
      const response = await fetch(`${API}/extension/dispatch/${job.id}`, { method: "POST", headers: { "X-ASMR-Bridge-Token": bridgeToken } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not dispatch Flow tasks");
      setNotice(`Dispatched ${data.dispatched} clips across five independent Flow accounts. The extension workers will pick them up.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not dispatch Flow tasks.");
    } finally { setDispatching(false); }
  }

  async function startAutomaticProduction(job: Job) {
    if (flowProfiles.filter(p=>p.configured).length !== 5) {
      setNotice("Save all five Google Flow project URLs first.");
      return;
    }
    if (flowAutomation.tasks.some(t=>t.job_id===job.id)) {
      setNotice("This job already has Flow tasks. Use the per-clip retry action for failed clips.");
      return;
    }
    setDispatching(true);
    try {
      setNotice("Opening Chrome profiles 01–05 and their saved Flow projects…");
      const opened = await fetch(API + "/flow/profiles/open-all", { method: "POST" });
      const openedData = await opened.json();
      if (!opened.ok) {
        const detail = typeof openedData.detail === "string" ? openedData.detail : openedData.detail?.message || "Could not open all five Chrome profiles";
        throw new Error(detail);
      }
      const loginProfiles = (openedData.profiles || []).filter((p: any) => p.login_required);
      if (loginProfiles.length) {
        setNotice("Chrome 01–05 opened. Sign in to Google in these windows once; waiting for their extensions to connect…");
      } else {
        setNotice("Chrome 01–05 opened. Waiting for all five extension workers…");
      }

      let connected = 0;
      for (let attempt = 0; attempt < 30; attempt++) {
        const statusResponse = await fetch(API + "/flow/automation/status");
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          setFlowAutomation(statusData);
          connected = statusData.registered_count || 0;
          if (connected === 5) break;
        }
        if (attempt < 29) await new Promise(resolve => window.setTimeout(resolve, 2000));
      }
      if (connected !== 5) {
        await refresh();
        throw new Error("All five Chrome windows were opened, but only " + connected + "/5 extension workers connected within 60 seconds. Check that the extension is installed and enabled in profiles 01–05, and complete Google sign-in if requested. Then click Generate Video again.");
      }

      let current = job;
      if (!current.clips.every(c=>c.prompt.trim().length>=40)) {
        setNotice("All five workers connected. Generating the five unique prompts…");
        const generated = await fetch(API + "/jobs/" + job.id + "/generate-prompts", { method: "POST" });
        const generatedData = await generated.json();
        if (!generated.ok) throw new Error(generatedData.detail || "Prompt generation failed");
        current = generatedData.job;
        setSelected(current);
      }
      if (current.status !== "prompts_approved") {
        const approved = await fetch(API + "/jobs/" + job.id + "/approve-prompts", { method: "POST" });
        const approvedData = await approved.json();
        if (!approved.ok) throw new Error(approvedData.detail || "Automatic prompt approval failed");
        current = approvedData.job;
        setSelected(current);
      }
      setNotice("Dispatching one clip to each of Chrome profiles 01–05…");
      const dispatched = await fetch(API + "/extension/dispatch/" + job.id, { method: "POST", headers: { "X-ASMR-Bridge-Token": bridgeToken } });
      const dispatchData = await dispatched.json();
      if (!dispatched.ok) throw new Error(dispatchData.detail || "Flow dispatch failed");
      setSelected(current);
      setNotice("Production started: five Chrome profiles opened, five workers connected, and five prompts dispatched.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not start automatic production.");
      await refresh();
    } finally { setDispatching(false); }
  }

  async function sendFlowCommand(task: FlowAutomationStatus["tasks"][number], command: "PAUSE" | "RESUME" | "CANCEL") {
    try {
      const response = await fetch(API + "/extension/tasks/" + task.task_id + "/command", {
        method: "POST", headers: { "Content-Type": "application/json", "X-ASMR-Bridge-Token": bridgeToken },
        body: JSON.stringify({ command })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not send Flow command");
      setNotice(command + " command queued for " + task.profile_id + ". The extension confirms it after handling.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not send Flow command."); }
  }

  async function retryFlowTask(task: FlowAutomationStatus["tasks"][number]) {
    try {
      const response = await fetch(API + "/extension/tasks/" + task.task_id + "/retry", {
        method: "POST", headers: { "Content-Type": "application/json", "X-ASMR-Bridge-Token": bridgeToken }, body: JSON.stringify({})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not retry Flow task");
      setNotice("Retry queued on " + data.profileId + ". The matching Flow worker will pick it up.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not retry Flow task."); }
  }

  async function assembleJob(job: Job) {
    setAssembling(true);
    try {
      const response = await fetch(API + "/jobs/" + job.id + "/assemble", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Video assembly failed");
      setNotice(data.already_assembled ? "Final video is already in your library." : "Five clips validated and merged. Final video saved to the local library.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Video assembly failed.");
    }
    finally { setAssembling(false); }
  }

  async function loadFacebookAccounts() {
    try {
      const [accountsResponse, statusResponse] = await Promise.all([fetch(API + "/facebook/accounts"), fetch(API + "/facebook/status")]);
      if (accountsResponse.ok) setFacebookAccounts((await accountsResponse.json()).accounts || []);
      if (statusResponse.ok) setFacebookStatus(await statusResponse.json());
    } catch {}
  }

  async function addFacebookAccount() {
    setSavingFacebookAccount(true);
    try {
      const response = await fetch(API + "/facebook/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: facebookAccountLabel, page_id: facebookPageId, page_access_token: facebookPageToken })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not connect Facebook Page");
      setFacebookPageToken("");
      setFacebookPageId("");
      setFacebookAccountLabel("");
      setShowAddFacebook(false);
      setNotice(data.account.page_name + " connected and saved securely on this computer.");
      await loadFacebookAccounts();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not connect Facebook Page."); }
    finally { setSavingFacebookAccount(false); }
  }

  async function selectFacebookAccount(account: FacebookAccount) {
    try {
      const response = await fetch(API + "/facebook/accounts/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: account.account_id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not select Page");
      setNotice("Publishing Page changed to " + account.page_name + ".");
      await loadFacebookAccounts();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not select Page."); }
  }

  async function removeFacebookAccount(account: FacebookAccount) {
    if (!window.confirm("Remove " + account.page_name + " from this computer?")) return;
    try {
      const response = await fetch(API + "/facebook/accounts/" + account.account_id, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not remove Page");
      setNotice(account.page_name + " removed from saved accounts.");
      await loadFacebookAccounts();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not remove Page."); }
  }

  async function saveFacebookMetadata(job: Job) {
    try {
      const response = await fetch(API + "/jobs/" + job.id + "/facebook-metadata", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: seoTitle, caption: seoCaption, description: seoDescription, hashtags: seoHashtags.split(/\s+/).filter(Boolean) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save Facebook metadata");
      setNotice("Facebook title, caption, description and hashtags saved.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save Facebook metadata."); }
  }

  async function publishFacebook(job: Job) {
    setPublishing(true);
    try {
      const response = await fetch(API + "/jobs/" + job.id + "/publish-facebook", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Facebook publishing failed");
      setFacebookPublication(data.publication);
      setNotice("Meta accepted the Reel upload. Facebook is processing it; verify its final Page status before assuming it is live.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Facebook publishing failed."); }
    finally { setPublishing(false); }
  }

  async function verifyAiProvider() {
    setVerifyingAi(true);
    setAiVerifyMessage("");
    try {
      const response = await fetch(API + "/settings/ai/verify", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "AI provider verification failed");
      setAiVerifyMessage("✓ " + data.message + " (" + data.model + ")");
      setAiConfigured(true);
      setNotice("AI provider connection verified successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI provider verification failed.";
      setAiVerifyMessage("× " + message);
      setNotice(message);
    } finally { setVerifyingAi(false); }
  }

  async function saveAiProvider() {
    setSavingAi(true);
    try {
      const response = await fetch(API + "/settings/ai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: aiProvider, model: aiModel, base_url: aiBaseUrl, api_key: aiApiKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save AI provider");
      setAiApiKey("");
      setAiConfigured(Boolean(data.configured));
      setAiKeySaved(Boolean(data.key_saved));
      setAiProvider(data.provider || aiProvider);
      setAiModel(data.model || aiModel);
      setAiBaseUrl(data.base_url || aiBaseUrl);
      setNotice(data.configured ? "AI provider saved. Built-in prompt generation remains available as fallback." : "AI provider preferences saved. Add an API key later to enable AI generation.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save AI provider."); }
    finally { setSavingAi(false); }
  }

  async function saveStyleBible() {
    try {
      const response = await fetch(API + "/style-bible", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: styleBible }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save Style Bible");
      setStyleBible(data.content); setNotice("ASMR Style Bible saved for future jobs.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save Style Bible."); }
  }

  async function approveJob(job: Job) {
    try {
      const response = await fetch(`${API}/jobs/${job.id}/approve`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Approval failed");
      setSelected(data.job);
      setNotice("Prompts approved. Real AI prompt generation and Flow automation are not connected yet.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not approve job."); }
  }

  const active = selected ?? jobs[0] ?? null;

  useEffect(() => {
    if (!active || active.final_video || assembling || autoAssemblyAttempted.has(active.id)) return;
    const downloaded = flowAutomation.tasks.filter(t=>t.job_id===active.id && t.status==="downloaded").length;
    if (downloaded === 5) {
      setAutoAssemblyAttempted(current => new Set(current).add(active.id));
      assembleJob(active);
    }
  }, [active?.id, active?.final_video?.created_at, flowAutomation.tasks, assembling, autoAssemblyAttempted]);

  useEffect(() => {
    if (!active) { setFacebookPublication(null); return; }
    let stopped = false;
    const loadPublication = async () => {
      try {
        let response = await fetch(`${API}/jobs/${active.id}/facebook-publication`);
        let data = await response.json();
        if (!stopped && data.publication?.status === "processing") {
          const verified = await fetch(`${API}/jobs/${active.id}/facebook-publication/refresh`, { method: "POST" });
          if (verified.ok) data = await verified.json();
        }
        if (!stopped) setFacebookPublication(data.publication || null);
      } catch { if (!stopped) setFacebookPublication(null); }
    };
    loadPublication();
    const timer = window.setInterval(loadPublication, 20000);
    const meta = active.final_video?.social_metadata;
    if (meta) { setSeoTitle(meta.title || ""); setSeoCaption(meta.caption || ""); setSeoDescription(meta.description || ""); setSeoHashtags((meta.hashtags || []).join(" ")); }
    return () => { stopped = true; window.clearInterval(timer); };
  }, [active?.id, active?.final_video?.created_at]);

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">A</div><div><b>ASMR FACTORY</b><small>CREATOR WORKSPACE</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <button className={activePage==="home" ? "nav-item active" : "nav-item"} onClick={()=>setActivePage("home")}><span>▦</span> Home</button>
      <button className={activePage==="prompts" ? "nav-item active" : "nav-item"} onClick={()=>setActivePage("prompts")}><span>✦</span> Prompt Studio <em>AI DIRECTOR</em></button>
      <button className={activePage==="library" ? "nav-item active" : "nav-item"} onClick={()=>setActivePage("library")}><span>▤</span> Video Library</button>
      <button className={activePage==="accounts" ? "nav-item active" : "nav-item"} onClick={()=>setActivePage("accounts")}><span>◉</span> Accounts</button>
      <div className="nav-label second">SYSTEM</div>
      <button className={activePage==="settings" ? "nav-item active" : "nav-item"} onClick={()=>setActivePage("settings")}><span>⚙</span> Settings</button>
      <div className="sidebar-bottom"><div className="service-dot" data-state={health}></div><div><b>Local service</b><small>{health === "online" ? "Connected" : health === "offline" ? "Not running" : "Checking…"}</small></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div><span className="crumb">Workspace</span><span className="slash">/</span><b>{({home:"Home",prompts:"Prompt Studio",accounts:"Accounts",library:"Video Library",settings:"Settings"})[activePage]}</b></div><div className="top-right"><span className="mode">LOCAL WORKSPACE</span><div className="avatar">AS</div></div></header>
      {activePage === "home" && <>
      <section className="welcome"><div><div className="eyebrow">YOUR AUTOMATED VIDEO WORKSHOP</div><h1>Make something <span>satisfying.</span></h1><p>Plan, generate and publish your ASMR videos from one place.</p></div><div className="welcome-art"><div className="orb orb-one"></div><div className="orb orb-two"></div><div className="orb-core">✦</div></div></section>

      <section className="stats">
        <div className="stat-card"><small>TOTAL JOBS</small><strong>{jobs.length.toString().padStart(2,"0")}</strong><span>Saved locally</span></div>
        <div className="stat-card"><small>CLIPS PLANNED</small><strong>{jobs.reduce((n,j)=>n+j.clips.length,0).toString().padStart(2,"0")}</strong><span>Across all jobs</span></div>
        <div className="stat-card"><small>COMPLETED VIDEOS</small><strong>{jobs.filter(j=>Boolean(j.final_video)).length.toString().padStart(2,"0")}</strong><span>Saved in local library</span></div>
        <div className="stat-card"><small>FLOW SESSIONS</small><strong>05</strong><span>Target capacity</span></div>
      </section>
      </>}
      {(activePage === "home" || activePage === "accounts") && <div className="content-grid">
        {activePage === "home" && <section className="panel create-panel">
          <div className="panel-head"><div><div className="eyebrow">NEW PRODUCTION</div><h2>Create a video job</h2></div><span className="step-tag">STEP 01 / 05</span></div>
          <label htmlFor="topic">WHAT SHOULD WE CREATE?</label>
          <input id="topic" value={topic} onChange={e=>setTopic(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createJob()} placeholder="e.g. tropical fruit cutting" />
          <label htmlFor="theme">GENERATION STYLE · 7 AVAILABLE</label>
          <select id="theme" className="theme-select" value={theme} onChange={e=>setTheme(e.target.value)}>{THEMES.map(t=><option key={t.value} value={t.value}>{t.emoji}  {t.label}</option>)}</select>
          <div className="style-hint">Scheduled today: {THEMES.find(t => t.value === todaysTheme())?.label} · five different subjects · {flowSettings.duration_seconds} seconds each</div>
          <div className="settings-row"><div><small>MODEL</small><b>{flowSettings.model}</b></div><div><small>QUALITY</small><b>{flowSettings.resolution}</b></div><div><small>DURATION</small><b>{flowSettings.duration_seconds} seconds</b></div></div>
          <button className="primary" onClick={createJob} disabled={busy || health!=="online"}>{busy ? "Creating job…" : "＋  Create production job"}</button>
          <p className="helper">Creates a saved five-clip plan. Flow settings are checked when the five browser tasks start.</p>
        </section>}
        {activePage === "accounts" && <section className="panel session-panel">
          <div className="panel-head"><div><div className="eyebrow">BROWSER CONNECTIONS</div><h2>Flow sessions</h2></div><span className="count-pill">{flowAutomation.registered_count} / 5 WORKERS</span></div>
          <p className="muted">Each session will use its own signed-in Google account and saved Flow project.</p>
          {flowProfiles.map((profile,i)=><div className="session-row flow-account-row" key={profile.profile_id}>
            <div className="session-number">{i+1}</div>
            <div className="flow-account-fields">
              <b>{profile.display_name}</b>
              <input className="flow-url-input" value={profile.project_url} onChange={e=>setFlowProfiles(current=>current.map(p=>p.profile_id===profile.profile_id?{...p,project_url:e.target.value}:p))} placeholder="Paste this account's Flow project URL" />
              <small>{profile.extension_connected ? "Extension connected" : profile.browser_open ? "Chrome open · extension not connected" : profile.configured ? "Project saved · Chrome closed" : "Not configured"}</small>
            </div>
            <div className="flow-account-actions">
              <button className="secondary compact" onClick={()=>saveFlowProfile(profile)} disabled={!profile.project_url.trim()}>Save</button>
              <button className="secondary compact" onClick={()=>openFlowProfile(profile)} disabled={!profile.configured && !profile.project_url.trim()}>Open</button>
            </div>
          </div>)}
          <div className="session-foot">Five isolated Chrome profiles · saved Google sessions are reused · first sign-in is done once per profile.</div>
          <div className="ai-account-panel">
            <div className="ai-account-heading">
              <div className="ai-provider-icon">✦</div>
              <div className="ai-provider-summary"><b>AI generation</b><small>{aiKeySaved ? (aiConfigured ? "Your AI provider is connected and ready." : "API key saved · verify the connection to finish setup.") : "Optional · built-in generation works without connecting an AI account."}</small></div>
              <span className={aiConfigured ? "ai-status connected" : "ai-status"}>{aiConfigured ? "CONNECTED" : aiKeySaved ? "VERIFY" : "OPTIONAL"}</span>
            </div>
            {!showAiSetup ? <div className="ai-provider-collapsed">
              <span>{aiKeySaved ? (aiProvider === "gemini" ? "Google Gemini" : "OpenAI-compatible provider") + " · " + aiModel : "No AI account added yet"}</span>
              <button className="secondary compact" onClick={()=>setShowAiSetup(true)}>{aiKeySaved ? "Manage account" : "＋ Add AI account"}</button>
            </div> : <div className="ai-setup">
              <div className="ai-setup-title"><b>{aiKeySaved ? "Manage AI account" : "Connect an AI provider"}</b><small>Choose a provider and add its API key. You can do this later.</small></div>
              <label>AI PROVIDER<select value={aiProvider} onChange={e=>{setAiProvider(e.target.value);setAiBaseUrl(e.target.value==="gemini"?"https://generativelanguage.googleapis.com/v1beta/openai":"https://api.openai.com/v1");setAiModel(e.target.value==="gemini"?"gemini-2.0-flash":"gpt-4o-mini");setAiVerifyMessage("");}}><option value="gemini">Google Gemini</option><option value="openai-compatible">OpenAI-compatible</option></select></label>
              <label>API KEY<input type="password" autoComplete="off" value={aiApiKey} onChange={e=>setAiApiKey(e.target.value)} placeholder={aiKeySaved ? "Key saved securely · paste only to replace" : "Paste your API key here"} /></label>
              <details className="ai-advanced"><summary>Advanced settings</summary>
                <label>MODEL NAME<input value={aiModel} onChange={e=>setAiModel(e.target.value)} placeholder="Model name"/></label>
                <label>API BASE URL<input value={aiBaseUrl} onChange={e=>setAiBaseUrl(e.target.value)} /></label>
              </details>
              <div className="ai-setup-actions">
                <button className="secondary compact" onClick={()=>{setShowAiSetup(false);setAiApiKey("");setAiVerifyMessage("");}}>Cancel</button>
                <button className="primary compact" onClick={saveAiProvider} disabled={savingAi || !aiModel.trim() || (!aiKeySaved && !aiApiKey.trim())}>{savingAi ? "Saving securely…" : "Save account"}</button>
                <button className="secondary compact" onClick={verifyAiProvider} disabled={verifyingAi || !aiKeySaved}>{verifyingAi ? "Checking…" : "Verify"}</button>
              </div>
              {aiVerifyMessage && <div className={aiVerifyMessage.startsWith("✓") ? "ai-verify-message success" : "ai-verify-message error"}>{aiVerifyMessage}</div>}
              <p className="ai-privacy-note">Your API key is stored securely on this computer. It is never displayed again after saving.</p>
            </div>}
          </div>

          <div className="extension-pairing">
            <div><b>Chrome extension bridge</b><small>Paste this token into the extension options in all five profiles. Each profile must use its matching flow-1 … flow-5 ID.</small></div>
            <input value={bridgeToken} readOnly type="password" aria-label="Extension bridge token" />
            <button className="secondary compact" onClick={copyBridgeToken} disabled={!bridgeToken}>Copy pairing token</button>
          </div>
        </section>}
        {activePage === "accounts" && <section className="panel facebook-accounts-page">
          <div className="panel-head"><div><div className="eyebrow">PUBLISHING DESTINATIONS</div><h2>Facebook Pages</h2></div><button className="secondary compact" onClick={()=>setShowAddFacebook(v=>!v)}>{showAddFacebook ? "Close" : "＋ Add Page"}</button></div>
          <p className="muted">Connect the Facebook Pages that can publish your finished Reels. Page tokens are stored in the computer's secure credential vault.</p>
          {facebookAccounts.length === 0 && <div className="facebook-empty-account">No Facebook Pages connected yet. Add a Page to enable publishing after video assembly.</div>}
          {facebookAccounts.map(account=><div className={account.is_active ? "facebook-account active" : "facebook-account"} key={account.account_id}>
            <div className="facebook-account-avatar">f</div><div className="facebook-account-details"><b>{account.label}</b><span>{account.page_name} · ID {account.page_id}</span><small>{account.is_active ? "Selected for publishing" : "Connected"}</small></div>
            {!account.is_active && <button className="secondary compact" onClick={()=>selectFacebookAccount(account)}>Use Page</button>}
            <button className="account-remove" title="Remove account" onClick={()=>removeFacebookAccount(account)}>×</button>
          </div>)}
          {showAddFacebook && <div className="facebook-add-form">
            <div><b>Add a Facebook Page</b><small>Enter the Page ID and a Page access token with publishing permission. The token is verified before saving.</small></div>
            <label>ACCOUNT LABEL</label><input value={facebookAccountLabel} onChange={e=>setFacebookAccountLabel(e.target.value)} placeholder="e.g. Main ASMR Page"/>
            <label>FACEBOOK PAGE ID</label><input value={facebookPageId} onChange={e=>setFacebookPageId(e.target.value)} placeholder="Enter Page ID"/>
            <label>PAGE ACCESS TOKEN</label><input type="password" autoComplete="off" value={facebookPageToken} onChange={e=>setFacebookPageToken(e.target.value)} placeholder="Paste Page access token"/>
            <button className="primary" disabled={savingFacebookAccount || !facebookAccountLabel.trim() || !facebookPageId.trim() || facebookPageToken.trim().length<20} onClick={addFacebookAccount}>{savingFacebookAccount ? "Verifying with Meta…" : "Connect Page"}</button>
          </div>}
          <div className="facebook-account-footer"><span>{facebookStatus.connected ? "Publishing destination ready: " + (facebookStatus.page_name || "selected Page") : facebookStatus.message || "Select a connected Page for publishing."}</span></div>
        </section>}
      </div>}

      {activePage === "library" && <section className="panel jobs-panel">
        <div className="panel-head"><div><div className="eyebrow">FINISHED PRODUCTIONS</div><h2>Video Library</h2></div><span className="count-pill">{library.length} VIDEOS</span></div>
        {library.length===0 ? <div className="empty"><div className="empty-icon">▣</div><b>No finished videos yet</b><span>Once five Flow downloads pass validation and merge, they will appear here.</span></div> :
          <div className="job-list">{library.map(video=><div className="job-row library-row" key={video.job_id}><video className="library-preview" controls preload="metadata" src={API + "/jobs/" + video.job_id + "/output/file"} /><div className="job-info"><b>{video.topic}</b><small>{Math.round(video.duration_seconds)}s · {video.width}×{video.height} · {(video.size_bytes/1024/1024).toFixed(1)} MB</small><small>{video.output_path}</small><a href={API + "/jobs/" + video.job_id + "/output/file"} download>Download MP4</a></div><span className="job-state">READY</span></div>)}</div>}
      </section>}

      {activePage === "home" && <section className="panel jobs-panel">
        <div className="panel-head"><div><div className="eyebrow">PRODUCTION HISTORY</div><h2>Recent jobs</h2></div><span className="count-pill">{jobs.length} JOBS</span></div>
        {jobs.length===0 ? <div className="empty"><div className="empty-icon">▤</div><b>No productions yet</b><span>Your created jobs will appear here.</span></div> :
          <div className="job-list">{jobs.map(job=><button className={active?.id===job.id?"job-row chosen":"job-row"} key={job.id} onClick={()=>{setSelected(job);setActivePage("prompts");}}><div className="job-thumb">🍓</div><div className="job-info"><b>{job.topic}</b><small>{new Date(job.created_at).toLocaleString()} · {job.clips.length} clip tasks</small></div><span className="job-state">{job.status.replaceAll("_"," ")}</span><span className="arrow">›</span></button>)}</div>}
      </section>}

      {activePage === "prompts" && active && <section className="panel detail-panel">
        <div className="panel-head"><div><div className="eyebrow">AI DIRECTOR · PROMPT STUDIO</div><h2>{active.topic}</h2></div><span className="count-pill">{active.status.replaceAll("_"," ")}</span></div>
        <div className="director-toolbar"><div><b>Five-clip prompt pack</b><small>{aiConfigured ? "AI provider configured" : "Built-in prompt composer · no API key required"}</small></div><button className="primary compact" disabled={generating || active.status==="prompts_approved"} onClick={()=>generatePrompts(active)}>{generating ? "Creating prompts…" : active.clips.some(c=>c.prompt) ? "Regenerate five prompts" : "✦ Generate five prompts"}</button></div>
        <div className="prompt-grid">{active.clips.map(clip=><PromptEditor key={clip.id} clip={clip} locked={active.status==="prompts_approved"} onSave={(value)=>savePrompt(active,clip,value)}/>)}</div>
        {active.clips.every(c=>c.prompt.length>=40) && active.status!=="prompts_approved" && <button className="secondary" onClick={()=>approvePrompts(active)}>Approve all five prompts</button>}
        {["draft","prompts_ready"].includes(active.status) && <div className="dispatch-toolbar">
          <div><b>Automatic five-account production</b><small>Generate missing prompts, approve the pack and dispatch all five clips without a manual preview step.</small></div>
          <button className="primary compact" disabled={dispatching || flowProfiles.filter(p=>p.configured).length!==5} onClick={()=>startAutomaticProduction(active)}>{dispatching ? "Opening browsers…" : "Generate Video · Open 01–05"}</button>
        </div>}
        {["prompts_approved","running","media_ready"].includes(active.status) && <>
          <div className="approved-note">✓ Prompt pack approved.</div>
          <div className="dispatch-toolbar">
            <div><b>Google Flow task queue</b><small>Chrome profiles 01–05 open automatically · {flowProfiles.filter(p=>p.extension_connected).length}/5 extension workers connected · {flowAutomation.tasks.filter(t=>t.job_id===active.id).length}/5 tasks dispatched</small></div>
            <button className="primary compact" disabled={dispatching || flowAutomation.registered_count!==5 || flowAutomation.tasks.some(t=>t.job_id===active.id)} onClick={()=>startAutomaticProduction(active)}>{dispatching ? "Starting production…" : "Start automatic production"}</button>
          </div>
          {flowAutomation.tasks.filter(t=>t.job_id===active.id).length>0 && <div className="flow-task-list">{flowAutomation.tasks.filter(t=>t.job_id===active.id).map(task=><div className="flow-task-row" key={task.task_id}><span>{task.profile_id}</span><b>{task.status.replaceAll("_"," ")}</b><small>{task.last_error || task.download_path || task.updated_at}</small>{["failed","blocked_ui","blocked_settings","needs_login","cancelled"].includes(task.status) && <button className="secondary compact" onClick={()=>retryFlowTask(task)}>Retry</button>}{["leased","project_open","submitted","generating","generation_completed","downloading"].includes(task.status) && <button className="secondary compact" onClick={()=>sendFlowCommand(task,"PAUSE")}>Pause</button>}{task.status==="paused" && <button className="secondary compact" onClick={()=>sendFlowCommand(task,"RESUME")}>Resume</button>}{!["downloaded","failed","cancelled"].includes(task.status) && <button className="secondary compact" onClick={()=>sendFlowCommand(task,"CANCEL")}>Cancel</button>}</div>)}</div>}
          {flowAutomation.tasks.filter(t=>t.job_id===active.id && t.status==="downloaded").length===5 && !active.final_video && <button className="primary compact" disabled={assembling} onClick={()=>assembleJob(active)}>{assembling ? "Validating and merging…" : "Merge five downloaded clips"}</button>}
          {active.final_video && <div className="facebook-publish-panel">
            <div className="panel-head"><div><div className="eyebrow">FACEBOOK REELS · SEO</div><h3>Publish finished video</h3></div><span className="count-pill">{facebookStatus.connected ? "PAGE CONNECTED" : "NOT CONNECTED"}</span></div>
            <div className="facebook-account-manager">
              <div className="facebook-account-heading"><div><b>Connected Pages</b><small>Manage the Pages that can publish Reels from this computer.</small></div><button className="secondary compact" onClick={()=>setShowAddFacebook(v=>!v)}>{showAddFacebook ? "Close" : "＋ Add account"}</button></div>
              {facebookAccounts.length === 0 && <div className="facebook-empty-account">No Facebook Pages added yet. Add a Page ID and Page access token to connect your first account.</div>}
              {facebookAccounts.map(account=><div className={account.is_active ? "facebook-account active" : "facebook-account"} key={account.account_id}>
                <div className="facebook-account-avatar">f</div><div className="facebook-account-details"><b>{account.label}</b><span>{account.page_name} · ID {account.page_id}</span><small>{account.is_active ? "Selected for publishing" : "Connected"}</small></div>
                {!account.is_active && <button className="secondary compact" onClick={()=>selectFacebookAccount(account)}>Use Page</button>}
                <button className="account-remove" title="Remove account" onClick={()=>removeFacebookAccount(account)}>×</button>
              </div>)}
              {showAddFacebook && <div className="facebook-add-form">
                <div><b>Add a Facebook Page</b><small>Use a Page access token with permission to publish content. Tokens are saved in your computer's secure credential vault.</small></div>
                <label>ACCOUNT LABEL</label><input value={facebookAccountLabel} onChange={e=>setFacebookAccountLabel(e.target.value)} placeholder="e.g. Main ASMR Page"/>
                <label>FACEBOOK PAGE ID</label><input value={facebookPageId} onChange={e=>setFacebookPageId(e.target.value)} placeholder="Enter Page ID"/>
                <label>PAGE ACCESS TOKEN</label><input type="password" autoComplete="off" value={facebookPageToken} onChange={e=>setFacebookPageToken(e.target.value)} placeholder="Paste Page access token"/>
                <button className="primary" disabled={savingFacebookAccount || !facebookAccountLabel.trim() || !facebookPageId.trim() || facebookPageToken.trim().length<20} onClick={addFacebookAccount}>{savingFacebookAccount ? "Verifying with Meta…" : "Connect account"}</button>
              </div>}
            </div>
            <p className="muted">{facebookStatus.connected ? "Ready to publish to " + (facebookStatus.page_name || "the selected Page") + "." : facebookStatus.message || "Add a Facebook Page account to enable publishing."}</p>
            <label>REEL TITLE</label><input value={seoTitle} maxLength={100} onChange={e=>setSeoTitle(e.target.value)}/>
            <label>CAPTION</label><textarea value={seoCaption} onChange={e=>setSeoCaption(e.target.value)}/>
            <label>DESCRIPTION</label><textarea value={seoDescription} onChange={e=>setSeoDescription(e.target.value)}/>
            <label>HASHTAGS</label><input value={seoHashtags} onChange={e=>setSeoHashtags(e.target.value)} placeholder="#ASMR #OddlySatisfying …"/>
            <div className="flow-account-actions">
              <button className="secondary compact" onClick={()=>saveFacebookMetadata(active)}>Save SEO metadata</button>
              <button className="primary compact" disabled={!facebookStatus.connected || publishing || Boolean(facebookPublication)} onClick={()=>publishFacebook(active)}>{publishing ? "Uploading Reel…" : facebookPublication ? "Upload " + facebookPublication.status : "Publish to Facebook Page"}</button>
            </div>
            {facebookPublication && <small>Publication status: {facebookPublication.status}{facebookPublication.video_id ? " · Meta video " + facebookPublication.video_id : ""}{facebookPublication.error ? " · " + facebookPublication.error : ""}</small>}
            <small>Duplicate protection is enabled: an accepted or uncertain upload cannot be submitted again automatically.</small>
          </div>}

        </>}
      </section>}
      {activePage === "prompts" && <section className="panel style-panel"><div className="panel-head"><div><div className="eyebrow">PERSISTENT CREATIVE RULES</div><h2>ASMR Style Bible</h2></div><span className="count-pill">SHARED ACROSS JOBS</span></div><p className="muted">Shared camera, lighting, texture and sound rules included in every prompt.</p><textarea className="style-editor" value={styleBible} onChange={e=>setStyleBible(e.target.value)}/><button className="secondary" onClick={saveStyleBible}>Save Style Bible</button></section>}

      {activePage === "settings" && <section className="panel settings-page">
        <div className="panel-head"><div><div className="eyebrow">WORKSPACE CONFIGURATION</div><h2>Production settings</h2></div><span className="count-pill">CURRENT DEFAULTS</span></div>
        <p className="muted">Set the values the extension must verify in each Google Flow account before it generates a clip.</p>
        <div className="settings-info">
          <label>VIDEO MODEL<input value={flowSettings.model} onChange={e=>setFlowSettings(v=>({...v,model:e.target.value}))} placeholder="Exact model label shown in Flow"/></label>
          <label>RESOLUTION<select value={flowSettings.resolution} onChange={e=>setFlowSettings(v=>({...v,resolution:e.target.value}))}><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
          <label>CLIP DURATION<select value={flowSettings.duration_seconds} onChange={e=>setFlowSettings(v=>({...v,duration_seconds:Number(e.target.value)}))}><option value={4}>4 seconds</option><option value={6}>6 seconds</option><option value={8}>8 seconds</option></select></label>
          <label>ASPECT RATIO<select value={flowSettings.aspect_ratio} onChange={e=>setFlowSettings(v=>({...v,aspect_ratio:e.target.value}))}><option value="9:16">9:16 vertical · Facebook Reels</option></select></label>
          <button className="primary compact" onClick={saveFlowSettings} disabled={savingFlowSettings}>{savingFlowSettings ? "Saving…" : "Save Flow settings"}</button>
        </div>
        <div className="settings-summary-grid"><div><small>CLIPS PER VIDEO</small><b>5</b></div><div><small>WEEKLY ROTATION</small><b>Monday–Sunday</b></div></div>
        <div className="settings-info"><b>Weekly ASMR style rotation</b><span>{THEMES.map((item,i)=>["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][i] + ": " + item.label).join(" · ")}</span></div>
        <div className="settings-info"><b>Local service</b><span>{health === "online" ? "Connected on this computer" : health === "offline" ? "Not connected · start the local service" : "Checking connection…"}</span><b>Media tools</b><span>FFmpeg and FFprobe are used by the local assembly pipeline. Availability is checked when assembly runs.</span><b>Credentials</b><span>AI and Facebook credentials are stored in the operating system credential vault, not in this settings screen.</span></div>
      </section>}
      <div className="notice">{notice}</div>
      <footer>ASMR FACTORY <span>·</span> EARLY DEVELOPMENT BUILD <span>·</span> LOCAL-FIRST</footer>
    </main>
  </div>;
}