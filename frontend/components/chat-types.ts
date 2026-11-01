export type Trace = { agent: string; detail: string; ms: number };
export type Source = { docId: string; fileName: string };

export type Msg = {
  role: "user" | "ai"; text: string;
  sources?: Source[]; trace?: Trace[];
  verified?: boolean | null;  // undefined = still working, true/false = verifier result, null = no verifier ran
  corrected?: boolean;        // true if the draft was replaced by a re-checked answer
};

export type Conv = { id: string; title: string; updated_at: string };