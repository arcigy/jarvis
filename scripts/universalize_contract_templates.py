from __future__ import annotations

import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path.home() / "Downloads"
OUT_DIR = ROOT / "docs" / "contracts" / "templates"

FORBIDDEN_TERMS = [
    "Natureon",
    "Jakub",
    "Horák",
    "Sanderova",
    "09351272",
    "CZ09351272",
    "jakub.horak",
]

REPLACEMENTS = [
    ("Natureon Czech Design s.r.o.", "[obchodné meno Klienta]"),
    ("Sídlo: Sanderova 1616/16, Holešovice, 170 00 Praha 7, Česká republika", "Sídlo: [sídlo Klienta]"),
    ("IČO: 09351272", "IČO: [IČO Klienta]"),
    ("DIČ/IČ DPH: CZ09351272", "DIČ/IČ DPH: [DIČ/IČ DPH Klienta]"),
    ("Zápis: Obchodní rejstřík vedený Městským soudem v Praze, spisová značka C 334956", "Zápis: [register Klienta]"),
    ("E-mail: jakub.horak@natureon.cz", "E-mail: [e-mail Klienta]"),
    ("Zastúpený: Jakub Horák, jednatel", "Zastúpený: [meno a funkcia zástupcu Klienta]"),
    ("Jakub Horák, CEO, jakub.horak@natureon.cz, +420 733 500 159", "[meno, funkcia, e-mail a telefón oprávnenej osoby Klienta]"),
    ("Jakub Horák, CEO", "[meno a funkcia zástupcu Klienta]"),
    ("Jakub Horák, jednatel", "[meno a funkcia zástupcu Klienta]"),
    ("Jakub Horák", "[meno zástupcu Klienta]"),
    ("Natureon", "[Klient]"),
    ("jakub.horak@natureon.cz", "[e-mail Klienta]"),
    ("Aplikácia Arcigy", "[názov projektu / pracovný názov Aplikácie]"),
    ("pre profesionálnych stolárov a výrobcov nábytku", "pre konkrétneho Klienta podľa Projektovej prílohy"),
    (
        "tvorbe cenových ponúk, správe materiálových katalógov, výpočtoch cien a používaní parametrických nábytkových modulov",
        "realizácii dohodnutých workflowov, správe klientskych dát, výpočtoch a používaní individuálnych automatizačných modulov",
    ),
    ("cenových ponúk pre stolárske a nábytkové zákazky", "dohodnutých klientskych workflowov, výstupov a automatizácií"),
    ("stolárske a nábytkové zákazky", "klientske workflowy a automatizácie"),
    ("stolárskej a nábytkovej zákazky", "klientskej zákazky alebo workflowu"),
    ("nábytkových modulov", "automatizačných modulov"),
    ("nábytkový modul", "automatizačný modul"),
    ("nábytkové riešenie", "klientske riešenie"),
    ("nábytok", "klientsky workflow"),
    ("parametrických nábytkových modulov", "automatizačných alebo aplikačných modulov"),
    ("Parametrické moduly", "Automatizačné moduly"),
    ("parametrické moduly", "automatizačné moduly"),
    ("parametrických modulov", "automatizačných modulov"),
    ("parametrickým modulom", "automatizačným modulom"),
    ("parametrický modul", "automatizačný modul"),
    ("Materiálový katalóg", "Dátový katalóg"),
    ("materiálový katalóg", "dátový katalóg"),
    ("materiálového katalógu", "dátového katalógu"),
    ("materiálových katalógov", "dátových katalógov"),
    ("materiálové katalógy", "dátové katalógy"),
    ("materiály, ceny, hrúbky, dostupnosti, základné pravidlá", "dátové zdroje, pravidlá, dostupnosti, stavy a základné konfigurácie"),
    ("dosky, hrany, kovanie, doplnky", "zdroje dát, typy záznamov, stavy, kategórie"),
    ("šírka, výška, hĺbka, materiál, počet políc, typ dvierok atď.", "vstupné polia, pravidlá, stavy, limity, výstupy atď."),
    ("cenových ponúk", "dohodnutých výstupov"),
    ("cenové ponuky", "dohodnuté výstupy"),
    ("cenovú ponuku", "dohodnutý výstup"),
    ("cenová ponuka", "dohodnutý výstup"),
    ("cenovej ponuky", "dohodnutého výstupu"),
    ("cenovej ponuke", "dohodnutom výstupe"),
    ("Cenový výpočet", "Výpočtová alebo rozhodovacia logika"),
    ("výpočet ceny", "výpočet alebo rozhodnutie"),
    ("výpočtoch cien", "výpočtoch alebo rozhodovacích pravidlách"),
    ("cenotvorba", "výpočtová logika"),
    ("výrobou", "produkčným použitím"),
    ("objednaním materiálu", "vykonaním nadväzujúceho úkonu"),
    ("DXF, 3D DXF, IFC, GLB", "PDF, Excel, API export, webhook, dátový export alebo iný dohodnutý formát"),
    ("DXF 2D", "Dátový export 1"),
    ("3D DXF", "Dátový export 2"),
    ("IFC", "API / integračný export"),
    ("GLB", "Iný dohodnutý export"),
]


def find_source(kind: str) -> Path:
    candidates = sorted(DOWNLOADS.glob("*.docx"), key=lambda p: p.stat().st_mtime, reverse=True)
    for path in candidates:
        lower = path.name.lower()
        if kind == "framework" and "rámcová zmluva" in lower:
            return path
        if kind == "appendix" and "projektová príloha" in lower:
            return path
    raise FileNotFoundError(f"Missing source DOCX for {kind}")


def patch_docx(source: Path, target: Path) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(source, "r") as zin:
            zin.extractall(tmp_path)

        for xml_path in list((tmp_path / "word").rglob("*.xml")) + list((tmp_path / "docProps").rglob("*.xml")):
            text = xml_path.read_text(encoding="utf-8")
            for old, new in REPLACEMENTS:
                text = text.replace(old, new)
            xml_path.write_text(text, encoding="utf-8")

        if target.exists():
            target.unlink()
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in tmp_path.rglob("*"):
                if item.is_file():
                    zout.write(item, item.relative_to(tmp_path).as_posix())


def docx_text(path: Path) -> str:
    with zipfile.ZipFile(path, "r") as zf:
        parts = []
        for name in zf.namelist():
            if name.startswith("word/") and name.endswith(".xml"):
                parts.append(zf.read(name).decode("utf-8", errors="ignore"))
        return "\n".join(parts)


def main() -> None:
    outputs = {
        "framework": OUT_DIR / "ramcova-zmluva-univerzalna.docx",
        "appendix": OUT_DIR / "projektova-priloha-univerzalna.docx",
    }

    for kind, target in outputs.items():
        patch_docx(find_source(kind), target)
        text = docx_text(target)
        leaked = [term for term in FORBIDDEN_TERMS if term in text]
        if leaked:
            raise RuntimeError(f"{target.name} still contains: {', '.join(leaked)}")
        print(f"created {target}")


if __name__ == "__main__":
    main()
