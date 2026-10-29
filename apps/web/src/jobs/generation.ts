import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import {
  deliverGenerationCallback,
  executeGenerationJob,
} from '../bl/generation'
import {
  createGenerationDependencies,
  type GenerationWorkflowParams,
} from '../infrastructure/generation-dependencies'
export type { GenerationWorkflowParams } from '../infrastructure/generation-dependencies'

/** Durable continuation is independent of the HTTP/MCP connection that submitted it. */
export class GenerationWorkflow extends WorkflowEntrypoint<
  Env,
  GenerationWorkflowParams
> {
  async run(
    event: WorkflowEvent<GenerationWorkflowParams>,
    step: WorkflowStep,
  ) {
    let result: { jobId: string; status: string }
    try {
      result = await step.do(
        'execute-generation',
        { retries: { limit: 0, delay: '1 second' }, timeout: '15 minutes' },
        async () => {
          return executeGenerationJob(
            event.payload.jobId,
            createGenerationDependencies(this.env),
          )
        },
      )
    } catch (error) {
      await step.do(
        'deliver-callback',
        {
          retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
          timeout: '5 minutes',
        },
        () =>
          deliverGenerationCallback(
            event.payload.jobId,
            createGenerationDependencies(this.env),
          ),
      )
      throw error
    }
    await step.do(
      'deliver-callback',
      {
        retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
        timeout: '5 minutes',
      },
      () =>
        deliverGenerationCallback(
          event.payload.jobId,
          createGenerationDependencies(this.env),
        ),
    )
    return result
  }
}
