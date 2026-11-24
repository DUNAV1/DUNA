import { useMemo, useState } from "react";
import { Bot, FolderGit2, Plus, Send, TerminalSquare, ShieldCheck, Sparkles, Code2, PanelLeftClose, ChevronDown } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type Project = { id: string; name: string; description: string };

export default function App() {
  const [projects, setProjects] = useState<Project[]>([{ id: "duna-demo", name: "Welcome project", description: "Explore your AI engineering workspace." }]);
  const [activeId, setActiveId] = useState("duna-demo");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useMemo(() => projects.find(p => p.id === activeId) ?? projects[0], [projects, activeId]);

  function createProject() {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const p = { id: crypto.randomUUID(), name: name.trim(), description: "New DUNA workspace" };
    setProjects(prev => [p, ...prev]); setActiveId(p.id); setMessages([]);
  }

  async function send(text = input) {
    const value = text.trim();
    if (!value || busy) return;
    const next = [...messages, { role: "user" as const, content: value }];
    setMessages(next); setInput(""); setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, project: active })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      setMessages([...next, { role: "assistant", content: data.message || "I couldn't generate a response." }]);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unable to reach DUNA API");
    } finally { setBusy(false); }
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">D</div><div><b>DUNA</b><small>AI ENGINEERING</small></div><PanelLeftClose size={17} className="muted push"/></div>
      <button className="new-project" onClick={createProject}><Plus size={16}/> New project</button>
      <div className="nav-label">WORKSPACES</div>
      {projects.map(p => <button key={p.id} className={`project ${p.id === activeId ? "selected" : ""}`} onClick={() => {setActiveId(p.id);setMessages([]);}}><FolderGit2 size={16}/><span>{p.name}</span></button>)}
      <div className="sidebar-bottom"><div className="safe"><ShieldCheck size={17}/><span><b>Safe mode enabled</b><small>Terminal execution disabled</small></span></div><div className="profile"><div className="avatar">D</div><span><b>DUNA Workspace</b><small>Local preview</small></span><ChevronDown size={15}/></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> {active?.name ?? "Project"}</div><div className="top-actions"><span className="status"><i/> System ready</span><button className="icon-button" title="Terminal is disabled"><TerminalSquare size={18}/></button></div></header>
      <section className="content">
        {messages.length === 0 ? <div className="welcome">
          <div className="orb"><Sparkles size={25}/></div>
          <div className="eyebrow">YOUR AI SOFTWARE ENGINEER</div>
          <h1>Build something<br/><em>remarkable.</em></h1>
          <p>DUNA can help plan, write, understand and improve your software. Start with a task or choose a workflow below.</p>
          <div className="suggestions">
            <button onClick={() => send("Help me plan a new software project. Ask only for essential missing requirements.")}><Code2/><b>Plan a project</b><small>Turn an idea into an implementation plan</small></button>
            <button onClick={() => send("Review this project architecture and recommend a robust technical design.")}><FolderGit2/><b>Review architecture</b><small>Explore design and engineering tradeoffs</small></button>
            <button onClick={() => send("Create a testing strategy for my application, including unit, integration and end-to-end tests.")}><ShieldCheck/><b>Design tests</b><small>Build a practical quality strategy</small></button>
          </div>
        </div> : <div className="conversation">{messages.map((m,i) => <article className={`message ${m.role}`} key={i}><div className="message-avatar">{m.role === "assistant" ? <Bot size={17}/> : "Y"}</div><div><div className="message-role">{m.role === "assistant" ? "DUNA" : "YOU"}</div><div className="message-text">{m.content}</div></div></article>)}{busy && <div className="thinking"><span/><span/><span/> DUNA is thinking…</div>}</div>}
        {notice && <div className="notice">{notice}</div>}
        <div className="composer"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Ask DUNA to build, debug, explain or plan…" rows={2}/><div className="composer-foot"><span><Sparkles size={13}/> DUNA AI · Shift + Enter for new line</span><button className="send" onClick={()=>send()} disabled={busy || !input.trim()}><Send size={16}/></button></div></div>
        <div className="disclaimer">DUNA can make mistakes. Review generated code before using it.</div>
      </section>
    </main>
  </div>;
}