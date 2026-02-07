import os, json, gzip, time
from datetime import datetime

# === Configuration ===
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
CONTEXT_FILE = os.path.join(PROJECT_ROOT, "project-context.json.gz")
RAW_CONTEXT = os.path.join(PROJECT_ROOT, "project-context.json")
GUARDIAN_LOG = os.path.join(PROJECT_ROOT, "guardian.log")

EXCLUDE_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".next", ".guardian_history"}
EXCLUDE_FILES = {".env", ".env.local", "package-lock.json", "yarn.lock"}

# === Functions ===
def scan_project_structure(root_dir):
    """Walk through project and collect file metadata."""
    structure = []
    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for file in files:
            if file in EXCLUDE_FILES:
                continue
            if file.endswith((".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json", ".md")):
                path = os.path.join(root, file)
                try:
                    with open(path, "r", encoding="utf-8", errors="ignore") as f:
                        lines = f.readlines()
                    structure.append({
                        "file": os.path.relpath(path, root_dir),
                        "lines": len(lines),
                        "last_modified": os.path.getmtime(path)
                    })
                except Exception as e:
                    print(f"⚠️ Skipping {path}: {e}")
    return structure

def generate_summary(structure):
    total_files = len(structure)
    total_lines = sum(item['lines'] for item in structure)
    lang_stats = {}
    for item in structure:
        ext = os.path.splitext(item['file'])[1]
        lang_stats[ext] = lang_stats.get(ext, 0) + 1
    recent_files = sorted(structure, key=lambda x: x["last_modified"], reverse=True)[:5]
    recent_list = [f"{f['file']} ({f['lines']} lines)" for f in recent_files]
    summary = {
        "summary": f"Project has {total_files} tracked code files (~{total_lines} lines total).",
        "recent_files": recent_list,
        "language_breakdown": lang_stats,
        "total_lines": total_lines,
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    return summary

def save_compressed_context(data):
    with open(RAW_CONTEXT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    with gzip.open(CONTEXT_FILE, "wb") as gz:
        gz.write(json.dumps(data).encode("utf-8"))

def log_update(message):
    with open(GUARDIAN_LOG, "a", encoding="utf-8") as f:
        f.write(f"[{datetime.now()}] {message}\n")

def update_guardian_md(summary):
    md_path = os.path.join(PROJECT_ROOT, "guardian.md")
    if not os.path.exists(md_path):
        return
    with open(md_path, "r", encoding="utf-8") as f:
        content = f.read()
    marker = "## 📊 Latest Project Snapshot"
    snapshot = f"\n\n{marker}\n_Last sync: {summary['last_updated']}_\n```\n{json.dumps(summary, indent=2)}\n```"
    if marker in content:
        content = content.split(marker)[0] + snapshot
    else:
        content += snapshot
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(content)
    log_update("🧠 guardian.md updated with latest project snapshot.")

# === Main Execution ===
if __name__ == "__main__":
    print(f"🔍 Scanning project in: {PROJECT_ROOT}")
    structure = scan_project_structure(PROJECT_ROOT)
    summary = generate_summary(structure)
    save_compressed_context(summary)
    update_guardian_md(summary)
    log_update(f"✅ Guardian memory updated — {summary['summary']}")
    print("\n📊 Project Stats:")
    print(f"• {summary['summary']}")
    print(f"• Languages: {summary['language_breakdown']}")
    print(f"• Recently modified: {', '.join(summary['recent_files'])}")
    print(f"🕒 Last sync: {summary['last_updated']}")
    print("✅ Data compressed and saved to project-context.json.gz\n")
