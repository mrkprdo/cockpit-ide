// Limits shared by the main-process fs bridge and the renderer that calls it.
//
// One number, so the editor refuses a file for exactly the reason the main
// process would: the bridge buffers the whole file before the renderer ever
// sees it, and decoding hundreds of MB on the main thread is how a workspace
// that happens to contain a disk image looks like a frozen app.

/** Largest text file the app will read into memory (32 MB). */
export const MAX_TEXT_FILE_BYTES = 32 * 1024 * 1024;
