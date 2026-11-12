export class HoldRepeat {
  private timer?: ReturnType<typeof setTimeout>;

  start(step: () => boolean): void {
    this.stop();
    let delay = 350;
    const run = () => {
      this.timer = undefined;
      if (!step()) return;
      this.timer = setTimeout(run, delay);
      delay = Math.max(55, Math.round(delay * 0.65));
    };
    run();
  }

  stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
