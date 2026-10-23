/** One in-flight job and one replaceable latest request; never build a worker queue. */
export class HeatJobs<T> {
  private busy = false;
  private visible = false;
  private pending?: T;
  private epoch = 0;
  private sentEpoch = 0;
  constructor(private send: (job: T) => void, private paint: (pixels: Uint8ClampedArray) => void) {}
  update(job: T, visible: boolean): void {
    if (visible !== this.visible) this.epoch++;
    this.visible = visible; this.pending = visible ? job : undefined;
    this.flush();
  }
  complete(pixels: Uint8ClampedArray): void {
    this.busy = false;
    if (this.visible && this.sentEpoch === this.epoch) this.paint(pixels);
    this.flush();
  }
  private flush(): void {
    if (this.busy || this.pending === undefined || !this.visible) return;
    const job = this.pending; this.pending = undefined; this.busy = true; this.sentEpoch = this.epoch;
    this.send(job);
  }
}
