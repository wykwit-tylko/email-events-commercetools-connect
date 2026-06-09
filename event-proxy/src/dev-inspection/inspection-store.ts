export type InspectionEntry = {
  id: string;
  receivedAt: string;
  contentType?: string;
  requestBytes: number;
  publishedBytes: number;
  dryRun: boolean;
  bodyBase64: string;
};

export class InspectionStore {
  private readonly entries: InspectionEntry[] = [];
  private nextId = 1;

  constructor(private readonly maxMessages: number) {}

  add(entry: Omit<InspectionEntry, 'id' | 'receivedAt'>): InspectionEntry {
    const stored: InspectionEntry = {
      id: String(this.nextId),
      receivedAt: new Date().toISOString(),
      ...entry,
    };
    this.nextId += 1;

    this.entries.unshift(stored);

    if (this.entries.length > this.maxMessages) {
      this.entries.length = this.maxMessages;
    }

    return stored;
  }

  list(): InspectionEntry[] {
    return [...this.entries];
  }

  get(id: string): InspectionEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }

  clear(): void {
    this.entries.length = 0;
  }
}
