'use strict';
const crypto = require('crypto');
const antigravity = require('./antigravity');
const { roleById } = require('./vibe-roles');

function isGreeting(text) {
  const t = (text || '').toLowerCase().trim();
  return /^(hi|halo|hello|hai|hey|p|tes|test|pagi|siang|sore|malam|selamat\s+(pagi|siang|sore|malam)|apa kabar|kamu siapa|siapa kamu)[\s!?.]*$/i.test(t);
}

function isCodingTask(text) {
  const t = (text || '').toLowerCase();
  return /code|coding|fungsi|function|buat|bikin|tulis|implement|build|fix|debug|refactor|script|program|app|api|service|database|query|html|css|js|ts|python|rust|golang|endpoint|class/i.test(t);
}

class SessionManager {
  constructor({ onEvent, onChat, onNote, onCelebrate, onLeft }) {
    this.cb = { onEvent, onChat, onNote, onCelebrate, onLeft };
    this.agents = new Map();
    this.chats = new Map();
    this.initCoreTeam();
  }

  initCoreTeam() {
    const core = [
      { id: 'agent_pm', label: 'Gembul', roleEmoji: '👔', roleId: 'pm', projectDir: 'gembul/office', shirt: '#4A90E2' },
      { id: 'agent_dev', label: 'Tupon', roleEmoji: '💻', roleId: 'dev', projectDir: 'gembul/engineering', shirt: '#10B981' },
      { id: 'agent_qa', label: 'Uyee', roleEmoji: '🔍', roleId: 'qa', projectDir: 'gembul/quality', shirt: '#F5A623' }
    ];

    for (const a of core) {
      const sessionId = `core-${a.id}`;
      this.agents.set(a.id, {
        agentId: a.id,
        sessionId,
        label: a.label,
        roleEmoji: a.roleEmoji,
        roleId: a.roleId,
        projectDir: a.projectDir,
        model: 'gemini-3.8-flash',
        controllable: true,
        busy: false
      });
      this.cb.onEvent({
        kind: 'session_started',
        ts: Date.now(),
        sessionId,
        agentId: a.id,
        projectDir: a.projectDir,
        label: a.label
      });
    }
  }

  has(agentId) {
    return this.agents.has(agentId);
  }

  roleEmoji(agentId) {
    return this.agents.get(agentId)?.roleEmoji || '🧑‍💻';
  }

  pushChat(agentId, who, text) {
    const msg = { ts: Date.now(), who, text: String(text || '').slice(0, 8000) };
    const log = this.chats.get(agentId) || [];
    log.push(msg);
    if (log.length > 80) log.shift();
    this.chats.set(agentId, log);
    this.cb.onChat(agentId, msg);
  }

  trackUsage(agentId, inputText, outputText, model) {
    const input = Math.max(12, Math.round((inputText || '').length / 4));
    const output = Math.max(12, Math.round((outputText || '').length / 4));
    this.cb.onEvent({
      kind: 'usage',
      ts: Date.now(),
      sessionId: `session-${agentId}`,
      agentId,
      model: model || 'gemini-3.8-flash',
      usage: { input, output, cacheRead: 0, cacheWrite: 0 }
    });
  }

  async say(agentId, text, model) {
    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = this.agents.get('agent_pm');
      agentId = 'agent_pm';
    }
    if (!agent) return;

