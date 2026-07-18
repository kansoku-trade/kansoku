import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@web/api";
import { client } from "@web/client";

export interface NoteResponse {
  markdown: string | null;
  mtime?: string;
}

export function useNote(symbol: string) {
  const [note, setNote] = useState<NoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    setError(null);

    client.symbols
      .note({ sym: symbol })
      .then((data) => {
        if (active) setNote(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(errorMessage(err));
      });

    return () => {
      active = false;
    };
  }, [symbol, version]);

  return { note, error, reload };
}
