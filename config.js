module.exports = {
  port: Number(process.env.PORT) || 3000,
  antigravityModel: process.env.ANTIGRAVITY_MODEL || 'gemini-3.8-flash',
  agents: [
    {
      id: "agent_pm",
      name: "Gembul",
      label: "PROJECT MANAGER",
      role: "Breakdown user goal into clear tasks, assign to Developer, and ensure overall alignment.",
      desk: { x: 150, y: 250 },
      color: "#4A90E2"
    },
    {
      id: "agent_dev",
      name: "Bulu",
      label: "DEVELOPER",
      role: "Write code, design logic, and provide complete technical implementations for tasks from PM.",
      desk: { x: 450, y: 250 },
      color: "#50E3C2"
    },
    {
      id: "agent_qa",
      name: "Kecil",
      label: "REVIEWER / QA",
      role: "Audit solutions, verify security and edge-cases, and sign-off on the final deliverable.",
      desk: { x: 750, y: 250 },
      color: "#F5A623"
    }
  ]
};
