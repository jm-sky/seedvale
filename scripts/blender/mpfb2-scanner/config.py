import os


# ============================================================
# WSL / REPOSITORY
# ============================================================

WSL_DISTRO = "Ubuntu-20.04"

WSL_REPO_PATH = "/home/MY_USERNAME/projects/private/seedvale"

WSL_REPO = rf"\\wsl.localhost\{WSL_DISTRO}{WSL_REPO_PATH.replace('/', '\\')}"


# ============================================================
# INPUT / OUTPUT
# ============================================================

REQUIREMENTS_JSON = os.path.join(
    WSL_REPO,
    "docs",
    "plans",
    "references",
    "mpfb2-npc-hero-assets-v1.json",
)

INVENTORY_JSON = os.path.join(
    WSL_REPO,
    "docs",
    "plans",
    "references",
    "mpfb2-asset-inventory.json",
)

OUTPUT_JSON = os.path.join(
    WSL_REPO,
    "docs",
    "plans",
    "references",
    "mpfb2-npc-hero-assets-v1-match.json",
)


# ============================================================
# MATCHING
# ============================================================

MATCH_THRESHOLD = 0.90
REVIEW_THRESHOLD = 0.70

MAX_MATCHES = 5
