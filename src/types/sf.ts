interface SFContentType {
  src: string;
  title: string;
  description: string;
}

export interface PartialSFContent extends SFContentType {
  type: "partial";
}

export interface FullSFContent extends SFContentType {
  type: "full";
  likes: number;
  views: number;
  shares: number;
  tags: string[];
  work: string | null;
}

export type SFContent = PartialSFContent | FullSFContent;
