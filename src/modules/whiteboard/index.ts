export {
  openWhiteboardTab,
  closeAllWhiteboards,
  closeWhiteboardsForWindow,
} from "./tab";
export { registerWhiteboardTabHooks, WHITEBOARD_TAB_TYPE } from "./tabHooks";
export { registerWhiteboardMenus, unregisterWhiteboardMenus } from "./menu";
export { createWhiteboardAttachment } from "./create";
export { isWhiteboardAttachment } from "./detect";
export {
  openWhiteboardAttachment,
  registerWhiteboardFileOpenInterceptor,
  unregisterWhiteboardFileOpenInterceptor,
} from "./open";
export { injectWhiteboardStyles } from "./styles";
export {
  serializeBoardDocument,
  ensureBoardExtension,
  basename,
} from "./file-io";
export { whiteboardRegistry } from "./session-registry";
export {
  parseBoardDocument,
  demoBoard,
  emptyBoard,
  type BoardDocument,
  type BoardNodeKind,
} from "./snapshot";
