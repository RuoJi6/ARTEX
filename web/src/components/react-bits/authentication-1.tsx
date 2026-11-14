"use client";

import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  AppleIcon,
  GithubIcon,
  Loading03Icon,
  Tick02Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const ruleTop = "border-t border-rb-line";
const typeHeadingSm = "text-[20px]/[24px] font-[450] tracking-[-0.015em]";
const typeBody = "text-[14px]/[20px] font-normal";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const primaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_94%,black))] text-[var(--rb-accent-fg,oklch(100%_0_0))] shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.22),0_2px_5px_-2px_rgb(0_0_0/0.3)] hover:not-disabled:brightness-110 active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] disabled:opacity-40 disabled:shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_94%,black))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.66),0_2px_5px_-2px_rgb(0_0_0/0.9)] dark:active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] dark:disabled:shadow-none";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const ghostButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg hover:not-disabled:bg-rb-soft active:bg-rb-soft aria-pressed:bg-rb-soft disabled:text-rb-muted/60 dark:text-rb-fg dark:hover:not-disabled:bg-rb-soft dark:active:bg-rb-soft dark:aria-pressed:bg-rb-soft dark:disabled:text-rb-muted/60";
const linkButton =
  "inline-flex min-h-6 items-center gap-1 rounded-[var(--rb-r-sm,6px)] text-[14px]/[16px] font-[450] text-rb-fg decoration-1 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const iconButtonXs = "size-6 rounded-[var(--rb-r-sm,6px)]";
const pendingRing =
  "animate-spin [animation-duration:800ms] motion-reduce:animate-none";
const inputBox =
  "relative flex w-full min-w-0 cursor-text items-center rounded-[var(--rb-r-sm,6px)] data-concentric:rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-canvas text-[14px]/[16px] font-[450] text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input focus-within:border-[var(--rb-accent,oklch(20.5%_0_0))] focus-within:ring-3 focus-within:ring-rb-line has-[[aria-invalid=true]]:border-[oklch(60%_0.236_26)] has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-rb-line has-[input:disabled]:text-rb-muted/60 has-[input:disabled]:shadow-none has-[input[readonly]]:cursor-default has-[input[readonly]]:border-transparent has-[input[readonly]]:bg-rb-soft has-[input[readonly]]:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input dark:focus-within:border-[var(--rb-accent,oklch(100%_0_0))] dark:focus-within:ring-rb-line dark:has-[[aria-invalid=true]]:border-[oklch(65.2%_0.219_26)] dark:has-[input:disabled]:border-rb-line dark:has-[input:disabled]:text-rb-muted/60 dark:has-[input[readonly]]:bg-rb-soft";
const fieldMd = "h-8";
const inputControl =
  "h-full w-full min-w-0 flex-1 bg-transparent px-3 outline-none [[data-affix]+&]:ps-2 [&:has(+[data-affix])]:pe-2 placeholder:text-rb-muted disabled:cursor-not-allowed disabled:placeholder:text-rb-muted/60 dark:placeholder:text-rb-muted dark:disabled:placeholder:text-rb-muted/60 dark:[color-scheme:dark]";
const inputAffix =
  "flex shrink-0 items-center gap-2 text-[14px]/[16px] text-rb-muted select-none first:ps-3 last:pe-3 has-[button]:first:ps-1 has-[button]:last:pe-1";
const fieldLabel =
  "flex w-fit items-center gap-2 text-[14px]/[16px] font-[450] text-rb-fg";
const fieldDescription =
  "max-w-[60ch] text-[13px]/[18px] text-rb-fg/80";
const fieldError =
  "flex items-start gap-2 text-[13px]/[18px] text-[oklch(51%_0.18_26)] dark:text-[oklch(76%_0.14_26)]";
const checkboxBox =
  "relative inline-flex size-4 shrink-0 items-center justify-center";
const checkbox =
  "peer size-4 shrink-0 cursor-pointer appearance-none rounded-[var(--rb-r-xs,4px)] border border-rb-input bg-rb-canvas shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[background-color,border-color,box-shadow,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-checked:not-disabled:border-rb-line active:not-checked:bg-rb-soft checked:border-transparent checked:bg-[var(--rb-accent,oklch(20.5%_0_0))] indeterminate:border-transparent indeterminate:bg-[var(--rb-accent,oklch(20.5%_0_0))] aria-invalid:border-[oklch(60%_0.236_26)] disabled:cursor-not-allowed disabled:border-rb-input disabled:shadow-none disabled:checked:bg-rb-fg/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:border-rb-input dark:bg-rb-popover dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-checked:not-disabled:border-rb-line dark:active:not-checked:bg-rb-soft dark:checked:bg-[var(--rb-accent,oklch(100%_0_0))] dark:indeterminate:bg-[var(--rb-accent,oklch(100%_0_0))] dark:aria-invalid:border-[oklch(65.2%_0.219_26)] dark:disabled:border-rb-input dark:disabled:checked:bg-rb-fg/40";
const checkboxMark =
  "pointer-events-none absolute text-[var(--rb-accent-fg,oklch(100%_0_0))] opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100 dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]";
const avatarSquare =
  "relative inline-flex size-8 shrink-0 overflow-hidden rounded-[var(--rb-r-sm,6px)] select-none";
const avatarFallback =
  "flex size-full items-center justify-center rounded-[inherit] border border-rb-line bg-rb-popover text-[12px]/[16px] font-[450] tabular-nums text-rb-fg";