    if (model) agent.model = model;
    this.pushChat(agentId, 'you', text);
    await this.executePrompt(agent, text, model);
  }

  async executePrompt(agent, text, model) {
    const agentId = agent.agentId;
    const sessionId = agent.sessionId;
    const chosenModel = model || agent.model || 'gemini-3.8-flash';
    agent.busy = true;

    try {
      // 1. Gembul (PM): smart routing & auto-relay
      if (agentId === 'agent_pm') {
        this.cb.onEvent({ kind: 'thinking', ts: Date.now(), sessionId, agentId });

        if (isGreeting(text)) {
          const reply = await antigravity.generate(
            agentId,
            `You are Gembul, Project Manager and Solution Architect of Gembul Agent cluster.\nUser says: "${text}".\nGreet the user warmly, concisely, and helpfully in their language (Indonesian/English). State how you and your team (Tupon the Lead Developer and Uyee the QA & Security Auditor) can help with projects, code, or architecture.`,
            chosenModel
          );
          this.cb.onEvent({
            kind: 'tool_call',
            ts: Date.now(),
            sessionId,
            agentId,
            tool: 'edit',
            toolName: 'Balas',
            toolUseId: crypto.randomUUID().slice(0, 8),
            detail: 'Menjawab OPERATOR...'
          });
          this.pushChat(agentId, 'agent', reply);
          this.trackUsage(agentId, text, reply, chosenModel);
          this.cb.onEvent({ kind: 'tool_result', ts: Date.now(), sessionId, agentId, toolUseId: '0', isError: false });
          agent.busy = false;
          return;
        }

        const isCoding = isCodingTask(text);
        if (!isCoding) {
          const reply = await antigravity.generate(
            agentId,
            `You are Gembul, Project Manager & Solution Architect.\nUser objective: "${text}".\nAnswer directly, clearly, and helpfully in the user's language. Provide clear scoping, architecture, or explanation.`,
            chosenModel
          );
          this.cb.onEvent({
            kind: 'tool_call',
            ts: Date.now(),
            sessionId,
            agentId,
            tool: 'edit',
            toolName: 'Rencana',
            toolUseId: crypto.randomUUID().slice(0, 8),
            detail: 'Memberikan penjelasan arsitektur...'
          });
          this.pushChat(agentId, 'agent', reply);
          this.trackUsage(agentId, text, reply, chosenModel);
          this.cb.onEvent({ kind: 'tool_result', ts: Date.now(), sessionId, agentId, toolUseId: '0', isError: false });
          agent.busy = false;
          return;
        }

        // Auto-Relay Workflow: Gembul -> Tupon -> Uyee
        this.cb.onEvent({
          kind: 'tool_call',
          ts: Date.now(),
          sessionId,
          agentId,
          tool: 'task',
          toolName: 'Spesifikasi',
          toolUseId: crypto.randomUUID().slice(0, 8),
          detail: 'Merancang spesifikasi teknis untuk Tupon...'
        });
        const pmSpecs = await antigravity.generate(
          agentId,
          `You are Gembul, Project Manager. Objective from user: "${text}".\nCreate clear, concise, actionable technical specifications for Lead Developer (Tupon). Focus on architecture, interfaces, and criteria. No fluff.`,
          chosenModel
        );
        this.pushChat(agentId, 'agent', `📋 **Spesifikasi & Rencana Arsitektur dari Gembul:**\n\n${pmSpecs}`);
        this.trackUsage(agentId, text, pmSpecs, chosenModel);
        this.cb.onNote('agent_pm', '📋', `Gembul mendelegasikan tugas ke Tupon`);
        this.cb.onEvent({ kind: 'tool_result', ts: Date.now(), sessionId, agentId, toolUseId: '0', isError: false });

        const dev = this.agents.get('agent_dev');
        if (dev) {
          dev.busy = true;
          this.cb.onEvent({ kind: 'thinking', ts: Date.now(), sessionId: dev.sessionId, agentId: 'agent_dev' });
          this.cb.onEvent({
            kind: 'tool_call',
            ts: Date.now(),
            sessionId: dev.sessionId,
            agentId: 'agent_dev',
            tool: 'edit',
            toolName: 'Implementasi',
            toolUseId: crypto.randomUUID().slice(0, 8),
            detail: 'Tupon menulis kode solusi lengkap...'
          });
          const devCode = await antigravity.generate(
            'agent_dev',
            `You are Tupon, Lead Developer. Implement the technical solution for:\n${pmSpecs}\n\nOriginal goal: "${text}".\nProvide complete, working, production-grade code with concise explanation. No placeholders.`,
            chosenModel
          );
          this.pushChat('agent_dev', 'agent', devCode);
          this.pushChat('agent_pm', 'agent', `💻 **Solusi Kode dari Tupon (Developer):**\n\n${devCode}`);
          this.trackUsage('agent_dev', pmSpecs, devCode, chosenModel);
          this.cb.onNote('agent_dev', '💻', `Tupon menyerahkan kode ke Uyee untuk audit`);
          this.cb.onEvent({ kind: 'tool_result', ts: Date.now(), sessionId: dev.sessionId, agentId: 'agent_dev', toolUseId: '0', isError: false });
          dev.busy = false;

          const qa = this.agents.get('agent_qa');
          if (qa) {
            qa.busy = true;
            this.cb.onEvent({ kind: 'thinking', ts: Date.now(), sessionId: qa.sessionId, agentId: 'agent_qa' });
            this.cb.onEvent({
              kind: 'tool_call',
              ts: Date.now(),
              sessionId: qa.sessionId,
              agentId: 'agent_qa',
              tool: 'read',
              toolName: 'Audit',
              toolUseId: crypto.randomUUID().slice(0, 8),
              detail: 'Uyee mengaudit keamanan & edge-cases...'
            });
            const qaReport = await antigravity.generate(
              'agent_qa',
              `You are Uyee, Senior QA & Security Reviewer. Review the code deliverable from Tupon against goal: "${text}".\nCode:\n${devCode}\n\nHighlight security, edge-cases, concurrency, and give your final approval verdict.`,
              chosenModel
            );
            this.pushChat('agent_qa', 'agent', qaReport);
            this.pushChat('agent_pm', 'agent', `🔍 **Laporan Audit & Persetujuan Uyee (QA):**\n\n${qaReport}`);
            this.trackUsage('agent_qa', devCode, qaReport, chosenModel);
            this.cb.onNote('agent_qa', '🎉', `Uyee menyetujui deliverable! Task selesai.`);
            this.cb.onEvent({ kind: 'tool_result', ts: Date.now(), sessionId: qa.sessionId, agentId: 'agent_qa', toolUseId: '0', isError: false });
            qa.busy = false;

            if (this.cb.onCelebrate) this.cb.onCelebrate();
          }
        }
        agent.busy = false;
        return;
      }

      // 2. Direct Tupon (Developer)
      if (agentId === 'agent_dev') {
        this.cb.onEvent({ kind: 'thinking', ts: Date.now(), sessionId, agentId });
        this.cb.onEvent({
          kind: 'tool_call',
          ts: Date.now(),
          sessionId,
          agentId,
          tool: 'edit',
          toolName: 'Koding',
          toolUseId: crypto.randomUUID().slice(0, 8),
          detail: 'Menulis solusi kode...'
        });
        const reply = await antigravity.generate(
          agentId,
          `You are Tupon, Lead Developer. Respond directly to the user's coding request:\n"${text}".\nProvide clean, working code with concise explanation.`,
          chosenModel
        );
        this.pushChat(agentId, 'agent', reply);
        this.trackUsage(agentId, text, reply, chosenModel);
        this.cb.onEvent({ kind: 'tool_result', ts: Date.now(), sessionId, agentId, toolUseId: '0', isError: false });
        agent.busy = false;
        return;
      }

      // 3. Direct Uyee (QA)
      if (agentId === 'agent_qa') {
        this.cb.onEvent({ kind: 'thinking', ts: Date.now(), sessionId, agentId });
        this.cb.onEvent({
          kind: 'tool_call',
          ts: Date.now(),
          sessionId,
          agentId,
          tool: 'read',
          toolName: 'Audit',
          toolUseId: crypto.randomUUID().slice(0, 8),
          detail: 'Menganalisis & review...'
        });
        const reply = await antigravity.generate(
          agentId,
          `You are Uyee, Senior QA & Security Reviewer. Respond directly to the user's review/audit request:\n"${text}".\nHighlight security, edge-cases, and quality assurance recommendations.`,
          chosenModel
        );
        this.pushChat(agentId, 'agent', reply);
        this.trackUsage(agentId, text, reply, chosenModel);
        this.cb.onEvent({ kind: 'tool_result', ts: Date.now(), sessionId, agentId, toolUseId: '0', isError: false });
        agent.busy = false;
        return;
      }

      // 4. Custom hired agent
      const role = roleById(agent.roleId) || { title: agent.label, systemPrompt: 'You are a helpful specialist agent.' };
      this.cb.onEvent({ kind: 'thinking', ts: Date.now(), sessionId, agentId });
      this.cb.onEvent({
        kind: 'tool_call',
        ts: Date.now(),
        sessionId,
        agentId,
        tool: 'edit',
        toolName: role.title,
        toolUseId: crypto.randomUUID().slice(0, 8),
        detail: `Mengerjakan ${role.title}...`
      });
      const reply = await antigravity.generate(
        agentId,
        `${role.systemPrompt}\n\nTask from user: "${text}".\nProvide thorough, expert work with clear output.`,
        chosenModel
      );
      this.pushChat(agentId, 'agent', reply);
      this.trackUsage(agentId, text, reply, chosenModel);
      this.cb.onEvent({ kind: 'tool_result', ts: Date.now(), sessionId, agentId, toolUseId: '0', isError: false });
      agent.busy = false;
    } catch (err) {
      this.cb.onEvent({ kind: 'tool_result', ts: Date.now(), sessionId, agentId, toolUseId: '0', isError: true });
      this.pushChat(agentId, 'agent', `⚠️ Error: ${err.message}`);
      agent.busy = false;
    }
  }

  hire(roleId, task, cwd, mode, model) {
    const role = roleById(roleId) || { id: roleId, title: 'Specialist', emoji: '🧑‍💻', systemPrompt: '' };
    const agentId = `hired-${crypto.randomUUID().slice(0, 6)}`;
    const sessionId = `session-${agentId}`;
    const projectDir = cwd || 'gembul/projects';
    const label = `${role.title}`;

    const agent = {
      agentId,
      sessionId,
      label,
      roleEmoji: role.emoji,
      roleId: role.id,
      projectDir,
      model: model || 'gemini-3.8-flash',
      controllable: true,
      busy: false
    };
    this.agents.set(agentId, agent);

    this.cb.onEvent({
      kind: 'session_started',
      ts: Date.now(),
      sessionId,
      agentId,
      projectDir,
      label
    });

    this.cb.onNote(agentId, role.emoji, `Hired ${role.title}: ${task ? task.slice(0, 60) : 'standby'}`);

    if (task) {
      this.pushChat(agentId, 'you', task);
      setTimeout(() => {
        this.executePrompt(agent, task).catch(err => {
          this.pushChat(agentId, 'agent', `⚠️ Error: ${err.message}`);
        });
      }, 600);
    }

    return agentId;
  }

  stop(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.cb.onLeft(agentId);
    this.agents.delete(agentId);
    this.chats.delete(agentId);
  }
}

module.exports = { SessionManager, isGreeting, isCodingTask };
