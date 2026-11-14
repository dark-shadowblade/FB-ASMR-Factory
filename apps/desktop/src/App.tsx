import { useEffect, useState } from "react";

type Clip = { id: string; subject: string; prompt: string; status: string; order: number };
type Job = { id: string; topic: string; theme: string; status: string; created_at: string; clips: Clip[]; final_video?: { output_path: string; duration_seconds: number; width: number; height: number; size_bytes: number; created_at: string } | null };
type FlowProfile = { profile_id: string; display_name: string; project_url: string; configured: boolean; browser_open: boolean; extension_connected?: boolean };
type LibraryVideo = { job_id: string; output_path: string; duration_seconds: number; width: number; height: number; size_bytes: number; created_at: string; topic: string; theme: string; status: string };
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
  const [generating, setGenerating] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [styleBible, setStyleBible] = useState("");

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

  useEffect(() => { refresh(); fetch(API + "/style-bible").then(r=>r.json()).then(d=>setStyleBible(d.content || "")).catch(()=>{}); fetch(API + "/settings/ai").then(r=>r.json()).then(d=>setAiConfigured(Boolean(d.configured))).catch(()=>{}); const timer = window.setInterval(refresh, 4000); return () => window.clearInterval(timer); }, []);

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
      const response = await fetch(`${API}/extension/dispatch/${job.id}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not dispatch Flow tasks");
      setNotice(`Dispatched ${data.dispatched} clips across five independent Flow accounts. The extension workers will pick them up.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not dispatch Flow tasks.");
    } finally { setDispatching(false); }
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

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">A</div><div><b>ASMR FACTORY</b><small>CREATOR WORKSPACE</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <div className="nav-item active"><span>▦</span> Overview</div>
      <div className="nav-item"><span>✦</span> Prompt Studio <em>AI DIRECTOR</em></div>
      <div className="nav-item"><span>▤</span> Video Library <em>Planned</em></div>
      <div className="nav-item"><span>◉</span> Flow Accounts <em>Planned</em></div>
      <div className="nav-label second">SYSTEM</div>
      <div className="nav-item"><span>⚙</span> Settings <em>Planned</em></div>
      <div className="sidebar-bottom"><div className="service-dot" data-state={health}></div><div><b>Local service</b><small>{health === "online" ? "Connected" : health === "offline" ? "Not running" : "Checking…"}</small></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div><span className="crumb">Workspace</span><span className="slash">/</span><b>Overview</b></div><div className="top-right"><span className="mode">LOCAL WORKSPACE</span><div className="avatar">AS</div></div></header>
      <section className="welcome"><div><div className="eyebrow">YOUR AUTOMATED VIDEO WORKSHOP</div><h1>Make something <span>satisfying.</span></h1><p>Plan, generate and publish your ASMR videos from one place.</p></div><div className="welcome-art"><div className="orb orb-one"></div><div className="orb orb-two"></div><div className="orb-core">✦</div></div></section>

      <section className="stats">
        <div className="stat-card"><small>TOTAL JOBS</small><strong>{jobs.length.toString().padStart(2,"0")}</strong><span>Saved locally</span></div>
        <div className="stat-card"><small>CLIPS PLANNED</small><strong>{jobs.reduce((n,j)=>n+j.clips.length,0).toString().padStart(2,"0")}</strong><span>Across all jobs</span></div>
        <div className="stat-card"><small>COMPLETED VIDEOS</small><strong>{jobs.filter(j=>Boolean(j.final_video)).length.toString().padStart(2,"0")}</strong><span>Saved in local library</span></div>
        <div className="stat-card"><small>FLOW SESSIONS</small><strong>05</strong><span>Target capacity</span></div>
      </section>

      <div className="content-grid">
        <section className="panel create-panel">
          <div className="panel-head"><div><div className="eyebrow">NEW PRODUCTION</div><h2>Create a video job</h2></div><span className="step-tag">STEP 01 / 05</span></div>
          <label htmlFor="topic">WHAT SHOULD WE CREATE?</label>
          <input id="topic" value={topic} onChange={e=>setTopic(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createJob()} placeholder="e.g. tropical fruit cutting" />
          <label htmlFor="theme">GENERATION STYLE · 7 AVAILABLE</label>
          <select id="theme" className="theme-select" value={theme} onChange={e=>setTheme(e.target.value)}>{THEMES.map(t=><option key={t.value} value={t.value}>{t.emoji}  {t.label}</option>)}</select>
          <div className="style-hint">Five different subjects per style · 8 seconds each · consistent Style Bible</div>
          <div className="settings-row"><div><small>MODEL</small><b>Veo 3.1 Lite</b></div><div><small>QUALITY</small><b>720p</b></div><div><small>DURATION</small><b>8 seconds</b></div></div>
          <button className="primary" onClick={createJob} disabled={busy || health!=="online"}>{busy ? "Creating job…" : "＋  Create production job"}</button>
          <p className="helper">Creates a saved five-clip plan. Generation settings are targets and will be verified against Flow when integration is built.</p>
        </section>

        <section className="panel session-panel">
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
          <div className="extension-pairing">
            <div><b>Chrome extension bridge</b><small>Paste this token into the extension options in all five profiles. Each profile must use its matching flow-1 … flow-5 ID.</small></div>
            <input value={bridgeToken} readOnly type="password" aria-label="Extension bridge token" />
            <button className="secondary compact" onClick={copyBridgeToken} disabled={!bridgeToken}>Copy pairing token</button>
          </div>
        </section>
      </div>

      <section className="panel jobs-panel">
        <div className="panel-head"><div><div className="eyebrow">FINISHED PRODUCTIONS</div><h2>Video Library</h2></div><span className="count-pill">{library.length} VIDEOS</span></div>
        {library.length===0 ? <div className="empty"><div className="empty-icon">▣</div><b>No finished videos yet</b><span>Once five Flow downloads pass validation and merge, they will appear here.</span></div> :
          <div className="job-list">{library.map(video=><div className="job-row library-row" key={video.job_id}><video className="library-preview" controls preload="metadata" src={API + "/jobs/" + video.job_id + "/output/file"} /><div className="job-info"><b>{video.topic}</b><small>{Math.round(video.duration_seconds)}s · {video.width}×{video.height} · {(video.size_bytes/1024/1024).toFixed(1)} MB</small><small>{video.output_path}</small><a href={API + "/jobs/" + video.job_id + "/output/file"} download>Download MP4</a></div><span className="job-state">READY</span></div>)}</div>}
      </section>

      <section className="panel jobs-panel">
        <div className="panel-head"><div><div className="eyebrow">PRODUCTION HISTORY</div><h2>Recent jobs</h2></div><span className="count-pill">{jobs.length} JOBS</span></div>
        {jobs.length===0 ? <div className="empty"><div className="empty-icon">▤</div><b>No productions yet</b><span>Your created jobs will appear here.</span></div> :
          <div className="job-list">{jobs.map(job=><button className={active?.id===job.id?"job-row chosen":"job-row"} key={job.id} onClick={()=>setSelected(job)}><div className="job-thumb">🍓</div><div className="job-info"><b>{job.topic}</b><small>{new Date(job.created_at).toLocaleString()} · {job.clips.length} clip tasks</small></div><span className="job-state">{job.status.replaceAll("_"," ")}</span><span className="arrow">›</span></button>)}</div>}
      </section>

      {active && <section className="panel detail-panel">
        <div className="panel-head"><div><div className="eyebrow">AI DIRECTOR · PROMPT STUDIO</div><h2>{active.topic}</h2></div><span className="count-pill">{active.status.replaceAll("_"," ")}</span></div>
        <div className="director-toolbar"><div><b>Five-clip prompt pack</b><small>{aiConfigured ? "AI provider configured" : "Built-in prompt composer · no API key required"}</small></div><button className="primary compact" disabled={generating || active.status==="prompts_approved"} onClick={()=>generatePrompts(active)}>{generating ? "Creating prompts…" : active.clips.some(c=>c.prompt) ? "Regenerate five prompts" : "✦ Generate five prompts"}</button></div>
        <div className="prompt-grid">{active.clips.map(clip=><PromptEditor key={clip.id} clip={clip} locked={active.status==="prompts_approved"} onSave={(value)=>savePrompt(active,clip,value)}/>)}</div>
        {active.clips.every(c=>c.prompt.length>=40) && active.status!=="prompts_approved" && <button className="secondary" onClick={()=>approvePrompts(active)}>Approve all five prompts</button>}
        {active.status==="prompts_approved" && <>
          <div className="approved-note">✓ Prompt pack approved.</div>
          <div className="dispatch-toolbar">
            <div><b>Google Flow task queue</b><small>{flowProfiles.filter(p=>p.extension_connected).length}/5 extension workers connected · {flowAutomation.tasks.filter(t=>t.job_id===active.id).length}/5 tasks dispatched</small></div>
            <button className="primary compact" disabled={dispatching || flowAutomation.registered_count!==5 || flowAutomation.tasks.some(t=>t.job_id===active.id)} onClick={()=>dispatchFlowJob(active)}>{dispatching ? "Dispatching…" : flowAutomation.registered_count!==5 ? "Connect all five Flow workers" : "Start five Flow tasks"}</button>
          </div>
          {flowAutomation.tasks.filter(t=>t.job_id===active.id).length>0 && <div className="flow-task-list">{flowAutomation.tasks.filter(t=>t.job_id===active.id).map(task=><div className="flow-task-row" key={task.task_id}><span>{task.profile_id}</span><b>{task.status.replaceAll("_"," ")}</b><small>{task.last_error || task.download_path || task.updated_at}</small></div>)}</div>}
          {flowAutomation.tasks.filter(t=>t.job_id===active.id && t.status==="downloaded").length===5 && !active.final_video && <button className="primary compact" disabled={assembling} onClick={()=>assembleJob(active)}>{assembling ? "Validating and merging…" : "Merge five downloaded clips"}</button>}
          {active.final_video && <div className="approved-note">✓ Final video saved · {Math.round(active.final_video.duration_seconds)}s · {active.final_video.width}×{active.final_video.height}<br/><small>{active.final_video.output_path}</small></div>}
        </>}
      </section>}
      <section className="panel style-panel"><div className="panel-head"><div><div className="eyebrow">PERSISTENT CREATIVE RULES</div><h2>ASMR Style Bible</h2></div><span className="count-pill">SHARED ACROSS JOBS</span></div><p className="muted">Shared camera, lighting, texture and sound rules included in every prompt.</p><textarea className="style-editor" value={styleBible} onChange={e=>setStyleBible(e.target.value)}/><button className="secondary" onClick={saveStyleBible}>Save Style Bible</button></section>

      <div className="notice">{notice}</div>
      <footer>ASMR FACTORY <span>·</span> EARLY DEVELOPMENT BUILD <span>·</span> LOCAL-FIRST</footer>
    </main>
  </div>;
}