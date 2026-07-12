import { useEffect, useState } from "react";
import { useQuery } from "../../apiHooks";
import { client } from "../../client";
import type { ReviewSection } from "./ReviewTab";

export interface CockpitReviewState {
  journalEntries: { name: string; date: string }[];
  reviewSection: ReviewSection;
  setReviewSection: (section: ReviewSection) => void;
  selectedJournal: string | null;
  setSelectedJournal: (name: string | null) => void;
}

export function useCockpitReviewState(sym: string): CockpitReviewState {
  const { data: journal } = useQuery<{ name: string; date: string }[]>(`symbols.journal:${sym}`, () =>
    client.symbols.journal({ sym }),
  );
  const [reviewSection, setReviewSection] = useState<ReviewSection>("history");
  const [selectedJournal, setSelectedJournal] = useState<string | null>(null);
  useEffect(() => {
    setSelectedJournal(null);
    setReviewSection("history");
  }, [sym]);

  return { journalEntries: journal ?? [], reviewSection, setReviewSection, selectedJournal, setSelectedJournal };
}
