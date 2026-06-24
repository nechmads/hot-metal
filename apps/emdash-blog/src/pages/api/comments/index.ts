import type { APIContext } from 'astro';
import { blogEnv } from '../../../lib/runtime';

export async function GET(context: APIContext): Promise<Response> {
  const url = new URL(context.request.url);
  const publicationSlug = url.searchParams.get('publicationSlug');
  const postSlug = url.searchParams.get('postSlug');

  if (!publicationSlug || !postSlug) {
    return Response.json({ error: 'Missing publicationSlug or postSlug' }, { status: 400 });
  }

  // No data layer in a bare preview — return an empty list so the island renders.
  if (!blogEnv.DAL) {
    return Response.json({ comments: [] }, { headers: { 'Cache-Control': 'no-cache' } });
  }

  const publication = await blogEnv.DAL.getPublicationBySlug(publicationSlug);
  if (!publication) {
    return Response.json({ error: 'Publication not found' }, { status: 404 });
  }

  if (!publication.commentsEnabled) {
    return Response.json({ comments: [] });
  }

  const comments = await blogEnv.DAL.listCommentsByPost(publication.id, postSlug);

  // Strip authorEmail — never expose publicly
  const safeComments = comments.map(({ authorEmail, ...rest }) => rest);

  return Response.json(
    { comments: safeComments },
    { headers: { 'Cache-Control': 'no-cache' } },
  );
}
