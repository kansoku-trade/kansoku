const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function eventCanvasSlug(eventId: string): string {
  const slug = `event-${eventId}`;
  if (!SLUG_RE.test(slug)) {
    throw new Error(`event canvas slug must stay kebab-case: ${eventId}`);
  }
  return slug;
}
