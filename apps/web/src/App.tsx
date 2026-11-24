import { useMemo, useState } from "react";
import {
  Bot,
  FolderGit2,
  Plus,
  Send,
  TerminalSquare,
  ShieldCheck,
  Sparkles,
  Code2,
  PanelLeftClose,
  ChevronDown,
  ClipboardList,
  CheckCircle2
} from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type Project = { id: string; name: string; description: string };
type PlanStep = {
  id: number;
  title: string;
  detail: string;
  files: string[];
  validation: string[];
  risk: "low" | "medium" | "high";
};
type AgentPlan = {
  summary: string;
  assumptions: string[];
  steps: PlanStep[];
  acceptanceCriteria: string[];
};

export default function App() {
  const [projects, setProjects] = useState<Project[]>([
    { id: "duna-demo", name: "Welcome project", description: "Explore your AI engineering workspace." }
  ]);
  const [activeId, setActiveId] = useState("duna-demo");
  const [messages, setMessages] = useState<Message[]>([]);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useMemo(() => projects.find((p) => p.id === activeId) ?? projects[0], [projects, activeId]);

  function createProject() {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const project = { id: crypto.randomUUID(), name: name.trim(), description: "New DUNA workspace" };
    setProjects((previous) => [project, ...previous]);
    setActiveId(project.id);
    setMessages([]);
    setPlan(null);
    setNotice("");
  }

  async function send(text = input) {
    const value = text.trim();
    if (!value || busy) return;
    const next = [...messages, { role: "user" as const, content: value }];
    setMessages(next);
    setPlan(null);
    setInput("");
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, project: active })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      setMessages([...next, { role: "assistant", content: data.message || "I couldn't generate a response." }]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to reach DUNA API");
    } finally {
      setBusy(false);
    }
  }

  async function planTask(text = input) {
    const value = text.trim();
    if (!value || busy) return;
    setInput("");
    setPlan(null);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: value, project: active })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Planning request failed");
      setPlan(data.plan as AgentPlan);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create an implementation plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div><b>DUNA</b><small>AI ENGINEERING</small></div>
          <PanelLeftClose size={17} className="muted push" />
        </div>
        <button className="new-project" onClick={createProject}><Plus size={16} /> New project</button>
        <div className="nav-label">WORKSPACES</div>
        {projects.map((project) => (
          <button
            key={project.id}
            className={`project ${project.id === activeId ? "selected" : ""}`}
            onClick={() => { setActiveId(project.id); setMessages([]); setPlan(null); setNotice(""); }}
          >
            <FolderGit2 size={16} /><span>{project.name}</span>
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="safe">
            <ShieldCheck size={17} />
            <span><b>Safe mode enabled</b><small>Execution requires approval</small></span>
          </div>
          <div className="profile">
            <div className="avatar">D</div>
            <span><b>DUNA Workspace</b><small>Local preview</small></span>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">Workspace <span>/</span> {active?.name ?? "Project"}</div>
          <div className="top-actions">
            <span className="status"><i /> System ready</span>
            <button className="icon-button" title="Terminal is disabled"><TerminalSquare size={18} /></button>
          </div>
        </header>

        <section className="content">
          {plan ? (
            <div className="plan-view">
              <div className="plan-eyebrow"><ClipboardList size={15} /> IMPLEMENTATION PLAN <span>· REVIEW ONLY</span></div>
              <h2>{plan.summary}</h2>
              <div className="plan-safety"><ShieldCheck size={16} /> Plan generated. No files changed and no commands executed.</div>
              {plan.assumptions.length > 0 && (
                <section className="plan-section">
                  <h3>Assumptions</h3>
                  <ul>{plan.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </section>
              )}
              <section className="plan-section">
                <h3>Proposed steps <span>{plan.steps.length}</span></h3>
                <div className="plan-steps">
                  {plan.steps.map((step) => (
                    <article className="plan-step" key={step.id}>
                      <div className="plan-step-head">
                        <span className="step-number">{String(step.id).padStart(2, "0")}</span>
                        <b>{step.title}</b>
                        <span className={`risk risk-${step.risk}`}>{step.risk} risk</span>
                      </div>
                      <p>{step.detail}</p>
                      {step.files.length > 0 && (
                        <div className="plan-files"><small>LIKELY FILES</small>{step.files.map((file) => <code key={file}>{file}</code>)}</div>
                      )}
                      {step.validation.length > 0 && (
                        <div className="plan-validation"><small>VALIDATION</small>{step.validation.map((item, index) => <div key={index}><CheckCircle2 size={13} /> {item}</div>)}</div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
              <section className="plan-section acceptance">
                <h3>Acceptance criteria</h3>
                <ul>{plan.acceptanceCriteria.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </section>
              <div className="plan-footer">Next capability: repository-aware file inspection and human-reviewed patches. Agent execution is not enabled.</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="welcome">
              <div className="orb"><Sparkles size={25} /></div>
              <div className="eyebrow">YOUR AI SOFTWARE ENGINEER</div>
              <h1>Build something<br /><em>remarkable.</em></h1>
              <p>DUNA can help plan, write, understand and improve your software. Start with a task or choose a workflow below.</p>
              <div className="suggestions">
                <button onClick={() => planTask("Create an implementation plan for a new software project. Include foundational milestones and key architecture decisions.")}>
                  <ClipboardList /><b>Plan a project</b><small>Turn an idea into an ordered implementation plan</small>
                </button>
                <button onClick={() => send("Review this project architecture and recommend a robust technical design.")}>
                  <FolderGit2 /><b>Review architecture</b><small>Explore design and engineering tradeoffs</small>
                </button>
                <button onClick={() => planTask("Create a testing strategy for my application, including unit, integration and end-to-end test coverage.")}>
                  <ShieldCheck /><b>Design tests</b><small>Build a practical quality strategy</small>
                </button>
              </div>
              {busy && <div className="thinking"><span /><span /><span /> DUNA is preparing your plan…</div>}
            </div>
          ) : (
            <div className="conversation">
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={index}>
                  <div className="message-avatar">{message.role === "assistant" ? <Bot size={17} /> : "Y"}</div>
                  <div>
                    <div className="message-role">{message.role === "assistant" ? "DUNA" : "YOU"}</div>
                    <div className="message-text">{message.content}</div>
                  </div>
                </article>
              ))}
              {busy && <div className="thinking"><span /><span /><span /> DUNA is thinking…</div>}
            </div>
          )}

          {notice && <div className="notice">{notice}</div>}
          <div className="composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Ask DUNA to build, debug, explain or plan…"
              rows={2}
            />
            <div className="composer-foot">
              <span><Sparkles size={13} /> DUNA AI · Shift + Enter for new line</span>
              <div className="composer-actions">
                <button className="plan-button" onClick={() => planTask()} disabled={busy || !input.trim()}>
                  <ClipboardList size={14} /> Plan task
                </button>
                <button className="send" onClick={() => send()} disabled={busy || !input.trim()} title="Send message">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
          <div className="disclaimer">DUNA can make mistakes. Review generated plans and code before using them.</div>
        </section>
      </main>
    </div>
  );
}
