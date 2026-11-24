import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Bot,
  FolderGit2,
  Plus,
  Send,
  TerminalSquare,
  ShieldCheck,
  Sparkles,
  PanelLeftClose,
  ChevronDown,
  ClipboardList,
  CheckCircle2,
  Upload,
  FileCode2,
  FolderOpen,
  Search,
  MessageSquare,
  AlertTriangle,
  Info,
  Loader2,
  Check,
  X
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
type SourceFile = { path: string; content: string };
type InspectionFinding = {
  severity: "info" | "low" | "medium" | "high";
  title: string;
  detail: string;
  files: string[];
};
type ProjectInspection = {
  projectType: string;
  summary: string;
  stack: string[];
  structure: { path: string; purpose: string }[];
  entryPoints: { path: string; reason: string }[];
  findings: InspectionFinding[];
  recommendations: string[];
  unknowns: string[];
};
type InspectionContext = {
  filesReviewed: number;
  filesSkipped: number;
  valuesRedacted: number;
  charactersReviewed: number;
  persisted: boolean;
  filesChanged: boolean;
  commandsRun: boolean;
  executionEnabled: boolean;
};
type PatchChange = {
  path: string;
  rationale: string;
  diff: string;
  newContent: string;
  baseSha256: string;
};
type PatchProposal = { summary: string; changes: PatchChange[] };

type WritableFileHandleLike = {
  kind: "file";
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
    abort?(): Promise<void>;
  }>;
};
type WritableDirectoryHandleLike = {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, WritableFileHandleLike | WritableDirectoryHandleLike]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<WritableDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<WritableFileHandleLike>;
  queryPermission?(descriptor?: { mode: "readwrite" }): Promise<"granted" | "denied" | "prompt">;
  requestPermission?(descriptor?: { mode: "readwrite" }): Promise<"granted" | "denied" | "prompt">;
};
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<WritableDirectoryHandleLike>;
};

const MAX_FILES = 120;
const MAX_FILE_BYTES = 12_000;
const MAX_TOTAL_CHARS = 100_000;
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx", ".html", ".css",
  ".scss", ".sass", ".less", ".py", ".go", ".rs", ".java", ".kt", ".kts", ".cs", ".php",
  ".rb", ".swift", ".sh", ".ps1", ".yml", ".yaml", ".toml", ".xml", ".sql", ".graphql",
  ".gql", ".prisma", ".vue", ".svelte", ".astro", ".dart", ".ex", ".exs", ".erl", ".hrl",
  ".scala", ".clj", ".cljs", ".fs", ".fsx", ".vb", ".c", ".h", ".cc", ".cpp", ".hpp",
  ".txt", ".gradle", ".properties", ".ini", ".conf", ".cfg", ".proto", ".ipynb"
]);
const SOURCE_SPECIAL_NAMES = new Set([
  "dockerfile", "makefile", "cmakelists.txt", "procfile", "gemfile", "rakefile", "justfile",
  ".gitignore", ".gitattributes", ".editorconfig", ".nvmrc", ".node-version"
]);
const BLOCKED_PARTS = new Set([
  ".git", "node_modules", "dist", "build", "coverage", ".next", ".nuxt", ".output", ".venv",
  "venv", "__pycache__", "vendor", "target", "out", ".ssh", ".aws", ".azure", ".config",
  ".idea", ".vscode", "secrets", "credentials"
]);

