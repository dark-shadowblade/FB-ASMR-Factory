import { useEffect, useState } from "react";

type Clip = { id: string; subject: string; prompt: string; status: string; order: number };
type Job = { id: string; topic: string; theme: string; status: string; created_at: string; clips: Clip[] };

const API = "http://127.0.0.1:8765/api/v1";
const fruitFallback = ["Mango", "Apple", "Kiwi", "Dragon fruit", "Orange"];


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
  const [jobs, setJobs] = useState<Job[]>([]);
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
      if (selected) {
        const updated = (data.jobs ?? []).find((j: Job) => j.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch {
      setHealth("offline");
    }
  }

  useEffect(() => { refresh(); fetch(API + "/style-bible").then(r=>r.json()).then(d=>setStyleBible(d.content || "")).catch(()=>{}); fetch(API + "/settings/ai").then(r=>r.json()).then(d=>setAiConfigured(Boolean(d.configured))).catch(()=>{}); const timer = window.setInterval(refresh, 4000); return () => window.clearInterval(timer); }, []);

  async function createJob() {
    if (!topic.trim()) { setNotice("Enter a topic first."); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), theme: "fruits" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not create job");
      setTopic("");
      setSelected(data.job);
      setNotice("Draft job created with five fruit clip tasks. Prompt generation is the next milestone.");
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
        <div className="stat-card"><small>COMPLETED VIDEOS</small><strong>00</strong><span>Media pipeline not connected</span></div>
        <div className="stat-card"><small>FLOW SESSIONS</small><strong>05</strong><span>Target capacity</span></div>
      </section>

      <div className="content-grid">
        <section className="panel create-panel">
          <div className="panel-head"><div><div className="eyebrow">NEW PRODUCTION</div><h2>Create a video job</h2></div><span className="step-tag">STEP 01 / 05</span></div>
          <label htmlFor="topic">WHAT SHOULD WE CREATE?</label>
          <input id="topic" value={topic} onChange={e=>setTopic(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createJob()} placeholder="e.g. tropical fruit cutting" />
          <label>GENERATION STYLE</label>
          <div className="style-choice"><div className="fruit-icon">🍉</div><div><b>Fruit Cutting ASMR</b><small>Five unique fruit clips · 8 seconds each</small></div><span className="selected-check">✓</span></div>
          <div className="settings-row"><div><small>MODEL</small><b>Veo 3.1 Lite</b></div><div><small>QUALITY</small><b>720p</b></div><div><small>DURATION</small><b>8 seconds</b></div></div>
          <button className="primary" onClick={createJob} disabled={busy || health!=="online"}>{busy ? "Creating job…" : "＋  Create production job"}</button>
          <p className="helper">Creates a saved five-clip plan. Generation settings are targets and will be verified against Flow when integration is built.</p>
        </section>

        <section className="panel session-panel">
          <div className="panel-head"><div><div className="eyebrow">BROWSER CONNECTIONS</div><h2>Flow sessions</h2></div><span className="count-pill">0 / 5 READY</span></div>
          <p className="muted">Each session will use its own signed-in Google account and saved Flow project.</p>
          {fruitFallback.map((name,i)=><div className="session-row" key={name}><div className="session-number">{i+1}</div><div><b>Browser profile {i+1}</b><small>Not configured</small></div><span className="pending">Not connected</span></div>)}
          <div className="session-foot">Account setup will be added in a later milestone.</div>
        </section>
      </div>

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
        {active.status==="prompts_approved" && <div className="approved-note">✓ Prompt pack approved. Google Flow generation is the next milestone.</div>}
      </section>}
      <section className="panel style-panel"><div className="panel-head"><div><div className="eyebrow">PERSISTENT CREATIVE RULES</div><h2>ASMR Style Bible</h2></div><span className="count-pill">SHARED ACROSS JOBS</span></div><p className="muted">Shared camera, lighting, texture and sound rules included in every prompt.</p><textarea className="style-editor" value={styleBible} onChange={e=>setStyleBible(e.target.value)}/><button className="secondary" onClick={saveStyleBible}>Save Style Bible</button></section>}

      <div className="notice">{notice}</div>
      <footer>ASMR FACTORY <span>·</span> EARLY DEVELOPMENT BUILD <span>·</span> LOCAL-FIRST</footer>
    </main>
  </div>;
}