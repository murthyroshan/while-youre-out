// Mom's phone, live beside the Echo Show: the real parent page in a phone frame, so judges see
// both screens react together (a question arrives, she taps an answer, the kitchen hears it).
// The page is laid out at a real phone width (390 px) and scaled down to fit.
import { useEffect, useRef, useState } from 'react';

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 823;

export function PhoneFrame(props: { src: string; onHome?: () => void; showHome?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);
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
          <iframe className="phone-screen" src={props.src} title="The parent's phone (live)" style={{ transform: `scale(${scale})` }} />
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