function isBrowserSourceFile(file: File, relativePath: string): boolean {
  const parts = relativePath.split("/");
  if (!relativePath || relativePath.length > 260 || relativePath.startsWith("/") || /[\u0000-\u001f\u007f]/.test(relativePath) || parts.some((part) => !part || part === "." || part === "..")) return false;
  if (parts.some((part) => BLOCKED_PARTS.has(part.toLowerCase()))) return false;
  const name = (parts.at(-1) ?? "").toLowerCase();
  if (!name || name.startsWith(".env") || [".npmrc", ".pypirc", ".netrc", "id_rsa", "id_ed25519", "credentials", "service-account.json"].includes(name)) return false;
  if (/^(id_(rsa|ed25519)|.*credentials.*|.*secret.*|.*service.account.*)$/i.test(name)) return false;
  if (/\.(pem|key|p12|pfx|keystore|jks|der)$/i.test(name)) return false;
  if (file.size > MAX_FILE_BYTES) return false;
  if (SOURCE_SPECIAL_NAMES.has(name)) return true;
  const extension = name.includes(".") ? `.${name.split(".").pop()}` : "";
  return SOURCE_EXTENSIONS.has(extension);
}

function isSafePatchPath(path: string): boolean {
  const parts = path.split("/");
  if (!path || path.length > 260 || path.startsWith("/") || /^[a-zA-Z]:/.test(path) || path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path) || parts.some((part) => !part || part === "." || part === "..")) return false;
  if (parts.some((part) => BLOCKED_PARTS.has(part.toLowerCase()))) return false;
  const name = (parts.at(-1) ?? "").toLowerCase();
  if (name.startsWith(".env") || name.includes("credential") || name.includes("secret")) return false;
  if (/\.(pem|key|p12|pfx|keystore|jks|der)$/i.test(name)) return false;
  return !["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"].includes(name);
}

async function collectWritableFolderFiles(
  directory: WritableDirectoryHandleLike,
  prefix = "",
  output: { file: File; path: string }[] = []
): Promise<{ file: File; path: string }[]> {
  for await (const [name, entry] of directory.entries()) {
    if (output.length >= MAX_FILES * 4) break;
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === "directory") {
      if (!BLOCKED_PARTS.has(name.toLowerCase())) await collectWritableFolderFiles(entry, relativePath, output);
      continue;
    }
    if (entry.kind === "file") {
      const file = await entry.getFile();
      output.push({ file, path: relativePath });
    }
  }
  return output;
}

async function resolveExistingWritableFile(root: WritableDirectoryHandleLike, path: string): Promise<WritableFileHandleLike> {
  if (!isSafePatchPath(path)) throw new Error(`DUNA blocked an unsafe target path: ${path}`);
  const parts = path.split("/");
  let directory = root;
  for (const segment of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, { create: false });
  }
  return directory.getFileHandle(parts[parts.length - 1], { create: false });
}

async function writeExistingFile(handle: WritableFileHandleLike, content: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (error) {
    try { await writable.abort?.(); } catch { /* best-effort abort */ }
    throw error;
  }
}

