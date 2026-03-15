export interface NotificationsApi {
  sendAnalysisReportNotification(params: {
    email: string
    url: string
    reportUrl: string
    overallScore: number
  }): Promise<void>
}

export interface AnalyzerEnv {
  // Secrets
  API_KEY: string
  ANTHROPIC_API_KEY: string

  // R2
  REPORTS_BUCKET: R2Bucket

  // Queue
  ANALYZER_QUEUE: Queue<AnalyzerQueueMessage>

  // Workflow
  ANALYZER_WORKFLOW: Workflow

  // Service bindings
  NOTIFICATIONS: NotificationsApi

  // Vars
  WEB_APP_URL: string
}

export interface AnalyzerQueueMessage {
  reportId: string
  email: string
  url: string
}

export interface AnalyzerWorkflowParams {
  reportId: string
  email: string
  url: string
}
