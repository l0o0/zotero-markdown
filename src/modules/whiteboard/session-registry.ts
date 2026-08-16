import type { WhiteboardHandle } from "./editor";

export interface WhiteboardView {
  root: HTMLElement;
  host: HTMLElement;
}

export interface WhiteboardSession {
  tabID: string;
  boardId: string;
  itemID: number;
  win: _ZoteroTypes.MainWindow;
  path: string;
  title: string;
  currentRev: number;
  savedRev: number;
  editor?: WhiteboardHandle;
  view?: WhiteboardView;
  closing?: boolean;
  autosaveTimer?: number;
  unbindTheme?: () => void;
}

export class WhiteboardSessionRegistry {
  private readonly byTab = new Map<string, WhiteboardSession>();
  private readonly byItem = new Map<number, string>();
  private readonly byWindow = new WeakMap<Window, Set<string>>();

  get(tabID: string) {
    return this.byTab.get(tabID);
  }

  findByItem(itemID: number) {
    const tabID = this.byItem.get(itemID);
    return tabID ? this.byTab.get(tabID) : undefined;
  }

  register(session: WhiteboardSession) {
    this.byTab.set(session.tabID, session);
    this.byItem.set(session.itemID, session.tabID);
    let tabs = this.byWindow.get(session.win);
    if (!tabs) {
      tabs = new Set();
      this.byWindow.set(session.win, tabs);
    }
    tabs.add(session.tabID);
  }

  unregister(tabID: string) {
    const session = this.byTab.get(tabID);
    if (!session) return;
    this.byTab.delete(tabID);
    this.byItem.delete(session.itemID);
    this.byWindow.get(session.win)?.delete(tabID);
  }

  sessionsForWindow(win: Window) {
    const tabs = this.byWindow.get(win);
    if (!tabs) return [];
    return [...tabs]
      .map((tabID) => this.byTab.get(tabID))
      .filter((session): session is WhiteboardSession => !!session);
  }

  all() {
    return [...this.byTab.values()];
  }
}

export const whiteboardRegistry = new WhiteboardSessionRegistry();
