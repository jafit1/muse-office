const defaultKey = process.env.MUSE_API_KEY || "mgst_jfWtPT3iw7fw1RA711k7mAjc9-9UwDXf7SQo-VgGcQw";

module.exports = {
  port: process.env.PORT || 61342,
  museBaseUrl: process.env.MUSE_BASE_URL || 'https://api.muse.ai/v1',
  agents: [
    {
      id: "agent_pm",
      name: "Alice (Project Manager)",
      role: "Breakdown user goal into clear tasks, assign to Developer, and ensure overall alignment.",
      apiKey: process.env.MUSE_KEY_PM || defaultKey,
      desk: { x: 120, y: 140 },
      color: "#4A90E2"
    },
    {
      id: "agent_dev",
      name: "Bob (Developer)",
      role: "Write code, design logic, and provide complete technical implementations for tasks from PM.",
      apiKey: process.env.MUSE_KEY_DEV || defaultKey,
      desk: { x: 340, y: 140 },
      color: "#50E3C2"
    },
    {
      id: "agent_qa",
      name: "Charlie (Reviewer / QA)",
      role: "Audit solutions, verify security and edge-cases, and sign-off on the final deliverable.",
      apiKey: process.env.MUSE_KEY_QA || defaultKey,
      desk: { x: 560, y: 140 },
      color: "#F5A623"
    }
  ]
};
