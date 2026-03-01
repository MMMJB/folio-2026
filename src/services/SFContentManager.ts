import SFLazyVideo from "./SFLazyVideo";

export default class SFContentManager {
  private container: HTMLElement;
  private frameIndex = 0;
  private t = 0;
  private videos = new WeakMap<HTMLVideoElement, SFLazyVideo>();
  private videoElements: NodeListOf<HTMLVideoElement> | null = null;
  private touchStartY: number | null = null;
  private touchStartT: number | null = null;
  private frameHeight: number | null = null;
  private animationFrameId: number | null = null;
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

    let lastFrameTimestamp: number | null = null;
    const animate = (t: number) => {
      if (lastFrameTimestamp !== null) {
        const dt = t - lastFrameTimestamp;
        if (dt > 16) {
          this.t++;
          lastFrameTimestamp = t;
        }
      } else {
        lastFrameTimestamp = t;
      }

      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  public stop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.t = 0;
  }

  private addListeners() {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    window.addEventListener("resize", this.onResize.bind(this), { signal });

    this.container.addEventListener(
      "touchstart",
      (e) => {
        this.onTouchStart(e.touches[0].clientY);
      },
      { signal },
    );
    window.addEventListener(
      "touchend",
      (e) => {
        this.onTouchEnd(e.changedTouches[0].clientY);
      },
      { signal },
    );
    window.addEventListener(
      "touchmove",
      (e) => {
        this.onTouchMove(e.touches[0].clientY);
      },
      { signal },
    );

    this.container.addEventListener(
      "mousedown",
      (e) => {
        this.updateContainerStyle("cursor", "grabbing");
        this.onTouchStart(e.clientY);
      },
      { signal },
    );
    window.addEventListener(
      "mouseup",
      (e) => {
        this.updateContainerStyle("cursor", "grab");
        this.onTouchEnd(e.clientY);
      },
      { signal },
    );
    window.addEventListener(
      "mousemove",
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

    const ut = Math.sqrt((2 * dy) / ay) * 5;
    const t = Math.max(Math.min(ut, 300), 150);
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

    const currentVideo = this.videos.get(this.videoElements[this.frameIndex]);
    currentVideo?.start();
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
    this.frameHeight = document.querySelector(".sf-frame")?.clientHeight ?? 0;
  }

  private onTouchStart(y: number) {
    this.touchStartY = y;
    this.touchStartT = this.t;
  }

  private onTouchEnd(y: number) {
    if (
      this.touchStartY === null ||
      this.frameHeight === null ||
      !this.videoElements
    )
      return;

    const dy = y - this.touchStartY;
    const dt = this.t - (this.touchStartT ?? this.t);
    const ay = ((dy / this.frameHeight) * 100) / dt / dt;

    if (Math.abs(ay) > 0.1) {
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
      if (dt < 10) {
        const currentVideo = this.videos.get(
          this.videoElements[this.frameIndex],
        );
        currentVideo?.togglePlay();
      } else {
        this.cancelScroll(ay, dy);
      }
    }

    this.touchStartY = null;
  }

  private onTouchMove(y: number) {
    if (this.touchStartY === null) return;

    const dy = y - this.touchStartY;

    if (dy > 0 && this.frameIndex === 0) {
      this.updateContainerStyle("--sf-scroll", `${Math.pow(dy, 0.7)}px`);
    } else {
      this.updateContainerStyle("--sf-scroll", `${dy}px`);
    }
  }
}
