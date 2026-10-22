"""Embed data.json + the real gameMarket copy (src/i18n/messages/en.json) into template.html -> index.html.

Usage, from this folder: python3 build.py
"""
import io, json, os, re

src = io.open("template.html", encoding="utf-8").read()
data = json.load(io.open("data.json", encoding="utf-8"))
en = json.load(io.open(os.path.join("..", "..", "src", "i18n", "messages", "en.json"), encoding="utf-8"))
data["copy"] = en["gameMarket"]
missing = [k for k in data["rewards"] if k not in data["copy"]["reward"]]
assert not missing, f"rewards missing from en.json gameMarket: {missing}"
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
n = len(re.findall(r"^D\.push\(", out, re.M))
assert n == 20, f"expected 20 designs, found {n}"
io.open("index.html", "w", encoding="utf-8", newline="").write(out)
print("index.html", len(out), "bytes,", n, "designs, keyframes audited")
