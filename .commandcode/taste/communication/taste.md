# Communication

- Gives short, informal directives with minimal detail and expects the agent to explore the codebase and decide implementation specifics autonomously (e.g., "please check how X and Y communication. if not have yet please fix and do simple event"). Confidence: 0.8
- Requests are often phrased as "check X, and if not present, fix/implement it" — combining investigation and implementation in a single turn; expects the agent to proceed straight to a fix without a separate confirmation step. Confidence: 0.7
- Asks short "how do we/how can we monitor/observe X" questions about its own running stack — wants the agent to explain the observation mechanism AND stand up a live, verifiable demonstration against the running services (connect a real subscriber, publish a test event, prove delivery via ack/recipient count/presence), not just describe where the docs or dashboard are. Confidence: 0.75
