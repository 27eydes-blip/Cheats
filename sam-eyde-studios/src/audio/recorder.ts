/**
 * Microphone capture: getUserMedia (all voice processing OFF so the take is raw)
 * + MediaRecorder, with an analyser for the live input meter.
 */
export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private scratch: Float32Array<ArrayBuffer> | null = null;
  private meterPeak = 0;

  get active(): boolean {
    return this.recorder !== null && this.recorder.state !== "inactive";
  }

  async open(ctx: AudioContext): Promise<void> {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone is not available (the app must be opened over HTTPS).");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.scratch = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser); // meter only — the mic is never routed to the output
  }

  /** Starts recording. Resolves once the recorder has actually started. */
  start(): Promise<void> {
    const stream = this.stream;
    if (!stream) return Promise.reject(new Error("Microphone is not open"));
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find(
      (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    );
    this.chunks = [];
    const rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      audioBitsPerSecond: 256000,
    });
    this.recorder = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    return new Promise((resolve, reject) => {
      rec.onstart = () => resolve();
      rec.onerror = () => reject(new Error("Recording failed to start"));
      rec.start();
    });
  }

  /** Stops recording and returns the encoded take. */
  stop(): Promise<Blob> {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") return Promise.resolve(new Blob(this.chunks));
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType }));
      rec.stop();
    });
  }

  /** Current input level, 0..1 (peak with a little hold/decay). */
  level(): number {
    if (!this.analyser || !this.scratch) return 0;
    this.analyser.getFloatTimeDomainData(this.scratch);
    let peak = 0;
    for (let i = 0; i < this.scratch.length; i++) {
      const v = Math.abs(this.scratch[i]);
      if (v > peak) peak = v;
    }
    this.meterPeak = Math.max(peak, this.meterPeak * 0.9);
    return Math.min(1, this.meterPeak);
  }

  close(): void {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.source = null;
    this.analyser = null;
    this.meterPeak = 0;
  }
}