async function sha256Text(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

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
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [codebaseName, setCodebaseName] = useState("");
  const [skippedLocalFiles, setSkippedLocalFiles] = useState(0);
  const [inspection, setInspection] = useState<ProjectInspection | null>(null);
  const [inspectionContext, setInspectionContext] = useState<InspectionContext | null>(null);
  const [patchProposal, setPatchProposal] = useState<PatchProposal | null>(null);
  const [writableFolderName, setWritableFolderName] = useState("");
  const writableDirectoryRef = useRef<WritableDirectoryHandleLike | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const active = useMemo(() => projects.find((project) => project.id === activeId) ?? projects[0], [projects, activeId]);

  function createProject() {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const project = { id: crypto.randomUUID(), name: name.trim(), description: "New DUNA workspace" };
    setProjects((previous) => [project, ...previous]);
    setActiveId(project.id);
    setMessages([]);
    setPlan(null);
    setSourceFiles([]);
    setInspection(null);
    setInspectionContext(null);
    setPatchProposal(null);
    writableDirectoryRef.current = null;
    setWritableFolderName("");
    setCodebaseName("");
    setNotice("");
  }

  async function loadLocalFiles(selected: { file: File; path: string }[], rootName: string) {
    if (selected.length === 0) return;
    setBusy(true);
    setNotice("");
    setSourceFiles([]);
    setCodebaseName("");
    setInspection(null);
    setInspectionContext(null);
    setPatchProposal(null);
    setMessages([]);
    setPlan(null);
    try {
      const accepted: { file: File; path: string }[] = [];
      let skipped = 0;
      let estimatedBytes = 0;
      for (const item of selected) {
        if (!isBrowserSourceFile(item.file, item.path) || accepted.length >= MAX_FILES || estimatedBytes + item.file.size > MAX_TOTAL_CHARS * 4) {
          skipped += 1;
          continue;
        }
        accepted.push(item);
        estimatedBytes += item.file.size;
      }

      const source: SourceFile[] = [];
      let totalChars = 0;
      for (const item of accepted) {
        const content = await item.file.text();
        if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(content) || totalChars + content.length > MAX_TOTAL_CHARS) {
          skipped += 1;
          continue;
        }
        source.push({ path: item.path, content });
        totalChars += content.length;
      }

      if (source.length === 0) {
        setSourceFiles([]);
        setCodebaseName("");
        setSkippedLocalFiles(skipped);
        setNotice("No eligible text source files were found. Choose a project folder containing source code, configuration, or documentation.");
        return;
      }
      setSourceFiles(source);
      setCodebaseName(rootName || active.name);
      setSkippedLocalFiles(skipped + selected.length - accepted.length);
      setNotice(`Loaded ${source.length} source files from ${rootName || active.name}. Analyze the project or ask DUNA to propose edits.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to read the selected project folder");
    } finally {
      setBusy(false);
    }
  }

  async function handleFolderImport(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (selected.length === 0) return;
    writableDirectoryRef.current = null;
    setWritableFolderName("");
    const firstRelative = selected.find((file) => file.webkitRelativePath)?.webkitRelativePath ?? selected[0].name;
    const rootName = firstRelative.includes("/") ? firstRelative.split("/")[0] : active.name;
    const items = selected.map((file) => {
      const fullPath = file.webkitRelativePath || file.name;
      const segments = fullPath.split("/");
      const path = file.webkitRelativePath && segments.length > 1 ? segments.slice(1).join("/") : file.name;
      return { file, path };
    });
    await loadLocalFiles(items, rootName);
  }

  async function openFolderPicker() {
    const browserWindow = window as DirectoryPickerWindow;
    if (!browserWindow.showDirectoryPicker) {
      setNotice("This browser does not support writable folder access. Use Chrome or Edge on localhost to review and apply patches; this fallback can only inspect files.");
      const inputElement = folderInputRef.current;
      if (inputElement) {
        inputElement.setAttribute("webkitdirectory", "");
        inputElement.setAttribute("directory", "");
        inputElement.click();
      }
      return;
    }

    try {
      const directory = await browserWindow.showDirectoryPicker({ mode: "readwrite" });
      writableDirectoryRef.current = directory;
      setWritableFolderName(directory.name);
      const selected = await collectWritableFolderFiles(directory);
      await loadLocalFiles(selected, directory.name);
      setNotice(`Loaded ${Math.min(selected.length, MAX_FILES)} eligible files from ${directory.name}. DUNA can apply only reviewed changes to existing files after your approval.`);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name !== "AbortError") setNotice(error instanceof Error ? error.message : "Unable to open a writable project folder");
    }
  }

  async function inspectCodebase() {
    if (sourceFiles.length === 0 || busy) return;
    setBusy(true);
    setNotice("");
    setPatchProposal(null);
    setInspection(null);
    setMessages([]);
    try {
      const response = await fetch("/api/project/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: codebaseName, files: sourceFiles })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Project inspection failed");
      setInspection(data.inspection as ProjectInspection);
      setInspectionContext(data.context as InspectionContext);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to inspect the selected project");
    } finally {
      setBusy(false);
    }
  }

  async function askAboutCodebase() {
    const question = input.trim();
    if (!question || busy || sourceFiles.length === 0) return;
    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setPatchProposal(null);
    setInput("");
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/project/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: codebaseName, question, files: sourceFiles })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Project question failed");
      setMessages([...next, { role: "assistant", content: data.answer || "I couldn't answer from the selected files." }]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to answer from the selected project files");
    } finally {
      setBusy(false);
    }
  }

  async function generatePatch() {
    const task = input.trim();
    if (!task || busy || sourceFiles.length === 0) return;
    setBusy(true);
    setNotice("");
    setPatchProposal(null);
    setInput("");
    try {
      const response = await fetch("/api/project/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: codebaseName, task, files: sourceFiles })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Patch generation failed");
      setPatchProposal(data.proposal as PatchProposal);
      setInspection(null);
      setPlan(null);
      setMessages([]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to generate a reviewed patch");
    } finally {
      setBusy(false);
    }
  }

  async function applyApprovedPatch() {
    const proposal = patchProposal;
    const root = writableDirectoryRef.current;
    if (!proposal || !root || busy) return;
    if (!window.confirm(`Approve and apply ${proposal.changes.length} reviewed file change(s) to ${writableFolderName}? DUNA will replace only these existing files.`)) return;

    setBusy(true);
    setNotice("");
    const written: { handle: WritableFileHandleLike; original: string; path: string }[] = [];
    try {
      // Request permission immediately inside the approval click so browsers that
      // require transient user activation can honor it. The folder picker already
      // asked for read/write access; this normally resolves without another prompt.
      const permission = root.requestPermission
        ? await root.requestPermission({ mode: "readwrite" })
        : await root.queryPermission?.({ mode: "readwrite" });
      if (permission !== "granted") throw new Error("Write permission was not granted. Re-open the project folder with read/write access.");

      const sourceByPath = new Map(sourceFiles.map((file) => [file.path, file.content]));
      const targets: { path: string; handle: WritableFileHandleLike; original: string; replacement: string }[] = [];
      for (const change of proposal.changes) {
        if (!isSafePatchPath(change.path)) throw new Error(`DUNA blocked unsafe path: ${change.path}`);
        const snapshot = sourceByPath.get(change.path);
        if (snapshot === undefined) throw new Error(`The original snapshot for ${change.path} is missing. Re-import the folder and generate a new proposal.`);
        if (await sha256Text(snapshot) !== change.baseSha256) throw new Error(`The approved proposal for ${change.path} no longer matches its original snapshot. Generate a fresh patch.`);
        const handle = await resolveExistingWritableFile(root, change.path);
        const current = await (await handle.getFile()).text();
        if (current !== snapshot) throw new Error(`${change.path} changed after import. No files were written. Re-import the folder and generate a fresh patch.`);
        targets.push({ path: change.path, handle, original: current, replacement: change.newContent });
      }

      for (const target of targets) {
        // Recheck immediately before writing to avoid clobbering an intervening edit.
        const latest = await (await target.handle.getFile()).text();
        if (latest !== target.original) throw new Error(`${target.path} changed during approval. Applying was stopped.`);
        // Register before writing so a partially completed write is included in rollback.
        written.push({ handle: target.handle, original: target.original, path: target.path });
        await writeExistingFile(target.handle, target.replacement);
      }

      const replacements = new Map(targets.map((target) => [target.path, target.replacement]));
      setSourceFiles((previous) => previous.map((file) => ({ ...file, content: replacements.get(file.path) ?? file.content })));
      setPatchProposal(null);
      setInspection(null);
      setInspectionContext(null);
      setNotice(`Approved patch applied to ${targets.length} existing file(s) in ${writableFolderName}. No commands were executed.`);
    } catch (error) {
      const rollbackFailures: string[] = [];
      for (const item of [...written].reverse()) {
        try { await writeExistingFile(item.handle, item.original); }
        catch { rollbackFailures.push(item.path); }
      }
      const baseMessage = error instanceof Error ? error.message : "Unable to apply the approved patch";
      setNotice(rollbackFailures.length > 0
        ? `${baseMessage} Rollback could not restore: ${rollbackFailures.join(", ")}. Check these files immediately.`
        : `${baseMessage}${written.length > 0 ? " Previously written files were restored." : " No files were changed."}`);
    } finally {
      setBusy(false);
    }
  }

  function discardPatch() {
    setPatchProposal(null);
    setNotice("Patch proposal discarded. No files were changed.");
  }

  async function send(text = input) {
    const value = text.trim();
    if (!value || busy) return;
    const next = [...messages, { role: "user" as const, content: value }];
    setMessages(next);
    setPlan(null);
    setPatchProposal(null);
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
    setPatchProposal(null);
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

  function renderConversation() {
    if (messages.length === 0) return null;
    return (
      <div className="conversation project-conversation">
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
    );
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
            onClick={() => {
              setActiveId(project.id); setMessages([]); setPlan(null); setSourceFiles([]);
              setCodebaseName(""); setInspection(null); setInspectionContext(null); setPatchProposal(null); setNotice("");
              writableDirectoryRef.current = null; setWritableFolderName("");
            }}
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
            <input
              ref={folderInputRef}
              className="hidden-folder-input"
              type="file"
              multiple
              onChange={handleFolderImport}
              aria-label="Choose project folder"
            />
            <button
              className="import-folder-button"
              onClick={openFolderPicker}
              disabled={busy}
              title="Import a local project folder"
            >
              <Upload size={15} /><span>Import folder</span>
            </button>
            <button className="icon-button" title="Terminal is disabled"><TerminalSquare size={18} /></button>
          </div>
        </header>

        <section className="content">
          {sourceFiles.length > 0 && (
            <section className="source-card">
              <div className="source-card-main">
                <div className="source-icon"><FolderOpen size={19} /></div>
                <div className="source-title"><b>{codebaseName}</b><small>{sourceFiles.length} source files loaded · {skippedLocalFiles} skipped or filtered · {writableFolderName ? "write access available" : "read-only import"}</small></div>
                <button className="inspect-button" onClick={inspectCodebase} disabled={busy}>
                  {busy ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                  {busy ? "Working…" : "Analyze project"}
                </button>
              </div>
              <details className="source-file-list">
                <summary><FileCode2 size={13} /> View selected file list</summary>
                <div>{sourceFiles.slice(0, 30).map((file) => <code key={file.path}>{file.path}</code>)}</div>
                {sourceFiles.length > 30 && <small>Showing 30 of {sourceFiles.length} files</small>}
              </details>
              <p className="privacy-note"><Info size={13} /> Selected text files are sent to your configured AI provider. Common secret files are excluded and credential-like values are redacted, but detection is not guaranteed. Proposed edits are not written until you review the diffs and explicitly approve them.</p>
            </section>
          )}

          {patchProposal ? (
            <div className="patch-review-view">
              <div className="patch-review-eyebrow"><FileCode2 size={15} /> CODE PATCH REVIEW <span>· APPROVAL REQUIRED</span></div>
              <h2>{patchProposal.summary}</h2>
              <div className="patch-review-safety"><ShieldCheck size={15} /> Proposal only. No files have been changed and no commands have been executed.</div>
              <div className="patch-review-count">{patchProposal.changes.length} existing file(s) proposed for update · maximum 3 files per patch</div>
              {patchProposal.changes.map((change) => (
                <section className="patch-change" key={change.path}>
                  <div className="patch-change-head"><code>{change.path}</code><span>UPDATE</span></div>
                  <p>{change.rationale}</p>
                  <details open className="patch-diff-details">
                    <summary>Review line-by-line diff</summary>
                    <pre>{change.diff.split("\n").map((line, index) => {
                      const className = line.startsWith("+++") || line.startsWith("---") ? "diff-file"
                        : line.startsWith("+") ? "diff-added"
                        : line.startsWith("-") ? "diff-removed"
                        : line.startsWith("@@") ? "diff-hunk" : "diff-context";
                      return <span className={className} key={`${index}-${line}`}>{line || " "}</span>;
                    })}</pre>
                  </details>
                </section>
              ))}
              {!writableFolderName && <div className="patch-readonly-warning"><AlertTriangle size={15} /> This folder was imported read-only. Re-import it using Chrome or Edge's folder picker to enable approved changes.</div>}
              <div className="patch-review-actions">
                <button className="discard-patch-button" onClick={discardPatch} disabled={busy}><X size={14} /> Discard proposal</button>
                <button className="apply-patch-button" onClick={applyApprovedPatch} disabled={busy || !writableFolderName}>
                  {busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                  {busy ? "Applying…" : `Approve & apply ${patchProposal.changes.length} file(s)`}
                </button>
              </div>
              <div className="patch-review-footer">Applying requires a separate confirmation, read/write folder permission, and an exact check that every target file still matches the imported snapshot. Only these existing files can be updated.</div>
            </div>
          ) : inspection ? (
            <div className="inspection-view">
              <div className="inspection-eyebrow"><FolderOpen size={15} /> REPOSITORY INTELLIGENCE <span>· READ ONLY</span></div>
              <h2>{inspection.projectType}</h2>
              <p className="inspection-summary">{inspection.summary}</p>
              {inspectionContext && (
                <div className="inspection-safety"><ShieldCheck size={15} /> Reviewed {inspectionContext.filesReviewed} files · {inspectionContext.valuesRedacted} values redacted · no files changed or commands run</div>
              )}
              {inspection.stack.length > 0 && (
                <section className="inspection-section">
                  <h3>Detected stack</h3>
                  <div className="stack-tags">{inspection.stack.map((item) => <span key={item}>{item}</span>)}</div>
                </section>
              )}
              {inspection.structure.length > 0 && (
                <section className="inspection-section">
                  <h3>Project structure</h3>
                  <div className="structure-list">{inspection.structure.map((item) => <article key={`${item.path}-${item.purpose}`}><code>{item.path}</code><span>{item.purpose}</span></article>)}</div>
                </section>
              )}
              {inspection.entryPoints.length > 0 && (
                <section className="inspection-section">
                  <h3>Likely entry points</h3>
                  <div className="structure-list">{inspection.entryPoints.map((item) => <article key={`${item.path}-${item.reason}`}><code>{item.path}</code><span>{item.reason}</span></article>)}</div>
                </section>
              )}
              {inspection.findings.length > 0 && (
                <section className="inspection-section">
                  <h3>Engineering findings <span>{inspection.findings.length}</span></h3>
                  <div className="finding-list">
                    {inspection.findings.map((finding, index) => (
                      <article className={`finding finding-${finding.severity}`} key={`${finding.title}-${index}`}>
                        <div><span className={`finding-severity severity-${finding.severity}`}>{finding.severity}</span><b>{finding.title}</b></div>
                        <p>{finding.detail}</p>
                        {finding.files.length > 0 && <small>{finding.files.join(" · ")}</small>}
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {inspection.recommendations.length > 0 && (
                <section className="inspection-section">
                  <h3>Recommended next steps</h3>
                  <ol>{inspection.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ol>
                </section>
              )}
              {inspection.unknowns.length > 0 && (
                <section className="inspection-section unknowns">
                  <h3><AlertTriangle size={14} /> Needs verification</h3>
                  <ul>{inspection.unknowns.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </section>
              )}
              <div className="inspection-footer">Repository intelligence is based only on the selected files. This is not a complete security audit or a verified build/test run.</div>
              {renderConversation()}
            </div>
          ) : plan ? (
            <div className="plan-view">
              <div className="plan-eyebrow"><ClipboardList size={15} /> IMPLEMENTATION PLAN <span>· REVIEW ONLY</span></div>
              <h2>{plan.summary}</h2>
              <div className="plan-safety"><ShieldCheck size={16} /> Plan generated. No files changed and no commands executed.</div>
              {plan.assumptions.length > 0 && (
                <section className="plan-section"><h3>Assumptions</h3><ul>{plan.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
              )}
              <section className="plan-section">
                <h3>Proposed steps <span>{plan.steps.length}</span></h3>
                <div className="plan-steps">
                  {plan.steps.map((step) => (
                    <article className="plan-step" key={step.id}>
                      <div className="plan-step-head"><span className="step-number">{String(step.id).padStart(2, "0")}</span><b>{step.title}</b><span className={`risk risk-${step.risk}`}>{step.risk} risk</span></div>
                      <p>{step.detail}</p>
                      {step.files.length > 0 && <div className="plan-files"><small>LIKELY FILES</small>{step.files.map((file) => <code key={file}>{file}</code>)}</div>}
                      {step.validation.length > 0 && <div className="plan-validation"><small>VALIDATION</small>{step.validation.map((item, index) => <div key={index}><CheckCircle2 size={13} /> {item}</div>)}</div>}
                    </article>
                  ))}
                </div>
              </section>
              <section className="plan-section acceptance"><h3>Acceptance criteria</h3><ul>{plan.acceptanceCriteria.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
              <div className="plan-footer">Next capability: repository-aware file inspection and human-reviewed patches. Agent execution is not enabled.</div>
            </div>
          ) : messages.length > 0 ? (
            renderConversation()
          ) : (
            <div className="welcome">
              <div className="orb"><Sparkles size={25} /></div>
              <div className="eyebrow">YOUR AI SOFTWARE ENGINEER</div>
              <h1>Build something<br /><em>remarkable.</em></h1>
              <p>DUNA can plan tasks, inspect a selected project folder, answer questions using supplied source files, and help improve your software.</p>
              <div className="suggestions">
                <button onClick={() => planTask("Create an implementation plan for a new software project. Include foundational milestones and key architecture decisions.")}>
                  <ClipboardList /><b>Plan a project</b><small>Turn an idea into an ordered implementation plan</small>
                </button>
                <button onClick={openFolderPicker}>
                  <FolderOpen /><b>Inspect a project</b><small>Map source files and identify engineering risks</small>
                </button>
                <button onClick={() => planTask("Create a testing strategy for my application, including unit, integration and end-to-end test coverage.")}>
                  <ShieldCheck /><b>Design tests</b><small>Build a practical quality strategy</small>
                </button>
              </div>
              {busy && <div className="thinking"><span /><span /><span /> DUNA is preparing your request…</div>}
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
                  if (inspection && sourceFiles.length > 0) askAboutCodebase();
                  else send();
                }
              }}
              placeholder={sourceFiles.length > 0 ? "Ask a question about the selected codebase…" : "Ask DUNA to build, debug, explain or plan…"}
              rows={2}
            />
            <div className="composer-foot">
              <span><Sparkles size={13} /> DUNA AI · Shift + Enter for new line</span>
              <div className="composer-actions">
                {sourceFiles.length > 0 && <button className="ask-code-button" onClick={askAboutCodebase} disabled={busy || !input.trim()}><MessageSquare size={14} /> Ask codebase</button>}
                {sourceFiles.length > 0 && <button className="propose-patch-button" onClick={generatePatch} disabled={busy || !input.trim()}><Sparkles size={14} /> Propose edits</button>}
                <button className="plan-button" onClick={() => planTask()} disabled={busy || !input.trim()}><ClipboardList size={14} /> Plan task</button>
                <button className="send" onClick={() => send()} disabled={busy || !input.trim()} title="Send message"><Send size={16} /></button>
              </div>
            </div>
          </div>
          <div className="disclaimer">DUNA can make mistakes. Review plans and every code diff. File changes require your explicit approval.</div>
        </section>
      </main>
    </div>
  );
}
