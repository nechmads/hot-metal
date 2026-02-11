import type { PublicationOutlet, CreatePublicationOutletInput } from '../types'

interface PublicationOutletRow {
	id: string
	publication_id: string
	connection_id: string
	auto_publish: number
	settings: string | null
	created_at: number
	updated_at: number
}

function mapRow(row: PublicationOutletRow): PublicationOutlet {
	return {
		id: row.id,
		publicationId: row.publication_id,
		connectionId: row.connection_id,
		autoPublish: row.auto_publish === 1,
		settings: row.settings,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export async function createPublicationOutlet(
	db: D1Database,
	data: CreatePublicationOutletInput
): Promise<PublicationOutlet> {
	const id = crypto.randomUUID()
	const now = Math.floor(Date.now() / 1000)

	await db
		.prepare(
			`INSERT INTO publication_outlets (id, publication_id, connection_id, auto_publish, settings, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			data.publicationId,
			data.connectionId,
			data.autoPublish ? 1 : 0,
			data.settings ?? null,
			now,
			now
		)
		.run()

	return {
		id,
		publicationId: data.publicationId,
		connectionId: data.connectionId,
		autoPublish: data.autoPublish ?? false,
		settings: data.settings ?? null,
		createdAt: now,
		updatedAt: now,
	}
}

export async function listOutletsByPublication(
	db: D1Database,
	publicationId: string
): Promise<PublicationOutlet[]> {
	const result = await db
		.prepare('SELECT * FROM publication_outlets WHERE publication_id = ? ORDER BY created_at ASC')
		.bind(publicationId)
		.all<PublicationOutletRow>()
	return (result.results ?? []).map(mapRow)
}

export async function deletePublicationOutlet(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM publication_outlets WHERE id = ?').bind(id).run()
}
