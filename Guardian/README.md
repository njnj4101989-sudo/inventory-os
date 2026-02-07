# 🧠 Guardian Agent — AI Coding Memory Companion

**Guardian** is a lightweight, local agent that keeps your AI coding environment (Claude, Cursor, or GPT) perfectly in sync — ensuring your web projects remain consistent and error-free between sessions.

---

## 🎯 Purpose
When using AI code editors like **Claude Code** or **Cursor**, project context often resets between sessions.  
This leads to:
- Inconsistent naming or broken imports  
- Missing references  
- Logic mismatches across frontend/backend  

Guardian solves this by maintaining a **compressed, auto-updating project context file** (`project-context.json.gz`) that the AI can reload anytime to restore full memory of your project.

---

## ⚙️ Setup

### 📦 Installation
Clone this repository:
```bash
git clone https://github.com/YOUR_USERNAME/guardian-agent.git
