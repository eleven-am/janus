import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { config } from '@/config'
import { startHuAgent } from '@/agent/hu-client'

let huInitialized = false

function initHuAgent() {
  if (huInitialized) return
  huInitialized = true

  if (!config.HU_URL || !config.HU_AGENT_ID) {
    console.log('[Janus] Hu agent not configured, skipping')
    return
  }

  try {
    startHuAgent()
    console.log('[Janus] Hu agent started')
  } catch (err) {
    console.error('[Janus] Failed to start Hu agent:', err)
  }
}

setTimeout(initHuAgent, 1000)

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request)
  },
})
