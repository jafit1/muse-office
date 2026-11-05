module.exports = {
  port: process.env.PORT || 3000,
  museBaseUrl: process.env.MUSE_BASE_URL || 'https://api.muse.ai/v1',
  agents: [
    {
      id: "agent_pm",
      name: "Alice (Project Manager)",
      role: "Breakdown user goal into clear tasks, assign to Developer, and ensure overall alignment.",
      apiKey: process.env.MUSE_KEY_PM || "",
      desk: { x: 120, y: 140 },
      color: "#4A90E2"
    },
    {
      id: "agent_dev",
      name: "Bob (Developer)",
      role: "Write code, design logic, and provide complete technical implementations for tasks from PM.",
      apiKey: process.env.MUSE_KEY_DEV || "",
      desk: { x: 340, y: 140 },
      color: "#50E3C2"
    },
    {
      id: "agent_qa",
      name: "Charlie (Reviewer / QA)",
      role: "Audit solutions, verify security and edge-cases, and sign-off on the final deliverable.",
      apiKey: process.env.MUSE_KEY_QA || "",
      desk: { x: 560, y: 140 },
      color: "#F5A623"
    }
  ]
};
