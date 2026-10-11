/**
 * In-app confirm and prompt dialogs, replacing the browser's window.confirm/prompt. One native
 * <dialog> (rendered by <DialogHost /> at the app root) gives focus trapping, Esc to cancel and a
 * backdrop. Call `confirmDialog()` / `promptDialog()` from anywhere; they resolve when closed.
 */
import { useEffect, useRef, useState } from 'react';
import { button, input } from './ui';

interface BaseOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

export interface PromptOptions extends BaseOptions {
  label: string;
  initial?: string;
  maxLength?: number;
}

type Request =
  | (BaseOptions & { kind: 'confirm'; resolve: (ok: boolean) => void })
  | (PromptOptions & { kind: 'prompt'; resolve: (value: string | null) => void });

let show: ((request: Request) => void) | null = null;

/** Resolves true if the user confirms, false if they cancel. */
export function confirmDialog(options: BaseOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ ...options, kind: 'confirm', resolve });
    else resolve(window.confirm(options.message ?? options.title));
  });
}

/** Resolves to the trimmed text, or null if the user cancels or leaves it empty. */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (show) show({ ...options, kind: 'prompt', resolve });
    else resolve(window.prompt(options.label, options.initial)?.trim() || null);
  });
}

export function DialogHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState('');
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    show = (r) => {
      setValue(r.kind === 'prompt' ? (r.initial ?? '') : '');
      setRequest(r);
    };
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (request && !ref.current?.open) ref.current?.showModal();
  }, [request]);

  const close = (confirmed: boolean) => {
    if (!request) return;
    if (request.kind === 'confirm') request.resolve(confirmed);
    else request.resolve(confirmed ? value.trim() || null : null);
    setRequest(null);
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close(false);
      }}
      onClick={(e) => {
        // A click on the backdrop (outside the panel) cancels.
        if (e.target === ref.current) close(false);
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
    >
      {request && (
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            close(true);
          }}
        >
          <h2 id="dialog-title" className="flex items-center gap-2.5 text-base font-semibold">
            <span className="h-4 w-1.5 -skew-x-[20deg] bg-accent" aria-hidden />
            {request.title}
          </h2>
          {request.message && <p className="text-sm text-text-muted">{request.message}</p>}
          {request.kind === 'prompt' && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">{request.label}</span>
              <input
                autoFocus
                value={value}
                maxLength={request.maxLength}
                onChange={(e) => setValue(e.target.value)}
                onFocus={(e) => e.target.select()}
                className={input}
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={button.secondary}
              onClick={() => close(false)}
              autoFocus={request.kind === 'confirm'}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={request.kind === 'prompt' && !value.trim()}
              className={request.danger ? button.dangerSolid : button.primary}
            >
              {request.confirmLabel ?? 'OK'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
