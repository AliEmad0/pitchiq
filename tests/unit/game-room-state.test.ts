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

  it("advancing wraps to an earlier gap rather than stopping at the end", () => {
    // The coach may fill slot 10 first; finishing slot 9 must then find slot 0, not close
    // the room while eight slots are still empty.
    let s = roomReducer(start(), { type: "pick", index: 10, cardId: "10@2020" });
    s = roomReducer(s, { type: "pick", index: 9, cardId: "9@2020" });
    expect(s.open).toBe(0);
  });
});
