#!/usr/bin/env python3
"""Generate plugin/udo.plg with real version and MD5 values."""
import os
import sys

version = os.environ.get('VERSION', '')
md5     = os.environ.get('MD5', '')
github  = "Parralex-Labs/Unraid-Docker-Orchestrator"

if not version or not md5:
    print("ERROR: VERSION and MD5 environment variables are required")
    sys.exit(1)

plg = (
    "<?xml version='1.0' standalone='yes'?>\n"
    "<!DOCTYPE PLUGIN [\n"
    "<!ENTITY name         \"unraid-docker-orchestrator\">\n"
    "<!ENTITY author       \"Parralex-Labs\">\n"
    "<!ENTITY version      \"" + version + "\">\n"
    "<!ENTITY md5          \"" + md5 + "\">\n"
    "<!ENTITY github       \"" + github + "\">\n"
    "<!ENTITY pluginURL    \"https://raw.githubusercontent.com/&github;/main/plugin/udo.plg\">\n"
    "<!ENTITY pluginpkg    \"&name;-&version;-x86_64-1.txz\">\n"
    "]>\n"
    "\n"
    "<PLUGIN name=\"&name;\"\n"
    "        author=\"&author;\"\n"
    "        version=\"&version;\"\n"
    "        pluginURL=\"&pluginURL;\"\n"
    "        support=\"https://github.com/" + github + "/issues\"\n"
    "        min=\"7.0.0\"\n"
    "        icon=\"tasks\">\n"
    "\n"
    "<CHANGES>\n"
    "## Unraid Docker Orchestrator\n"
    "### " + version + "\n"
    "- See https://github.com/" + github + "/releases\n"
    "</CHANGES>\n"
    "\n"
    "<FILE Run=\"/bin/bash\">\n"
    "<INLINE>\n"
    "rm -f $(ls /boot/config/plugins/&name;/&name;*.txz 2>/dev/null | grep -v '&version;')\n"
    "</INLINE>\n"
    "</FILE>\n"
    "\n"
    "<FILE Name=\"/boot/config/plugins/&name;/&name;-&version;-x86_64-1.txz\" Run=\"upgradepkg --install-new\">\n"
    "<URL>https://raw.githubusercontent.com/&github;/main/archive/&pluginpkg;</URL>\n"
    "<MD5>&md5;</MD5>\n"
    "</FILE>\n"
    "\n"
    "<FILE Run=\"/bin/bash\">\n"
    "<INLINE>\n"
    "INSTALL_SH=\"/usr/local/emhttp/plugins/unraid-docker-orchestrator/install.sh\"\n"
    "if [ -f \"$INSTALL_SH\" ]; then\n"
    "  bash \"$INSTALL_SH\"\n"
    "else\n"
    "  echo \"ERROR: install.sh not found\"\n"
    "  exit 1\n"
    "fi\n"
    "</INLINE>\n"
    "</FILE>\n"
    "\n"
    "<FILE Run=\"/bin/bash\" Method=\"remove\">\n"
    "<INLINE>\n"
    "UNINSTALL_SH=\"/usr/local/emhttp/plugins/unraid-docker-orchestrator/uninstall.sh\"\n"
    "if [ -f \"$UNINSTALL_SH\" ]; then\n"
    "  bash \"$UNINSTALL_SH\"\n"
    "else\n"
    "  rm -rf /usr/local/emhttp/plugins/unraid-docker-orchestrator\n"
    "  rm -rf /boot/config/plugins/unraid-docker-orchestrator\n"
    "fi\n"
    "removepkg unraid-docker-orchestrator 2>/dev/null || true\n"
    "</INLINE>\n"
    "</FILE>\n"
    "\n"
    "</PLUGIN>\n"
)

# Verify no non-ASCII
bad = [c for c in plg if ord(c) > 127]
if bad:
    print(f"ERROR: non-ASCII characters found: {bad[:5]}")
    sys.exit(1)

os.makedirs("plugin", exist_ok=True)
with open("plugin/udo.plg", "w") as f:
    f.write(plg)

print(f"plugin/udo.plg generated: version={version} md5={md5}")
