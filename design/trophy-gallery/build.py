"""Embed data.json (from extract.ts) and the real crests into template.html -> index.html.

Usage, from this folder: python build.py
"""
import base64, io, json, os

src = io.open("template.html", encoding="utf-8").read()
data = json.load(io.open("data.json", encoding="utf-8"))
logos = os.path.join("..", "..", "public", "logos")
crests = {}
for s in data["sets"]:
    p = os.path.join(logos, f"{s['teamId']}.png")
    if os.path.exists(p):
        crests[s["teamId"]] = "data:image/png;base64," + base64.b64encode(open(p, "rb").read()).decode()
out = src.replace("/*DATA*/[]", json.dumps(data, ensure_ascii=False)).replace("/*CRESTS*/{}", json.dumps(crests))
io.open("index.html", "w", encoding="utf-8", newline="").write(out)
print("index.html", len(out), "bytes,", len(crests), "crests")
