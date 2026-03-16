/**
 * Lead tracking — records marketing leads to a Google Sheet.
 *
 * Provides a single `addLead()` entry point that any service can use.
 * Each lead source (analyzer, newsletter, waitlist, etc.) writes to
 * the same sheet with a `source` column for easy filtering.
 */

import { appendRows, type GoogleSheetsConfig } from './google-sheets'
import { logger } from './logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadEntry {
  /** Contact email. */
  email: string
  /** Where the lead came from (e.g. 'analyzer', 'newsletter', 'waitlist'). */
  source: string
  /** Arbitrary key-value metadata serialized into the sheet. */
  metadata?: Record<string, string>
}

export interface LeadsConfig {
  /** Google Sheets credentials + spreadsheet ID. */
  googleSheets: GoogleSheetsConfig
  /** Sheet/tab name inside the spreadsheet (defaults to "Leads"). */
  sheetName?: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a lead in the Google Sheet.
 *
 * Row format: [email, source, timestamp, metadata_json]
 *
 * This function never throws — lead tracking is non-critical and must not
 * break the calling workflow. Errors are logged.
 */
export async function addLead(config: LeadsConfig, lead: LeadEntry): Promise<void> {
  const log = logger('shared')
  const sheet = config.sheetName ?? 'Leads'

  try {
    const row = [
      lead.email,
      lead.source,
      new Date().toISOString(),
      lead.metadata ? JSON.stringify(lead.metadata) : '',
    ]

    await appendRows(config.googleSheets, sheet, [row])

    log.info('Lead recorded', {
      component: 'leads',
      source: lead.source,
    })
  } catch (err) {
    log.error('Failed to record lead (non-critical)', {
      component: 'leads',
      source: lead.source,
      error: err instanceof Error ? err : new Error(String(err)),
    })
  }
}
