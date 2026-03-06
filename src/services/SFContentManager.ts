import SFLazyVideo from "./SFLazyVideo";
import { vibrate } from "../util/haptics";

export default class SFContentManager {
  private container: HTMLElement;
  private frameIndex = 0;
  private videos = new WeakMap<HTMLVideoElement, SFLazyVideo>();
  private videoElements: NodeListOf<HTMLVideoElement> | null = null;
  private touchStartY: number | null = null;
  private touchStartT: number | null = null;
  private frameHeight: number | null = null;
  private frameWidth: number | null = null;
  private frameLeft: number | null = null;
  private abortController: AbortController | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.onResize();
  }

  public start() {
    this.videoElements = this.container.querySelectorAll("video");
    this.videoElements.forEach((el) => {
      this.videos.set(el, new SFLazyVideo(el));
    });

    this.addListeners();
  }

  public stop() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.touchStartT = null;
    this.frameIndex = 0;
    this.updateContainerStyle("--sf-scroll", "0px");
    this.updateContainerStyle("--sf-active-frame", "0");
  }

  private addListeners() {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    window.addEventListener("resize", this.onResize.bind(this), { signal });

    window.addEventListener(
      "pointerdown",
      (e) => {
        if (!this.container.contains(e.target as Node)) return;

        this.updateContainerStyle("cursor", "grabbing");
        this.onTouchStart(e.clientX, e.clientY);
      },
      { signal },
    );
    window.addEventListener(
      "pointerup",
      (e) => {
        this.updateContainerStyle("cursor", "grab");
        this.onTouchEnd(e.clientY);
      },
      { signal },
    );
    window.addEventListener(
      "pointermove",
      (e) => {
        this.onTouchMove(e.clientY);
      },
      { signal },
    );

    this.container.addEventListener(
      "transitionend",
      this.onTransitionEnd.bind(this),
      { signal },
    );

    this.container.addEventListener(
      "click",
      () => {
        this.updateVideoPlaybacks(0);
      },
      { signal, once: true },
    );
  }

  private updateContainerStyle(k: string, v: string) {
    this.container.style.setProperty(k, v);
  }

  private transitionFrame(ay: number, dy: number, n: number) {
    if (this.frameIndex + n < 0) {
      this.cancelScroll(ay, dy);
      return;
    }

    this.frameIndex += n;

    const ut = Math.sqrt((2 * dy) / ay);
    const t = Math.max(Math.min(ut, 500), 150);
    this.updateContainerStyle("--sf-scroll-transition", `${t}ms`);
    this.updateContainerStyle("--sf-scroll", "0px");
    this.updateContainerStyle("--sf-active-frame", `${this.frameIndex}`);

    if (n != 0) this.updateVideoPlaybacks(n);
  }

  private updateVideoPlaybacks(n: number) {
    if (!this.videoElements) return;

    const prevVideoIndex = this.frameIndex - n;
    if (prevVideoIndex >= 0 && prevVideoIndex < this.videoElements.length) {
      const prevVideo = this.videos.get(this.videoElements[prevVideoIndex]);
      prevVideo?.stop();
    }

    if (this.frameIndex < this.videoElements.length - 1) {
      const nextVideo = this.videos.get(
        this.videoElements[this.frameIndex + 1],
      );
      nextVideo?.load();
    }

    const currentVideo = this.getCurrentVideo();
    currentVideo?.start();
  }

  private getCurrentVideo() {
    if (!this.videoElements) return null;

    return this.videos.get(this.videoElements[this.frameIndex]) ?? null;
  }

  private scrollToNext(ay: number, dy: number) {
    this.transitionFrame(ay, dy, 1);
  }

  private scrollToPrev(ay: number, dy: number) {
    this.transitionFrame(ay, dy, -1);
  }

  private cancelScroll(ay: number, dy: number) {
    this.transitionFrame(ay, dy, 0);
  }

  private onTransitionEnd() {
    this.updateContainerStyle("--sf-scroll-transition", "0ms");
  }

  private onResize() {
    const el = document.querySelector(".sf-frame");

    if (!el) throw new Error("No frame element found");

    this.frameHeight = el.clientHeight;
    this.frameWidth = el.clientWidth;
    this.frameLeft = el.getBoundingClientRect().left;
  }

  private onTouchStart(x: number, y: number) {
    if (
      this.frameWidth === null ||
      this.frameHeight === null ||
      this.frameLeft === null
    )
      return;

    this.touchStartY = y;
    this.touchStartT = performance.now();

    if (x >= this.frameLeft + this.frameWidth * 0.85) {
      const currentVideo = this.getCurrentVideo();

      if (currentVideo) {
        currentVideo?.setSpeed(2);
        this.updateContainerStyle("--sf-sped-up", "1");
        vibrate();
      }
    }
  }

  private onTouchEnd(y: number) {
    if (
      this.touchStartY === null ||
      this.touchStartT === null ||
      this.frameHeight === null ||
      !this.videoElements
    )
      return;

    const dy = y - this.touchStartY;
    const dt = Math.max(performance.now() - this.touchStartT, 16);
    const ay = ((dy / this.frameHeight) * 100) / dt;
    const currentVideo = this.getCurrentVideo();

    if (Math.abs(ay) > 0.05) {
      if (ay < 0) {
        this.scrollToNext(ay, dy);
      } else {
        this.scrollToPrev(ay, dy);
      }
    } else if (Math.abs(dy) > this.frameHeight / 2) {
      if (dy < 0) {
        this.scrollToNext(ay, dy);
      } else {
        this.scrollToPrev(ay, dy);
      }
    } else {
      if (dt < 160 && Math.abs(dy) < 2) {
        currentVideo?.togglePlay();
      }

      this.cancelScroll(ay, dy);
    }

    this.touchStartY = null;
    this.touchStartT = null;

    currentVideo?.setSpeed(1);
    this.updateContainerStyle("--sf-sped-up", "0");
  }

  private onTouchMove(y: number) {
    if (this.touchStartY === null) return;

    const dy = y - this.touchStartY;

    if (dy > 0 && this.frameIndex === 0) {
      this.updateContainerStyle("--sf-scroll", `${Math.pow(dy, 0.8)}px`);
    } else {
      this.updateContainerStyle("--sf-scroll", `${dy}px`);
    }
  }
}
