"""Embed the extracted scenario data into template.html -> index.html.

The data file is produced from data/{events,fixtures,lineups}-<season>.json; see the
TASK-1816 plan, Task 1. Usage: python build.py <scenarios.json>
"""
import io, sys
src = io.open("template.html", encoding="utf-8").read()
data = io.open(sys.argv[1], encoding="utf-8").read()
io.open("index.html", "w", encoding="utf-8", newline="").write(src.replace("/*DATA*/[]", data))
