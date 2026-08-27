import { describe, expect, it } from "vitest";
import { formationByName } from "@/features/game/domain/formation";
import { createRoomState, isRoomComplete, roomReducer } from "@/features/game/view/room-state";

const shape = formationByName("4-4-2 Flat");
const start = () => createRoomState(shape);

describe("roomReducer", () => {
  it("opens on the first unfilled slot", () => {
    expect(start().open).toBe(0);
  });

  it("records a pick and advances to the next unfilled slot", () => {
    const s = roomReducer(start(), { type: "pick", index: 0, cardId: "1@2020" });
    expect(s.picks[0]).toBe("1@2020");
    expect(s.open).toBe(1);
  });

  it("⚠️ any slot can be opened at any time", () => {
    // Free roam: the room is eleven slots you may visit in any order, not eleven rounds.
    const s = roomReducer(start(), { type: "open", index: 7 });
    expect(s.open).toBe(7);
  });

  it("⚠️ re-picking a filled slot replaces rather than appends", () => {
    let s = roomReducer(start(), { type: "pick", index: 3, cardId: "1@2020" });
    s = roomReducer(s, { type: "pick", index: 3, cardId: "2@2020" });
    expect(s.picks[3]).toBe("2@2020");
    expect(s.picks.filter(Boolean)).toHaveLength(1);
  });

  it("advancing from the last unfilled slot closes the room", () => {
    let s = start();
    shape.slots.forEach((_, i) => {
      s = roomReducer(s, { type: "pick", index: i, cardId: `${i}@2020` });
    });
    expect(isRoomComplete(s)).toBe(true);
    expect(s.open).toBeNull();
  });

  it("⚠️ a pick into an out-of-range slot is ignored, not applied", () => {
    // Ignoring by default means the UI cannot drive the room into a state it has no
    // rendering for — the same discipline as the play machine's phase reducer.
    const s = start();
    expect(roomReducer(s, { type: "pick", index: 99, cardId: "1@2020" })).toBe(s);
    expect(roomReducer(s, { type: "open", index: -1 })).toBe(s);
  });

  it("changing formation restarts the room", () => {
    let s = roomReducer(start(), { type: "pick", index: 0, cardId: "1@2020" });
    s = roomReducer(s, { type: "setFormation", formation: formationByName("3-5-2") });
    expect(s.picks.filter(Boolean)).toHaveLength(0);
    expect(s.formation.name).toBe("3-5-2");
  });

  it("⭐ clearing a pick empties the slot and leaves it open", () => {
    // TASK-1810 — dropping a man is how the coach frees money in Budget Cap. The slot he
    // just emptied is by definition the one he is now drafting, so `open` follows him there
    // rather than running `nextUnfilled` off to some other gap.
    let s = roomReducer(start(), { type: "pick", index: 3, cardId: "1@2020" });
    s = roomReducer(s, { type: "clear", index: 3 });
    expect(s.picks[3]).toBeNull();
    expect(s.open).toBe(3);
  });

  it("⛔ the LOCKED pick cannot be cleared — the mode is built on him", () => {
    // Captain's Draft places its icon before the draft starts. He is not a pick the coach
    // made, so he is not a pick the coach may drop.
    const s = createRoomState(shape, { index: 0, cardId: "99@2020" });
    expect(roomReducer(s, { type: "clear", index: 0 })).toBe(s);
    expect(s.picks[0]).toBe("99@2020");
  });

  it("⚠️ clearing an empty or out-of-range slot is ignored, not applied", () => {
    const s = start();
    expect(roomReducer(s, { type: "clear", index: 5 })).toBe(s);
    expect(roomReducer(s, { type: "clear", index: 99 })).toBe(s);
    expect(roomReducer(s, { type: "clear", index: -1 })).toBe(s);
  });

  it("advancing wraps to an earlier gap rather than stopping at the end", () => {
    // The coach may fill slot 10 first; finishing slot 9 must then find slot 0, not close
    // the room while eight slots are still empty.
    let s = roomReducer(start(), { type: "pick", index: 10, cardId: "10@2020" });
    s = roomReducer(s, { type: "pick", index: 9, cardId: "9@2020" });
    expect(s.open).toBe(0);
  });
});
