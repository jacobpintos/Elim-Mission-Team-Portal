/**
 * Native has no viewport tag: a native screen already draws edge to edge and
 * keeps clear of the notch through its safe-area insets. Nothing to do.
 */
export function useCoverViewport(_active: boolean): void {}
