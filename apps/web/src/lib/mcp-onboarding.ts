export const MCP_SERVER_URL = 'https://hotmetalapp.com/mcp'
export const HOTMETAL_SKILL_URL =
  'https://hotmetalapp.com/skills/use-hotmetal/SKILL.md'

export const HOTMETAL_SETUP_PROMPT = `Help me connect you to Hot Metal, my workspace for discovering content ideas, drafting articles, and publishing blog posts.

MCP server: ${MCP_SERVER_URL}
Transport: Streamable HTTP
Authentication: OAuth with my Hot Metal account
Agent skill: ${HOTMETAL_SKILL_URL}

Reuse an existing authenticated Hot Metal connection if available. Otherwise, if you can configure remote MCP connections, add this server and start OAuth. If you cannot, guide me through adding it in this assistant's connector settings. I will sign in and choose publications, read/write/publish permissions, and any social-sharing outlets. Do not ask me to paste passwords, access tokens, or API keys.

After connecting, fetch and read the skill file above to learn what Hot Metal is and how to use its tools. If you cannot read that URL, ask me to attach or paste the file. Discover the tools available to this connection, then use getMe and listPublications to verify access. Tell me which publications are accessible and stop after this read-only setup check. Do not create, edit, scout, or publish content during setup, and do not claim a successful connection unless the tool calls succeed. Use the skill for subsequent Hot Metal tasks in this chat.`
