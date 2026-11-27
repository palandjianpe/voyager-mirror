// Photo and video capture. Files are saved straight to this computer's Downloads folder.
export interface SourceView { el: CanvasImageSource | null; w: number; h: number; visible: boolean }

const stamp = () => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export class Capture {
  recording = false;
  startedAt = 0;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private wantPhoto = false;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(private gl: HTMLCanvasElement, private source: () => SourceView, private notify: (msg: string) => void) {}

  get canRecord() { return typeof MediaRecorder !== 'undefined' && 'captureStream' in this.canvas; }

  photo() { this.wantPhoto = true; }

  toggleRecord() {
    if (this.recording) { this.rec?.stop(); return; }
    if (!this.canRecord) { this.notify('Video recording is not supported in this browser'); return; }
    this.size();
    const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const stream = this.canvas.captureStream(30);
    this.rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
    this.rec.onstop = () => {
      this.recording = false;
      const type = this.rec?.mimeType || mime || 'video/webm';
      download(new Blob(this.chunks, { type }), `voyager-${stamp()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
      this.notify('Video saved to Downloads');
    };
    this.rec.start(500);
    this.recording = true; this.startedAt = performance.now();
  }

  private size() {
    const s = Math.min(1, 1920 / Math.max(this.gl.width, this.gl.height));
    this.canvas.width = Math.round((this.gl.width * s) / 2) * 2;
    this.canvas.height = Math.round((this.gl.height * s) / 2) * 2;
  }

  /** Call right after the 3D scene is drawn. */
  afterRender() {
    if (!this.recording && !this.wantPhoto) return;
    if (!this.recording) this.size();
    const { canvas: c, ctx } = this, v = this.source();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    if (v.visible && v.el && v.w > 0) {
      const sc = Math.max(c.width / v.w, c.height / v.h), dw = v.w * sc, dh = v.h * sc;
      ctx.save(); ctx.translate(c.width, 0); ctx.scale(-1, 1);
      ctx.drawImage(v.el, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
      ctx.restore();
    }
    ctx.drawImage(this.gl, 0, 0, c.width, c.height);
    if (this.wantPhoto) {
      this.wantPhoto = false;
      c.toBlob((b) => { if (b) { download(b, `voyager-${stamp()}.png`); this.notify('Photo saved to Downloads'); } }, 'image/png');
    }
  }
}
