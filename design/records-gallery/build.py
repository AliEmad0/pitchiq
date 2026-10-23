"""Embed data.json and the real club crests into template.html -> index.html.

Usage, from this folder: python3 build.py
"""
import base64, io, json, os, re

src = io.open("template.html", encoding="utf-8").read()
# The 30 concepts live in their own files and are spliced in here.
src = src.replace("/*CONCEPTS*/", io.open("concepts.js", encoding="utf-8").read()).replace("/*CONCEPT-CSS*/", io.open("concepts.css", encoding="utf-8").read())
data = json.load(io.open("data.json", encoding="utf-8"))
logos = os.path.join("..", "..", "public", "logos")
crests = {}
for c in data["clubs"]:
    p = os.path.join(logos, f"{c['id']}.png")
    if os.path.exists(p):
        crests[c["id"]] = "data:image/png;base64," + base64.b64encode(open(p, "rb").read()).decode()
out = src.replace("/*DATA*/{}", json.dumps(data, ensure_ascii=False)).replace("/*CRESTS*/{}", json.dumps(crests))
assert "/*DATA*/" not in out and "/*CRESTS*/" not in out

# Layout round: motion is limited to trivial hover; anything that animates must obey the app's audit.
css = "".join(re.findall(r"<style>(.*?)</style>", out, re.S))
allowed = {"transform", "opacity", "box-shadow"}
for name, body in re.findall(r"@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}", css):
    props = {p for inner in re.findall(r"\{([^{}]*)\}", body) for p in re.findall(r"(?:^|;)\s*([a-z-]+)\s*:", inner)}
    assert not (props - allowed), f"@keyframes {name} animates {props - allowed}"
assert "infinite" not in out, "an infinite animation slipped in"
n = len(re.findall(r"^C\.push\(", out, re.M))
assert n == 30, f"expected 30 concepts, found {n}"
io.open("index.html", "w", encoding="utf-8", newline="").write(out)
print("index.html", len(out), "bytes,", n, "concepts,", len(crests), "crests")
