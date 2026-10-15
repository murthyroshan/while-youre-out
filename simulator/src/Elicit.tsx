import { useState } from 'react';
import type { ElicitRequest, ElicitResult } from '@modelcontextprotocol/sdk/types.js';

type Params = ElicitRequest['params'];
type Field = { type?: string; title?: string; description?: string; enum?: string[]; enumNames?: string[]; oneOf?: Array<{ const: string; title?: string }>; default?: unknown; minimum?: number; maximum?: number };

/**
 * The Echo Show asking the person in front of it (MCP elicitation): a short form on screen, or a
 * link to open on their phone (URL mode, used for payments so they never happen on a shared screen).
 */
export function Elicit({ params, onDone, openUrl }: { params: Params; onDone: (r: ElicitResult) => void; openUrl?: (url: string) => void }) {
  if (params.mode === 'url') return <UrlAsk params={params as Extract<Params, { mode: 'url' }>} onDone={onDone} openUrl={openUrl} />;
  return <FormAsk params={params as Extract<Params, { message: string; requestedSchema: unknown }>} onDone={onDone} />;
}

function UrlAsk({ params, onDone, openUrl }: { params: Extract<Params, { mode: 'url' }>; onDone: (r: ElicitResult) => void; openUrl?: (url: string) => void }) {
  const host = (() => {
    try {
      return new URL(params.url).host;
    } catch {
      return params.url;
    }
  })();
  return (
    <div className="overlay ask-view" role="dialog" aria-label="Open on your phone">
      <div className="ask-card">
        <p className="ask-eyebrow">📱 On your phone</p>
        <h2>{params.message}</h2>
        <p className="ask-host">Opens {host}</p>
        <div className="ask-btns">
          <button
            className="primary"
            onClick={() => {
              // In the demo the "phone" is the one beside the Echo Show, or else a new tab.
              if (openUrl) openUrl(params.url);
              else window.open(params.url, '_blank', 'noopener');
              onDone({ action: 'accept' });
            }}
          >
            Open on my phone
          </button>
          <button onClick={() => onDone({ action: 'decline' })}>Not now</button>
        </div>
      </div>
    </div>
  );
}

function FormAsk({ params, onDone }: { params: Extract<Params, { requestedSchema: unknown }>; onDone: (r: ElicitResult) => void }) {
  const schema = params.requestedSchema as { properties: Record<string, Field>; required?: string[] };
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(schema.properties).map(([k, f]) => [k, f.default === undefined ? '' : String(f.default)])),
  );
  const required = new Set(schema.required ?? []);
  const missing = [...required].some((k) => !values[k]?.trim());
  const submit = () => {
    const content: Record<string, string | number | boolean> = {};
    for (const [k, f] of Object.entries(schema.properties)) {
      const v = values[k]?.trim();
      if (!v) continue;
      content[k] = f.type === 'number' || f.type === 'integer' ? Number(v) : f.type === 'boolean' ? v === 'true' : v;
    }
    onDone({ action: 'accept', content });
  };
  return (
    <div className="overlay ask-view" role="dialog" aria-label={params.message}>
      <form
        className="ask-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing) submit();
        }}
      >
        <p className="ask-eyebrow">Alexa needs to know</p>
        <h2>{params.message}</h2>
        {Object.entries(schema.properties).map(([k, f], i) => {
          const options = f.oneOf?.map((o) => [o.const, o.title ?? o.const]) ?? f.enum?.map((v, j) => [v, f.enumNames?.[j] ?? v]);
          return (
            <label key={k} className="ask-field">
              <span>
                {f.title ?? k}
                {required.has(k) ? '' : ' (optional)'}
              </span>
              {options ? (
                <select value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })}>
                  {options.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  autoFocus={i === 0}
                  type={f.type === 'number' || f.type === 'integer' ? 'number' : 'text'}
                  min={f.minimum}
                  max={f.maximum}
                  value={values[k]}
                  placeholder={f.description}
                  onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                />
              )}
            </label>
          );
        })}
        <div className="ask-btns">
          <button type="submit" className="primary" disabled={missing}>
            Done
          </button>
          <button type="button" onClick={() => onDone({ action: 'cancel' })}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
