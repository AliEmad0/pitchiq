"""Embed data.json + the real chemistry copy (src/i18n/messages/en.json game.chem*) into template.html -> index.html.

Usage, from this folder: python3 build.py
"""
import io, json, os, re

src = io.open("template.html", encoding="utf-8").read()
data = json.load(io.open("data.json", encoding="utf-8"))
en = json.load(io.open(os.path.join("..", "..", "src", "i18n", "messages", "en.json"), encoding="utf-8"))
data["copy"] = {k: v for k, v in en["game"].items() if k.startswith("chem")}
need = ["chemScore", "chemDelta", "chemDeltaDown", "chemDeltaNone", "chemOffTag", "chemOffBadge", "chemOffWarn",
        "chemTeammates", "chemClubLegends", "chemCountrymen", "chemNoLinksYet"]
missing = [k for k in need if k not in data["copy"]]
assert not missing, f"copy missing from en.json game: {missing}"
out = src.replace("/*DATA*/{}", json.dumps(data, ensure_ascii=False))
assert "/*DATA*/" not in out

# Motion audit, the same rules the app enforces: keyframes may touch only
# transform / opacity / box-shadow, and nothing may loop forever.
css = "".join(re.findall(r"<style>(.*?)</style>", out, re.S))
allowed = {"transform", "opacity", "box-shadow"}
for name, body in re.findall(r"@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}", css):
    props = {p for inner in re.findall(r"\{([^{}]*)\}", body) for p in re.findall(r"(?:^|;)\s*([a-z-]+)\s*:", inner)}
    bad = props - allowed
    assert not bad, f"@keyframes {name} animates {bad}"
assert "infinite" not in out, "an infinite animation slipped in"
assert "prefers-reduced-motion: reduce" in css, "the reduce gate is missing"
n = len(data["designs"])
assert n == 20, f"expected 20 designs, found {n}"
for i in range(1, 21):
    assert f".G{i} " in css, f"design G{i} has no CSS"
io.open("index.html", "w", encoding="utf-8", newline="").write(out)
print("index.html", len(out), "bytes,", n, "designs, keyframes audited")
