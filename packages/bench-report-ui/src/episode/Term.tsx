import { Tooltip } from '../ui/Tooltip';
import { TERM_GLOSSARY } from './glossary';

export function Term({ label }: { label: string }) {
  return <Tooltip content={TERM_GLOSSARY[label] ?? null}>{label}</Tooltip>;
}
