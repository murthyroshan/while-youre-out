// The Echo Show's camera for photo check-ins. Uses the computer's webcam when allowed; otherwise a
// drawn sample photo, so the demo works anywhere. Photos are resized before sending (≤ 960 px).

export interface Shot {
  /** base64 without the data: prefix */
  data: string;
  mime: 'image/jpeg';
}

const MAX_WIDTH = 960;

/** The webcam, or null if there is none, it was refused, or the permission prompt went unanswered. */
export async function openCamera(waitMs = 8000): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  const request = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false }).catch(() => null);
  const timedOut = new Promise<null>((r) => setTimeout(() => r(null), waitMs));
  const stream = await Promise.race([request, timedOut]);
  // A camera that arrives after we gave up is switched straight off again.
  if (!stream) void request.then((late) => late?.getTracks().forEach((t) => t.stop()));
  return stream;
}

function toShot(canvas: HTMLCanvasElement): Shot {
  return { data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1], mime: 'image/jpeg' };
}

/** One frame from the live video, mirrored like the preview the carer saw. */
export function grab(video: HTMLVideoElement): Shot | null {
  if (!video.videoWidth) return null;
  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const g = canvas.getContext('2d')!;
  g.translate(canvas.width, 0);
  g.scale(-1, 1);
  g.drawImage(video, 0, 0, canvas.width, canvas.height);
  return toShot(canvas);
}

/** A cosy drawn scene (child, dog, lamp, moon) for computers without a camera. */
export function samplePhoto(): Shot {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 720;
  const g = canvas.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 720);
  sky.addColorStop(0, '#f6e7d0');
  sky.addColorStop(1, '#e9cfa9');
  g.fillStyle = sky;
  g.fillRect(0, 0, 960, 720);
  // window with the moon
  g.fillStyle = '#1f2f4a';
  g.fillRect(620, 80, 240, 200);
  g.fillStyle = '#f7c948';
  g.beginPath();
  g.arc(760, 150, 38, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1f2f4a';
  g.beginPath();
  g.arc(778, 138, 34, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#8a6a48';
  g.lineWidth = 10;
  g.strokeRect(620, 80, 240, 200);
  // sofa
  g.fillStyle = '#4f7c8a';
  g.beginPath();
  g.roundRect(80, 400, 800, 220, 40);
  g.fill();
  g.fillStyle = '#5f93a2';
  g.beginPath();
  g.roundRect(120, 330, 720, 140, 40);
  g.fill();
  // child
  g.fillStyle = '#f3c9a5';
  g.beginPath();
  g.arc(360, 330, 70, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3b2a20';
  g.beginPath();
  g.arc(360, 305, 74, Math.PI, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e86a5c';
  g.beginPath();
  g.roundRect(285, 395, 150, 170, 30);
  g.fill();
  g.fillStyle = '#1f2933';
  g.beginPath();
  g.arc(337, 335, 7, 0, Math.PI * 2);
  g.arc(383, 335, 7, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1f2933';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(360, 352, 22, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  // dog
  g.fillStyle = '#b07a46';
  g.beginPath();
  g.ellipse(600, 500, 120, 70, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(690, 420, 55, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7a5230';
  g.beginPath();
  g.ellipse(655, 395, 18, 38, -0.4, 0, Math.PI * 2);
  g.ellipse(728, 395, 18, 38, 0.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1f2933';
  g.beginPath();
  g.arc(675, 415, 6, 0, Math.PI * 2);
  g.arc(705, 415, 6, 0, Math.PI * 2);
  g.arc(690, 438, 9, 0, Math.PI * 2);
  g.fill();
  // label
  g.fillStyle = 'rgba(31,41,51,.75)';
  g.beginPath();
  g.roundRect(24, 24, 330, 50, 12);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '600 24px system-ui, sans-serif';
  g.fillText('Sample photo (no camera)', 42, 57);
  return toShot(canvas);
}
