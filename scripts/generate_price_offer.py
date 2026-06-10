from __future__ import annotations

import argparse
import json
import re
import tempfile
import zipfile
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "docs" / "pricing" / "templates" / "arcigy-price-offer-template.docx"
DEFAULT_OUTPUT_DIR = ROOT / "generated" / "price-offers"
MANIFEST_NAME = "generation-manifest.json"
UNRESOLVED_RE = re.compile(r"\{\{[^{}]+\}\}|\b(todo|tbd|xxx)\b|\?{3,}", re.IGNORECASE)


def required(data: dict[str, Any], key: str) -> Any:
    value = data.get(key)
    if value in (None, ""):
        raise ValueError(f"Missing required field: {key}")
    return value


def money(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return f"{value:,.0f} EUR".replace(",", " ")
    return ""


def clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def assert_no_unresolved(value: Any, path: str = "$") -> None:
    hits = collect_unresolved(value, path)
    if hits:
        raise ValueError(f"Unresolved price offer placeholder(s): {', '.join(hits[:10])}. Complete the intake before generating DOCX.")


def collect_unresolved(value: Any, path: str) -> list[str]:
    if isinstance(value, str):
        return [path] if UNRESOLVED_RE.search(value) else []
    if isinstance(value, dict):
        output: list[str] = []
        for key, item in value.items():
            output.extend(collect_unresolved(item, f"{path}.{key}"))
        return output
    if isinstance(value, list):
        output = []
        for index, item in enumerate(value):
            output.extend(collect_unresolved(item, f"{path}[{index}]"))
        return output
    return []


def normalize(data: dict[str, Any]) -> dict[str, Any]:
    assert_no_unresolved(data)
    company = clean(required(data, "company"))
    what_to_do = clean(required(data, "what_to_do"))
    cost = data.get("cost")
    if cost in (None, ""):
        items = data.get("items") if isinstance(data.get("items"), list) else []
        cost = sum(float(item.get("total", item.get("pricePerUnit", 0)) or 0) for item in items if isinstance(item, dict))
    return {
        **data,
        "company": company,
        "what_to_do": what_to_do,
        "cost": money(cost),
        "cost_one": money(data.get("cost_one") or cost),
        "cost_two": money(data.get("cost_two") or data.get("monthlyCost") or 0),
        "ICO": clean(data.get("ico")),
        "last_name_withsalution": clean(data.get("last_name_with_salution") or data.get("last_name_withsalution") or data.get("customerName") or "Dobrý deň,"),
    }


def roi_table_xml(rows: Any) -> str:
    if not isinstance(rows, list) or not rows:
        rows = [
            {"label": "Odhadovaná úspora času", "value": "doplní sa podľa prevádzky"},
            {"label": "Návratnosť riešenia", "value": "zvyčajne po prvých automatizovaných procesoch", "highlight": True},
        ]
    body = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        label = escape(clean(row.get("label")))
        value = escape(clean(row.get("value")))
        fill_left = "0E0820" if row.get("highlight") else "050508"
        fill_right = "6B35C9" if row.get("highlight") else "0A0A12"
        body.append(
            f"""
<w:tr>
  <w:tc>
    <w:tcPr><w:tcW w:w="6600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="{fill_left}"/></w:tcPr>
    <w:p><w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="20"/></w:rPr><w:t>{label}</w:t></w:r></w:p>
  </w:tc>
  <w:tc>
    <w:tcPr><w:tcW w:w="3866" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="{fill_right}"/></w:tcPr>
    <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="20"/></w:rPr><w:t>{value}</w:t></w:r></w:p>
  </w:tc>
</w:tr>
""".strip()
        )
    return f"""<w:tbl>
<w:tblPr><w:tblW w:w="10466" w:type="dxa"/></w:tblPr>
<w:tblGrid><w:gridCol w:w="6600"/><w:gridCol w:w="3866"/></w:tblGrid>
{''.join(body)}
</w:tbl>"""


def replace_placeholder_paragraph(xml: str, placeholder: str, replacement_xml: str) -> str:
    idx = xml.find(placeholder)
    if idx == -1:
        return xml
    p_start = max(xml.rfind("<w:p ", 0, idx), xml.rfind("<w:p>", 0, idx))
    p_end = xml.find("</w:p>", idx)
    if p_start == -1 or p_end == -1:
        return xml.replace(placeholder, replacement_xml)
    return xml[:p_start] + replacement_xml + xml[p_end + len("</w:p>") :]


def patch_docx(data: dict[str, Any], output_dir: Path) -> Path:
    if not TEMPLATE.exists():
        raise ValueError(f"Price offer template not found: {TEMPLATE}")
    output_dir.mkdir(parents=True, exist_ok=True)
    normalized = normalize(data)
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", normalized["company"]).strip("-").lower() or "ponuka"
    target = output_dir / f"{slug}-cenova-ponuka.docx"
    replacements = {
        "{{company}}": normalized["company"],
        "{{ICO}}": normalized["ICO"],
        "{{last_name_withsalution}}": normalized["last_name_withsalution"],
        "{{last_name_with_salution}}": normalized["last_name_withsalution"],
        "{{what_to_do}}": normalized["what_to_do"],
        "{{cost_one}}": normalized["cost_one"],
        "{{cost_two}}": normalized["cost_two"],
        "{{cost}}": normalized["cost"],
    }
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(TEMPLATE, "r") as zin:
            zin.extractall(tmp_path)
        for xml_path in list((tmp_path / "word").rglob("*.xml")) + list((tmp_path / "docProps").rglob("*.xml")):
            text = xml_path.read_text(encoding="utf-8")
            for old, new in replacements.items():
                text = text.replace(old, escape(clean(new)))
            text = replace_placeholder_paragraph(text, "{{ROI_TABLE_PLACEHOLDER}}", roi_table_xml(normalized.get("roi_rows")))
            xml_path.write_text(text, encoding="utf-8")
        if target.exists():
            target.unlink()
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in tmp_path.rglob("*"):
                if item.is_file():
                    zout.write(item, item.relative_to(tmp_path).as_posix())
    assert_docx_clean(target)
    write_manifest(output_dir, target, normalized)
    return target


def assert_docx_clean(path: Path) -> None:
    with zipfile.ZipFile(path, "r") as docx:
        for name in docx.namelist():
            if not name.endswith(".xml") or not (name.startswith("word/") or name.startswith("docProps/")):
                continue
            text = docx.read(name).decode("utf-8", errors="ignore")
            match = UNRESOLVED_RE.search(text)
            if match:
                path.unlink(missing_ok=True)
                raise ValueError(f"Generated price offer still contains unresolved placeholder: {match.group(0)} in {name}")


def write_manifest(output_dir: Path, target: Path, data: dict[str, Any]) -> None:
    manifest = {
        "mode": "price-offer-generator",
        "template": str(TEMPLATE.relative_to(ROOT)),
        "generatedFile": str(target),
        "company": data.get("company"),
        "total": data.get("cost"),
    }
    (output_dir / MANIFEST_NAME).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def load_payload(value: str) -> dict[str, Any]:
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError("Price offer payload must be a JSON object.")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Arcigy price offer DOCX.")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--payload")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()
    if not args.input and not args.payload:
        raise SystemExit("Provide --input or --payload.")
    data = json.loads(args.input.read_text(encoding="utf-8-sig")) if args.input else load_payload(args.payload)
    target = patch_docx(data, args.output_dir)
    print(json.dumps({"generatedFile": str(target), "manifest": str(args.output_dir / MANIFEST_NAME)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
