import json
from pathlib import Path

root = Path(__file__).resolve().parent
listings = json.loads((root / "listings.json").read_text())
products = json.loads((root / "catalog.json").read_text())
ids = {row[0]: f"{row[3]}:{row[4]}:{row[0]}" for row in listings}

def sql(value):
    return "'" + value.replace("'", "''") + "'"

stocks = ["(" + ", ".join(map(sql, [ids[row[0]], *row])) + ")" for row in listings]
items = []
for product in products:
    fields = [product["id"], ids[product["symbol"]], product["name"], product["brand"],
              product["category"], product["market"], product["status"],
              json.dumps(product, ensure_ascii=False, separators=(",", ":"))]
    items.append("(" + ", ".join(map(sql, fields)) + ")")
print("INSERT INTO listings VALUES\n" + ",\n".join(stocks) + ";")
print("INSERT INTO products VALUES\n" + ",\n".join(items) + ";")
