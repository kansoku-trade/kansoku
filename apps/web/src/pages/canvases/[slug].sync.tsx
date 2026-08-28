import { Navigate, useParams } from 'react-router';
import { researchCanvasPath } from '@kansoku/core/contract/research';

export function Component() {
  const slug = decodeURIComponent(useParams().slug ?? '');
  const path = slug ? researchCanvasPath(slug) : '';
  const search = new URLSearchParams({ view: 'canvases' });
  if (path) search.set('path', path);
  return <Navigate to={`/research?${search.toString()}`} replace />;
}
