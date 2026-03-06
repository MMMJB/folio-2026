export default class SFLazyVideo {
  private el: HTMLVideoElement;
  private resetTimeout: number | null = null;
  private isLoaded = false;

  constructor(el: HTMLVideoElement) {
    this.el = el;

    this.el.addEventListener("waiting", () => {
      this.el.style.opacity = "0.5";
    });

    this.el.addEventListener("playing", () => {
      this.el.style.opacity = "1";
    });
  }

  private clearResetTimeout() {
    if (this.resetTimeout !== null) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
  }

  public load() {
    if (this.isLoaded) return;

    const sources = this.el.querySelectorAll("source");
    sources.forEach((source) => {
      source.src = source.dataset.src ?? "";
    });

    this.el.load();

    this.isLoaded = true;
  }

  public start() {
    this.clearResetTimeout();
    this.el.play();
  }

  public stop(frozen = false) {
    this.clearResetTimeout();

    this.el.pause();

    if (!frozen) {
      this.resetTimeout = setTimeout(() => {
        if (this.el.paused) {
          this.el.currentTime = 0;
        }
      }, 1000);
    }
  }

  public togglePlay() {
    if (this.el.paused) {
      this.start();
      return false;
    } else {
      this.stop(true);
      return true;
    }
  }

  public setSpeed(speed: number) {
    this.el.playbackRate = speed;
  }
}
