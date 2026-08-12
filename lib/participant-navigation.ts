export type ActiveItemState = {
  readonly activeLocal: number;
  readonly seenServerLocal: number;
};

export function resolveActiveItem(state: ActiveItemState, serverLocal: number): ActiveItemState {
  if (state.seenServerLocal === serverLocal) {
    return state;
  }
  return { activeLocal: serverLocal, seenServerLocal: serverLocal };
}

export function moveActiveItem(state: ActiveItemState, localNumber: number): ActiveItemState {
  return { activeLocal: localNumber, seenServerLocal: state.seenServerLocal };
}

export type DraftMap = Readonly<Record<string, string>>;

export function seedDrafts(
  items: readonly { readonly itemVersionId: string; readonly savedValue?: string | null }[],
): DraftMap {
  return Object.fromEntries(items.map((item) => [item.itemVersionId, item.savedValue ?? ""]));
}

export function readDraft(drafts: DraftMap, itemVersionId: string): string {
  return drafts[itemVersionId] ?? "";
}

export function writeDraft(drafts: DraftMap, itemVersionId: string, value: string): DraftMap {
  if (drafts[itemVersionId] === value) {
    return drafts;
  }
  return { ...drafts, [itemVersionId]: value };
}
