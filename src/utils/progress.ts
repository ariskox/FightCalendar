import { SingleBar, Presets } from "cli-progress";
import { green, cyan, magenta } from "colorette";

export class ProgressBar {
  private bar: SingleBar;
  private total: number;

  constructor(total: number) {
    this.total = total;
    this.bar = new SingleBar(
      {
        format: `${magenta("{bar}")} ${cyan("{percentage}%")} | {value}/{total} | {promotion}`,
        hideCursor: true,
        barCompleteChar: "[42m ",
        barIncompleteChar: "[41m ",
        fps: 30
      },
      Presets.shades_classic
    );
    this.bar.start(total, 0, { promotion: "" });
  }

  update(value: number, promotion: string) {
    this.bar.update(value, { promotion: green(promotion) });
  }

  increment(promotion: string) {
    this.bar.increment(1, { promotion: green(promotion) });
  }

  stop() {
    this.bar.stop();
  }
}
