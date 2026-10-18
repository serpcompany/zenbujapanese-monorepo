import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PROJECT = ROOT / "apps/ios/ZenbuJapanese.xcodeproj/project.pbxproj"
BUILD_CONFIGURATION = re.compile(
    r"isa = XCBuildConfiguration;\s*buildSettings = \{(?P<settings>.*?)\};\s*name = (?P<name>\w+);",
    re.DOTALL,
)


def app_build_settings(name: str = "") -> list[str]:
    return [
        found["settings"]
        for found in BUILD_CONFIGURATION.finditer(PROJECT.read_text(encoding="utf-8"))
        if (not name or found["name"] == name)
        and "INFOPLIST_FILE = App/Info.plist;" in found["settings"]
    ]


def build_setting(settings: str, key: str) -> str:
    found = re.search(rf'^\s*"?{re.escape(key)}"? = (.*);$', settings, re.MULTILINE)
    return "<not set>" if found is None else found.group(1).strip('"')
