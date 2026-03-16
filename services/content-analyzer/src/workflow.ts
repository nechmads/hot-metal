import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import type { AnalyzerEnv, AnalyzerWorkflowParams } from './env'
import { createLogger } from '@hotmetal/shared'
import { extractContentProfile } from './extractor/html-parser'
import { simulateCrawlers } from './extractor/crawler-sim'
import { analyzeContent } from './scorer/aggregator'

export class AnalyzerWorkflow extends WorkflowEntrypoint<AnalyzerEnv, AnalyzerWorkflowParams> {
  async run(event: WorkflowEvent<AnalyzerWorkflowParams>, step: WorkflowStep) {
    const { reportId, email, url } = event.payload

    const log = createLogger({
      service: 'content-analyzer',
      axiom: this.env.AXIOM_TOKEN && this.env.AXIOM_DATASET
        ? { token: this.env.AXIOM_TOKEN, dataset: this.env.AXIOM_DATASET }
        : undefined,
    }).child({ component: 'workflow', reportId, url })

    log.info('Starting analysis')

    // Step 1: Extract content and simulate crawlers in parallel
    const extractionJson = await step.do(
      'extract-content',
      { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '3 minutes' },
      async () => {
        const [profile, crawlerReport] = await Promise.all([
          extractContentProfile(url),
          simulateCrawlers(url),
        ])
        return JSON.stringify({ profile, crawlerReport })
      },
    )
    const extraction = JSON.parse(extractionJson as string)
    log.info('Step 1 done: extraction complete', {
      wordCount: extraction.profile.stats.wordCount,
      crawlersTested: extraction.crawlerReport.probes.length,
    })

    // Step 2: Score content (deterministic + LLM)
    const reportJson = await step.do(
      'score-content',
      { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '3 minutes' },
      async () => {
        const report = await analyzeContent({
          profile: extraction.profile,
          crawlerReport: extraction.crawlerReport,
          anthropicApiKey: this.env.ANTHROPIC_API_KEY,
        })
        return JSON.stringify(report)
      },
    )
    const report = JSON.parse(reportJson as string)
    log.info('Step 2 done: scoring complete', { overallScore: report.overallScore })

    // Step 3: Store report in R2
    await step.do(
      'store-report',
      { retries: { limit: 2, delay: '5 seconds' }, timeout: '30 seconds' },
      async () => {
        const storedReport = {
          ...report,
          _meta: {
            reportId,
            email,
            submittedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        }
        await this.env.REPORTS_BUCKET.put(
          `reports/${reportId}.json`,
          JSON.stringify(storedReport),
          { httpMetadata: { contentType: 'application/json' } },
        )
        return 'stored'
      },
    )
    log.info('Step 3 done: report stored')

    // Step 4: Email report link (non-critical — never fails the workflow)
    await step.do('send-email', async () => {
      try {
        const reportUrl = `${this.env.WEB_APP_URL}/analyze/reports/${reportId}`
        await this.env.NOTIFICATIONS.sendAnalysisReportNotification({
          email,
          url,
          reportUrl,
          overallScore: report.overallScore,
        })
        log.info('Step 4 done: email sent', { email })
      } catch (err) {
        log.error('Email send failed (non-critical)', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return 'done'
    })

    await log.flush()
    return { reportId, overallScore: report.overallScore }
  }
}
