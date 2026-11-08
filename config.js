module.exports = {
  port: Number(process.env.PORT) || 3000,
  antigravityModel: process.env.ANTIGRAVITY_MODEL || 'gemini-3.8-flash',
  agents: [
    {
      id: "agent_pm",
      name: "Gembul",
      label: "Project Manager",
      specialty: "Scoping, Planning & Solution Architecture",
      role: "Project Manager & Solution Architect. Handles direct user conversation, answers general queries, scopes requirements, and delegates to Lead Developer (Tupon) only when code implementation is needed.",
      desk: { x: 150, y: 250 },
      color: "#4A90E2"
    },
    {
      id: "agent_dev",
      name: "Tupon",
      label: "Lead Developer",
      specialty: "Full-Stack Coding & Architecture",
      role: "Lead Software Engineer. Writes clean, complete, production-ready code, implements algorithms, refactors systems, and fixes technical bugs.",
      desk: { x: 450, y: 250 },
      color: "#10B981"
    },
    {
      id: "agent_qa",
      name: "Uyee",
      label: "QA & Security",
      specialty: "Code Audit & Security Review",
      role: "Senior QA & Security Reviewer. Audits code implementations, checks edge cases, concurrency & security vulnerabilities, and provides final sign-off.",
      desk: { x: 750, y: 250 },
      color: "#F5A623"
    }
  ]
};
