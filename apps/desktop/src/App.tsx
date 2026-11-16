import { useEffect, useState } from "react";

type Clip = { id: string; subject: string; prompt: string; status: string; order: number };
type Job = { id: string; topic: string; theme: string; status: string; created_at: string; clips: Clip[]; final_video?: { output_path: string; duration_seconds: number; width: number; height: number; size_bytes: number; created_at: string; social_metadata?: { title: string; caption: string; description: string; hashtags: string[]; source: string } } | null };
type FlowProfile = { profile_id: string; display_name: string; project_url: string; configured: boolean; browser_open: boolean; extension_connected?: boolean };
type LibraryVideo = { job_id: string; output_path: string; duration_seconds: number; width: number; height: number; size_bytes: number; created_at: string; topic: string; theme: string; status: string };
type FacebookStatus = { configured: boolean; connected?: boolean; page_name?: string; message?: string; account_id?: string; label?: string };
type FacebookAccount = { account_id: string; label: string; page_id: string; page_name: string; is_active: boolean; created_at?: string };
type FacebookPublication = { status: string; video_id?: string | null; post_id?: string | null; error?: string | null; created_at?: string };
type DiagnosticLog = { id: number; source: string; level: string; message: string; profile_id?: string | null; task_id?: string | null; created_at: string };
type FlowAutomationStatus = { profiles: { profile_id: string; registered: boolean; last_seen: string | null; extension_version: string | null }[]; registered_count: number; tasks: { task_id: string; job_id: string; clip_id: string; profile_id: string; status: string; updated_at: string; last_error: string | null; download_path: string | null }[] };

const API = "http://127.0.0.1:8765/api/v1";
const THEMES = [
  { value: "fruits", label: "Fruits", emoji: "🍉" },
  { value: "soaps", label: "Soaps", emoji: "🧼" },
  { value: "clay", label: "Clay", emoji: "🟣" },
  { value: "kinetic_sand", label: "Kinetic Sand", emoji: "🏖️" },
  { value: "slime", label: "Slime", emoji: "🫧" },
  { value: "satisfying_objects", label: "Satisfying Objects / Materials", emoji: "🧊" },
  { value: "mixed_asmr", label: "Mixed ASMR", emoji: "✨" },
];


