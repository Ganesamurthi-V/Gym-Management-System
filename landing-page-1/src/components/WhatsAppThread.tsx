import { BatteryFull, Camera, ChevronLeft, Lock, Mic, Paperclip, Phone, Signal, Smile, Wifi } from 'lucide-react';

export interface ThreadMessage {
  /**
   * The message as WhatsApp receives it. A blank line starts a new paragraph, a
   * single newline is a line break, and *asterisks* bold — the same syntax the
   * real templates are authored in, so these strings can be pasted either way.
   */
  body: string;
  time: string;
  /** Renders the GymFlow header image above the body, as the live templates do. */
  banner?: boolean;
  /** Dim line pinned bottom-left of the bubble, opposite the timestamp. */
  footer?: string;
}

/**
 * Renders WhatsApp's *asterisk* bold syntax.
 *
 * The capturing group in the split keeps the delimiters in the output, so the
 * marked runs survive as their own entries instead of being discarded.
 */
function renderBold(line: string) {
  return line.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.length > 2 && part.startsWith('*') && part.endsWith('*') ? (
      <strong key={`${part}-${i}`} className="font-semibold text-[var(--wa-ink-strong)]">
        {part.slice(1, -1)}
      </strong>
    ) : (
      part
    )
  );
}

/**
 * CSS-drawn WhatsApp conversation on a phone, mirroring the message GymFlow
 * actually sends: branded header image, the details block with bold values, and
 * the "Powered by Gym Flow" sign-off.
 *
 * Drawn rather than shipped as a screenshot so it stays crisp at any DPI and the
 * copy stays real text, editable in one place rather than baked into pixels.
 *
 * Every surface reads a --wa-* custom property, so the screen follows the site's
 * light/dark toggle by holding WhatsApp's own light or dark palette. The tokens
 * do the switching in CSS rather than the component reading the theme in JS: a
 * value read at render would go stale the moment ThemeToggle flips .dark, since
 * nothing re-renders this.
 *
 * role="img" collapses the mock to a single label for assistive tech. Without it
 * a screen reader walks the fake chrome and reads sample member data as page
 * content — and the message types are already described in prose beside this.
 */
