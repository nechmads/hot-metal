import type { APIContext } from 'astro';
import { checkContent } from '@hotmetal/shared';
import { blogEnv } from '../../../lib/runtime';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CONTENT_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;

interface SubmitBody {
  publicationSlug: string;
  postSlug: string;
  authorName: string;
  authorEmail?: string;
  content: string;
  parentId?: string;
  turnstileToken: string;
}

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

export async function POST(context: APIContext): Promise<Response> {
  if (!blogEnv.DAL || !blogEnv.TURNSTILE_SECRET_KEY) {
    return Response.json({ error: 'Comments are not available' }, { status: 503 });
  }

  let body: SubmitBody;
  try {
    body = (await context.request.json()) as SubmitBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { publicationSlug, postSlug, authorName, authorEmail, content, parentId, turnstileToken } = body;

  // Validate required fields
  if (!publicationSlug || !postSlug || !authorName?.trim() || !content?.trim()) {
    return Response.json(
      { error: 'publicationSlug, postSlug, authorName, and content are required' },
      { status: 400 },
    );
  }

  if (authorName.trim().length > MAX_NAME_LENGTH) {
    return Response.json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 });
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return Response.json({ error: `Comment must be ${MAX_CONTENT_LENGTH} characters or fewer` }, { status: 400 });
  }

  if (authorEmail && !EMAIL_RE.test(authorEmail)) {
    return Response.json({ error: 'Invalid email format' }, { status: 400 });
  }

  if (!turnstileToken) {
    return Response.json({ error: 'Turnstile verification required' }, { status: 400 });
  }

  // Verify Turnstile
  const turnstileValid = await verifyTurnstile(turnstileToken, blogEnv.TURNSTILE_SECRET_KEY);
  if (!turnstileValid) {
    return Response.json({ error: 'Bot verification failed. Please try again.' }, { status: 403 });
  }

  // Resolve publication
  const publication = await blogEnv.DAL.getPublicationBySlug(publicationSlug);
  if (!publication) {
    return Response.json({ error: 'Publication not found' }, { status: 404 });
  }

  if (!publication.commentsEnabled) {
    return Response.json({ error: 'Comments are not enabled for this publication' }, { status: 403 });
  }

  // Content filter (check both name and content)
  const nameFilter = checkContent(authorName);
  if (!nameFilter.passed) {
    return Response.json({ error: 'Name contains inappropriate language' }, { status: 400 });
  }

  const contentFilter = checkContent(content);
  if (!contentFilter.passed) {
    return Response.json({ error: contentFilter.reason }, { status: 400 });
  }

  // Threading validation
  if (parentId) {
    const parent = await blogEnv.DAL.getCommentById(parentId);
    if (!parent) {
      return Response.json({ error: 'Parent comment not found' }, { status: 400 });
    }
    if (parent.parentId !== null) {
      return Response.json({ error: 'Cannot reply to a reply' }, { status: 400 });
    }
    if (parent.publicationId !== publication.id || parent.postSlug !== postSlug) {
      return Response.json({ error: 'Parent comment does not belong to this post' }, { status: 400 });
    }
  }

  // Determine status based on moderation mode
  const status = publication.commentsModeration === 'pre-approve' ? 'pending' : 'approved';

  const comment = await blogEnv.DAL.createComment({
    id: crypto.randomUUID(),
    publicationId: publication.id,
    postSlug,
    parentId: parentId ?? null,
    authorName: authorName.trim(),
    authorEmail: authorEmail?.trim() || null,
    content: content.trim(),
    status,
  });

  // Fire-and-forget notification for auto-approved comments
  if (status === 'approved' && blogEnv.NOTIFICATIONS) {
    const postUrl = `${new URL(context.request.url).origin}/${postSlug}`;
    const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;
    blogEnv.NOTIFICATIONS.sendNewCommentNotification({
      userId: publication.userId,
      publicationName: publication.name,
      postSlug,
      commenterName: authorName.trim(),
      commentPreview: preview,
      postUrl,
    }).catch(() => {
      // Notification failure must not affect the comment submission
    });
  }

  if (status === 'pending') {
    return Response.json(
      { message: 'Your comment has been submitted and is pending review', status: 'pending' },
      { status: 201 },
    );
  }

  // Strip authorEmail from response
  const { authorEmail: _, ...safeComment } = comment;
  return Response.json({ comment: safeComment }, { status: 201 });
}
