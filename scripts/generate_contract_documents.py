from __future__ import annotations

import argparse
import json
import re
import tempfile
import zipfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = ROOT / "docs" / "contracts" / "templates"
DEFAULT_OUTPUT_DIR = ROOT / "generated" / "contracts"
MANIFEST_NAME = "generation-manifest.json"


def money(value: float | int) -> str:
    if float(value).is_integer():
        return f"{int(value)} EUR"
    return f"{value:.2f} EUR"


def required(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current or current[part] in (None, ""):
            raise ValueError(f"Missing required field: {path}")
        current = current[part]
    return current


def join_items(items: list[Any] | None, fallback: str = "[●]") -> str:
    if not items:
        return fallback
    if all(isinstance(item, str) for item in items):
        return "; ".join(items)
    return "; ".join(str(item) for item in items)


def build_replacements(data: dict[str, Any]) -> dict[str, str]:
    for field in [
        "client.businessName",
        "client.registeredAddress",
        "client.companyId",
        "client.representativeName",
        "client.representativeRole",
        "client.email",
        "project.name",
        "project.goal",
        "pricing.implementationFeeEur",
        "pricing.monthlyFeeEur",
        "pricing.initialTermMonths",
    ]:
        required(data, field)

    client = data["client"]
    project = data["project"]
    pricing = data["pricing"]
    dates = data.get("dates", {})
    contacts = data.get("contacts", {})

    implementation_fee = float(pricing["implementationFeeEur"])
    deposit_percent = float(pricing.get("depositPercent", 30))
    deposit = round(implementation_fee * deposit_percent / 100, 2)
    final_payment = round(implementation_fee - deposit, 2)
    monthly = float(pricing["monthlyFeeEur"])
    modules = project.get("includedModules", [])

    client_block = "\n".join(
        [
            client["businessName"],
            f"Sídlo: {client['registeredAddress']}",
            f"IČO: {client['companyId']}",
            f"DIČ/IČ DPH: {client.get('taxId', '[DIČ/IČ DPH Klienta]')}",
            f"Zápis: {client.get('registration', '[register Klienta]')}",
            f"E-mail: {client['email']}",
            f"Zastúpený: {client['representativeName']}, {client['representativeRole']}",
            'ďalej len ako "Klient"',
        ]
    )

    first_module = modules[0] if modules else {}
    module_count = len(modules) if modules else "[●]"
    outputs = join_items(project.get("outputs"))
    ai_features = join_items(project.get("aiFeatures"))
    acceptance = join_items(project.get("acceptanceCriteria"), "podľa dohodnutého rozsahu")
    attachment = data.get("_currentAttachment") or {}

    return {
        "[obchodné meno Klienta]": client["businessName"],
        "Sídlo: [sídlo Klienta]": f"Sídlo: {client['registeredAddress']}",
        "IČO: [IČO Klienta]": f"IČO: {client['companyId']}",
        "DIČ/IČ DPH: [DIČ/IČ DPH Klienta]": f"DIČ/IČ DPH: {client.get('taxId', '[●]')}",
        "Zápis: [register Klienta]": f"Zápis: {client.get('registration', '[●]')}",
        "E-mail: [e-mail Klienta]": f"E-mail: {client['email']}",
        "Zastúpený: [meno a funkcia zástupcu Klienta]": f"Zastúpený: {client['representativeName']}, {client['representativeRole']}",
        "[meno zástupcu Klienta]": client["representativeName"],
        "[meno a funkcia zástupcu Klienta]": f"{client['representativeName']}, {client['representativeRole']}",
        "[meno, funkcia, e-mail a telefón oprávnenej osoby Klienta]": contacts.get(
            "clientAuthorizedContact",
            f"{client['representativeName']}, {client['representativeRole']}, {client['email']}, {client.get('phone', '[telefón]')}",
        ),
        "[názov projektu / pracovný názov Aplikácie]": project["name"],
        "[dátum]": dates.get("projectAppendixDate") or dates.get("frameworkAgreementDate") or "[dátum]",
        "[●] modulov": f"{module_count} modulov",
        "[●], za predpokladu riadnej súčinnosti Klienta": f"{dates.get('plannedLaunchDate', '[dátum]')}, za predpokladu riadnej súčinnosti Klienta",
        "2000 EUR": money(implementation_fee),
        "600 EUR": money(deposit),
        "1400 EUR": money(final_payment),
        "200 EUR": money(monthly),
        "6 mesiacov": f"{pricing['initialTermMonths']} mesiacov",
        "2 používateľov": f"{project.get('includedUserAccounts', 1)} používateľov",
        "5 kôl": f"{project.get('feedbackRounds', 5)} kôl",
        "[rozsah]": ai_features,
        "[obsah, dizajn, jazyk]": outputs,
        "[formát / rozsah / frekvencia]": outputs,
        "[spôsob výpočtu]": project.get("calculationRules", "[dohodnuté pravidlá]"),
        "[názov modulu]": first_module.get("name", "[názov modulu]"),
        "[opis nábytkovej štruktúry]": first_module.get("purpose", "[opis modulu]"),
        "[hlavné parametre]": first_module.get("inputs", "[hlavné vstupy]"),
        "[čo modul počíta / exportuje]": first_module.get("outputs", "[výstupy modulu]"),
        "[čo nie je zahrnuté]": first_module.get("outOfScope", "[mimo rozsahu]"),
        "[stav špecifikácie]": "podľa vyplneného formulára / schválenia Klientom",
        "[akú nábytkovú štruktúru modul rieši]": first_module.get("purpose", "[účel modulu]"),
        "[čo musí Klient zadať alebo spravovať]": first_module.get("inputs", "[vstupy od Klienta]"),
        "[čo sa počíta a podľa akých pravidiel]": project.get("calculationRules", "[výpočtová alebo rozhodovacia logika]"),
        "[cenová položka, export, 3D/2D, tabuľka atď.]": first_module.get("outputs", outputs),
        "[meno / e-mail / áno-nie]": contacts.get("clientAuthorizedContact", client["email"]),
        "[mená / e-maily]": contacts.get("clientAuthorizedContact", client["email"]),
        "[forma / rozsah / frekvencia]": outputs,
        "[žiadna / opis výnimky, ak je výslovne dohodnutá]": join_items(data.get("specialTerms"), "žiadna"),
        "Meno a funkcia: [meno a funkcia zástupcu Klienta]": f"Meno a funkcia: {client['representativeName']}, {client['representativeRole']}",
        "[názov doplnkovej prílohy]": attachment.get("title", "[názov doplnkovej prílohy]"),
        "[opis doplnkovej prílohy]": attachment.get("description", "[opis doplnkovej prílohy]"),
        "[položky doplnkovej prílohy]": join_items(attachment.get("items"), "[položky doplnkovej prílohy]"),
        "[akceptačné kritériá]": acceptance,
        client_block: client_block,
        "[●]": "[doplniť podľa klienta]",
    }


def patch_docx(template: Path, target: Path, replacements: dict[str, str]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(template, "r") as zin:
            zin.extractall(tmp_path)

        xml_files = list((tmp_path / "word").rglob("*.xml")) + list((tmp_path / "docProps").rglob("*.xml"))
        for xml_path in xml_files:
            text = xml_path.read_text(encoding="utf-8")
            for old, new in replacements.items():
                text = text.replace(old, new)
            text = re.sub(r"\[[^\[\]]+Klienta[^\[\]]*\]", "[doplniť podľa klienta]", text)
            xml_path.write_text(text, encoding="utf-8")

        if target.exists():
            target.unlink()
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in tmp_path.rglob("*"):
                if item.is_file():
                    zout.write(item, item.relative_to(tmp_path).as_posix())


def generate_contract_documents(input_path: Path, output_dir: Path = DEFAULT_OUTPUT_DIR) -> list[Path]:
    return generate_contract_documents_from_data(
        json.loads(input_path.read_text(encoding="utf-8")),
        output_dir,
        input_label=str(input_path),
    )


def generate_contract_documents_from_data(
    data: dict[str, Any],
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    input_label: str = "inline-payload",
) -> list[Path]:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", data["client"]["businessName"]).strip("-").lower() or "klient"
    targets = [
        (
            TEMPLATE_DIR / "ramcova-zmluva-univerzalna.docx",
            output_dir / f"{slug}-ramcova-zmluva.docx",
        ),
        (
            TEMPLATE_DIR / "projektova-priloha-univerzalna.docx",
            output_dir / f"{slug}-projektova-priloha.docx",
        ),
    ]
    created: list[Path] = []
    for template, target in targets:
        patch_docx(template, target, build_replacements(data))
        created.append(target)

    for attachment in data.get("additionalAttachments", []):
        template = resolve_template_path(required(attachment, "templatePath"))
        output_name = safe_docx_name(required(attachment, "outputName"))
        attachment_data = {**data, "_currentAttachment": attachment}
        target = output_dir / f"{slug}-{output_name}"
        patch_docx(template, target, build_replacements(attachment_data))
        created.append(target)

    write_manifest(input_label, output_dir, created, data)
    return created


def resolve_template_path(raw_path: str) -> Path:
    path = Path(raw_path)
    if not path.is_absolute():
        path = ROOT / path
    resolved = path.resolve()
    template_root = TEMPLATE_DIR.resolve()
    if template_root not in resolved.parents and resolved != template_root:
        raise ValueError(f"Attachment template must be under {TEMPLATE_DIR}: {raw_path}")
    if resolved.suffix.lower() != ".docx":
        raise ValueError(f"Attachment template must be a DOCX file: {raw_path}")
    if not resolved.exists():
        raise FileNotFoundError(f"Attachment template does not exist: {raw_path}")
    return resolved


def safe_docx_name(raw_name: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9_.-]+", "-", raw_name.strip()).strip("-")
    if not name:
        raise ValueError("Attachment outputName cannot be empty")
    if not name.lower().endswith(".docx"):
        name = f"{name}.docx"
    return name


def write_manifest(input_label: str, output_dir: Path, created: list[Path], data: dict[str, Any]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "input": input_label,
        "client": data["client"]["businessName"],
        "generatedFiles": [str(path) for path in created],
    }
    (output_dir / MANIFEST_NAME).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def load_payload(raw: str) -> dict[str, Any]:
    path = Path(raw)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return json.loads(raw)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Arcigy contract DOCX files from a JSON intake form.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", type=Path)
    source.add_argument("--payload")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    if args.input:
        created = generate_contract_documents(args.input, args.output_dir)
    else:
        created = generate_contract_documents_from_data(load_payload(args.payload), args.output_dir)

    for path in created:
        print(path)
    print(args.output_dir / MANIFEST_NAME)


if __name__ == "__main__":
    main()
