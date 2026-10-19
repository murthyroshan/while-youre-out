import { useEffect, useState } from 'react';

/** The rest of the house, as the server keeps it (GET /demo/devices). Simulated devices. */
interface Devices {
  dot: { room: string; night_light: boolean; playing: string | null };
  tv: { status: 'off' | 'playing' | 'paused'; title: string | null; started_at: string | null; limit_minutes: number | null; banner: string | null };
  door: { locked: boolean; porch_light: boolean; by: string | null };
  bee: { by: string | null; note: string | null };
}

/**
 * The whole house, not one screen: the living room TV, the child's Echo Dot, the front door and the
 * parent's Bee, each following the parents' rules and tonight's events. A tile lights up when its
 * device does something. The Bee tile lets you say something to Mom's Bee, as she would in the car.
 */
export function House(props: { serverOrigin: string; parentName: string; active: boolean }) {
  const [d, setD] = useState<Devices | null>(null);
  const [beeText, setBeeText] = useState('Maya napped until 4:30 today');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!props.active || !props.serverOrigin) return;
    let stop = false;
    const load = () =>
      fetch(`${props.serverOrigin}/demo/devices`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => !stop && j && setD(j))
        .catch(() => {});
    void load();
    const t = setInterval(load, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [props.serverOrigin, props.active]);

  if (!d) return null;
  const tellBee = async () => {
    if (!beeText.trim() || sending) return;
    setSending(true);
    await fetch(`${props.serverOrigin}/demo/bee`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: beeText.trim(), by: props.parentName }) }).catch(() => null);
    setSending(false);
  };
  const tvLine =
    d.tv.status === 'paused' ? d.tv.banner ?? 'Paused' : d.tv.status === 'playing' ? `${d.tv.title ?? 'Playing'}${d.tv.limit_minutes ? ` · ${d.tv.limit_minutes} min limit` : ''}` : 'Off';
  return (
    <section className="house" aria-label="The rest of the house (simulated)">
      <div className={`room ${d.tv.status === 'paused' ? 'lit amber' : d.tv.status === 'playing' ? 'lit' : ''}`}>
        <small>Living room · Fire TV</small>
        <b>{d.tv.status === 'paused' ? 'Paused' : d.tv.status === 'playing' ? 'Playing' : 'Off'}</b>
        <span>{tvLine}</span>
      </div>
      <div className={`room ${d.dot.night_light ? 'lit warm' : ''}`}>
        <small>{d.dot.room} · Echo Dot</small>
        <b>{d.dot.night_light ? 'Night light on' : 'Quiet'}</b>
        <span>{d.dot.playing ?? 'Nothing playing'}</span>
      </div>
      <div className={`room ${!d.door.locked ? 'lit red' : d.door.porch_light ? 'lit warm' : ''}`}>
        <small>Front door · Ring</small>
        <b>{d.door.locked ? 'Locked' : 'Unlocked'}</b>
        <span>{!d.door.locked && d.door.by ? `by ${d.door.by} · ` : ''}{d.door.porch_light ? 'porch light on' : 'porch light off'}</span>
      </div>
      <div className={`room bee ${d.bee.note ? 'lit' : ''}`}>
        <small>{props.parentName}’s Bee</small>
        {d.bee.note ? <span className="said">“{d.bee.note}”</span> : <span>Say something to it, as {props.parentName} would</span>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void tellBee();
          }}
        >
          <input value={beeText} onChange={(e) => setBeeText(e.target.value)} aria-label={`Tell ${props.parentName}'s Bee`} maxLength={200} />
          <button type="submit" disabled={sending}>
            Tell Bee
          </button>
        </form>
      </div>
    </section>
  );
}
