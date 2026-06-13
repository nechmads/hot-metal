/**
 * OpenAPI 3.1.0 specification for the Hot Metal Agents API v1.
 *
 * Exported as a plain object so it can be served as JSON from the
 * /agents-api/v1/openapi.json endpoint.
 */

const BASE_URL = 'https://hotmetalapp.com'

const errorResponse = (description: string) => ({
	description,
	content: {
		'application/json': {
			schema: { $ref: '#/components/schemas/ErrorResponse' },
		},
	},
})

const quotaErrorResponse = {
	description: 'Quota exceeded — upgrade plan for higher limits',
	content: {
		'application/json': {
			schema: { $ref: '#/components/schemas/QuotaErrorResponse' },
		},
	},
}

const jsonBody = (schema: Record<string, unknown>, required = true) => ({
	...(required ? { required: true } : {}),
	content: { 'application/json': { schema } },
})

export const openapiSpec = {
	openapi: '3.1.0',
	info: {
		title: 'Hot Metal Agents API',
		version: '1.0.0',
		description:
			'Public REST API for AI agents to manage publications, topics, ideas, drafts, and publishing on the Hot Metal platform. Authenticate with a `Bearer hm_*` API key.',
		contact: { email: 'hello@hotmetalapp.com' },
	},
	servers: [{ url: `${BASE_URL}/agents-api/v1`, description: 'Production' }],
	security: [{ apiKeyAuth: [] }],

	// ── Paths ──────────────────────────────────────────────────────────────

	paths: {
		// ── Me ──
		'/me': {
			get: {
				operationId: 'getMe',
				summary: 'Get current user',
				description: 'Returns the authenticated user profile derived from the API key.',
				tags: ['User'],
				responses: {
					200: {
						description: 'Current user info',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: { $ref: '#/components/schemas/User' },
									},
								},
							},
						},
					},
					401: errorResponse('Invalid or missing API key'),
				},
			},
		},

		// ── Publications list + create ──
		'/publications': {
			get: {
				operationId: 'listPublications',
				summary: 'List publications',
				description: 'Returns all publications owned by the authenticated user.',
				tags: ['Publications'],
				responses: {
					200: {
						description: 'Array of publications',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'array',
											items: { $ref: '#/components/schemas/Publication' },
										},
									},
								},
							},
						},
					},
				},
			},
			post: {
				operationId: 'createPublication',
				summary: 'Create a publication',
				description:
					'Creates a new publication and syncs it with the CMS. Subject to tier limits on publication count.',
				tags: ['Publications'],
				requestBody: jsonBody({
					type: 'object',
					required: ['name', 'slug'],
					properties: {
						name: { type: 'string', description: 'Publication name' },
						slug: {
							type: 'string',
							pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
							description: 'URL slug (lowercase, hyphens only)',
						},
						description: { type: 'string' },
						writingTone: { type: 'string' },
						defaultAuthor: { type: 'string' },
						autoPublishMode: { $ref: '#/components/schemas/AutoPublishMode' },
						cadencePostsPerWeek: { type: 'integer', minimum: 1 },
						scoutSchedule: { $ref: '#/components/schemas/ScoutSchedule' },
						timezone: { type: 'string', description: 'IANA timezone (e.g. America/New_York)' },
					},
				}),
				responses: {
					201: {
						description: 'Publication created',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/Publication' } },
								},
							},
						},
					},
					400: errorResponse('Validation error (bad slug, timezone, etc.)'),
					403: quotaErrorResponse,
				},
			},
		},

		// ── Publication by ID ──
		'/publications/{id}': {
			get: {
				operationId: 'getPublication',
				summary: 'Get a publication',
				description: 'Returns a single publication with its topics array.',
				tags: ['Publications'],
				parameters: [{ $ref: '#/components/parameters/PublicationId' }],
				responses: {
					200: {
						description: 'Publication with topics',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: { $ref: '#/components/schemas/PublicationWithTopics' },
									},
								},
							},
						},
					},
					404: errorResponse('Publication not found'),
				},
			},
			patch: {
				operationId: 'updatePublication',
				summary: 'Update a publication',
				description: 'Updates publication settings. All fields are optional.',
				tags: ['Publications'],
				parameters: [{ $ref: '#/components/parameters/PublicationId' }],
				requestBody: jsonBody(
					{
						type: 'object',
						properties: {
							name: { type: 'string' },
							slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
							description: { type: ['string', 'null'] },
							writingTone: { type: ['string', 'null'] },
							defaultAuthor: { type: 'string' },
							autoPublishMode: { $ref: '#/components/schemas/AutoPublishMode' },
							cadencePostsPerWeek: { type: 'integer', minimum: 1 },
							scoutSchedule: { $ref: '#/components/schemas/ScoutSchedule' },
							timezone: { type: 'string' },
							scoutEnabled: { type: 'boolean', description: 'When false, automation is paused: the scout will not run on its schedule. The saved schedule is preserved and resumes when set back to true.' },
							styleId: { type: ['string', 'null'] },
							templateId: { type: 'string', enum: ['starter', 'editorial', 'bold'] },
							feedFullEnabled: { type: 'boolean' },
							feedPartialEnabled: { type: 'boolean' },
							commentsEnabled: { type: 'boolean' },
							commentsModeration: { type: 'string', enum: ['auto-approve', 'pre-approve'] },
						},
					},
					false,
				),
				responses: {
					200: {
						description: 'Updated publication',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/Publication' } },
								},
							},
						},
					},
					400: errorResponse('Validation error'),
					403: quotaErrorResponse,
					404: errorResponse('Publication not found'),
				},
			},
			delete: {
				operationId: 'deletePublication',
				summary: 'Delete a publication',
				tags: ['Publications'],
				parameters: [{ $ref: '#/components/parameters/PublicationId' }],
				responses: {
					200: {
						description: 'Deleted',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/DeletedResponse' } },
								},
							},
						},
					},
					404: errorResponse('Publication not found'),
				},
			},
		},

		// ── Posts ──
		'/publications/{id}/posts': {
			get: {
				operationId: 'listPosts',
				summary: 'List published posts',
				description:
					'Returns up to 50 published posts for the publication from the CMS. Returns an empty array if no CMS link exists.',
				tags: ['Publications'],
				parameters: [{ $ref: '#/components/parameters/PublicationId' }],
				responses: {
					200: {
						description: 'Array of posts',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: { type: 'array', items: { $ref: '#/components/schemas/Post' } },
									},
								},
							},
						},
					},
					404: errorResponse('Publication not found'),
				},
			},
		},

		// ── Topics ──
		'/publications/{pubId}/topics': {
			get: {
				operationId: 'listTopics',
				summary: 'List topics',
				description: 'Returns all topics for a publication.',
				tags: ['Topics'],
				parameters: [{ $ref: '#/components/parameters/PubId' }],
				responses: {
					200: {
						description: 'Array of topics',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'array',
											items: { $ref: '#/components/schemas/Topic' },
										},
									},
								},
							},
						},
					},
					404: errorResponse('Publication not found'),
				},
			},
			post: {
				operationId: 'createTopic',
				summary: 'Create a topic',
				description: 'Creates a topic under a publication. Subject to tier limits on topic count.',
				tags: ['Topics'],
				parameters: [{ $ref: '#/components/parameters/PubId' }],
				requestBody: jsonBody({
					type: 'object',
					required: ['name'],
					properties: {
						name: { type: 'string', description: 'Topic name' },
						description: { type: 'string' },
						priority: { type: 'integer', enum: [1, 2, 3], default: 1, description: '1 = highest' },
					},
				}),
				responses: {
					201: {
						description: 'Topic created',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/Topic' } },
								},
							},
						},
					},
					400: errorResponse('Validation error (missing name, bad priority)'),
					403: quotaErrorResponse,
					404: errorResponse('Publication not found'),
				},
			},
		},

		'/topics/{id}': {
			patch: {
				operationId: 'updateTopic',
				summary: 'Update a topic',
				tags: ['Topics'],
				parameters: [{ $ref: '#/components/parameters/TopicId' }],
				requestBody: jsonBody(
					{
						type: 'object',
						properties: {
							name: { type: 'string' },
							description: { type: ['string', 'null'] },
							priority: { type: 'integer', enum: [1, 2, 3] },
							isActive: { type: 'boolean' },
						},
					},
					false,
				),
				responses: {
					200: {
						description: 'Updated topic',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/Topic' } },
								},
							},
						},
					},
					400: errorResponse('Validation error'),
					404: errorResponse('Topic not found'),
				},
			},
			delete: {
				operationId: 'deleteTopic',
				summary: 'Delete a topic',
				tags: ['Topics'],
				parameters: [{ $ref: '#/components/parameters/TopicId' }],
				responses: {
					200: {
						description: 'Deleted',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/DeletedResponse' } },
								},
							},
						},
					},
					404: errorResponse('Topic not found'),
				},
			},
		},

		// ── Ideas ──
		'/publications/{pubId}/ideas': {
			get: {
				operationId: 'listIdeas',
				summary: 'List ideas',
				description: 'Returns ideas for a publication, optionally filtered by status.',
				tags: ['Ideas'],
				parameters: [
					{ $ref: '#/components/parameters/PubId' },
					{
						name: 'status',
						in: 'query',
						schema: { $ref: '#/components/schemas/IdeaStatus' },
						description: 'Filter by idea status',
					},
				],
				responses: {
					200: {
						description: 'Array of ideas',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'array',
											items: { $ref: '#/components/schemas/Idea' },
										},
									},
								},
							},
						},
					},
					400: errorResponse('Invalid status filter'),
					404: errorResponse('Publication not found'),
				},
			},
		},

		'/ideas/{id}': {
			get: {
				operationId: 'getIdea',
				summary: 'Get an idea',
				tags: ['Ideas'],
				parameters: [
					{
						name: 'id',
						in: 'path',
						required: true,
						schema: { type: 'string', format: 'uuid' },
					},
				],
				responses: {
					200: {
						description: 'Idea details',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/Idea' } },
								},
							},
						},
					},
					404: errorResponse('Idea not found'),
				},
			},
		},

		// ── Styles ──
		'/styles': {
			get: {
				operationId: 'listStyles',
				summary: 'List writing styles',
				description:
					"Returns all writing styles available to the user: custom styles they've created plus prebuilt system styles.",
				tags: ['Styles'],
				responses: {
					200: {
						description: 'Array of writing styles',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'array',
											items: { $ref: '#/components/schemas/WritingStyle' },
										},
									},
								},
							},
						},
					},
				},
			},
		},

		// ── Draft generation ──
		'/publications/{id}/drafts/generate': {
			post: {
				operationId: 'generateDraft',
				summary: 'Generate a draft',
				description:
					'Instructs the AI writer agent to generate a draft for the publication. Without `webhookUrl` the call blocks until the draft is ready (synchronous). With `webhookUrl` the call returns 202 immediately and delivers the result via webhook (asynchronous).',
				tags: ['Drafts'],
				parameters: [{ $ref: '#/components/parameters/PublicationId' }],
				requestBody: jsonBody({
					type: 'object',
					required: ['title', 'instructions'],
					properties: {
						title: { type: 'string', description: 'Working title for the draft' },
						instructions: {
							type: 'string',
							description: 'Detailed writing instructions for the AI agent',
						},
						styleId: {
							type: 'string',
							format: 'uuid',
							description: 'Writing style to use (from GET /styles)',
						},
						autoPublish: {
							type: 'boolean',
							default: false,
							description: 'If true, publish the draft to CMS automatically on completion',
						},
						webhookUrl: {
							type: 'string',
							format: 'uri',
							description:
								'HTTPS URL to receive the result asynchronously. Must not point to private/internal addresses.',
						},
					},
				}),
				responses: {
					200: {
						description: 'Draft generated (synchronous mode)',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: { $ref: '#/components/schemas/GenerationResult' },
									},
								},
							},
						},
					},
					202: {
						description: 'Generation started (asynchronous mode with webhookUrl)',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'object',
											properties: {
												sessionId: { type: 'string', format: 'uuid' },
												status: { type: 'string', example: 'generating' },
											},
										},
									},
								},
							},
						},
					},
					400: errorResponse('Validation error (missing fields, bad webhook URL)'),
					403: quotaErrorResponse,
					404: errorResponse('Publication not found'),
					500: errorResponse('Draft generation failed'),
				},
			},
		},

		// ── Sessions ──
		'/sessions/{id}': {
			get: {
				operationId: 'getSession',
				summary: 'Get session status',
				description: 'Returns session status and a summary of the current draft.',
				tags: ['Sessions'],
				parameters: [{ $ref: '#/components/parameters/SessionId' }],
				responses: {
					200: {
						description: 'Session with draft summary',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/Session' } },
								},
							},
						},
					},
					404: errorResponse('Session not found'),
				},
			},
		},

		'/sessions/{id}/drafts/{version}': {
			get: {
				operationId: 'getDraftVersion',
				summary: 'Get a draft version',
				description: 'Returns the full content of a specific draft version.',
				tags: ['Sessions'],
				parameters: [
					{ $ref: '#/components/parameters/SessionId' },
					{
						name: 'version',
						in: 'path',
						required: true,
						schema: { type: 'integer', minimum: 1 },
						description: 'Draft version number',
					},
				],
				responses: {
					200: {
						description: 'Draft content',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/Draft' } },
								},
							},
						},
					},
					400: errorResponse('Invalid version number'),
					404: errorResponse('Session or draft version not found'),
				},
			},
		},

		// ── Publish ──
		'/sessions/{id}/publish': {
			post: {
				operationId: 'publishDraft',
				summary: 'Publish a draft',
				description:
					'Publishes the session draft to the CMS and optionally shares to LinkedIn and/or Twitter.',
				tags: ['Publishing'],
				parameters: [{ $ref: '#/components/parameters/SessionId' }],
				requestBody: jsonBody(
					{
						type: 'object',
						properties: {
							slug: { type: 'string', description: 'URL slug for the published post' },
							author: { type: 'string', description: 'Author name override' },
							tags: { type: 'string', description: 'Comma-separated tags' },
							excerpt: { type: 'string', description: 'Custom excerpt / meta description' },
							draftVersion: {
								type: 'integer',
								minimum: 1,
								description: 'Specific draft version to publish (defaults to latest)',
							},
							publishToLinkedIn: { type: 'boolean', default: false },
							publishToTwitter: { type: 'boolean', default: false },
							tweetText: {
								type: 'string',
								maxLength: 256,
								description: 'Custom tweet text (max ~256 chars to leave room for link)',
							},
							linkedInText: {
								type: 'string',
								maxLength: 3000,
								description: 'Custom LinkedIn post text',
							},
						},
					},
					false,
				),
				responses: {
					200: {
						description: 'Published successfully',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/PublishResult' } },
								},
							},
						},
					},
					400: errorResponse('Validation error (tweet text too long)'),
					403: quotaErrorResponse,
					404: errorResponse('Session not found'),
					500: errorResponse('Publish failed'),
				},
			},
		},

		// ── Scout ──
		'/publications/{id}/scout/run': {
			post: {
				operationId: 'runScout',
				summary: 'Trigger content scout',
				description:
					'Triggers the content scout to find new content ideas for the publication. Runs asynchronously. Optionally sends results to a webhook URL.',
				tags: ['Scout'],
				parameters: [{ $ref: '#/components/parameters/PublicationId' }],
				requestBody: jsonBody(
					{
						type: 'object',
						properties: {
							webhookUrl: {
								type: 'string',
								format: 'uri',
								description:
									'HTTPS URL to receive scout results. Must not point to private/internal addresses.',
							},
						},
					},
					false,
				),
				responses: {
					200: {
						description: 'Scout run queued',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'object',
											properties: { queued: { type: 'boolean', example: true } },
										},
									},
								},
							},
						},
					},
					400: errorResponse('Invalid webhook URL'),
					404: errorResponse('Publication not found'),
					502: errorResponse('Scout service returned error'),
					503: errorResponse('Scout service unavailable'),
				},
			},
		},
	},

	// ── Components ─────────────────────────────────────────────────────────

	components: {
		securitySchemes: {
			apiKeyAuth: {
				type: 'http',
				scheme: 'bearer',
				description: 'API key token starting with `hm_`. Get yours from the Hot Metal dashboard.',
			},
		},

		parameters: {
			PublicationId: {
				name: 'id',
				in: 'path',
				required: true,
				schema: { type: 'string', format: 'uuid' },
				description: 'Publication ID',
			},
			PubId: {
				name: 'pubId',
				in: 'path',
				required: true,
				schema: { type: 'string', format: 'uuid' },
				description: 'Publication ID',
			},
			TopicId: {
				name: 'id',
				in: 'path',
				required: true,
				schema: { type: 'string', format: 'uuid' },
				description: 'Topic ID',
			},
			SessionId: {
				name: 'id',
				in: 'path',
				required: true,
				schema: { type: 'string', format: 'uuid' },
				description: 'Session ID',
			},
		},

		schemas: {
			// ── Enums ──
			AutoPublishMode: {
				type: 'string',
				enum: ['ideas-only', 'draft', 'full-auto'],
				description:
					'`ideas-only` — scout generates ideas only; `draft` — auto-generate drafts for review; `full-auto` — generate and publish automatically',
			},
			IdeaStatus: {
				type: 'string',
				enum: ['new', 'reviewed', 'promoted', 'dismissed'],
			},
			TopicPriority: {
				type: 'integer',
				enum: [1, 2, 3],
				description: '1 = highest priority, 3 = lowest',
			},

			// ── Composite types ──
			ScoutSchedule: {
				oneOf: [
					{
						type: 'object',
						required: ['type', 'hour'],
						properties: {
							type: { type: 'string', const: 'daily' },
							hour: { type: 'integer', minimum: 0, maximum: 23 },
						},
						description: 'Run daily at a specific hour (UTC)',
					},
					{
						type: 'object',
						required: ['type', 'count'],
						properties: {
							type: { type: 'string', const: 'times_per_day' },
							count: { type: 'integer', minimum: 2, maximum: 6 },
						},
						description: 'Run N times per day, evenly spaced',
					},
					{
						type: 'object',
						required: ['type', 'days', 'hour'],
						properties: {
							type: { type: 'string', const: 'every_n_days' },
							days: { type: 'integer', minimum: 2, maximum: 7 },
							hour: { type: 'integer', minimum: 0, maximum: 23 },
						},
						description: 'Run every N days at a specific hour (UTC)',
					},
				],
			},

			// ── Resource schemas ──
			User: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					email: { type: 'string', format: 'email' },
					name: { type: 'string' },
					tier: { type: 'string', description: 'User plan tier (e.g. free, pro)' },
				},
			},

			Publication: {
				type: 'object',
				properties: {
					id: { type: 'string', format: 'uuid' },
					userId: { type: 'string' },
					name: { type: 'string' },
					slug: { type: 'string' },
					description: { type: ['string', 'null'] },
					writingTone: { type: ['string', 'null'] },
					defaultAuthor: { type: 'string' },
					autoPublishMode: { $ref: '#/components/schemas/AutoPublishMode' },
					cadencePostsPerWeek: { type: 'integer' },
					scoutSchedule: { $ref: '#/components/schemas/ScoutSchedule' },
					timezone: { type: 'string' },
					nextScoutAt: { type: ['integer', 'null'], description: 'Unix timestamp of the next scheduled scout run; null when automation is paused' },
					scoutEnabled: { type: 'boolean', description: 'Whether automated scouting is enabled. When false, the scout never runs on its schedule.' },
					cmsPublicationId: { type: ['string', 'null'], format: 'uuid' },
					styleId: { type: ['string', 'null'], format: 'uuid' },
					templateId: { type: 'string' },
					tagline: { type: ['string', 'null'] },
					logoUrl: { type: ['string', 'null'] },
					headerImageUrl: { type: ['string', 'null'] },
					accentColor: { type: ['string', 'null'] },
					socialLinks: { type: ['object', 'null'] },
					feedFullEnabled: { type: 'boolean' },
					feedPartialEnabled: { type: 'boolean' },
					commentsEnabled: { type: 'boolean' },
					commentsModeration: { type: 'string', enum: ['auto-approve', 'pre-approve'] },
					customDomain: { type: ['string', 'null'] },
					metaDescription: { type: ['string', 'null'] },
					createdAt: { type: 'integer', description: 'Unix timestamp' },
					updatedAt: { type: 'integer', description: 'Unix timestamp' },
				},
			},

			PublicationWithTopics: {
				allOf: [
					{ $ref: '#/components/schemas/Publication' },
					{
						type: 'object',
						properties: {
							topics: {
								type: 'array',
								items: { $ref: '#/components/schemas/Topic' },
							},
						},
					},
				],
			},

			Topic: {
				type: 'object',
				properties: {
					id: { type: 'string', format: 'uuid' },
					publicationId: { type: 'string', format: 'uuid' },
					name: { type: 'string' },
					description: { type: ['string', 'null'] },
					priority: { $ref: '#/components/schemas/TopicPriority' },
					isActive: { type: 'boolean' },
					createdAt: { type: 'integer', description: 'Unix timestamp' },
					updatedAt: { type: 'integer', description: 'Unix timestamp' },
				},
			},

			Idea: {
				type: 'object',
				properties: {
					id: { type: 'string', format: 'uuid' },
					publicationId: { type: 'string', format: 'uuid' },
					topicId: { type: ['string', 'null'], format: 'uuid' },
					title: { type: 'string' },
					angle: { type: 'string' },
					summary: { type: 'string' },
					sources: {
						type: ['array', 'null'],
						items: {
							type: 'object',
							properties: {
								url: { type: 'string', format: 'uri' },
								title: { type: 'string' },
								snippet: { type: 'string' },
								publishedAt: { type: 'string', format: 'date-time' },
							},
						},
					},
					status: { $ref: '#/components/schemas/IdeaStatus' },
					sessionId: { type: ['string', 'null'], format: 'uuid' },
					relevanceScore: { type: ['number', 'null'] },
					createdAt: { type: 'integer', description: 'Unix timestamp' },
					updatedAt: { type: 'integer', description: 'Unix timestamp' },
				},
			},

			WritingStyle: {
				type: 'object',
				properties: {
					id: { type: 'string', format: 'uuid' },
					userId: {
						type: ['string', 'null'],
						description: 'null for prebuilt system styles',
					},
					name: { type: 'string' },
					description: { type: ['string', 'null'] },
					systemPrompt: { type: 'string' },
					isPrebuilt: { type: 'boolean' },
					createdAt: { type: 'integer' },
					updatedAt: { type: 'integer' },
				},
				description:
					'Writing styles control the AI writer\'s tone and voice. Includes both user-created and prebuilt system styles.',
			},

			Post: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					title: { type: 'string' },
					slug: { type: 'string' },
					status: { type: 'string' },
					createdAt: { type: 'integer' },
					updatedAt: { type: 'integer' },
				},
			},

			Draft: {
				type: 'object',
				properties: {
					version: { type: 'integer' },
					title: { type: ['string', 'null'] },
					content: { type: 'string', description: 'HTML content' },
					wordCount: { type: 'integer' },
					isFinal: { type: 'boolean' },
					createdAt: { type: 'integer' },
				},
			},

			Session: {
				type: 'object',
				properties: {
					id: { type: 'string', format: 'uuid' },
					title: { type: ['string', 'null'] },
					status: { type: 'string', enum: ['active', 'completed', 'archived'] },
					publicationId: { type: ['string', 'null'], format: 'uuid' },
					cmsPostId: { type: ['string', 'null'] },
					currentDraftVersion: { type: 'integer' },
					currentDraft: {
						type: ['object', 'null'],
						properties: {
							id: { type: 'string' },
							version: { type: 'integer' },
							title: { type: ['string', 'null'] },
							wordCount: { type: 'integer' },
							createdAt: { type: 'integer' },
						},
						description: 'Summary of the latest draft (null if unavailable)',
					},
					createdAt: { type: 'integer' },
					updatedAt: { type: 'integer' },
				},
			},

			GenerationResult: {
				type: 'object',
				properties: {
					sessionId: { type: 'string', format: 'uuid' },
					draft: {
						type: 'object',
						properties: {
							version: { type: 'integer' },
							title: { type: ['string', 'null'] },
							content: { type: 'string' },
							wordCount: { type: 'integer' },
						},
					},
					status: { type: 'string', example: 'draft_ready' },
				},
			},

			PublishResult: {
				type: 'object',
				properties: {
					postId: { type: 'string' },
					slug: { type: 'string' },
					url: { type: 'string', format: 'uri' },
					social: {
						type: 'object',
						properties: {
							linkedin: {
								type: 'object',
								properties: {
									success: { type: 'boolean' },
									error: { type: 'string' },
								},
							},
							twitter: {
								type: 'object',
								properties: {
									success: { type: 'boolean' },
									error: { type: 'string' },
								},
							},
						},
					},
				},
			},

			// ── Error schemas ──
			ErrorResponse: {
				type: 'object',
				required: ['error', 'code'],
				properties: {
					error: { type: 'string', description: 'Human-readable error message' },
					code: {
						type: 'string',
						description: 'Machine-readable error code',
						enum: [
							'NOT_FOUND',
							'VALIDATION_ERROR',
							'FORBIDDEN',
							'QUOTA_EXCEEDED',
							'INVALID_JSON',
							'GENERATION_FAILED',
							'PUBLISH_FAILED',
							'SERVICE_UNAVAILABLE',
							'BAD_GATEWAY',
							'INTERNAL_ERROR',
						],
					},
				},
			},

			QuotaErrorResponse: {
				allOf: [
					{ $ref: '#/components/schemas/ErrorResponse' },
					{
						type: 'object',
						properties: {
							limit: { type: 'integer', description: 'Maximum allowed by current plan' },
							current: { type: 'integer', description: 'Current usage count' },
							upgradeEmail: {
								type: 'string',
								format: 'email',
								description: 'Contact email to upgrade plan',
							},
						},
					},
				],
			},

			DeletedResponse: {
				type: 'object',
				properties: {
					deleted: { type: 'boolean', example: true },
				},
			},

			// ── Webhook payload ──
			WebhookPayload: {
				type: 'object',
				description:
					'Payload delivered to webhook URLs. Signed with HMAC-SHA256 (X-HotMetal-Signature header).',
				properties: {
					event: {
						type: 'string',
						enum: ['draft.ready', 'draft.published', 'draft.failed', 'scout.completed'],
					},
					sessionId: { type: 'string', format: 'uuid' },
					publicationId: { type: 'string', format: 'uuid' },
					data: { type: 'object', description: 'Event-specific payload (draft content, etc.)' },
					error: { type: 'string', description: 'Error message (only on failure events)' },
					timestamp: { type: 'string', format: 'date-time' },
				},
			},
		},
	},
}
