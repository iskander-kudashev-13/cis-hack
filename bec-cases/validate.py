"""Проверка библиотеки кейсов BEC Guard.

Запуск:  pip install pyyaml && python validate.py
Проверяет, что каждая карточка ссылается на известные события и сигналы, что события
идут по времени, и что сумма весов сигналов попадает в ожидаемую зону риска.
Это НЕ детектор — это проверка согласованности самих карточек.
"""
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).parent
REQUIRED = ["id", "title", "scheme", "target", "attacker_controls", "clean_channels",
            "events", "signals_fired", "expected", "catch_stage", "devin_task"]


def load(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def band(score, bands):
    name = "low"
    for b, threshold in sorted(bands.items(), key=lambda kv: kv[1]):
        if score >= threshold:
            name = b
    return name


def main():
    sig_doc = load(ROOT / "schema" / "signals.yaml")
    signals, bands = sig_doc["signals"], sig_doc["risk_bands"]
    order = {b: i for i, b in enumerate(sorted(bands, key=bands.get))}
    event_types = load(ROOT / "schema" / "events.yaml")["event_types"]

    errors, rows = [], []
    for path in sorted((ROOT / "cases").glob("*.yaml")):
        card = load(path)
        cid = card.get("id", path.stem)
        err = lambda m: errors.append(f"{cid}: {m}")

        for key in REQUIRED:
            if key not in card:
                err(f"нет поля {key}")
        if cid != path.stem:
            err("id не совпадает с именем файла")

        times = [e["t"] for e in card.get("events", [])]
        if times != sorted(times):
            err("события не отсортированы по времени")
        for e in card.get("events", []) + card.get("resolution", []):
            if e["type"] not in event_types:
                err(f"неизвестный тип события {e['type']}")

        fired, fired_bank_only = set(), set()
        for s in card.get("signals_fired", []):
            name = s["signal"]
            if name not in signals:
                err(f"неизвестный сигнал {name}")
                continue
            fired.add(name)
            if "visible_only_if" not in s:
                fired_bank_only.add(name)

        score = sum(signals[s]["weight"] for s in fired)
        score_visible = sum(signals[s]["weight"] for s in fired_bank_only)
        exp = card.get("expected", {})
        for s in exp.get("must_fire", []):
            if s not in fired:
                err(f"must_fire {s} не в signals_fired")
        for s in exp.get("must_not_fire", []):
            if s in fired:
                err(f"must_not_fire {s} сработал")
        got = band(score_visible, bands)  # оцениваем по тому, что видно без интеграций
        if "min_risk" in exp and order[got] < order[exp["min_risk"]]:
            err(f"риск {got} ({score_visible}) ниже ожидаемого {exp['min_risk']}")
        if "max_risk" in exp and order[got] > order[exp["max_risk"]]:
            err(f"риск {got} ({score_visible}) выше допустимого {exp['max_risk']}")

        rows.append((cid, score_visible, score, got, exp.get("action"), card.get("catch_stage")))

    print(f"{'кейс':40} {'видимый':>7} {'полный':>6}  {'риск':9} {'действие':8} этап")
    for r in rows:
        print(f"{r[0]:40} {r[1]:>7} {r[2]:>6}  {r[3]:9} {str(r[4]):8} {r[5]}")
    if errors:
        print("\nОШИБКИ:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print(f"\nOK: {len(rows)} карточек согласованы")


if __name__ == "__main__":
    main()