const frame =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover text-rb-fg";
const breadcrumbLink =
  "rounded-[var(--rb-r-sm,6px)] hover:text-rb-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:text-rb-fg";
const proseLink =
  "text-rb-fg underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";

const footerLink = cx(typeCaption, text3, breadcrumbLink);

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M21.35 11.1H12v2.98h5.35c-.24 1.4-1.75 4.1-5.35 4.1a5.95 5.95 0 0 1 0-11.9c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.62 14.53 2.7 12 2.7a9.3 9.3 0 1 0 0 18.6c5.25 0 8.73-3.69 8.73-8.88 0-.6-.06-1.05-.14-1.52Z" />
    </svg>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Authentication1() {
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(true);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState<"email" | "password" | null>(null);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!EMAIL.test(email.trim())) {
      setError("email");
      return;
    }
    if (password.length < 8) {
      setError("password");
      return;
    }
    setError(null);
    setPending(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPending(false), 1400);
  };

  const trackCaps = (event: KeyboardEvent<HTMLInputElement>) => {
    setCaps(event.getModifierState?.("CapsLock") ?? false);
  };

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[640px] w-full flex-col overflow-hidden p-8 sm:p-10",
      )}
    >
      <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center">
        <div className={cx(frame, "shrink-0 p-6 sm:p-7")}>
          <div className="flex flex-col items-center text-center">
            <div className={cx(avatarSquare, "size-9")}>
              <span className={avatarFallback}>N</span>
            </div>
            <h1 className={cx(typeHeadingSm, text1, "mt-4")}>Sign in</h1>
            <p className={cx(typeBody, text3, "mt-1")}>
              Continue to the Northwind workspace.
            </p>
          </div>

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            <div className="flex flex-col gap-2">
              <label htmlFor={emailId} className={fieldLabel}>
                Email or username
              </label>
              <div className={cx(inputBox, fieldMd)}>
                <input
                  id={emailId}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error === "email") setError(null);
                  }}
                  placeholder="you@northwind.com"
                  aria-invalid={error === "email"}
                  aria-describedby={error === "email" ? errorId : undefined}
                  className={inputControl}
                />
              </div>
              {error === "email" && (
                <p id={errorId} className={fieldError}>
                  <HugeiconsIcon
                    icon={AlertCircleIcon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className="shrink-0"
                  />
                  Enter a valid email address.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex h-4 items-center justify-between gap-3">
                <label htmlFor={passwordId} className={fieldLabel}>
                  Password
                </label>
                <button type="button" className={linkButton}>
                  Forgot password?
                </button>
              </div>
              <div className={cx(inputBox, fieldMd)}>
                <input
                  id={passwordId}
                  type={reveal ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error === "password") setError(null);
                  }}
                  onKeyUp={trackCaps}
                  onKeyDown={trackCaps}
                  onBlur={() => setCaps(false)}
                  placeholder="Enter your password"
                  aria-invalid={error === "password"}
                  className={inputControl}
                />
                <span data-affix className={inputAffix}>
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    aria-label={reveal ? "Hide password" : "Show password"}
                    className={cx(ghostButton, iconButtonXs)}
                  >
                    <HugeiconsIcon
                      icon={reveal ? ViewOffSlashIcon : ViewIcon}
                      size={14}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </button>
                </span>
              </div>
              {error === "password" ? (
                <p className={fieldError}>
                  <HugeiconsIcon
                    icon={AlertCircleIcon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className="shrink-0"
                  />
                  Passwords are at least 8 characters.
                </p>
              ) : caps ? (
                <p className={fieldDescription}>Caps Lock is on.</p>
              ) : null}
            </div>

            <label
              className={cx(
                typeBodySm,
                text2,
                "flex cursor-pointer items-center gap-2",
              )}
            >
              <span className={checkboxBox}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className={checkbox}
                />
                <HugeiconsIcon
                  icon={Tick02Icon}
                  size={12}
                  strokeWidth={2.5}
                  aria-hidden="true"
                  className={checkboxMark}
                />
              </span>
              Keep me signed in for 30 days
            </label>

            <button
              type="submit"
              disabled={pending}
              className={cx(primaryButton, buttonMd, "w-full")}
            >
              {pending && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className={pendingRing}
                />
              )}
              {pending ? "Signing in" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-3">
            <span className={cx(ruleTop, "flex-1")} />
            <span className={cx(typeCaption, text3)}>Or continue with</span>
            <span className={cx(ruleTop, "flex-1")} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button type="button" className={cx(secondaryButton, buttonMd)}>
              <GoogleMark className="h-4 w-4 shrink-0" />
              <span className="max-sm:sr-only">Google</span>
            </button>
            <button type="button" className={cx(secondaryButton, buttonMd)}>
              <HugeiconsIcon
                icon={AppleIcon}
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
                className="shrink-0"
              />
              <span className="max-sm:sr-only">Apple</span>
            </button>
            <button type="button" className={cx(secondaryButton, buttonMd)}>
              <HugeiconsIcon
                icon={GithubIcon}
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
                className="shrink-0"
              />
              <span className="max-sm:sr-only">GitHub</span>
            </button>
          </div>
        </div>

        <p className={cx(typeBody, text3, "mt-5 text-center")}>
          Need an account?{" "}
          <button type="button" className={proseLink}>
            Create one
          </button>
        </p>

        <div className="mt-6 flex items-center justify-center gap-4">
          {["Privacy", "Terms", "Status"].map((item) => (
            <button
              key={item}
              type="button"
              className={cx(footerLink, "inline-flex min-h-6 items-center")}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
