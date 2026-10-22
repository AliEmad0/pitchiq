"""Pull the gallery's sample data out of the committed snapshots -> data.json.

Usage, from this folder (WSL): python3 extract.py

Real club names + ids (crests are embedded by build.py) and real 2025-26 player names. The
OVRs are SAMPLE figures for the gallery only — player rows carry no game rating.
"""
import io, json, os

ROOT = os.path.join("..", "..", "data")
players = json.load(io.open(os.path.join(ROOT, "players-2025.json"), encoding="utf-8"))

# The ladder: Your XI + seven real rivals. Two spares for the onboarding / market screens.
CLUBS = [
    (42, "Arsenal"), (40, "Liverpool"), (63, "Leeds United"), (41, "Southampton"),
    (65, "Nottingham Forest"), (55, "Brentford"), (747, "Barnsley"),
    (1355, "Portsmouth"), (1333, "Wimbledon"), (1356, "Blackpool"),
]

def apps(p):
    return (p.get("metrics") or {}).get("appearances") or 0

def goals(p):
    return (p.get("metrics") or {}).get("goals") or 0

def pick(roles, strongest, exclude):
    out = []
    src = {"ST": "CF", "RM": "RW", "LM": "LW"}
    for role in roles:
        cand = [p for p in players if p.get("role") == src.get(role, role) and p["id"] not in exclude and apps(p) >= 4]
        cand.sort(key=lambda p: (-(apps(p) * 3 + goals(p) * 5), p["id"]) if strongest else (apps(p), p["id"]))
        # Spread across clubs: never two from the same club in one XI.
        clubs = {o["club"] for o in out}
        c = next(p for p in cand if p.get("teamName") not in clubs)
        exclude.add(c["id"])
        out.append({"id": str(c["id"]), "name": c["name"], "role": role, "club": c.get("teamName"), "teamId": c.get("teamId")})
    return out

used = set()
XI_ROLES = ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "RW", "ST", "LW"]
xi = pick(XI_ROLES, True, used)
for p, o in zip(xi, [84, 81, 86, 83, 80, 85, 82, 79, 87, 89, 84]):
    p["ovr"] = o

MKT_ROLES = ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST", "ST"]
mkt = pick(MKT_ROLES, False, used)
for p, o in zip(mkt, [61, 58, 60, 59, 57, 62, 60, 58, 61, 63, 59]):
    p["ovr"] = o

# Two signings the pack can bring in.
extra = pick(["ST", "CM"], True, used)
extra[0]["ovr"] = 88  # Marquee: 85+
extra[1]["ovr"] = 66  # Wonderkid: well above the market XI's average
# Wonderkid's catch: the best outfielder is sold and the weakest eligible man covers.
cover = pick(["CM"], False, used)[0]
cover["ovr"] = 55

data = {
    "clubs": [{"id": i, "name": n} for i, n in CLUBS],
    "xi": xi,
    "marketXi": mkt,
    "marquee": extra[0],
    "wonderkid": extra[1],
    "cover": cover,
}
io.open("data.json", "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=1))
print("xi:", [p["name"] for p in xi])
print("market:", [p["name"] for p in mkt])
print("extra:", [p["name"] for p in extra])
