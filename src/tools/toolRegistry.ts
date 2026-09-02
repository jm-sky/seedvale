/**
 * Central `Tools` menu registry (plan tools-003). The Main Menu renders this
 * list instead of hardcoding a button per standalone tool app, so adding a
 * future tool (NPC Inspector, Settlement Browser, …) only needs one entry
 * here. Each `path` is a plain URL to that tool's own Vite entrypoint —
 * `Tools` navigates to separate apps, it never imports or runs their
 * Three.js scenes. Kept dependency-light so future tools don't enter the
 * gameplay bundle.
 */
export interface ToolDefinition {
  id: string
  label: string
  description?: string
  path: string
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'house-browser',
    label: 'House Browser',
    description: 'Browse modular house definitions',
    path: '/house-browser.html',
  },
  {
    id: 'asset-browser',
    label: 'Asset Browser',
    description: 'Browse available game assets',
    path: '/asset-browser.html',
  },
]