export default function App() {
  const [activePage, setActivePage] = useState<"home" | "prompts" | "accounts" | "library" | "settings" | "debug">("home");
  const [topic, setTopic] = useState("");
  const [theme, setTheme] = useState("fruits");
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
  const [notice, setNotice] = useState("Create a Fruits job to plan your first five clips.");
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
  const [autoAssemblyAttempted, setAutoAssemblyAttempted] = useState<Set<string>>(new Set());
  const [debugUpdatedAt, setDebugUpdatedAt] = useState(new Date().toISOString());
  const [debugFilter, setDebugFilter] = useState("all");
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLog[]>([]);

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
      // Diagnostics are optional: a logging endpoint failure must not mark the
      // orchestrator itself offline or interrupt the normal dashboard refresh.
      try {
        const diagnosticsResponse = await fetch(`${API}/extension/diagnostics/logs?limit=500`);
        if (diagnosticsResponse.ok) setDiagnosticLogs((await diagnosticsResponse.json()).logs ?? []);
      } catch {
        // Keep the last successfully loaded diagnostic entries.
      }
      setDebugUpdatedAt(new Date().toISOString());
      if (selected) {
        const updated = (data.jobs ?? []).find((j: Job) => j.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch {
      setHealth("offline");
    }
  }

  useEffect(() => { refresh(); loadFacebookAccounts(); fetch(API + "/style-bible").then(r=>r.json()).then(d=>setStyleBible(d.content || "")).catch(()=>{}); fetch(API + "/settings/ai").then(r=>r.json()).then(d=>{setAiConfigured(Boolean(d.configured));setAiProvider(d.provider || "gemini");setAiModel(d.model || "gemini-2.0-flash");setAiBaseUrl(d.base_url || "https://generativelanguage.googleapis.com/v1beta/openai");setAiKeySaved(Boolean(d.key_saved));}).catch(()=>{}); const timer = window.setInterval(refresh, 4000); return () => window.clearInterval(timer); }, []);

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
        : (data.profile.project_created
            ? profile.display_name + " created and saved its Google Flow project."
            : profile.display_name + " opened its saved Google Flow project."));
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
      setNotice("Job created. Starting the five-account production workflow…");
      await refresh();
      await startAutomaticProduction(data.job);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Backend is not running. Start the local service.");
    } finally { setBusy(false); }
  }


  async function startAutomaticProduction(job: Job, allowSupersededAttempt = false) {
    const previousTasks = flowAutomation.tasks.filter(t=>t.job_id===job.id);
    const terminalStatuses = ["superseded","cancelled","failed","blocked_ui","blocked_settings","needs_login","downloaded"];
    const reusableAttempt = allowSupersededAttempt && previousTasks.length > 0 &&
      previousTasks.every(t=>terminalStatuses.includes(t.status));
    if (previousTasks.length && !reusableAttempt) {
      setNotice("This job already has active Flow tasks. Wait for them to stop before starting another attempt.");
      return;
    }
    setDispatching(true);
    try {
      setNotice("Opening Chrome profiles 01–05 and generating prompts in parallel…");
      const openPromise = fetch(API + "/flow/profiles/open-all", { method: "POST" });
      const needsPrompts = !job.clips.every(c=>c.prompt.trim().length>=40);
      const promptPromise = needsPrompts
        ? fetch(API + "/jobs/" + job.id + "/generate-prompts", { method: "POST" })
        : Promise.resolve(null);
      const [openedResult, promptResult] = await Promise.allSettled([openPromise, promptPromise]);
      if (openedResult.status === "rejected") throw openedResult.reason;
      const openedResponse = openedResult.value;
      const openedData = await openedResponse.json();
      if (!openedResponse.ok) throw new Error(openedData.detail?.message || openedData.detail || "Could not open Chrome profiles");
      let loginProfiles = (openedData.profiles || []).filter((p: any) => p.login_required);
      let current = job;
      if (promptResult.status === "rejected") throw promptResult.reason;
      if (promptResult.value) {
        const generatedData = await promptResult.value.json();
        if (!promptResult.value.ok) throw new Error(generatedData.detail || "Prompt generation failed");
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
      // First-time Google sign-in is manual, but project creation and saving are
      // automatic as soon as each profile is signed in. Re-open the persistent
      // profile while waiting so the backend can create its missing project.
      let projectsReady = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        const profilesResponse = await fetch(API + "/flow/profiles");
        const profilesData = await profilesResponse.json();
        projectsReady = profilesResponse.ok &&
          (profilesData.profiles || []).length === 5 &&
          profilesData.profiles.every((p: FlowProfile) => Boolean(p.project_url));
        if (projectsReady) break;
        setNotice(loginProfiles.length
          ? "Sign in to Google in the opened Flow windows. The app will create and save each project automatically…"
          : "Creating and saving the five Google Flow projects…");
        await new Promise(resolve => window.setTimeout(resolve, 3000));
        const retryOpen = await fetch(API + "/flow/profiles/open-all", { method: "POST" });
        const retryData = await retryOpen.json();
        if (!retryOpen.ok) {
          const detail = retryData.detail?.message || retryData.detail;
          if (detail && !String(detail).toLowerCase().includes("sign in")) {
            throw new Error(typeof detail === "string" ? detail : "Could not initialise all Flow projects.");
          }
        } else {
          loginProfiles = (retryData.profiles || []).filter((p: any) => p.login_required);
        }
      }
      if (!projectsReady) {
        const finalProfilesResponse = await fetch(API + "/flow/profiles");
        const finalProfilesData = await finalProfilesResponse.json();
        projectsReady = finalProfilesResponse.ok &&
          (finalProfilesData.profiles || []).length === 5 &&
          finalProfilesData.profiles.every((p: FlowProfile) => Boolean(p.project_url));
      }
      if (!projectsReady) {
        throw new Error("Google sign-in is still required in one or more Flow profiles. Sign in there, then start Generate Video again; created projects will be reused.");
      }
      setNotice("Five Flow projects are ready. Queueing each clip for its matching account…");
      const dispatched = await fetch(API + "/extension/dispatch/" + job.id, { method: "POST" });
      const dispatchData = await dispatched.json();
      if (!dispatched.ok) throw new Error(dispatchData.detail || "Flow dispatch failed");
      setSelected(current);
      setNotice("Production queued. Each profile will pick up its own clip when its extension is connected.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not start automatic production.");
      await refresh();
    } finally { setDispatching(false); }
  }

  async function generateFreshPromptsForFailedJob(job: Job) {
    if (dispatching || busy) return;
    setDispatching(true);
    try {
      setNotice("Superseding the failed attempt and generating five fresh prompts…");
      const response = await fetch(API + "/jobs/" + job.id + "/regenerate-prompts", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not generate a fresh prompt pack");
      let updated: Job = data.job;
      const approved = await fetch(API + "/jobs/" + job.id + "/approve-prompts", { method: "POST" });
      const approvedData = await approved.json();
      if (!approved.ok) throw new Error(approvedData.detail || "Could not approve the fresh prompts");
      updated = approvedData.job;
      setSelected(updated);
      await refresh();
      setNotice("Fresh prompts ready. Starting a new Flow generation attempt…");
      await startAutomaticProduction(updated, true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Fresh prompt generation failed.");
      await refresh();
    } finally {
      setDispatching(false);
    }
  }

  async function assembleJob(job: Job) {
    setAssembling(true);
    try {
      const response = await fetch(API + "/jobs/" + job.id + "/assemble", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Video assembly failed");
      setNotice(data.already_assembled ? "Final video is already in your library." : "Five clips validated and merged. Final video saved to the local library.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Video assembly failed."); }
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

  const debugEntries = [
    ...diagnosticLogs.map(log=>({key:"diagnostic-"+log.id,time:new Date(log.created_at).toLocaleTimeString(),level:log.level==="error"?"error":log.level==="warn"?"warn":"info",source:log.source,message:log.message+(log.profile_id?" · "+log.profile_id:"")+(log.task_id?" · "+log.task_id:"")})),
    {key:"service",time:new Date(debugUpdatedAt).toLocaleTimeString(),level:health==="offline"?"error":"info",source:"BACKEND",message:health==="online"?"Local API health check passed":"Local API is unreachable"},
    ...flowAutomation.profiles.map(p=>({key:"worker-"+p.profile_id,time:p.last_seen?new Date(p.last_seen).toLocaleTimeString():"—",level:p.registered?"info":"warn",source:"FLOW",message:p.profile_id+" · "+(p.registered?"extension registered":"worker not connected")+(p.extension_version?" · extension "+p.extension_version:"")})),
    ...flowAutomation.tasks.map(t=>({key:"task-"+t.task_id,time:new Date(t.updated_at).toLocaleTimeString(),level:["failed","blocked_ui","blocked_settings","needs_login"].includes(t.status)?"error":"info",source:"TASK",message:t.profile_id+" · "+t.status.replaceAll("_"," ")+(t.last_error?" · "+t.last_error:"")+(t.download_path?" · "+t.download_path:"")})),
    ...jobs.slice(0,8).map(j=>({key:"job-"+j.id,time:new Date(j.created_at).toLocaleTimeString(),level:"info",source:"JOB",message:j.topic+" · "+j.status.replaceAll("_"," ")+(j.final_video?" · final video assembled":"")})),
    {key:"notice",time:"now",level:"info",source:"DESKTOP",message:notice}
  ].sort((a,b)=>b.time.localeCompare(a.time));
  const active = selected ?? jobs[0] ?? null;
  const jobProgress = (job: Job) => {
    const tasks = flowAutomation.tasks.filter(task => task.job_id === job.id);
    const downloaded = tasks.filter(task => task.status === "downloaded").length;
    const failed = tasks.filter(task => ["failed", "blocked_ui", "blocked_settings", "needs_login"].includes(task.status)).length;
    return { downloaded, failed, percent: job.final_video ? 100 : Math.round(downloaded / 5 * 100) };
  };

  useEffect(() => {
    if (assembling) return;
    const readyJob = jobs.find(job =>
      !job.final_video &&
      !autoAssemblyAttempted.has(job.id) &&
      flowAutomation.tasks.filter(task => task.job_id === job.id && task.status === "downloaded").length === 5
    );
    if (readyJob) {
      setAutoAssemblyAttempted(current => new Set(current).add(readyJob.id));
      assembleJob(readyJob);
    }
  }, [jobs, flowAutomation.tasks, assembling, autoAssemblyAttempted]);

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
      <button className={activePage==="debug" ? "nav-item active" : "nav-item"} onClick={()=>setActivePage("debug")}><span>⌁</span> Debug Window <em>LIVE</em></button>
      <div className="sidebar-bottom"><div className="service-dot" data-state={health}></div><div><b>Local service</b><small>{health === "online" ? "Connected" : health === "offline" ? "Not running" : "Checking…"}</small></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div><span className="crumb">Workspace</span><span className="slash">/</span><b>{({home:"Home",prompts:"Prompt Studio",accounts:"Accounts",library:"Video Library",settings:"Settings",debug:"Debug Window"})[activePage]}</b></div><div className="top-right"><span className="mode">LOCAL WORKSPACE</span><div className="avatar">AS</div></div></header>
      {activePage === "debug" && <section className="debug-page">
        <div className="debug-heading"><div><div className="eyebrow">SYSTEM DIAGNOSTICS</div><h1>Debug Window</h1><p>Live operational state from the desktop UI, local service, five Flow workers and clip tasks. Refreshes with the workspace status poll.</p></div><div className="debug-actions"><button className="secondary compact" onClick={()=>refresh()}>↻ Refresh</button><button className="primary compact" onClick={()=>{const lines=debugEntries.map(e=>e.time+" ["+e.level.toUpperCase()+"] ["+e.source+"] "+e.message).join("\n");const blob=new Blob([lines+"\n\nUpdated: "+debugUpdatedAt+"\n"],{type:"text/plain"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="asmr-factory-debug.log";a.click();URL.revokeObjectURL(url);}}>Export log</button></div></div>
        <div className="debug-summary">
          <div><small>LOCAL SERVICE</small><b className={health==="online"?"debug-ok":"debug-bad"}>{health.toUpperCase()}</b></div>
          <div><small>FLOW WORKERS</small><b>{flowAutomation.registered_count}/5 connected</b></div>
          <div><small>ACTIVE TASKS</small><b>{flowAutomation.tasks.filter(t=>!["downloaded","failed","cancelled"].includes(t.status)).length}</b></div>
          <div><small>FAILED TASKS</small><b className={flowAutomation.tasks.some(t=>["failed","blocked_ui","blocked_settings","needs_login"].includes(t.status))?"debug-bad":"debug-ok"}>{flowAutomation.tasks.filter(t=>["failed","blocked_ui","blocked_settings","needs_login"].includes(t.status)).length}</b></div>
        </div>
        <div className="panel debug-panel"><div className="panel-head"><div><div className="eyebrow">LIVE EVENT FEED</div><h2>System activity</h2></div><select className="theme-select debug-filter" value={debugFilter} onChange={e=>setDebugFilter(e.target.value)}><option value="all">All events</option><option value="error">Errors only</option><option value="worker">Flow workers</option><option value="task">Clip tasks</option></select></div>
          <div className="debug-feed">{debugEntries.filter(e=>debugFilter==="all"||(debugFilter==="error"&&e.level==="error")||(debugFilter==="worker"&&e.source==="FLOW")||(debugFilter==="task"&&e.source==="TASK")).map((entry,i)=><div className="debug-entry" key={entry.key}><time>{entry.time}</time><span className={"debug-level "+entry.level}>{entry.level.toUpperCase()}</span><b>{entry.source}</b><p>{entry.message}</p></div>)}{debugEntries.filter(e=>debugFilter==="all"||(debugFilter==="error"&&e.level==="error")||(debugFilter==="worker"&&e.source==="FLOW")||(debugFilter==="task"&&e.source==="TASK")).length===0&&<div className="empty">No events match this filter.</div>}</div>
          <small className="debug-foot">Last status refresh: {new Date(debugUpdatedAt).toLocaleString()} · Feed combines captured Electron, renderer, backend and Flow extension diagnostics with current task state. FFmpeg output is included when emitted by the backend process.</small>
        </div>
      </section>}
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
          <div className="style-hint">Five different subjects per style · 8 seconds each · consistent Style Bible</div>
          <div className="settings-row"><div><small>MODEL</small><b>Veo 3.1 Lite</b></div><div><small>QUALITY</small><b>720p</b></div><div><small>DURATION</small><b>8 seconds</b></div></div>
          <button className="primary" onClick={createJob} disabled={busy || dispatching || health!=="online"}>{busy || dispatching ? "Starting automated production…" : "▶  Generate Video"}</button>
          <p className="helper">One click generates and internally approves five prompts, opens profiles 01–05, dispatches generation, downloads, assembles and publishes automatically. First-time profile pairing, Google sign-in and Facebook Page setup are required; Flow controls are auto-detected when uniquely identifiable.</p>
        </section>}
        {activePage === "accounts" && <section className="panel session-panel">
          <div className="panel-head"><div><div className="eyebrow">BROWSER CONNECTIONS</div><h2>Flow sessions</h2></div><span className="count-pill">{flowAutomation.registered_count} / 5 WORKERS</span></div>
          <p className="muted">Open Google Flow in each dedicated profile once. The extension captures and saves that profile’s project automatically; no URL pasting is needed.</p>
          {flowProfiles.map((profile,i)=><div className="session-row flow-account-row" key={profile.profile_id}>
            <div className="session-number">{i+1}</div>
            <div className="flow-account-fields">
              <b>{profile.display_name}</b>
              <small>{profile.project_url ? "Flow project detected and saved automatically" : "Waiting for this profile to detect a Flow project"} · {profile.extension_connected ? "Extension connected" : profile.browser_open ? "Browser open · waiting for extension" : "Browser closed"}</small>
            </div>
            <div className="flow-account-actions">
              <button className="secondary compact" onClick={()=>openFlowProfile(profile)}>Open browser</button>
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
            <div><b>Chrome extension bridge</b><small>Pair the extension once in each dedicated profile using its matching profile ID. After pairing, project detection is automatic.</small></div>
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
          <div className="job-list">{jobs.map(job=><button className={active?.id===job.id?"job-row chosen":"job-row"} key={job.id} onClick={()=>setSelected(job)}><div className="job-thumb">🍓</div><div className="job-info"><b>{job.topic}</b><small>{new Date(job.created_at).toLocaleString()} · {job.clips.length} clip tasks</small><div className="job-progress-meta"><span>{jobProgress(job).downloaded}/5 clips downloaded</span><span>{jobProgress(job).percent}%</span></div><div className="job-progress-track"><div className="job-progress-fill" style={{width: jobProgress(job).percent + "%"}} /></div>{jobProgress(job).failed>0 && <small className="job-progress-error">{jobProgress(job).failed} clip task(s) need attention</small>}</div><span className="job-state">{job.status.replaceAll("_"," ")}</span><span className="arrow">›</span></button>)}</div>}
      </section>}

      {activePage === "prompts" && active && <section className="panel detail-panel">
        <div className="panel-head"><div><div className="eyebrow">AUTOMATED PROMPT PACK</div><h2>{active.topic}</h2></div><span className="count-pill">{active.status.replaceAll("_"," ")}</span></div>
        <p className="muted">The five prompts are generated, internally approved and dispatched automatically when you click Generate Video on Home. There is no separate prompt-generation or approval step.</p>
        <div className="prompt-grid">{active.clips.map(clip=><div className="prompt-card" key={clip.id}>
          <div className="clip-top"><span>CLIP 0{clip.order}</span><span>{clip.status.replaceAll("_"," ")}</span></div>
          <b>{clip.subject}</b><p className="prompt-readonly">{clip.prompt || "Generated automatically when production starts."}</p>
        </div>)}</div>
        <div className="dispatch-toolbar">
          <div><b>Production progress</b><small>{flowAutomation.tasks.filter(t=>t.job_id===active.id).length}/5 Flow tasks · {flowAutomation.tasks.filter(t=>t.job_id===active.id && t.status==="downloaded").length}/5 downloads · {active.final_video ? "video assembled" : "assembly runs automatically after all downloads"}</small></div>
          <span className="count-pill">{active.final_video ? "ASSEMBLED" : "AUTOMATIC"}</span>
        </div>
        {flowAutomation.tasks.some(t=>t.job_id===active.id && ["failed","blocked_ui","blocked_settings","needs_login"].includes(t.status)) &&
          flowAutomation.tasks.filter(t=>t.job_id===active.id).every(t=>["failed","blocked_ui","blocked_settings","needs_login","cancelled","superseded","downloaded"].includes(t.status)) &&
          !active.final_video && <div className="dispatch-toolbar"><div><b>Generation failed</b><small>The failed attempt is retained in history. Generate a completely new prompt pack and start a fresh attempt.</small></div><button className="primary compact" disabled={dispatching} onClick={()=>generateFreshPromptsForFailedJob(active)}>{dispatching ? "Generating…" : "Generate New Prompts"}</button></div>}
        {flowAutomation.tasks.filter(t=>t.job_id===active.id).length>0 && <div className="flow-task-list">{flowAutomation.tasks.filter(t=>t.job_id===active.id).map(task=><div className="flow-task-row" key={task.task_id}><span>{task.profile_id}</span><b>{task.status.replaceAll("_"," ")}</b><small>{task.last_error || task.download_path || task.updated_at}</small></div>)}</div>}
        {active.final_video && <div className="facebook-publish-panel">
          <div className="panel-head"><div><div className="eyebrow">FACEBOOK REELS</div><h3>Automatic publishing</h3></div><span className="count-pill">{facebookPublication?.status?.toUpperCase() || (facebookStatus.connected ? "QUEUED" : "PAGE SETUP REQUIRED")}</span></div>
          <p className="muted">{facebookPublication?.status === "published" ? "Reel successfully published." : facebookPublication?.status === "processing" ? "Meta accepted the Reel. Publication status is being checked automatically." : facebookPublication?.status === "uncertain" ? "Meta upload needs manual verification; duplicate protection is active." : facebookStatus.connected ? "Final video assembled. Upload to the selected Page starts automatically." : "Connect and select a Facebook Page once in Accounts. Publishing will then run automatically for future videos."}</p>
          {facebookPublication?.error && <small>{facebookPublication.error}</small>}
          {facebookPublication?.video_id && <small>Meta video ID: {facebookPublication.video_id}</small>}
          <small>Title, caption, description and hashtags are generated automatically. Duplicate upload protection remains enabled.</small>
        </div>}
      </section>}
      {activePage === "prompts" && <section className="panel style-panel"><div className="panel-head"><div><div className="eyebrow">PERSISTENT CREATIVE RULES</div><h2>ASMR Style Bible</h2></div><span className="count-pill">SHARED ACROSS JOBS</span></div><p className="muted">Shared camera, lighting, texture and sound rules included in every prompt.</p><textarea className="style-editor" value={styleBible} onChange={e=>setStyleBible(e.target.value)}/><button className="secondary" onClick={saveStyleBible}>Save Style Bible</button></section>}

      {activePage === "settings" && <section className="panel settings-page">
        <div className="panel-head"><div><div className="eyebrow">WORKSPACE CONFIGURATION</div><h2>Production settings</h2></div><span className="count-pill">CURRENT DEFAULTS</span></div>
        <p className="muted">These are production targets. Google Flow must confirm the selected values in each signed-in profile before generation.</p>
        <div className="settings-summary-grid">
          <div><small>VIDEO MODEL</small><b>Veo 3.1 Lite</b></div><div><small>RESOLUTION</small><b>720p</b></div><div><small>CLIP DURATION</small><b>8 seconds</b></div><div><small>ASPECT RATIO</small><b>9:16 vertical</b></div><div><small>CLIPS PER VIDEO</small><b>5</b></div><div><small>FINAL TARGET</small><b>~40 seconds</b></div>
        </div>
        <div className="settings-info"><b>Local service</b><span>{health === "online" ? "Connected on this computer" : health === "offline" ? "Not connected · start the local service" : "Checking connection…"}</span><b>Media tools</b><span>FFmpeg and FFprobe are used by the local assembly pipeline. Availability is checked when assembly runs.</span><b>Credentials</b><span>AI and Facebook credentials are stored in the operating system credential vault, not in this settings screen.</span></div>
      </section>}
      <div className="notice">{notice}</div>
      <footer>ASMR FACTORY <span>·</span> EARLY DEVELOPMENT BUILD <span>·</span> LOCAL-FIRST</footer>
    </main>
  </div>;
}