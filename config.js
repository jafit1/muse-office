module.exports = {
  port: process.env.PORT || 61342,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
  agents: [
    {
      id: "agent_pm",
      name: "Alice (Project Manager)",
      role: "Breakdown user goal into clear tasks, assign to Developer, and ensure overall alignment.",
      apiKey: process.env.GEMINI_KEY_PM || process.env.GEMINI_API_KEY || '',
      desk: { x: 120, y: 140 },
      color: "#4A90E2"
    },
    {
      id: "agent_dev",
      name: "Bob (Developer)",
      role: "Write code, design logic, and provide complete technical implementations for tasks from PM.",
      apiKey: process.env.GEMINI_KEY_DEV || process.env.GEMINI_API_KEY || '',
      desk: { x: 340, y: 140 },
      color: "#50E3C2"
    },
    {
      id: "agent_qa",
      name: "Charlie (Reviewer / QA)",
      role: "Audit solutions, verify security and edge-cases, and sign-off on the final deliverable.",
      apiKey: process.env.GEMINI_KEY_QA || process.env.GEMINI_API_KEY || '',
      desk: { x: 560, y: 140 },
      color: "#F5A623"
    }
  ]
};
