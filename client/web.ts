/**
 * Every browser global this plugin touches, in the one module 0.8 allows them
 * in. Each export declares the narrow shape of the globals it uses, gates on
 * `Platform.OS`, and gives native the alternative or a no-op — so the rest of
 * `client/` never reaches for `window` or `document` and typechecks without the
 * DOM library.
 */
import { AppState, Linking, Platform } from "react-native";

/**
 * `Linking.openURL` is `window.open` on the desktop renderer, and the main
 * Electron window installs no window-open handler, so a card click lands in a
 * bare child window instead of the browser. The desktop preload exposes the
 * same opener Paseo's own links go through, which hands the URL to the OS
 * browser as a normal tab. Mobile and plain web have no bridge and keep
 * `Linking`, which already opens a tab there.
 */
interface DesktopOpenerBridge {
  readonly opener?: { readonly openUrl?: (url: string) => Promise<void> };
}

/**
 * What a link out of a card is allowed to be. Every URL here was written by
 * whoever wrote the issue, the pull request or the comment, and both openers
 * below hand it somewhere with more authority than a text view: `window.open`
 * on the web, the OS handler on the desktop. `javascript:` runs, `file:`
 * reads the daemon machine, and a registered app scheme launches an
 * application, so the opener takes an allowlist rather than a denylist.
 */
const OPENABLE_PROTOCOLS: Record<string, true> = {
  "https:": true,
  "http:": true,
  "mailto:": true,
};

export function openExternalUrl(url: string): void {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    console.warn("[pr-views] refused to open a URL that does not parse");
    return;
  }
  if (OPENABLE_PROTOCOLS[protocol] !== true) {
    console.warn(`[pr-views] refused to open a ${protocol} URL`);
    return;
  }
  const openUrl = (globalThis as { paseoDesktop?: DesktopOpenerBridge })
    .paseoDesktop?.opener?.openUrl;
  if (typeof openUrl !== "function") {
    void Linking.openURL(url);
    return;
  }
  void openUrl(url).catch((error: unknown) => {
    console.warn(
      "[pr-views] desktop opener refused the URL, falling back",
      error,
    );
    void Linking.openURL(url);
  });
}

/** Only what this module reads off the web globals; the DOM library stays off. */
interface WebGlobals {
  document?: {
    visibilityState?: string;
    hasFocus?: () => boolean;
    addEventListener?: (
      type: string,
      listener: (event: unknown) => void,
    ) => void;
    removeEventListener?: (
      type: string,
      listener: (event: unknown) => void,
    ) => void;
    body?: { style?: Record<string, string> };
  };
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

/** Visibility gates foreground polling; focus also asks for a fresh active view. */
export function isAppVisible(): boolean {
  if (Platform.OS !== "web")
    return AppState.currentState === null || AppState.currentState === "active";
  return (globalThis as WebGlobals).document?.visibilityState !== "hidden";
}

export function isAppFocused(): boolean {
  if (!isAppVisible()) return false;
  if (Platform.OS !== "web") return AppState.currentState === "active";
  return (globalThis as WebGlobals).document?.hasFocus?.() ?? true;
}

export function observeAppVisibility(listener: () => void): () => void {
  if (Platform.OS !== "web") {
    const subscription = AppState.addEventListener("change", listener);
    return () => subscription.remove();
  }
  const web = globalThis as WebGlobals;
  web.document?.addEventListener?.("visibilitychange", listener);
  web.addEventListener?.("focus", listener);
  web.addEventListener?.("blur", listener);
  return () => {
    web.document?.removeEventListener?.("visibilitychange", listener);
    web.removeEventListener?.("focus", listener);
    web.removeEventListener?.("blur", listener);
  };
}

/**
 * Follows a drag at the document level on the web renderer, where the
 * responder system alone is not enough: widening the panel means dragging
 * *left*, across the board's columns, whose scroll views ask for the responder
 * as the pointer crosses them, and a pointer moving faster than the handle
 * leaves it altogether. Document listeners see every move until the button is
 * released, wherever the pointer is — including outside the window, where a
 * `blur` stands in for the release the browser cannot report.
 *
 * Native has no pointer to follow at the document level and gets a no-op; the
 * responder system alone is enough there, because there are no columns
 * competing for a finger that is already down on the handle.
 */
export function trackPointerOnDocument(
  onMove: (clientX: number) => void,
  onEnd: () => void,
): () => void {
  if (Platform.OS !== "web") return () => {};

  const web = globalThis as WebGlobals;
  const document = web.document;
  if (
    document === undefined ||
    typeof document.addEventListener !== "function" ||
    typeof document.removeEventListener !== "function"
  ) {
    return () => {};
  }
  const move = (event: unknown) => {
    const clientX =
      typeof event === "object" && event !== null
        ? Reflect.get(event, "clientX")
        : null;
    if (typeof clientX === "number") onMove(clientX);
  };
  /**
   * A drag is also a mouse-down followed by movement, which is how a browser
   * starts a text selection — and once the pointer leaves the handle, every
   * card title it crosses is selectable. Selection is switched off on the body
   * for the drag's duration, and the resize cursor is pinned there too so it
   * does not flicker back to an I-beam over text.
   */
  const bodyStyle = document.body?.style;
  const previous = {
    userSelect: bodyStyle?.userSelect ?? "",
    webkitUserSelect: bodyStyle?.webkitUserSelect ?? "",
    cursor: bodyStyle?.cursor ?? "",
  };
  if (bodyStyle !== undefined) {
    bodyStyle.userSelect = "none";
    bodyStyle.webkitUserSelect = "none";
    bodyStyle.cursor = "col-resize";
  }
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    if (bodyStyle !== undefined) {
      bodyStyle.userSelect = previous.userSelect;
      bodyStyle.webkitUserSelect = previous.webkitUserSelect;
      bodyStyle.cursor = previous.cursor;
    }
    document.removeEventListener?.("pointermove", move);
    document.removeEventListener?.("pointerup", end);
    document.removeEventListener?.("pointercancel", end);
    web.removeEventListener?.("blur", end);
    onEnd();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  web.addEventListener?.("blur", end);
  return end;
}

/** Paseo 0.8 has no public SDK getter for its composer preferences. Read only. */
export function readHostLaunchPreferences(): string | null {
  if (Platform.OS !== "web") return null;
  try {
    const web = globalThis as {
      localStorage?: { getItem(key: string): string | null };
    };
    return web.localStorage?.getItem("@paseo:create-agent-preferences") ?? null;
  } catch {
    return null;
  }
}