export function WhatsAppThread({ messages }: { messages: readonly ThreadMessage[] }) {
  return (
    <div
      role="img"
      aria-label="A new member's phone showing the automated WhatsApp message from their gym: a branded confirmation that their annual membership is active, listing their member ID, plan and start date, and signed Powered by Gym Flow."
      /* The bezel stays dark in both themes. A phone frame is dark whatever the
         app on it is doing, and at 10px it is the only thing separating a light
         screen from a light page. */
      className="rounded-[42px] bg-[#0b0b0b] p-[10px] shadow-[0_30px_60px_-25px_rgba(0,0,0,0.55)]"
    >
      {/* 9/15 is chosen against the content, not from a spec sheet. One template
          plus the thread head runs ~355px; at a true 9/19.5 the screen would be
          600px tall and the message would sit under a slab of empty chat, which
          reads as a dead conversation. Shortening the screen is the lie worth
          telling. */}
      <div className="relative flex aspect-[9/15] flex-col overflow-hidden rounded-[33px] bg-[var(--wa-chat)]">
        {/* Status bar and chat header share one surface, the way WhatsApp tints
            the top of the screen as a single block. */}
        <div className="shrink-0 bg-[var(--wa-bar)]">
          <div className="relative flex items-center justify-between px-4 pb-1 pt-2.5">
            <span className="text-[10px] font-semibold text-[var(--wa-ink)]">9:41</span>
            {/* Notch, so black in both themes like the bezel. */}
            <span
              aria-hidden
              className="absolute left-1/2 top-[7px] h-[17px] w-[62px] -translate-x-1/2 rounded-full bg-[#0b0b0b]"
            />
            <span className="flex items-center gap-1 text-[var(--wa-ink)]">
              <Signal className="h-[11px] w-[11px]" />
              <Wifi className="h-[11px] w-[11px]" />
              <BatteryFull className="h-[13px] w-[13px]" />
            </span>
          </div>

          {/* The gym, not GymFlow: these messages arrive from the gym's own
              WhatsApp number, which is the claim this section is making. */}
          <div className="flex items-center gap-2 px-2.5 pb-2.5">
            <ChevronLeft className="h-4 w-4 shrink-0 text-[var(--wa-ink-dim)]" />
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--wa-avatar)] text-[10px] font-semibold text-[var(--wa-green)]">
              GF
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[12px] font-medium text-[var(--wa-ink)]">
                Gym Flow
              </span>
              <span className="block text-[9px] text-[var(--wa-ink-dim)]">Business account</span>
            </span>
            <Phone className="h-[13px] w-[13px] shrink-0 text-[var(--wa-ink-dim)]" />
            {/* Three dots drawn rather than an icon: the overflow glyph has been
                renamed across lucide majors, and this cannot break. */}
            <span aria-hidden className="flex shrink-0 flex-col gap-[2px] pr-1">
              <span className="h-[2.5px] w-[2.5px] rounded-full bg-[var(--wa-ink-dim)]" />
              <span className="h-[2.5px] w-[2.5px] rounded-full bg-[var(--wa-ink-dim)]" />
              <span className="h-[2.5px] w-[2.5px] rounded-full bg-[var(--wa-ink-dim)]" />
            </span>
          </div>
        </div>

        {/* justify-end anchors the thread to the input bar like a real chat, and
            keeps the newest message whole if the copy ever grows past the screen
            by clipping the overflow off the top. */}
        <div className="flex flex-1 flex-col justify-end gap-1.5 overflow-hidden px-2.5 py-2.5">
          {/* The date chip and encryption notice are what WhatsApp itself puts at
              the head of a thread. They belong here rather than being filler: a
              welcome message *is* the first message a member ever gets, so this
              is genuinely the top of the conversation. */}
          <span className="mx-auto rounded-md bg-[var(--wa-chip)] px-2 py-[3px] text-[8px] font-semibold uppercase tracking-wider text-[var(--wa-ink-dim)]">
            Today
          </span>
          <span className="mx-auto mb-1 flex max-w-[88%] items-center justify-center gap-1.5 rounded-md bg-[var(--wa-chip)] px-2.5 py-1.5">
            <Lock className="h-[9px] w-[9px] shrink-0 text-[var(--wa-ink-dim)]" />
            <span className="text-[8.5px] leading-snug text-[var(--wa-ink-dim)]">
              Messages are end-to-end encrypted
            </span>
          </span>

          {messages.map(message => (
            /* Incoming, so left-aligned with no read receipt. A tick here would
               claim the member sent their own welcome message.
 
               The hairline shadow is WhatsApp's own bubble lift. It matters in
               light mode, where a white bubble on the beige chat surface has no
               other edge; in dark it is too faint to register. */
            <div
              key={message.body}
              className="mr-auto w-[88%] shrink-0 rounded-lg rounded-tl-[3px] bg-[var(--wa-bubble-in)] p-[3px] text-left shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
            >
              {message.banner && (
                /* Hairline ring, because in light mode the banner's white left
                   edge would otherwise dissolve into a white bubble. */
                <img
                  src="/logo_landspace.webp"
                  alt=""
                  aria-hidden
                  width={560}
                  height={249}
                  loading="lazy"
                  decoding="async"
                  className="mb-1 block w-full rounded-[7px] ring-1 ring-inset ring-black/[0.07]"
                />
              )}

              <div className="px-1.5 pb-0.5">
                {message.body.split('\n\n').map((para, i) => (
                  <p
                    key={para}
                    className={`text-[11.5px] leading-[1.42] text-[var(--wa-ink)] ${i > 0 ? 'mt-[9px]' : ''}`}
                  >
                    {para.split('\n').map((line, j) => (
                      <span key={line}>
                        {j > 0 && <br />}
                        {renderBold(line)}
                      </span>
                    ))}
                  </p>
                ))}

                <p className="mt-1.5 flex items-baseline justify-between gap-3">
                  {message.footer && (
                    <span className="text-[8.5px] text-[var(--wa-ink-faint)]">
                      {message.footer}
                    </span>
                  )}
                  <span className="ml-auto text-[9px] text-[var(--wa-ink-dim)]">
                    {message.time}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Composer and home indicator share one surface: in light mode WhatsApp
            tints this strip away from the chat, in dark it matches it, which is
            what --wa-composer encodes. */}
        <div className="shrink-0 bg-[var(--wa-composer)]">
          <div className="flex items-center gap-1.5 px-2 pt-1.5">
            <span className="flex flex-1 items-center gap-2 rounded-full bg-[var(--wa-bubble-in)] px-2.5 py-[7px]">
              <Smile className="h-[13px] w-[13px] shrink-0 text-[var(--wa-ink-dim)]" />
              <span className="flex-1 text-left text-[10px] text-[var(--wa-ink-dim)]">
                Message
              </span>
              <Paperclip className="h-[13px] w-[13px] shrink-0 text-[var(--wa-ink-dim)]" />
              <Camera className="h-[13px] w-[13px] shrink-0 text-[var(--wa-ink-dim)]" />
            </span>
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--wa-green)]">
              <Mic className="h-[15px] w-[15px] text-white" />
            </span>
          </div>

          <span
            aria-hidden
            className="mx-auto my-1.5 block h-[3px] w-[84px] rounded-full bg-[var(--wa-home)] opacity-30"
          />
        </div>
      </div>
    </div>
  );
}
