export type QueueWorker = (path: string) => Promise<void>;

export interface QueueState {
  /** Items waiting in line (not yet picked up by a worker). */
  pending: number;
  /** Items currently being processed by a worker. */
  active: number;
  /** Total tombstoned paths. */
  tombstoned: number;
}

export type QueueListener = (state: QueueState) => void;

export class TwinQueue {
  private readonly inFlight = new Set<string>();
  private readonly pending: string[] = [];
  private readonly failedPaths = new Set<string>();
  private active = 0;
  private idleResolvers: Array<() => void> = [];
  private readonly listeners: QueueListener[] = [];

  constructor(
    private readonly run: QueueWorker,
    private readonly concurrency = 8,
  ) {}

  enqueue(path: string): void {
    if (this.inFlight.has(path)) return;
    if (this.failedPaths.has(path)) return;
    this.inFlight.add(path);
    this.pending.push(path);
    this.notify();
    this.drain();
  }

  /** True if a previous run of `path` failed; future enqueues for it are no-ops. */
  tombstoned(path: string): boolean {
    return this.failedPaths.has(path);
  }

  /**
   * Mark a path as permanently failed without it having thrown out of the worker.
   * Callers use this when a step inside the worker reports failure via a return
   * value rather than an exception (e.g. `ensurePreview` returning "failed").
   */
  markFailed(path: string): void {
    this.failedPaths.add(path);
    this.notify();
  }

  /** Clear the failure tombstone for one path (or all). Lets the user retry after fixing the underlying issue. */
  clearTombstone(path?: string): void {
    if (path === undefined) this.failedPaths.clear();
    else this.failedPaths.delete(path);
    this.notify();
  }

  size(): number {
    return this.pending.length + this.active;
  }

  state(): QueueState {
    return {
      pending: this.pending.length,
      active: this.active,
      tombstoned: this.failedPaths.size,
    };
  }

  /**
   * Subscribe to queue size/state changes. Listeners are called whenever
   * pending, active, or tombstoned counts change. Used by the status-bar
   * progress UI in main.ts.
   */
  onChange(listener: QueueListener): void {
    this.listeners.push(listener);
  }

  async idle(): Promise<void> {
    if (this.active === 0 && this.pending.length === 0) return;
    await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }

  private notify(): void {
    if (this.listeners.length === 0) return;
    const state = this.state();
    for (const l of this.listeners) {
      try {
        l(state);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[attachments-autopilot] queue listener error", err);
      }
    }
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const path = this.pending.shift() as string;
      this.active += 1;
      this.notify();
      this.run(path)
        .catch((err) => {
          this.failedPaths.add(path);
          // eslint-disable-next-line no-console
          console.error("[attachments-autopilot] twin queue error", path, err);
        })
        .finally(() => {
          this.active -= 1;
          this.inFlight.delete(path);
          this.notify();
          if (this.pending.length > 0) {
            this.drain();
          } else if (this.active === 0) {
            const resolvers = this.idleResolvers;
            this.idleResolvers = [];
            for (const r of resolvers) r();
          }
        });
    }
  }
}
