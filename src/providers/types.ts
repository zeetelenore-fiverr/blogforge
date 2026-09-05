/** A provider row decrypted and normalised for the adapters to consume. */
export type RuntimeProvider = {
  rowId: number;
  providerId: string;
  adapter: string;
  label: string;
  apiKey: string;
  model: string;
  extra: Record<string, string>;
};

export type ImageResult = {
  /** Either a hosted URL or a data: URI we persist to /public/uploads. */
  url: string;
  provider: string;
  width?: number;
  height?: number;
  attribution?: string;
};

export type KeywordSuggestion = {
  keyword: string;
  source: string;
  intent?: string;
  volume?: number | null;
  difficulty?: number | null;
  seed?: string;
};
