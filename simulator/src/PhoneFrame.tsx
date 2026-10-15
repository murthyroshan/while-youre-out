// Mom's phone, live beside the Echo Show: the real parent page in a phone frame, so judges see
// both screens react together (a question arrives, she taps an answer, the kitchen hears it).
// The page is laid out at a real phone width (390 px) below a status bar, and scaled to fit.
import { useEffect, useRef, useState } from 'react';
import { Qr } from './Qr';

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const STATUS_BAR = 50;

export function PhoneFrame(props: {
  src: string;
  time: string;
  onHome?: () => void;
  showHome?: boolean;
  /** "Use your own phone": the QR card shows over this phone's screen until a real phone joins. */
  qrUrl?: string;
  phones?: number;
  scan?: boolean;
  onScanClose?: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);
  // The status bar's time and icons stay readable when the phone is drawn small.
  const ui = Math.max(scale, 0.68);
  const { scan, onScanClose } = props;
  const joined = (props.phones ?? 0) > 0;
  useEffect(() => {
    if (!scan || !joined) return;
    const t = setTimeout(() => onScanClose?.(), 2600);
    return () => clearTimeout(t);
  }, [scan, joined, onScanClose]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / PHONE_WIDTH, el.clientHeight / PHONE_HEIGHT) || 0.7);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <figure className="phone" aria-label="The parent's phone">
      <div className="phone-body">
        <div className="phone-notch" />
        <div className="phone-viewport" ref={viewport}>
          <div className="phone-status" style={{ height: STATUS_BAR * scale, fontSize: 15 * ui, padding: `0 ${26 * scale}px` }} aria-hidden="true">
            <b>{props.time}</b>
            <span className="phone-icons">
              <svg viewBox="0 0 18 12" style={{ height: 11 * ui, width: 16.5 * ui }}>
                <rect x="0" y="8" width="3" height="4" rx="1" />
                <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                <rect x="10" y="3" width="3" height="9" rx="1" />
                <rect x="15" y="0" width="3" height="12" rx="1" />
              </svg>
              <svg viewBox="-2 -1 20 13" style={{ height: 11 * ui, width: 16 * ui }}>
                <path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.5Zm-4.2-4.3L2.2 5.6a8.2 8.2 0 0 1 11.6 0l-1.6 1.6a5.9 5.9 0 0 0-8.4 0ZM.2 3.6-1.4 2a11 11 0 0 1 18.8 0l-1.6 1.6a8.8 8.8 0 0 0-15.6 0Z" />
              </svg>
              <svg viewBox="0 0 27 13" style={{ height: 12 * ui, width: 25 * ui }}>
                <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" />
                <rect x="2.5" y="2.5" width="16" height="8" rx="2" />
                <rect x="24.5" y="4.5" width="2" height="4" rx="1" opacity="0.4" />
              </svg>
            </span>
          </div>
          <iframe
            className="phone-screen"
            src={props.src}
            title="The parent's phone (live)"
            style={{ top: STATUS_BAR * scale, height: (PHONE_HEIGHT - STATUS_BAR), transform: `scale(${scale})` }}
          />
          <i className="phone-indicator" aria-hidden="true" />
          {scan && props.qrUrl && (
            <div className={`phone-scan ${joined ? 'joined' : ''}`} role="dialog" aria-label="Use your own phone">
              {joined ? (
                <>
                  <span className="scan-tick" aria-hidden="true">✓</span>
                  <b>Your phone is Anita’s now</b>
                  <p>Priya’s questions will arrive on it. Answer them there.</p>
                </>
              ) : (
                <>
                  <b>Be Anita on your own phone</b>
                  <Qr text={props.qrUrl} label="QR code that opens Anita’s parent page on your phone" />
                  <p>Scan with your camera. Priya’s questions reach your phone, and the Echo Show hears your answer.</p>
                  <button onClick={() => onScanClose?.()}>Not now</button>
                </>
              )}
            </div>
          )}
        </div>
        {props.showHome && props.onHome && (
          <button className="phone-home" onClick={props.onHome} aria-label="Back to the parent page">
            Back
          </button>
        )}
      </div>
      <figcaption className="device-label">Anita’s phone · live</figcaption>
    </figure>
  );
}
