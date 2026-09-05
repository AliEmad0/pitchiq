import { screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it } from "vitest";
import { ChoiceLink } from "@/features/game/components/ChoiceLink";
import { renderWithIntl } from "./_helpers/intl";

const at = (search: string) =>
  renderWithIntl(
    <NuqsTestingAdapter searchParams={search}>
      <ChoiceLink href="/game/legacy/40">Liverpool</ChoiceLink>
    </NuqsTestingAdapter>,
  );

const href = () => screen.getByRole("link").getAttribute("href");

describe("the club sheet carries the chosen format (TASK-1811)", () => {
  it("⭐ a season survives the club choice", () => {
    // ⛔ The gate's format link and the club page's `?format=` reader were built in separate
    // tasks and each was correct alone. Between them sits this sheet, which is rendered on the
    // SERVER from `/game/{mode}/{id}` and dropped the param — so picking Full Season landed the
    // coach in an ordinary single match, with every screen on the way looking right.
    at("?format=season");
    expect(href()).toBe("/game/legacy/40?format=season");
  });

  it("⛔ THE INERTNESS CONTROL — One Match arrives with no query at all", () => {
    // Without this the rule above could be satisfied by appending the param unconditionally,
    // which would put a query string on every other mode's links too.
    at("");
    expect(href()).toBe("/game/legacy/40");
  });

  it("⛔ the param is MATCHED, never echoed — the href is not a place to put user input", () => {
    at("?format=%22%3E%3Cscript%3E");
    expect(href()).toBe("/game/legacy/40");
  });

  it("⚠️ an unknown format is simply not a season", () => {
    at("?format=weekly");
    expect(href()).toBe("/game/legacy/40");
  });
});
